import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import LegacyIntelligencePage from "@/app/(site)/intelligence/page";
import RetiredProductsPage from "@/app/(site)/products/page";
import { buildSitemap } from "@/app/sitemap";
import {
  getDatedBloggerCandidate,
  getRootHtmlCandidate,
  resolveLegacyContentRedirect,
} from "@/lib/seo/legacy-routes";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

function captureFrameworkInterrupt(run: () => unknown): Error & {
  readonly digest?: string;
} {
  let received: unknown;
  try {
    run();
  } catch (error) {
    received = error;
  }
  assert.ok(received instanceof Error, "expected a Next framework interrupt");
  return received as Error & { readonly digest?: string };
}

function verifyIntelligenceAndProductsPolicy(): void {
  const intelligenceRedirect = captureFrameworkInterrupt(() =>
    LegacyIntelligencePage(),
  );
  assert.match(
    intelligenceRedirect.digest || "",
    /^NEXT_REDIRECT;replace;\/markets;308;/,
  );
  assert.doesNotMatch(intelligenceRedirect.digest || "", /\/vip|\/account/);

  const productsMissing = captureFrameworkInterrupt(() => RetiredProductsPage());
  assert.equal(productsMissing.digest, "NEXT_HTTP_ERROR_FALLBACK;404");

  const intelligenceSource = readSource(
    "src/app/(site)/intelligence/page.tsx",
  );
  const productsSource = readSource("src/app/(site)/products/page.tsx");
  assert.match(intelligenceSource, /permanentRedirect\("\/markets"\)/);
  assert.doesNotMatch(intelligenceSource, /"\/vip"|"\/account"/);
  assert.match(productsSource, /notFound\(\)/);
  assert.doesNotMatch(productsSource, /redirect/i);
}

async function verifyLegacyArticleNormalization(): Promise<void> {
  assert.equal(getRootHtmlCandidate("known-article.html"), "known-article");
  assert.equal(getRootHtmlCandidate("known-article"), null);
  assert.equal(getRootHtmlCandidate("unknown.article.html"), null);
  assert.equal(getRootHtmlCandidate("markets.html"), null);
  assert.equal(getRootHtmlCandidate("Known-Article.html"), null);

  assert.equal(
    getDatedBloggerCandidate("2024", "09", "known-article.html"),
    "known-article",
  );
  assert.equal(
    getDatedBloggerCandidate("2024", "09", "known-article"),
    "known-article",
  );
  assert.equal(
    getDatedBloggerCandidate("24", "09", "known-article.html"),
    null,
  );
  assert.equal(
    getDatedBloggerCandidate("2024", "13", "known-article.html"),
    null,
  );
  assert.equal(
    getDatedBloggerCandidate("2024", "9", "known-article.html"),
    null,
  );
  assert.equal(
    getDatedBloggerCandidate("2024", "09", "bad/path.html"),
    null,
  );
  assert.equal(
    getDatedBloggerCandidate("2024", "09", "account.html"),
    null,
  );

  assert.equal(
    await resolveLegacyContentRedirect("known-article", async () => true),
    "/known-article",
  );
  assert.equal(
    await resolveLegacyContentRedirect("unknown-article", async () => false),
    null,
  );

  let invalidLookupCount = 0;
  assert.equal(
    await resolveLegacyContentRedirect(null, async () => {
      invalidLookupCount += 1;
      return true;
    }),
    null,
  );
  assert.equal(invalidLookupCount, 0, "malformed legacy URLs do not query Sanity");

  const providerFailure = new Error("Sanity unavailable");
  await assert.rejects(
    () =>
      resolveLegacyContentRedirect("known-article", async () => {
        throw providerFailure;
      }),
    (error) => error === providerFailure,
  );
}

function verifyRouteIntegrationAndNoSoftRedirects(): void {
  const rootRouteSource = readSource("src/app/(site)/[slug]/page.tsx");
  const datedRouteSource = readSource(
    "src/app/(site)/[slug]/[month]/[legacySlug]/page.tsx",
  );
  const configSource = readSource("next.config.ts");

  assert.equal(rootRouteSource.match(/slug\.endsWith\("\.html"\)/g)?.length, 2);
  assert.match(rootRouteSource, /getRootHtmlCandidate\(slug\)/);
  assert.match(rootRouteSource, /resolveLegacyContentRedirect/);
  assert.match(rootRouteSource, /if \(!legacyTarget\) notFound\(\)/);
  assert.equal(
    rootRouteSource.match(/permanentRedirect\(legacyTarget\)/g)?.length,
    2,
    "metadata and render paths perform the same permanent redirect",
  );

  assert.match(datedRouteSource, /getDatedBloggerCandidate/);
  assert.match(datedRouteSource, /resolveLegacyContentRedirect/);
  assert.match(datedRouteSource, /if \(!target\) notFound\(\)/);
  assert.match(datedRouteSource, /permanentRedirect\(target\)/);

  assert.doesNotMatch(configSource, /\.html/);
  assert.doesNotMatch(
    configSource,
    /the-new-scarcity-economy-macro-crisis/,
  );
  assert.doesNotMatch(configSource, /destination:\s*"\/"|destination:\s*'\/'/);

  for (const source of [rootRouteSource, datedRouteSource]) {
    assert.doesNotMatch(source, /permanentRedirect\("\/"\)/);
    assert.doesNotMatch(source, /redirect\("\/"\)/);
  }
}

function verifySearchPolicy(): void {
  const urls = new Set(
    buildSitemap({ posts: [], categorySlugs: [] }).map((entry) => entry.url),
  );
  const origin = "https://chronoversecapital.com";
  assert.equal(urls.has(`${origin}/markets`), true);
  assert.equal(urls.has(`${origin}/pricing`), true);

  for (const legacyOrPrivateUrl of [
    "/intelligence",
    "/products",
    "/vip",
    "/2024/09/known-article.html",
    "/known-article.html",
  ]) {
    assert.equal(urls.has(`${origin}${legacyOrPrivateUrl}`), false);
  }

  const reservedSource = readSource("src/lib/content/reservedSlugs.ts");
  assert.match(reservedSource, /"intelligence"/);
  assert.match(reservedSource, /"products"/);
  assert.doesNotMatch(
    reservedSource,
    /"the-new-scarcity-economy-macro-crisis"/,
  );
}

async function main(): Promise<void> {
  verifyIntelligenceAndProductsPolicy();
  await verifyLegacyArticleNormalization();
  verifyRouteIntegrationAndNoSoftRedirects();
  verifySearchPolicy();

  console.log("PASS: SEO-B9 truthful legacy redirect and retirement policy");
}

void main();
