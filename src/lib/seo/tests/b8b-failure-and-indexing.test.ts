import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { GET as getFeedRedirect } from "@/app/feed.xml/route";
import { createRssResponse } from "@/app/rss.xml/route";
import { buildSitemap, loadSitemapContent } from "@/app/sitemap";
import {
  getSanityArticles,
  type ContentItem,
  type PageContentItem,
} from "@/lib/content";
import {
  requireRootContent,
  resolveRootContent,
} from "@/lib/seo/article-data";
import {
  buildArticleJsonLd,
  buildArticleMetadata,
  normalizeArticleSeo,
} from "@/lib/seo/article";
import { buildCmsPageMetadata } from "@/lib/seo/cms-page";
import type { RssArticle } from "@/lib/seo/rss";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const post: ContentItem = {
  slug: "liquidity-cycle-update",
  title: "Liquidity Cycle Update",
  date: "2026-09-13",
  publishedAt: "2026-09-13T07:08:09.123Z",
  updatedAt: "2026-09-14T10:11:12.456Z",
  category: "Macro Liquidity",
  categorySlug: "macro-liquidity",
  keywords: ["liquidity"],
  content: "Published research.",
  bodyContent: "Published research.",
};

const page: PageContentItem = {
  slug: "legacy-custom-page",
  title: "Legacy Custom Page",
  seoDescription: "Truthful legacy page description.",
  legacyHtml: "<p>Preserved legacy content.</p>",
};

const rssPost: RssArticle = {
  slug: post.slug,
  title: post.title,
  publishedAt: post.publishedAt || null,
  seoDescription: "Published RSS description.",
  excerpt: null,
  bodyPlainText: post.bodyContent || null,
  bodyRaw: null,
  categoryTitle: post.category,
  authorName: null,
};

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value && typeof value === "object", `${label} must be present`);
  return value as Record<string, unknown>;
}

async function verifyRootResolutionContract(): Promise<void> {
  let pageLoads = 0;
  const resolvedPost = await resolveRootContent(
    Promise.resolve(post),
    async () => {
      pageLoads += 1;
      return page;
    },
  );
  assert.deepEqual(resolvedPost, { kind: "post", post });
  assert.equal(pageLoads, 0, "Post wins and Page is not queried");

  const resolvedPage = await resolveRootContent(
    Promise.resolve(null),
    async () => page,
  );
  assert.deepEqual(resolvedPage, { kind: "page", page });

  const missing = await resolveRootContent(
    Promise.resolve(null),
    async () => null,
  );
  assert.equal(missing, null);
  let notFoundError: unknown;
  try {
    requireRootContent(missing);
  } catch (error) {
    notFoundError = error;
  }
  assert.equal(
    (notFoundError as Error & { readonly digest?: string }).digest,
    "NEXT_HTTP_ERROR_FALLBACK;404",
    "successful Post and Page misses use genuine notFound behavior",
  );

  const postFailure = new Error("post provider unavailable");
  await assert.rejects(
    () =>
      resolveRootContent(Promise.reject(postFailure), async () => {
        pageLoads += 1;
        return page;
      }),
    (error) => error === postFailure,
  );
  assert.equal(pageLoads, 0, "Post failure does not fall through to Page");

  const pageFailure = new Error("page provider unavailable");
  await assert.rejects(
    () =>
      resolveRootContent(Promise.resolve(null), async () => {
        throw pageFailure;
      }),
    (error) => error === pageFailure,
  );

  const contentSource = readSource("src/lib/content.ts");
  const articleLoader = contentSource.slice(
    contentSource.indexOf("export async function getSanityArticleBySlug"),
    contentSource.indexOf("type SanityArticleCollectionLoader"),
  );
  const pageLoader = contentSource.slice(
    contentSource.indexOf("export async function getSanityPageBySlug"),
    contentSource.indexOf("export async function getAllCategories"),
  );
  assert.doesNotMatch(articleLoader, /catch\s*\(/);
  assert.doesNotMatch(pageLoader, /catch\s*\(/);
}

function verifyPostAndPageSearchPolicy(): void {
  const pageMetadata = buildCmsPageMetadata(page);
  const pageRobots = requireRecord(pageMetadata.robots, "CMS Page robots");
  const pageGoogleBot = requireRecord(
    pageRobots.googleBot,
    "CMS Page Google robots",
  );
  assert.equal(pageMetadata.title, page.title);
  assert.equal(pageMetadata.description, page.seoDescription);
  assert.equal(pageRobots.index, false);
  assert.equal(pageRobots.follow, true);
  assert.equal(pageGoogleBot.index, false);
  assert.equal(pageGoogleBot.follow, true);
  assert.equal(pageMetadata.alternates, undefined);
  assert.equal(
    requireRecord(pageMetadata.openGraph, "CMS Page Open Graph").url,
    undefined,
  );

  const normalizedPost = normalizeArticleSeo({
    slug: post.slug,
    title: post.title,
    bodyText: post.bodyContent,
    publishedAt: post.publishedAt,
    modifiedAt: post.updatedAt,
    category: post.category,
    keywords: post.keywords,
  });
  assert.equal(buildArticleMetadata(normalizedPost).robots, undefined);
  assert.equal(buildArticleJsonLd(normalizedPost)["@type"], "Article");

  const pageSource = readSource("src/app/(site)/[slug]/page.tsx");
  const pageBranch = pageSource.indexOf('if (content.kind === "page")');
  const postAssignment = pageSource.indexOf("const currentPost = content.post");
  const articleJsonLd = pageSource.indexOf('type="application/ld+json"');
  assert.ok(pageBranch >= 0 && pageBranch < postAssignment);
  assert.ok(postAssignment < articleJsonLd);
  assert.match(pageSource.slice(pageBranch, postAssignment), /legacyHtml/);
  assert.doesNotMatch(
    pageSource.slice(pageBranch, postAssignment),
    /application\/ld\+json/,
  );
  assert.equal(pageSource.match(/getArticleForRoute\(slug\)/g)?.length, 2);
  assert.equal(
    pageSource.match(/if \(isReservedRootSlug\(slug\)\) notFound\(\);/g)
      ?.length,
    2,
  );
}

async function verifyListingFailureContract(): Promise<void> {
  assert.deepEqual(await getSanityArticles(async () => []), []);

  const failure = new Error("listing provider unavailable");
  await assert.rejects(
    () =>
      getSanityArticles(async () => {
        throw failure;
      }),
    (error) => error === failure,
  );
}

async function verifyRssFailureContract(): Promise<void> {
  const populated = await createRssResponse(async () => [rssPost]);
  assert.equal(populated.status, 200);
  assert.match(
    populated.headers.get("content-type") || "",
    /^application\/rss\+xml/,
  );
  assert.match(await populated.text(), /<item>/);

  const empty = await createRssResponse(async () => []);
  assert.equal(empty.status, 200);
  const emptyXml = await empty.text();
  assert.match(emptyXml, /<rss version="2\.0"/);
  assert.doesNotMatch(emptyXml, /<item>/);

  const unavailable = await createRssResponse(async () => {
    throw new Error("rss provider unavailable");
  });
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.headers.get("content-type") || "", /^text\/plain/);
  assert.doesNotMatch(await unavailable.text(), /<rss|<channel|<item>/);

  const redirect = await getFeedRedirect();
  assert.equal(redirect.status, 301);
  assert.equal(
    redirect.headers.get("location"),
    "https://chronoversecapital.com/rss.xml",
  );
}

async function verifySitemapPolicyAndAtomicity(): Promise<void> {
  const sitemap = buildSitemap({
    posts: [
      {
        slug: post.slug,
        updatedAt: post.updatedAt,
        publishedAt: post.publishedAt,
      },
      {
        slug: "publication-date-only",
        publishedAt: "2026-09-12T01:02:03.000Z",
      },
      { slug: "factual-date-unknown" },
      { slug: "account", updatedAt: "2026-09-14T00:00:00.000Z" },
      { slug: "invalid/path", updatedAt: "2026-09-14T00:00:00.000Z" },
    ],
    categorySlugs: ["macro-liquidity", "account", "invalid/path", ""],
  });
  const byUrl = new Map(sitemap.map((entry) => [entry.url, entry]));
  const urls = new Set(byUrl.keys());
  const origin = "https://chronoversecapital.com";

  for (const pathname of [
    "/",
    "/about",
    "/contact",
    "/data-sources",
    "/disclaimer",
    "/dmca",
    "/editorial-policy",
    "/faq",
    "/freshness",
    "/newsletter",
    "/markets",
    "/methodology",
    "/pricing",
    "/privacy-policy",
    "/reports",
    "/terms-of-service",
  ]) {
    assert.equal(urls.has(`${origin}${pathname}`), true, pathname);
  }

  for (const pathname of [
    "/archive",
    "/vip",
    "/account",
    "/billing",
    "/manifesto",
    "/sponsors",
    "/studio",
    "/rss.xml",
    "/feed.xml",
    "/api/revalidate",
    "/legacy-custom-page",
    "/invalid/path",
    "/category/invalid/path",
  ]) {
    assert.equal(urls.has(`${origin}${pathname}`), false, pathname);
  }

  assert.equal(urls.has(`${origin}/${post.slug}`), true);
  assert.equal(urls.has(`${origin}/category/macro-liquidity`), true);
  assert.equal(
    urls.has(`${origin}/category/account`),
    true,
    "root reservations do not apply inside the Category namespace",
  );
  assert.equal(
    byUrl.get(`${origin}/${post.slug}`)?.lastModified,
    post.updatedAt,
  );
  assert.equal(
    byUrl.get(`${origin}/publication-date-only`)?.lastModified,
    "2026-09-12T01:02:03.000Z",
  );
  assert.equal(
    byUrl.get(`${origin}/factual-date-unknown`)?.lastModified,
    undefined,
  );
  assert.equal(
    sitemap.every((entry) => entry.url.startsWith(origin)),
    true,
  );

  const providerFailure = new Error("sitemap provider unavailable");
  await assert.rejects(
    () =>
      loadSitemapContent(
        async () => {
          throw providerFailure;
        },
        async () => ["macro-liquidity"],
      ),
    (error) => error === providerFailure,
  );
  await assert.rejects(
    () =>
      loadSitemapContent(
        async () => [],
        async () => {
          throw providerFailure;
        },
      ),
    (error) => error === providerFailure,
  );

  const sitemapSource = readSource("src/app/sitemap.ts");
  assert.doesNotMatch(sitemapSource, /NEXT_PUBLIC_SITE_URL|VERCEL_URL/);
  assert.doesNotMatch(sitemapSource, /new Date\s*\(/);
  assert.doesNotMatch(sitemapSource, /_type == "page"/);
  assert.doesNotMatch(sitemapSource, /catch\s*\(/);
  assert.match(sitemapSource, /isReservedRootSlug\(post\.slug\)/);
  assert.match(sitemapSource, /defined\(category->slug\.current\)/);
  assert.match(sitemapSource, /hasUncategorizedPosts/);
  assert.match(sitemapSource, /hasGeneralCategory/);
}

async function main(): Promise<void> {
  await verifyRootResolutionContract();
  verifyPostAndPageSearchPolicy();
  await verifyListingFailureContract();
  await verifyRssFailureContract();
  await verifySitemapPolicyAndAtomicity();

  console.log(
    "PASS: SEO-B8B Sanity failures, CMS Page policy, RSS, and sitemap integrity",
  );
}

void main();
