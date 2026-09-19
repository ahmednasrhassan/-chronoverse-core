import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { encodeSignatureHeader } from "@sanity/webhook";

import { POST as disabledCommentPost } from "@/app/api/comment/route";
import { GET as newsletterCronGet } from "@/app/api/cron/send-newsletter/route";
import { handleSanityRevalidation } from "@/app/api/revalidate/handler";
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
import { dataset, projectId } from "@/sanity/client";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");
const secret = "local-test-webhook-secret";
const now = Date.now();

async function signedRawRequest(
  body: string,
  overrides: Record<string, string | null> = {},
  timestamp = now,
): Promise<Request> {
  const signature = await encodeSignatureHeader(body, timestamp, secret);
  const headers = new Headers({
    "content-type": "application/json",
    "sanity-webhook-signature": signature,
    "sanity-project-id": "project-test",
    "sanity-dataset": "production",
    "sanity-document-id": "post-1",
    "sanity-operation": "create",
    "idempotency-key": "delivery-test-1",
  });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }

  return new Request("https://chronoversecapital.com/api/webhook/test", {
    method: "POST",
    headers,
    body,
  });
}

async function signedRequest(
  payload: Record<string, unknown>,
  overrides: Record<string, string | null> = {},
  timestamp = now,
): Promise<Request> {
  return signedRawRequest(JSON.stringify(payload), overrides, timestamp);
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

  const opaqueIdempotencyKey = '"delivery/opaque?part=1 value"';
  const opaqueKeyRequest = await verifySanityWebhookRequest(
    await signedRequest(
      { documentId: "post-1" },
      { "idempotency-key": opaqueIdempotencyKey },
    ),
    {
      secret,
      expectedProjectId: "project-test",
      expectedDataset: "production",
      now,
    },
  );
  assert.equal(opaqueKeyRequest.idempotencyKey, opaqueIdempotencyKey);

  for (const operation of ["create", "update", "delete"] as const) {
    const operationRequest = await verifySanityWebhookRequest(
      await signedRequest(
        { _type: "post", slug: operation === "delete" ? "before-slug" : "after-slug" },
        {
          "sanity-operation": operation,
          "idempotency-key": `delivery-${operation}`,
        },
      ),
      {
        secret,
        expectedProjectId: "project-test",
        expectedDataset: "production",
        now,
      },
    );
    assert.equal(operationRequest.operation, operation);
    assert.equal(
      operationRequest.payload.slug,
      operation === "delete" ? "before-slug" : "after-slug",
    );
  }

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

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(
        await signedRequest(
          { documentId: "post-1" },
          { "sanity-operation": "publish" },
        ),
        {
          secret,
          expectedProjectId: "project-test",
          expectedDataset: "production",
          now,
        },
      ),
    400,
    "invalid_operation",
  );

  for (const idempotencyKey of [null, "", "x".repeat(201)]) {
    await expectWebhookError(
      async () =>
        verifySanityWebhookRequest(
          await signedRequest(
            { documentId: "post-1" },
            { "idempotency-key": idempotencyKey },
          ),
          {
            secret,
            expectedProjectId: "project-test",
            expectedDataset: "production",
            now,
          },
        ),
      400,
      "invalid_idempotency_key",
    );
  }

  const controlCharacterRequest = await signedRequest({ documentId: "post-1" });
  const unsafeRequest = {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "idempotency-key"
          ? "delivery\nkey"
          : controlCharacterRequest.headers.get(name);
      },
    },
    text: () => controlCharacterRequest.text(),
  } as unknown as Request;
  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(unsafeRequest, {
        secret,
        expectedProjectId: "project-test",
        expectedDataset: "production",
        now,
      }),
    400,
    "invalid_idempotency_key",
  );

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(await signedRawRequest("{"), {
        secret,
        expectedProjectId: "project-test",
        expectedDataset: "production",
        now,
      }),
    400,
    "invalid_json",
  );

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(await signedRawRequest("[]"), {
        secret,
        expectedProjectId: "project-test",
        expectedDataset: "production",
        now,
      }),
    400,
    "invalid_payload",
  );

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(
        await signedRawRequest("x".repeat(64 * 1024 + 1)),
        {
          secret,
          expectedProjectId: "project-test",
          expectedDataset: "production",
          now,
        },
      ),
    413,
    "payload_too_large",
  );

  await expectWebhookError(
    async () =>
      verifySanityWebhookRequest(
        await signedRequest(
          { documentId: "post-1" },
          { "sanity-dataset": "staging" },
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

function verifyRevalidationContract(): void {
  const route = readSource("src/app/api/revalidate/route.ts");
  const handler = readSource("src/app/api/revalidate/handler.ts");
  assert.match(route, /handleSanityRevalidation\(request, revalidatePath\)/);
  assert.match(handler, /REVALIDATED_TYPES = new Set\(\["post", "page", "category"\]\)/);
  assert.match(handler, /SLUG_PATTERN = \/\^\[a-z0-9\]\+\(\?:-\[a-z0-9\]\+\)\*\$\//);
  assert.match(handler, /verifySanityWebhookRequest/);
  assert.match(handler, /secret: process\.env\.SANITY_WEBHOOK_SECRET/);
  assert.match(handler, /expectedProjectId: projectId/);
  assert.match(handler, /expectedDataset: dataset/);

  for (const publicPath of [
    "/",
    "/reports",
    "/archive",
    "/sitemap.xml",
    "/feed.xml",
    "/rss.xml",
  ]) {
    assert.match(handler, new RegExp(`invalidatePath\\(\\"${publicPath.replace("/", "\\/")}\\"\\)`));
  }

  assert.match(handler, /invalidatePath\(`\/\$\{slug\}`\)/);
  assert.match(handler, /invalidatePath\("\/\[slug\]", "page"\)/);
  assert.match(handler, /invalidatePath\("\/category\/\[slug\]", "page"\)/);
}

async function verifySignedRevalidationRoute(): Promise<void> {
  const previousWebhookSecret = process.env.SANITY_WEBHOOK_SECRET;
  process.env.SANITY_WEBHOOK_SECRET = secret;

  try {
    for (const documentType of ["post", "page", "category"] as const) {
      const slug = `${documentType}-slug`;
      const calls: Array<[string, "layout" | "page" | undefined]> = [];
      const response = await handleSanityRevalidation(
        await signedRequest(
          { _type: documentType, slug },
          {
            "sanity-project-id": projectId,
            "sanity-dataset": dataset,
            "idempotency-key": `"revalidation/${documentType}?attempt=1"`,
          },
        ),
        (path, type) => {
          calls.push([path, type]);
        },
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { revalidated: true, slug });
      assert.deepEqual(calls, [
        ["/", undefined],
        ["/reports", undefined],
        ["/archive", undefined],
        ["/sitemap.xml", undefined],
        ["/feed.xml", undefined],
        ["/rss.xml", undefined],
        documentType === "category"
          ? ["/[slug]", "page"]
          : [`/${slug}`, undefined],
        ["/category/[slug]", "page"],
      ]);
    }
  } finally {
    if (previousWebhookSecret === undefined) delete process.env.SANITY_WEBHOOK_SECRET;
    else process.env.SANITY_WEBHOOK_SECRET = previousWebhookSecret;
  }
}

async function verifyPublishWebhookSharedVerifier(): Promise<void> {
  const previousWebhookSecret = process.env.SANITY_WEBHOOK_SECRET;
  process.env.SANITY_WEBHOOK_SECRET = secret;

  try {
    const response = await publishWebhookPost(
      await signedRequest(
        { documentType: "page", becamePublished: true },
        {
          "sanity-project-id": projectId,
          "sanity-dataset": dataset,
          "idempotency-key": '"newsletter/opaque?attempt=1"',
        },
      ),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "skipped",
      message: "Not a new published post",
    });

    const bloggerResponse = await bloggerWebhookPost(
      await signedRequest(
        { documentType: "post" },
        {
          "sanity-project-id": projectId,
          "sanity-dataset": dataset,
          "sanity-operation": "delete",
          "idempotency-key": '"blogger-images/opaque?attempt=1"',
        },
      ),
    );
    assert.equal(bloggerResponse.status, 200);
    assert.deepEqual(await bloggerResponse.json(), {
      status: "skipped",
      message: "Unsupported document operation",
    });

    const route = readSource("src/app/api/webhook/sanity/route.ts");
    assert.match(
      route,
      /beginSanityWebhookOperation\("publish", verified\.idempotencyKey\)/,
    );
  } finally {
    if (previousWebhookSecret === undefined) delete process.env.SANITY_WEBHOOK_SECRET;
    else process.env.SANITY_WEBHOOK_SECRET = previousWebhookSecret;
  }
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

  const route = readSource("src/app/api/cron/send-newsletter/route.ts");
  assert.match(route, /Failed to send one newsletter email/);
  assert.doesNotMatch(route, /Failed to send to \$\{subscriber\.email\}/);
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
  assert.match(route, /documentId\.startsWith\("drafts\."\)/);
  assert.match(route, /_rev == \$revision/);
  assert.match(route, /publishedAt <= now\(\)/);
  assert.match(route, /_type == "subscriber" && active != false/);
  assert.match(route, /\[0\.\.\.1000\]/);
  assert.match(route, /if \(subscribers\.length === 0\)/);
  assert.match(route, /if \(!lease\)/);
  assert.match(route, /Webhook delivery already processed/);
  assert.match(route, /Failed to send one article email/);
  assert.doesNotMatch(route, /SUBSCRIBER_EMAILS/);
  assert.doesNotMatch(route, /Failed to send.*\$\{email\}/);
}

async function main(): Promise<void> {
  await verifyWebhookSecurity();
  verifyRevalidationContract();
  await verifySignedRevalidationRoute();
  await verifyPublishWebhookSharedVerifier();
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
