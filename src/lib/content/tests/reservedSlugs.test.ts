import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isReservedRootSlug,
  normalizeRootSlug,
  RESERVED_ROOT_SLUGS,
  ROOT_SLUG_FORMAT_ERROR,
  validatePublicRootSlug,
} from "../reservedSlugs";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

function verifyPurePolicy(): void {
  for (const slug of [
    "account",
    "api",
    "category",
    "markets",
    "rss.xml",
    "studio",
    "vip",
    "about",
    "auth",
    "methodology",
    "premium",
    "robots.txt",
    "sitemap.xml",
    "the-new-scarcity-economy-macro-crisis",
  ]) {
    assert.equal(isReservedRootSlug(slug), true, `${slug} must be reserved`);
  }

  assert.equal(isReservedRootSlug("euro-liquidity-cycle"), false);
  assert.equal(validatePublicRootSlug("euro-liquidity-cycle"), true);
  assert.equal(normalizeRootSlug("  AcCoUnT  "), "account");
  assert.equal(isReservedRootSlug("AcCoUnT"), true);
  assert.equal(isReservedRootSlug("  account  "), true);
  assert.match(String(validatePublicRootSlug("ACCOUNT")), /reserved/);
  assert.match(String(validatePublicRootSlug(" account ")), /reserved/);

  for (const malformed of [
    "research/article",
    "/article",
    "article/",
    "research\\article",
    "https://example.com/article",
    "article?preview=true",
  ]) {
    assert.equal(
      validatePublicRootSlug(malformed),
      ROOT_SLUG_FORMAT_ERROR,
      `${malformed} must be rejected as path-like or malformed`,
    );
  }

  assert.equal(new Set(RESERVED_ROOT_SLUGS).size, RESERVED_ROOT_SLUGS.length);
}

function verifySchemaIntegration(): void {
  const postSource = readSource("src/sanity/schemaTypes/post.ts");
  const pageSource = readSource("src/sanity/schemaTypes/page.ts");
  const categorySource = readSource("src/sanity/schemaTypes/category.ts");

  for (const [label, source] of [
    ["Post", postSource],
    ["Page", pageSource],
  ] as const) {
    assert.match(source, /import \{ validatePublicRootSlug \}/);
    assert.match(source, /validatePublicRootSlug\(slug\?\.current\)/);
    assert.doesNotMatch(
      source,
      /new Set|RESERVED_ROOT_SLUGS|\[\s*["']account["']/,
      `${label} must not implement a second reserved list`,
    );
  }

  assert.doesNotMatch(categorySource, /reservedSlugs|validatePublicRootSlug/);
  assert.match(categorySource, /\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$/);
}

function verifyRuntimeDefense(): void {
  const articleSource = readSource("src/app/(site)/[slug]/page.tsx");
  assert.match(articleSource, /import \{ isReservedRootSlug \}/);
  assert.equal(
    articleSource.match(/if \(isReservedRootSlug\(slug\)\) notFound\(\);/g)
      ?.length,
    2,
  );

  const metadataStart = articleSource.indexOf("export async function generateMetadata");
  const renderStart = articleSource.indexOf("export default async function");
  const metadataSource = articleSource.slice(metadataStart, renderStart);
  const renderSource = articleSource.slice(renderStart);
  assert.ok(
    metadataSource.indexOf("isReservedRootSlug(slug)") <
      metadataSource.indexOf("getArticleForRoute(slug)"),
  );
  assert.ok(
    renderSource.indexOf("isReservedRootSlug(slug)") <
      renderSource.indexOf("getArticleForRoute(slug)"),
  );
  assert.match(articleSource, /filter\(\(article\) => !isReservedRootSlug\(article\.slug\)\)/);
  assert.doesNotMatch(articleSource, /redirect\s*\(/);
}

verifyPurePolicy();
verifySchemaIntegration();
verifyRuntimeDefense();

console.log("PASS: SEO-B8A reserved root slug guardrails");
