import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { GET as getResearchImage } from "../../../app/api/research-image/route";
import { getSanityArticles } from "../../content";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const basePost = {
  slug: "image-performance-test",
  title: "Image performance test",
  publishedAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
  category: "Research",
  categorySlug: "research",
  keywords: ["images"],
  content: [],
  legacyBody: null,
  imageUrl: null,
  author: null,
  seoDescription: null,
  excerpt: null,
  bodyPlainText: null,
  body: null,
  manualRelatedLinks: null,
};

async function verifySanityImageVariants(): Promise<string> {
  const [article] = await getSanityArticles(async () => [
    {
      ...basePost,
      mainImage: {
        asset: { _ref: "image-a1b2c3d4-1600x900-jpg" },
        alt: "Authored description of the research chart",
        caption: "Authored factual caption.",
      },
    },
  ]);

  assert.ok(article.featuredImageUrl);
  assert.ok(article.cardImageUrl);
  const heroUrl = new URL(article.featuredImageUrl);
  const cardUrl = new URL(article.cardImageUrl);

  assert.equal(heroUrl.hostname, "cdn.sanity.io");
  assert.equal(heroUrl.searchParams.get("w"), "1600");
  assert.equal(heroUrl.searchParams.get("h"), "900");
  assert.equal(heroUrl.searchParams.get("fit"), "crop");
  assert.equal(cardUrl.hostname, "cdn.sanity.io");
  assert.equal(cardUrl.searchParams.get("w"), "720");
  assert.equal(cardUrl.searchParams.get("h"), "405");
  assert.equal(cardUrl.searchParams.get("fit"), "crop");
  assert.notEqual(article.cardImageUrl, article.featuredImageUrl);
  assert.equal(article.imageAlt, "Authored description of the research chart");
  assert.equal(article.imageCaption, "Authored factual caption.");
  return article.cardImageUrl;
}

async function verifyHomepageCardRelay(cardUrl: string): Promise<void> {
  const originalFetch = globalThis.fetch;
  const imageBytes = new Uint8Array([82, 73, 70, 70]);
  const croppedCardUrl = cardUrl.replace("?", "?rect=0,0,1600,900&");
  const allowedUrls = new Set([cardUrl, croppedCardUrl]);
  let upstreamRequests = 0;

  globalThis.fetch = async (input, init) => {
    upstreamRequests += 1;
    assert.ok(allowedUrls.has(input.toString()));
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "manual");
    return new Response(new Blob([imageBytes]), {
      headers: { "Content-Type": "image/webp" },
    });
  };

  try {
    const relayUrl =
      `http://localhost/api/research-image?url=${encodeURIComponent(cardUrl)}`;
    const response = await getResearchImage(new Request(relayUrl));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/webp");
    assert.match(response.headers.get("Cache-Control") || "", /s-maxage=31536000/);
    assert.match(response.headers.get("Cache-Control") || "", /immutable/);
    assert.equal(
      response.headers.get("Vercel-CDN-Cache-Control"),
      "public, max-age=31536000, immutable",
    );
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      imageBytes,
    );
    assert.equal(upstreamRequests, 1);

    const croppedResponse = await getResearchImage(
      new Request(
        `http://localhost/api/research-image?url=${encodeURIComponent(croppedCardUrl)}`,
      ),
    );
    assert.equal(croppedResponse.status, 200);
    assert.equal(upstreamRequests, 2);

    const rejected = await getResearchImage(
      new Request(
        "http://localhost/api/research-image?url=" +
          encodeURIComponent(cardUrl.replace("cdn.sanity.io", "example.com")),
      ),
    );
    assert.equal(rejected.status, 400);
    assert.equal(upstreamRequests, 2);

    const duplicateWidth = await getResearchImage(
      new Request(
        "http://localhost/api/research-image?url=" +
          encodeURIComponent(cardUrl + "&w=5000"),
      ),
    );
    assert.equal(duplicateWidth.status, 400);
    assert.equal(upstreamRequests, 2);

    globalThis.fetch = async (_input, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      throw new DOMException("Upstream timed out", "TimeoutError");
    };
    const timedOut = await getResearchImage(new Request(relayUrl));
    assert.equal(timedOut.status, 502);
    assert.equal(timedOut.headers.get("Cache-Control"), "no-store");
    assert.equal(timedOut.headers.get("Vercel-CDN-Cache-Control"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function verifyLegacyImageConservatism(): Promise<void> {
  const [article] = await getSanityArticles(async () => [
    {
      ...basePost,
      legacyBody:
        '<p><img src="https://legacy.example/research-image.jpg"></p>',
      mainImage: null,
    },
  ]);

  assert.equal(article.imageUrl, "https://legacy.example/research-image.jpg");
  assert.equal(article.featuredImageUrl, undefined);
  assert.equal(article.cardImageUrl, undefined);
  assert.equal(article.imageAlt, undefined);
}

function verifyRenderContracts(): void {
  const homepageSource = readSource("src/app/(site)/page.tsx");
  const articleSource = readSource("src/app/(site)/[slug]/page.tsx");
  const headerSource = readSource("src/components/navigation/Header.tsx");
  const nextConfigSource = readSource("next.config.ts");
  const researchImageRouteSource = readSource("src/app/api/research-image/route.ts");

  assert.match(researchImageRouteSource, /signal:\s*AbortSignal\.timeout\(5000\)/);

  assert.match(homepageSource, /article\.cardImageUrl \|\| article\.imageUrl/);
  assert.match(
    homepageSource,
    /\/api\/research-image\?url=\$\{encodeURIComponent\(article\.cardImageUrl\)\}/,
  );
  assert.match(homepageSource, /alt=\{article\.imageAlt \|\| ""\}/);
  assert.match(homepageSource, /loading="lazy"/);
  assert.match(homepageSource, /decoding="async"/);
  assert.doesNotMatch(homepageSource, /alt=\{article\.title\}/);

  assert.match(articleSource, /currentPost\.featuredImageUrl \? \(/);
  assert.match(articleSource, /src=\{currentPost\.featuredImageUrl\}/);
  assert.match(articleSource, /aspect-video[\s\S]*?preload/);
  assert.equal(articleSource.match(/\n\s+preload\s*\n/g)?.length, 1);
  assert.match(articleSource, /<img[\s\S]*?src=\{currentPost\.imageUrl\}/);
  assert.match(articleSource, /fetchPriority="high"/);
  assert.match(articleSource, /loading="eager"/);
  assert.match(articleSource, /src=\{currentPage\.imageUrl\}[\s\S]*?alt=""/);
  assert.doesNotMatch(articleSource, /\n\s+priority\s*\n/);
  assert.match(
    articleSource,
    /const imageAltText = currentPost\.imageAlt \|\| "Article featured image"/,
  );
  assert.match(articleSource, /sanitizeHtml\(transformedLegacyBody\)/);
  assert.match(headerSource, /loading="eager"/);
  assert.doesNotMatch(headerSource, /\n\s+(?:priority|preload)\s*\n/);
  assert.match(nextConfigSource, /images:\s*\{\s*unoptimized:\s*true/);
}

async function main(): Promise<void> {
  const cardUrl = await verifySanityImageVariants();
  await verifyHomepageCardRelay(cardUrl);
  await verifyLegacyImageConservatism();
  verifyRenderContracts();
  console.log("PASS: SEO-B11B public image delivery boundaries");
}

void main();
