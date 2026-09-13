import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { metadata as archiveMetadata } from "@/app/(site)/archive/page";
import {
  buildCategoryMetadataV1,
  requirePopulatedCategoryV1,
} from "@/app/(site)/category/[slug]/page";
import { metadata as reportsMetadata } from "@/app/(site)/reports/page";
import type {
  CategoryPageContentV1,
  ContentItem,
} from "@/lib/content";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const article: ContentItem = {
  slug: "liquidity-cycle-update",
  title: "Liquidity Cycle Update",
  date: "2026-09-14",
  category: "Macro Liquidity",
  categorySlug: "macro-liquidity",
  keywords: [],
  content: "Published category research.",
};

const populatedCategory: CategoryPageContentV1 = {
  title: "Macro Liquidity",
  slug: "macro-liquidity",
  description: "Authored analysis of liquidity conditions and market cycles.",
  articles: [article],
};

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  assert.ok(value && typeof value === "object", `${label} must be present`);
  return value as Record<string, unknown>;
}

function expectNotFound(
  category: CategoryPageContentV1 | null,
  label: string,
): void {
  let received: unknown;

  try {
    requirePopulatedCategoryV1(category);
  } catch (error) {
    received = error;
  }

  assert.ok(received instanceof Error, `${label} throws a Next not-found error`);
  assert.equal(
    (received as Error & { readonly digest?: string }).digest,
    "NEXT_HTTP_ERROR_FALLBACK;404",
    `${label} uses genuine notFound behavior`,
  );
}

function verifyCategoryBehaviorAndMetadata(): void {
  assert.equal(
    requirePopulatedCategoryV1(populatedCategory),
    populatedCategory,
    "a real populated category remains render-capable",
  );
  expectNotFound(null, "invalid category");
  expectNotFound(
    { ...populatedCategory, articles: [] },
    "real empty category",
  );

  const metadata = buildCategoryMetadataV1(populatedCategory);
  const canonical = "https://chronoversecapital.com/category/macro-liquidity";

  assert.equal(metadata.title, "Macro Liquidity");
  assert.equal(
    String(metadata.title).includes("Chronoverse"),
    false,
    "category child title contains no duplicate branding",
  );
  assert.equal(metadata.description, populatedCategory.description);
  assert.equal(metadata.alternates?.canonical, canonical);
  assert.equal(metadata.robots, undefined, "populated category is indexable");

  const openGraph = requireRecord(metadata.openGraph, "category Open Graph");
  assert.equal(openGraph.url, canonical);
  assert.equal(openGraph.title, populatedCategory.title);
  assert.equal(openGraph.description, populatedCategory.description);

  const twitter = requireRecord(metadata.twitter, "category Twitter");
  assert.equal(twitter.title, populatedCategory.title);
  assert.equal(twitter.description, populatedCategory.description);
  assert.deepEqual(metadata.alternates?.types?.["application/rss+xml"], [
    {
      url: "https://chronoversecapital.com/rss.xml",
      title: "Chronoverse Capital - RSS Feed",
    },
  ]);

  const factualFallback = buildCategoryMetadataV1({
    ...populatedCategory,
    description: undefined,
  });
  assert.equal(
    factualFallback.description,
    populatedCategory.title,
    "a missing authored description falls back only to the factual title",
  );
  assert.equal(
    String(factualFallback.description).includes("Explore comprehensive"),
    false,
    "no marketing description is fabricated",
  );
}

function verifyCategoryQueryBoundary(): void {
  const contentSource = readSource("src/lib/content.ts");
  const helperStart = contentSource.indexOf(
    "export async function getSanityCategoryPageBySlugV1",
  );
  const helperEnd = contentSource.indexOf(
    "/**\n * Automated Internal Linking Engine.",
    helperStart,
  );
  const helperSource = contentSource.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(helperSource, /_type == "category"/);
  assert.match(helperSource, /slug\.current == \$slug/);
  assert.match(helperSource, /description/);
  assert.match(helperSource, /PUBLISHED_POST_FILTER/);
  assert.match(helperSource, /await client\.fetch/);
  assert.doesNotMatch(
    helperSource,
    /catch\s*\(/,
    "category route query does not collapse provider failure into not-found",
  );

  const categoryPageSource = readSource(
    "src/app/(site)/category/[slug]/page.tsx",
  );
  assert.equal(
    categoryPageSource.match(/getSanityCategoryPageBySlugV1\(slug\)/g)?.length,
    2,
    "metadata and render paths both validate the real populated category",
  );
  assert.match(categoryPageSource, /\{category\.description\}/);
  assert.doesNotMatch(categoryPageSource, /slug\.replace\(\/-\/g/);
  assert.doesNotMatch(categoryPageSource, /Explore comprehensive/);

  const categorySchemaSource = readSource(
    "src/sanity/schemaTypes/category.ts",
  );
  assert.match(categorySchemaSource, /name: 'description'/);
  assert.match(categorySchemaSource, /type: 'text'/);
}

function verifyReportsDiscovery(): void {
  const reportsSource = readSource("src/app/(site)/reports/page.tsx");

  assert.match(reportsSource, /article\.categorySlug \? \(/);
  assert.match(
    reportsSource,
    /href=\{`\/category\/\$\{article\.categorySlug\}`\}/,
  );
  assert.match(
    reportsSource,
    /aria-label=\{`Browse \$\{article\.category\} category`\}/,
  );
  assert.match(
    reportsSource,
    /\) : \(\s*<span className=/,
    "missing category slugs retain a non-linked badge",
  );
  assert.match(reportsSource, /<article\s+key=\{article\.slug\}/);
  assert.doesNotMatch(
    reportsSource,
    /<Link\s+key=\{article\.slug\}/,
    "report cards no longer wrap category links in an outer link",
  );
  assert.doesNotMatch(reportsSource, /\/category\/undefined/);

  assert.equal(reportsMetadata.title, "Research Reports");
  assert.equal(
    reportsMetadata.alternates?.canonical,
    "https://chronoversecapital.com/reports",
  );

  const articlePageSource = readSource("src/app/(site)/[slug]/page.tsx");
  assert.match(
    articlePageSource,
    /href=\{`\/category\/\$\{currentPost\.categorySlug \|\| DEFAULT_CATEGORY_SLUG\}`\}/,
    "existing article category navigation remains intact",
  );
}

function verifyArchiveAndSitemapPolicy(): void {
  assert.equal(archiveMetadata.title, "Archive");
  assert.match(String(archiveMetadata.description), /published Chronoverse research/);

  const robots = requireRecord(archiveMetadata.robots, "Archive robots");
  assert.equal(robots.index, false);
  assert.equal(robots.follow, true);
  const googleBot = requireRecord(robots.googleBot, "Archive Google robots");
  assert.equal(googleBot.index, false);
  assert.equal(googleBot.follow, true);
  assert.equal(
    archiveMetadata.alternates?.canonical,
    undefined,
    "Archive has no index-encouraging canonical",
  );

  const archiveSource = readSource("src/app/(site)/archive/page.tsx");
  assert.match(archiveSource, /export default async function ArchiveIndexPage/);
  assert.doesNotMatch(archiveSource, /redirect\s*\(/);

  const sitemapSource = readSource("src/app/sitemap.ts");
  assert.doesNotMatch(
    sitemapSource,
    /\{\s*path:\s*"archive"/,
    "Archive is absent from static sitemap entries",
  );
  assert.match(sitemapSource, /hasGeneralCategory/);
  assert.match(sitemapSource, /slug\.current == \$generalSlug/);
  assert.match(sitemapSource, /hasUncategorizedPosts\s*&&\s*hasGeneralCategory/);
  assert.match(
    sitemapSource,
    /defined\(category->slug\.current\)/,
    "referenced category sitemap entries remain real and populated",
  );
}

function main(): void {
  verifyCategoryBehaviorAndMetadata();
  verifyCategoryQueryBoundary();
  verifyReportsDiscovery();
  verifyArchiveAndSitemapPolicy();

  console.log("PASS: SEO-B6 category and Archive search policy");
}

main();
