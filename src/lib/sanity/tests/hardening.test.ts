import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { encodeSignatureHeader } from "@sanity/webhook";

import { POST as disabledCommentPost } from "@/app/api/comment/route";
import { GET as newsletterCronGet } from "@/app/api/cron/send-newsletter/route";
import { POST as revalidatePost } from "@/app/api/revalidate/route";
import { POST as bloggerWebhookPost } from "@/app/api/webhook/blogger-images/route";
import { POST as publishWebhookPost } from "@/app/api/webhook/sanity/route";
import { POST as disabledSeoPost } from "@/app/api/webhook/seo-generate/route";
import { sanitizeHtml } from "@/lib/content";
import {
  extractBloggerImageUrls,
  isAllowedBloggerImageUrl,
} from "@/lib/sanity/bloggerImages";
import { generateFallbackSeo } from "@/lib/sanity/textUtils";
import { getSanityWriteClient } from "@/lib/sanity/writeClient";
import {
  isValidSanityDocumentId,
  SanityWebhookRequestError,
  verifySanityWebhookRequest,
} from "@/lib/sanity/webhookSecurity";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");
const secret = "local-test-webhook-secret";
const now = Date.now();

async function signedRequest(
  payload: Record<string, unknown>,
  overrides: Record<string, string> = {},
  timestamp = now,
): Promise<Request> {
  const body = JSON.stringify(payload);
  const signature = await encodeSignatureHeader(body, timestamp, secret);
  return new Request("https://chronoversecapital.com/api/webhook/test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sanity-webhook-signature": signature,
      "sanity-project-id": "project-test",
      "sanity-dataset": "production",
      "sanity-document-id": "post-1",
      "sanity-operation": "create",
      "idempotency-key": "delivery-test-1",
      ...overrides,
    },
    body,
  });
}

async function expectWebhookError(
  action: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof SanityWebhookRequestError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.equal(error.message.includes(secret), false, "errors never expose secrets");
    return true;
  });
}

async function verifyWebhookSecurity(): Promise<void> {
  const verified = await verifySanityWebhookRequest(
    await signedRequest({ documentId: "post-1" }),
    {
      secret,
      expectedProjectId: "project-test",
      expectedDataset: "production",
      now,
    },
  );
  assert.equal(verified.payload.documentId, "post-1");
  assert.equal(verified.operation, "create");
  assert.equal(verified.idempotencyKey, "delivery-test-1");

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(
        new Request("https://chronoversecapital.com/api/webhook/test", {
          method: "POST",
          body: "{}",
        }),
        {
          expectedProjectId: "project-test",
          expectedDataset: "production",
          now,
        },
      ),
    503,
    "verification_unavailable",
  );

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(
        new Request("https://chronoversecapital.com/api/webhook/test", {
          method: "POST",
          headers: {
            "sanity-webhook-signature": "t=1700000000000,v1=invalid",
          },
          body: "{}",
        }),
        {
          secret,
          expectedProjectId: "project-test",
          expectedDataset: "production",
          now,
        },
      ),
    401,
    "stale_signature",
  );

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(
        await signedRequest(
          { documentId: "post-1" },
          { "sanity-webhook-signature": `t=${now},v1=invalid` },
        ),
        {
          secret,
          expectedProjectId: "project-test",
          expectedDataset: "production",
          now,
        },
      ),
    401,
    "invalid_signature",
  );

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(
        await signedRequest(
          { documentId: "post-1" },
          { "sanity-project-id": "wrong-project" },
        ),
        {
          secret,
          expectedProjectId: "project-test",
          expectedDataset: "production",
          now,
        },
      ),
    401,
    "invalid_source",
  );

  for (const invalidId of ["", "../post", "versions.release.post", "post/one", "x".repeat(129)]) {
    assert.equal(isValidSanityDocumentId(invalidId), false, `rejects ${invalidId}`);
  }
  assert.equal(isValidSanityDocumentId("post-one"), true);
  assert.equal(isValidSanityDocumentId("drafts.post-one"), true);
}

function verifyBloggerBoundaries(): void {
  assert.equal(isAllowedBloggerImageUrl("https://images.blogspot.com/a.png"), true);
  assert.equal(isAllowedBloggerImageUrl("http://images.blogspot.com/a.png"), false);
  assert.equal(isAllowedBloggerImageUrl("https://blogspot.com.attacker.test/a.png"), false);
  assert.equal(isAllowedBloggerImageUrl("https://user@images.blogspot.com/a.png"), false);
  assert.deepEqual(
    extractBloggerImageUrls(
      '<img src="https://images.blogspot.com/a.png"><img src="https://images.blogspot.com/a.png"><img src="https://attacker.test/b.png">',
    ),
    ["https://images.blogspot.com/a.png"],
  );

  const route = readSource("src/app/api/webhook/blogger-images/route.ts");
  const handler = route.slice(route.indexOf("export async function POST"));
  assert.ok(handler.indexOf("verifySanityWebhookRequest") < handler.indexOf("getSanityWriteClient"));
  assert.ok(handler.indexOf("verifySanityWebhookRequest") < handler.indexOf("migrateDocumentImages"));
  assert.match(route, /_type == \$documentType && _rev == \$revision/);
  assert.doesNotMatch(route, /migrateAllBloggerImages/);
  assert.match(route, /ALLOWED_DOCUMENT_TYPES = new Set\(\["post", "page"\]\)/);

  const helper = readSource("src/lib/sanity/bloggerImages.ts");
  assert.match(helper, /MAX_IMAGES_PER_DOCUMENT = 20/);
  assert.match(helper, /MAX_IMAGE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(helper, /redirect: "error"/);
}

async function verifyDisabledLegacyMutations(): Promise<void> {
  const seoResponse = await disabledSeoPost();
  assert.equal(seoResponse.status, 410);
  const commentResponse = await disabledCommentPost();
  assert.equal(commentResponse.status, 410);

  const seoRoute = readSource("src/app/api/webhook/seo-generate/route.ts");
  const commentRoute = readSource("src/app/api/comment/route.ts");
  assert.doesNotMatch(seoRoute, /writeClient|generateSeoForArticle|\.patch\(/);
  assert.doesNotMatch(commentRoute, /writeClient|createClient|\.create\(/);
  assert.doesNotMatch(readSource("src/app/(site)/[slug]/page.tsx"), /ExecutiveDiscussion/);
}

async function verifyRouteGuardsAndWriteConfiguration(): Promise<void> {
  const previousWebhookSecret = process.env.SANITY_WEBHOOK_SECRET;
  delete process.env.SANITY_WEBHOOK_SECRET;

  try {
    for (const handler of [bloggerWebhookPost, publishWebhookPost, revalidatePost]) {
      const response = await handler(
        new Request("https://chronoversecapital.com/api/webhook/test", {
          method: "POST",
          body: "{}",
        }),
      );
      assert.equal(response.status, 503, "missing verification fails before side effects");
    }

    process.env.SANITY_WEBHOOK_SECRET = secret;
    const response = await bloggerWebhookPost(
      new Request("https://chronoversecapital.com/api/webhook/blogger-images", {
        method: "POST",
        headers: {
          "sanity-webhook-signature": `t=${now},v1=invalid`,
        },
        body: "{}",
      }),
    );
    assert.equal(response.status, 401, "invalid verification fails before migration");
  } finally {
    if (previousWebhookSecret === undefined) delete process.env.SANITY_WEBHOOK_SECRET;
    else process.env.SANITY_WEBHOOK_SECRET = previousWebhookSecret;
  }

  const previousWriteToken = process.env.SANITY_API_WRITE_TOKEN;
  const previousLegacyToken = process.env.SANITY_API_TOKEN;
  delete process.env.SANITY_API_WRITE_TOKEN;
  delete process.env.SANITY_API_TOKEN;
  try {
    assert.throws(
      () => getSanityWriteClient(),
      /Missing SANITY_API_WRITE_TOKEN/,
      "missing write configuration fails before client construction",
    );
  } finally {
    if (previousWriteToken === undefined) delete process.env.SANITY_API_WRITE_TOKEN;
    else process.env.SANITY_API_WRITE_TOKEN = previousWriteToken;
    if (previousLegacyToken === undefined) delete process.env.SANITY_API_TOKEN;
    else process.env.SANITY_API_TOKEN = previousLegacyToken;
  }
}

async function verifyCronFailsClosed(): Promise<void> {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const response = await newsletterCronGet(
      new Request("https://chronoversecapital.com/api/cron/send-newsletter"),
    );
    assert.equal(response.status, 503);

    process.env.CRON_SECRET = "expected-cron-secret";
    const unauthorized = await newsletterCronGet(
      new Request("https://chronoversecapital.com/api/cron/send-newsletter"),
    );
    assert.equal(unauthorized.status, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
}

function verifyAuthoringContracts(): void {
  const post = readSource("src/sanity/schemaTypes/post.ts");
  assert.match(post, /name: 'mainImage'[\s\S]*name: 'alt'[\s\S]*name: 'caption'/);
  assert.match(post, /type: 'image'[\s\S]*fields: \[[\s\S]*name: 'alt'[\s\S]*name: 'caption'/);
  assert.equal((post.match(/name: 'category'/g) || []).length, 1);
  const categoryField = post.slice(
    post.indexOf("name: 'category'"),
    post.indexOf("name: 'tags'"),
  );
  assert.match(categoryField, /type: 'reference'/);
  assert.doesNotMatch(categoryField, /type: 'string'/);
  assert.match(categoryField, /Rule\.custom/);
  assert.match(categoryField, /\.warning\(\)/);
  assert.match(post, /name: 'bodyRaw'/);
  assert.doesNotMatch(post, /optimizedTitle|40 characters/);

  const studio = readSource("src/app/studio/[[...index]]/page.tsx");
  assert.match(studio, /types: schemaTypes/);
  for (const widget of [
    "QuickDraftsWidget",
    "RecentContentWidget",
    "ImageAssetsWidget",
    "ContentStatsWidget",
  ]) {
    assert.match(studio, new RegExp(widget));
  }

  const schemaRegistry = readSource("src/sanity/schemaTypes/index.ts");
  for (const schema of ["post", "page", "author", "category", "subscriber", "comment"]) {
    assert.match(schemaRegistry, new RegExp(`\\b${schema}\\b`));
  }
}

function verifyContentAndSeoSafety(): void {
  const sanitized = sanitizeHtml(
    '<p onclick="steal()">Safe</p><a href="javascript:steal()">link</a><img src="x" onerror="steal()"><script>steal()</script><iframe src="https://attacker.test"></iframe>',
  );
  assert.match(sanitized, /Safe/);
  assert.doesNotMatch(sanitized, /onclick|onerror|javascript:|script|iframe|steal\(\)/i);

  assert.deepEqual(generateFallbackSeo(""), {
    excerpt: "",
    seoDescription: "",
  });
  const generated = generateFallbackSeo(
    "The published observation remained unchanged. The recorded value was 42 percent.",
  );
  assert.ok(generated.excerpt.length <= 320);
  assert.ok(generated.seoDescription.length <= 160);

  const aiHelper = readSource("src/lib/sanity/aiSeo.ts");
  assert.match(aiHelper, /import "server-only"/);
  assert.match(aiHelper, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(aiHelper, /OPENAI_API_KEY|source: "openai"/);
  assert.match(aiHelper, /typeof excerptValue !== "string"/);
  assert.match(aiHelper, /typeof descriptionValue !== "string"/);
  assert.match(aiHelper, /\.slice\(0, 320\)/);
  assert.match(aiHelper, /\.slice\(0, 160\)/);
}

function verifyPublishWebhookOrdering(): void {
  const route = readSource("src/app/api/webhook/sanity/route.ts");
  const handler = route.slice(route.indexOf("export async function POST"));
  const verification = handler.indexOf("verifySanityWebhookRequest");
  const fetches = handler.indexOf("Promise.all", verification);
  const lease = handler.indexOf("beginSanityWebhookOperation", fetches);
  const broadcast = handler.indexOf("broadcastToSubscribers(post", lease);
  assert.ok(verification >= 0 && verification < fetches && fetches < lease && lease < broadcast);
  assert.match(route, /verified\.operation !== "create"/);
  assert.match(route, /documentType !== "post"/);
  assert.match(route, /becamePublished !== true/);
  assert.match(route, /_rev == \$revision/);
  assert.match(route, /_type == "subscriber" && active != false/);
  assert.match(route, /\[0\.\.\.1000\]/);
  assert.doesNotMatch(route, /SUBSCRIBER_EMAILS/);
}

async function main(): Promise<void> {
  await verifyWebhookSecurity();
  verifyBloggerBoundaries();
  await verifyDisabledLegacyMutations();
  await verifyRouteGuardsAndWriteConfiguration();
  await verifyCronFailsClosed();
  verifyAuthoringContracts();
  verifyContentAndSeoSafety();
  verifyPublishWebhookOrdering();
  console.log("PASS: Sanity operational and authoring hardening");
}

void main();
