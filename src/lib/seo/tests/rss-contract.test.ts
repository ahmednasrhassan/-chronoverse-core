import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { GET as getFeedRedirect } from "@/app/feed.xml/route";
import {
  buildRssXml,
  legacyHtmlToPlainText,
  resolveRssDescription,
  type RssArticle,
} from "../rss";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const basePost: RssArticle = {
  slug: "euro-liquidity-update",
  title: "Euro & Liquidity <Update>",
  publishedAt: "2026-09-13T07:08:09.123Z",
  seoDescription: "Authored SEO & factual description.",
  excerpt: "Authored excerpt.",
  bodyPlainText: "Portable Text fallback.",
  bodyRaw: "<p>Legacy body fallback.</p>",
  categoryTitle: "Macro & Rates",
  authorName: "Analyst & Author",
};

function verifyDescriptionOrderAndLegacySafety(): void {
  assert.equal(
    resolveRssDescription(basePost),
    "Authored SEO & factual description.",
  );
  assert.equal(
    resolveRssDescription({ ...basePost, seoDescription: null }),
    "Authored excerpt.",
  );
  assert.equal(
    resolveRssDescription({
      ...basePost,
      seoDescription: null,
      excerpt: null,
    }),
    "Portable Text fallback.",
  );

  const bodyRaw =
    '<script>alert("leak")</script><p>Legacy <strong>body</strong> &amp; facts.</p>';
  const legacy = legacyHtmlToPlainText(bodyRaw);
  assert.equal(legacy, "Legacy body & facts.");
  assert.equal(legacy.includes("alert"), false);
  assert.equal(
    resolveRssDescription({
      ...basePost,
      seoDescription: null,
      excerpt: null,
      bodyPlainText: null,
      bodyRaw,
    }),
    legacy,
  );
}

function verifyCanonicalRssXml(): void {
  const withoutAuthor: RssArticle = {
    ...basePost,
    slug: "author-omitted",
    title: "No author",
    authorName: null,
    seoDescription: null,
    excerpt: "Excerpt fallback.",
  };
  const legacyPost: RssArticle = {
    ...basePost,
    slug: "legacy-body",
    title: "Legacy body",
    authorName: null,
    seoDescription: null,
    excerpt: null,
    bodyPlainText: null,
    bodyRaw:
      '<script>alert("leak")</script><p>Legacy <strong>body</strong> &amp; facts.</p>',
  };
  const missingDate: RssArticle = {
    ...basePost,
    slug: "missing-date",
    title: "Missing date must not be fabricated",
    publishedAt: null,
  };
  const xml = buildRssXml(
    [basePost, withoutAuthor, legacyPost, missingDate],
    new Date("2026-09-14T12:00:00.000Z"),
  );

  assert.match(xml, /<title>Chronoverse Capital<\/title>/);
  assert.match(
    xml,
    /<description>Published market research and analytical updates from Chronoverse Capital\.<\/description>/,
  );
  assert.match(
    xml,
    /<atom:link href="https:\/\/chronoversecapital\.com\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/,
  );
  assert.match(xml, /xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/"/);
  assert.match(xml, /<title>Euro &amp; Liquidity &lt;Update&gt;<\/title>/);
  assert.match(
    xml,
    /<link>https:\/\/chronoversecapital\.com\/euro-liquidity-update<\/link>/,
  );
  assert.match(
    xml,
    /<guid isPermaLink="true">https:\/\/chronoversecapital\.com\/euro-liquidity-update<\/guid>/,
  );
  assert.match(xml, /<pubDate>Sun, 13 Sep 2026 07:08:09 GMT<\/pubDate>/);
  assert.match(
    xml,
    /<description>Authored SEO &amp; factual description\.<\/description>/,
  );
  assert.match(xml, /<dc:creator>Analyst &amp; Author<\/dc:creator>/);
  assert.equal(xml.match(/<dc:creator>/g)?.length, 1);
  assert.match(xml, /<description>Legacy body &amp; facts\.<\/description>/);
  assert.equal(xml.includes("<script>"), false);
  assert.equal(xml.includes("alert"), false);
  assert.equal(xml.includes("Missing date must not be fabricated"), false);
}

async function verifyFeedRedirectAndQueryBoundary(): Promise<void> {
  const response = await getFeedRedirect();
  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get("location"),
    "https://chronoversecapital.com/rss.xml",
  );

  const rssSource = readSource("src/app/rss.xml/route.ts");
  const feedSource = readSource("src/app/feed.xml/route.ts");
  assert.match(rssSource, /defined\(publishedAt\)/);
  assert.match(rssSource, /publishedAt <= now\(\)/);
  assert.match(rssSource, /order\(publishedAt desc\) \[0\.\.\.50\]/);
  assert.match(rssSource, /"bodyRaw": bodyRaw/);
  assert.match(rssSource, /"authorName": author->name/);
  assert.match(rssSource, /buildRssXml\(posts\)/);
  assert.doesNotMatch(rssSource, /Response\.redirect/);
  assert.match(rssSource, /status: 200/);
  assert.doesNotMatch(feedSource, /client\.fetch/);
  assert.match(feedSource, /Response\.redirect\(RSS_CANONICAL_URL, 301\)/);
}

async function main(): Promise<void> {
  verifyDescriptionOrderAndLegacySafety();
  verifyCanonicalRssXml();
  await verifyFeedRedirectAndQueryBoundary();
  console.log("PASS: SEO-B7 canonical RSS and feed redirect");
}

void main();
