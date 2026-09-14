import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

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

async function verifySanityImageVariants(): Promise<void> {
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

  assert.match(homepageSource, /article\.cardImageUrl \|\| article\.imageUrl/);
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
  await verifySanityImageVariants();
  await verifyLegacyImageConservatism();
  verifyRenderContracts();
  console.log("PASS: SEO-B11B public image delivery boundaries");
}

void main();
