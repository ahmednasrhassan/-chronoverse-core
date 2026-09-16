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

async function verifySanityImageVariants(): Promise<{
  featuredCardUrl: string;
  secondaryCardUrl: string;
}> {
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
  assert.ok(article.secondaryCardImageUrl);
  const heroUrl = new URL(article.featuredImageUrl);
  const cardUrl = new URL(article.cardImageUrl);
  const secondaryCardUrl = new URL(article.secondaryCardImageUrl);

  assert.equal(heroUrl.hostname, "cdn.sanity.io");
  assert.equal(heroUrl.searchParams.get("w"), "1600");
  assert.equal(heroUrl.searchParams.get("h"), "900");
  assert.equal(heroUrl.searchParams.get("fit"), "crop");
  assert.equal(cardUrl.hostname, "cdn.sanity.io");
  assert.equal(cardUrl.searchParams.get("w"), "720");
  assert.equal(cardUrl.searchParams.get("h"), "405");
  assert.equal(cardUrl.searchParams.get("q"), "80");
  assert.equal(cardUrl.searchParams.get("fit"), "crop");
  assert.equal(cardUrl.searchParams.get("auto"), "format");
  assert.equal(secondaryCardUrl.hostname, "cdn.sanity.io");
  assert.equal(secondaryCardUrl.searchParams.get("w"), "320");
  assert.equal(secondaryCardUrl.searchParams.get("h"), "240");
  assert.equal(secondaryCardUrl.searchParams.get("q"), "75");
  assert.equal(secondaryCardUrl.searchParams.get("fit"), "crop");
  assert.equal(secondaryCardUrl.searchParams.get("auto"), "format");
  assert.notEqual(article.cardImageUrl, article.featuredImageUrl);
  assert.notEqual(article.secondaryCardImageUrl, article.cardImageUrl);
  assert.equal(article.imageAlt, "Authored description of the research chart");
  assert.equal(article.imageCaption, "Authored factual caption.");
  return {
    featuredCardUrl: article.cardImageUrl,
    secondaryCardUrl: article.secondaryCardImageUrl,
  };
}

async function verifyHomepageCardRelay(
  featuredCardUrl: string,
  secondaryCardUrl: string,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const imageBytes = new Uint8Array([82, 73, 70, 70]);
  const croppedCardUrl = featuredCardUrl.replace(
    "?",
    "?rect=0,0,1600,900&",
  );
  const allowedUrls = new Set([
    featuredCardUrl,
    secondaryCardUrl,
    croppedCardUrl,
  ]);
  let upstreamRequests = 0;

  globalThis.fetch = async (input, init) => {
    upstreamRequests += 1;
    assert.ok(allowedUrls.has(input.toString()));
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "manual");
    assert.equal(new Headers(init.headers).get("Accept"), "image/webp");
    return new Response(new Blob([imageBytes]), {
      headers: { "Content-Type": "image/webp" },
    });
  };

  try {
    const relayUrl = `http://localhost/api/research-image?url=${encodeURIComponent(featuredCardUrl)}`;
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

    const secondaryResponse = await getResearchImage(
      new Request(
        `http://localhost/api/research-image?url=${encodeURIComponent(secondaryCardUrl)}`,
      ),
    );
    assert.equal(secondaryResponse.status, 200);
    assert.equal(upstreamRequests, 2);

    const croppedResponse = await getResearchImage(
      new Request(
        `http://localhost/api/research-image?url=${encodeURIComponent(croppedCardUrl)}`,
      ),
    );
    assert.equal(croppedResponse.status, 200);
    assert.equal(upstreamRequests, 3);

    const requestFor = (url: string) =>
      getResearchImage(
        new Request(
          `http://localhost/api/research-image?url=${encodeURIComponent(url)}`,
        ),
      );

    const rejectedHost = await requestFor(
      featuredCardUrl.replace("cdn.sanity.io", "example.com"),
    );
    assert.equal(rejectedHost.status, 400);

    const arbitraryDimensions = new URL(featuredCardUrl);
    arbitraryDimensions.searchParams.set("w", "5000");
    assert.equal((await requestFor(arbitraryDimensions.toString())).status, 400);

    const wrongProject = new URL(featuredCardUrl);
    wrongProject.pathname = wrongProject.pathname.replace(
      `/images/${wrongProject.pathname.split("/")[2]}/`,
      "/images/not-the-project/",
    );
    assert.equal((await requestFor(wrongProject.toString())).status, 400);

    const wrongDataset = new URL(featuredCardUrl);
    const pathParts = wrongDataset.pathname.split("/");
    pathParts[3] = "not-the-dataset";
    wrongDataset.pathname = pathParts.join("/");
    assert.equal((await requestFor(wrongDataset.toString())).status, 400);

    const malformedRect = new URL(featuredCardUrl);
    malformedRect.searchParams.set("rect", "0,0,invalid,900");
    assert.equal((await requestFor(malformedRect.toString())).status, 400);

    const unexpectedParameter = new URL(featuredCardUrl);
    unexpectedParameter.searchParams.set("download", "1");
    assert.equal((await requestFor(unexpectedParameter.toString())).status, 400);

    const duplicateWidth = await getResearchImage(
      new Request(
        "http://localhost/api/research-image?url=" +
          encodeURIComponent(featuredCardUrl + "&w=5000"),
      ),
    );
    assert.equal(duplicateWidth.status, 400);
    assert.equal(upstreamRequests, 3);

    globalThis.fetch = async () =>
      new Response(null, {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      });
    const failedUpstream = await getResearchImage(new Request(relayUrl));
    assert.equal(failedUpstream.status, 502);
    assert.equal(failedUpstream.headers.get("Cache-Control"), "no-store");
    assert.equal(failedUpstream.headers.get("Vercel-CDN-Cache-Control"), null);

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
    /function getResearchImageRelayUrl[\s\S]*?\/api\/research-image\?url=\$\{encodeURIComponent\(url\)\}/,
  );
  assert.match(homepageSource, /media="\(min-width: 640px\)"/);
  assert.match(homepageSource, /srcSet=\{secondaryImageSrc\}/);
  assert.match(homepageSource, /\(max-width: 639px\) 100vw, 136px/);
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
  const { featuredCardUrl, secondaryCardUrl } =
    await verifySanityImageVariants();
  await verifyHomepageCardRelay(featuredCardUrl, secondaryCardUrl);
  await verifyLegacyImageConservatism();
  verifyRenderContracts();
  console.log("PASS: SEO-B11B public image delivery boundaries");
}

void main();
