import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildArticleJsonLd,
  buildArticleMetadata,
  normalizeArticleSeo,
  resolveArticleDescription,
  serializeJsonForHtml,
} from "../article";
import { publicSocialImage } from "../metadata";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  assert.ok(value && typeof value === "object", `${label} must be present`);
  return value as Record<string, unknown>;
}

function verifyArticleIdentityAndMetadata(): void {
  const longTitle =
    "Euro Liquidity Transmission Across Sovereign Curves and Cross-Border Funding Markets";
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.test";

  try {
    const article = normalizeArticleSeo({
      slug: "euro-liquidity-transmission",
      title: longTitle,
      seoDescription: "Authored factual SEO description.",
      excerpt: "Authored excerpt that must not win.",
      bodyText: "Body-derived fallback that must not win.",
      publishedAt: "2026-09-13T07:08:09.123Z",
      modifiedAt: "2026-09-14T10:11:12.456Z",
      author: "Factual Author",
      category: "Macro Liquidity",
      keywords: ["EUR/USD", "liquidity"],
      featuredImageUrl: "https://cdn.sanity.io/images/project/dataset/image.jpg",
      imageAlt: "Euro-area yield curves shown across maturities",
      imageCaption: "Yield curves at the stated observation date.",
    });
    const metadata = buildArticleMetadata(article);
    const openGraph = requireRecord(metadata.openGraph, "Open Graph");
    const twitter = requireRecord(metadata.twitter, "Twitter");
    const jsonLd = buildArticleJsonLd(article);
    const mainEntity = requireRecord(
      jsonLd.mainEntityOfPage,
      "JSON-LD mainEntityOfPage",
    );

    assert.equal(article.title, longTitle);
    assert.ok(article.title.length > 40);
    assert.equal(metadata.title, longTitle);
    assert.equal(openGraph.title, longTitle);
    assert.equal(twitter.title, longTitle);
    assert.equal(jsonLd.headline, longTitle);

    const canonical =
      "https://chronoversecapital.com/euro-liquidity-transmission";
    assert.equal(article.canonicalUrl, canonical);
    assert.equal(metadata.alternates?.canonical, canonical);
    assert.equal(openGraph.url, canonical);
    assert.equal(jsonLd.url, canonical);
    assert.equal(mainEntity["@id"], canonical);

    assert.equal(article.descriptionSource, "seoDescription");
    assert.equal(article.description, "Authored factual SEO description.");
    assert.equal(openGraph.description, article.description);
    assert.equal(twitter.description, article.description);
    assert.equal(jsonLd.description, article.description);
    assert.equal(article.description.includes("Read the full analysis"), false);

    assert.equal(article.publishedAt, "2026-09-13T07:08:09.123Z");
    assert.equal(article.modifiedAt, "2026-09-14T10:11:12.456Z");
    assert.equal(openGraph.publishedTime, article.publishedAt);
    assert.equal(openGraph.modifiedTime, article.modifiedAt);
    assert.equal(jsonLd.datePublished, article.publishedAt);
    assert.equal(jsonLd.dateModified, article.modifiedAt);
    assert.deepEqual(metadata.authors, [{ name: "Factual Author" }]);
    assert.deepEqual(jsonLd.author, {
      "@type": "Person",
      name: "Factual Author",
    });
    assert.equal(jsonLd.image, article.featuredImage?.url);
    const authoredAlt = "Euro-area yield curves shown across maturities";
    assert.equal(article.featuredImage?.alt, authoredAlt);

    const openGraphImages = openGraph.images as Array<Record<string, unknown>>;
    const twitterImages = twitter.images as Array<Record<string, unknown>>;
    assert.equal(openGraphImages[0]?.alt, authoredAlt);
    assert.equal(twitterImages[0]?.alt, authoredAlt);
    assert.equal(openGraphImages[0]?.url, article.featuredImage?.url);
    assert.equal(twitterImages[0]?.url, article.featuredImage?.url);
    assert.notEqual(openGraphImages[0]?.url, publicSocialImage.url);
  } finally {
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  }
}

function verifyDescriptionPrecedence(): void {
  assert.deepEqual(
    resolveArticleDescription({
      seoDescription: " SEO description ",
      excerpt: "Excerpt",
      bodyText: "Body",
    }),
    { description: "SEO description", source: "seoDescription" },
  );
  assert.deepEqual(
    resolveArticleDescription({ excerpt: " Excerpt ", bodyText: "Body" }),
    { description: "Excerpt", source: "excerpt" },
  );
  assert.deepEqual(
    resolveArticleDescription({ bodyText: " Body-derived factual text. " }),
    { description: "Body-derived factual text.", source: "body" },
  );
  const empty = resolveArticleDescription({});
  assert.equal(empty.source, "site");
  assert.equal(
    empty.description,
    "Independent market research from Chronoverse Capital.",
  );
  assert.equal(empty.description.includes("article"), false);
  assert.equal(empty.description.includes("Read the full analysis"), false);
}

function verifyJsonLdSecurityAndOptionalOmission(): void {
  const malicious = "</script><script>alert(1)</script> < > & A\u2028B\u2029C";
  const article = normalizeArticleSeo({
    slug: "safe-json",
    title: malicious,
    bodyText: malicious,
  });
  const jsonLd = buildArticleJsonLd(article);
  const metadata = buildArticleMetadata(article);
  const serialized = serializeJsonForHtml(jsonLd);

  assert.doesNotMatch(serialized, /<\/script/i);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/u);
  assert.equal(
    (JSON.parse(serialized) as Record<string, unknown>).headline,
    malicious,
  );
  assert.equal("author" in jsonLd, false);
  assert.equal("image" in jsonLd, false);
  assert.equal("datePublished" in jsonLd, false);
  assert.equal("dateModified" in jsonLd, false);
  assert.equal(metadata.authors, undefined);
  assert.equal(
    "authors" in requireRecord(metadata.openGraph, "minimal Open Graph"),
    false,
  );
  assert.equal(article.featuredImage?.alt, undefined);

  const imageWithoutAlt = normalizeArticleSeo({
    slug: "image-without-alt",
    title: "Image without authored alt",
    bodyText: "Factual body.",
    featuredImageUrl: "https://cdn.sanity.io/images/project/dataset/image.jpg",
  });
  const imageMetadata = buildArticleMetadata(imageWithoutAlt);
  const imageOpenGraph = requireRecord(
    imageMetadata.openGraph,
    "image Open Graph",
  );
  const imageDescriptor = (
    imageOpenGraph.images as Array<Record<string, unknown>>
  )[0];
  assert.equal(imageWithoutAlt.featuredImage?.alt, undefined);
  assert.equal(imageDescriptor?.alt, undefined);
}

function verifySanityProjectionAndRequestDedupe(): void {
  const contentSource = readSource("src/lib/content.ts");
  assert.match(contentSource, /publishedAt,/);
  assert.match(contentSource, /"updatedAt": _updatedAt/);
  assert.match(contentSource, /\n\s+excerpt,/);
  assert.match(contentSource, /"author": author->name/);
  assert.match(contentSource, /mainImage \{ \.\.\., alt, caption, asset-> \}/);
  assert.match(contentSource, /publishedAt: post\.publishedAt \|\| undefined/);
  assert.match(contentSource, /updatedAt: post\.updatedAt \|\| undefined/);
  assert.match(contentSource, /authoredCategory: post\.category\?\.trim\(\)/);
  assert.match(contentSource, /authoredSeoDescription/);
  assert.match(contentSource, /excerpt: authoredExcerpt/);
  assert.match(contentSource, /imageAlt: post\.mainImage\?\.alt/);
  assert.match(contentSource, /imageCaption: post\.mainImage\?\.caption/);

  const dataSource = readSource("src/lib/seo/article-data.ts");
  const pageSource = readSource("src/app/(site)/[slug]/page.tsx");
  assert.match(dataSource, /import \{ cache \} from "react"/);
  assert.match(dataSource, /cache\(getSanityArticleBySlug\)/);
  assert.equal(pageSource.match(/getArticleForRoute\(slug\)/g)?.length, 2);
  assert.doesNotMatch(pageSource, /getSanityArticleBySlug\(slug\)/);
  assert.doesNotMatch(pageSource, /maxTitleLength = 40/);
  assert.doesNotMatch(pageSource, /Read the full analysis/);
  assert.match(pageSource, /<h1[^>]*>[\s\S]*?\{currentPost\.title\}[\s\S]*?<\/h1>/);
  assert.match(readSource("src/lib/seo/article.ts"), /buildCanonicalUrl\(`\/\$\{input\.slug\}`\)/);
}

verifyArticleIdentityAndMetadata();
verifyDescriptionPrecedence();
verifyJsonLdSecurityAndOptionalOmission();
verifySanityProjectionAndRequestDedupe();

console.log("PASS: SEO-B7 article SEO, structured data, and request dedupe");
