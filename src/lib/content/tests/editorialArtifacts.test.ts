import assert from "node:assert/strict";
import type { PortableTextBlock } from "@portabletext/types";
import { renderToStaticMarkup } from "react-dom/server";

import ReportsPage from "../../../app/(site)/reports/page";
import CategoryPage from "../../../app/(site)/category/[slug]/page";
import { client } from "../../../sanity/client";

import { getSanityArticles, getRelatedArticleCandidates, stripHtml } from "../../content";
import { normalizeEditorialArtifacts, normalizeEditorialBlocks } from "../../editorialArtifacts";
import { generateExcerpt, generateFallbackTags } from "../../metadataFallback";
import { generateExecutiveSummary } from "../../executiveSummary";
import { computeTopRelatedArticles } from "../../relatedArticles";
import { normalizeArticleSeo, buildArticleJsonLd, buildArticleMetadata } from "../../seo/article";
import { buildRssXml, resolveRssDescription, type RssArticle } from "../../seo/rss";

const before = "Bitcoin, Gold and Oil remain legitimate editorial research topics.";
const after = "Euro liquidity responds to monetary policy and funding conditions.";
const rows = [
  "SYSTEM ENTROPY CHECK // BTC: $128,450.00 | GOLD: $2,845.50 | OIL: $80.50 | US10Y: 5.62% | VIX: 44.80 | [Gear 01/12]",
  "SYSTEM ENTROPY CHECK: BTC/USD: $92,450 | US10Y YIELD: 4.68% | VIX: 19.2 | GLOBAL DEBT: TERMINAL VELOCITY",
  "[SYSTEM ENTROPY CHECK: 15-AUG-1971 // CURRENT ECHO: 2026] | STATUS: HISTORICAL PIVOT DECRYPTION | PROTOCOL: NIXON-SHOCK",
];

for (const row of rows) {
  for (const input of [
    `${before}\n${row}\n${after}`,
    `<p>${before}</p><div>${row}</div><p>${after}</p>`,
    `${before} ${row} ${after}`,
    `<p>${before}<br>${row}<br>${after}</p>`,
    `<p>${before} ${row.replace("SYSTEM ENTROPY", "<strong>SYSTEM</strong> ENTROPY")} ${after}</p>`,
  ]) {
    const normalized = normalizeEditorialArtifacts(input);
    assert.doesNotMatch(stripHtml(normalized), /SYSTEM ENTROPY CHECK|128,450|92,450|TERMINAL VELOCITY|NIXON-SHOCK/);
    assert.ok(normalized.includes(before));
    assert.ok(normalized.includes(after));
    assert.equal(normalizeEditorialArtifacts(normalized), normalized);
  }
}
assert.equal(normalizeEditorialArtifacts(before), before);
assert.equal(normalizeEditorialArtifacts("Gold: $2,845.50 | VIX: 44.80"), "Gold: $2,845.50 | VIX: 44.80");
assert.equal(normalizeEditorialArtifacts(`SYSTEM ENTROPY CHECK: ${after}`), after, "unrecognized prose is preserved");
assert.equal(normalizeEditorialArtifacts(`${rows[0]} Table of Contents 01. Evidence`), " Table of Contents 01. Evidence");
assert.doesNotMatch(normalizeEditorialArtifacts(rows.join("\n")), /SYSTEM ENTROPY CHECK/);

const body: PortableTextBlock[] = [{
  _type: "block", _key: "paragraph", style: "normal", markDefs: [],
  children: [
    { _type: "span", _key: "before", marks: [], text: `${before}\nSYSTEM ` },
    { _type: "span", _key: "artifact", marks: ["strong"], text: `ENTROPY CHECK: BTC/USD: $92,450 | GLOBAL DEBT: TERMINAL VELOCITY\n${after}` },
  ],
}];
const snapshot = JSON.stringify(body);
const normalizedBody = normalizeEditorialBlocks(body);
assert.equal(JSON.stringify(body), snapshot, "CMS input is never mutated");
assert.doesNotMatch(normalizedBody[0].children.map((span) => span.text).join(""), /SYSTEM ENTROPY CHECK|TERMINAL VELOCITY/);
assert.deepEqual(normalizedBody[0].children[1].marks, ["strong"]);
assert.deepEqual(normalizeEditorialBlocks(normalizedBody), normalizedBody);

async function main(): Promise<void> {
  const contaminated = `${before}\n${rows[0]}\n${rows[1]}\n${after}`;
  const rawPost = {
    slug: "legitimate-research", title: "Euro liquidity", publishedAt: "2026-09-19T00:00:00Z",
    updatedAt: null, category: "Macro", categorySlug: "macro", keywords: null,
    content: contaminated, legacyBody: `<h1>Evidence</h1><p>${contaminated}</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)">`,
    imageUrl: null, author: null, seoDescription: rows[0], excerpt: rows[1], bodyPlainText: contaminated,
    body, manualRelatedLinks: null,
  };
  const [article] = await getSanityArticles(async () => [rawPost]);
  assert.doesNotMatch(JSON.stringify(article), /SYSTEM ENTROPY CHECK|128,450|92,450|TERMINAL VELOCITY|<script|onerror|javascript:/);
  assert.ok(article.legacyBody?.includes("<h2>Evidence</h2>"));
  assert.ok(article.bodyContent?.includes(before));
  assert.ok(article.bodyContent?.includes(after));
  const originalFetch = client.fetch;
  try {
    client.fetch = (async () => [rawPost]) as unknown as typeof client.fetch;
    const reportsHtml = renderToStaticMarkup(await ReportsPage());
    client.fetch = (async () => ({
      category: { title: "Macro", slug: "macro", description: null }, articles: [rawPost],
    })) as unknown as typeof client.fetch;
    const categoryHtml = renderToStaticMarkup(await CategoryPage({ params: Promise.resolve({ slug: "macro" }) }));
    for (const html of [reportsHtml, categoryHtml]) {
      assert.doesNotMatch(html, /SYSTEM ENTROPY CHECK|128,450|TERMINAL VELOCITY/);
      assert.match(html, /Bitcoin, Gold and Oil/);
    }
  } finally {
    client.fetch = originalFetch;
  }
  assert.equal(article.seoDescription, generateExcerpt(article.bodyContent!));
  assert.deepEqual(article.keywords, generateFallbackTags(article.title, article.bodyContent!));
  assert.equal(article.keywords.includes("entropy"), false);
  const summary = generateExecutiveSummary(article.title, article.category, article.bodyContent, article.keywords);
  assert.doesNotMatch(summary.join(" "), /SYSTEM ENTROPY CHECK|128,450|TERMINAL VELOCITY/);
  assert.ok(summary.join(" ").includes(after));
  const seo = normalizeArticleSeo({ ...article, seoDescription: article.authoredSeoDescription, bodyText: article.bodyContent });
  assert.equal(seo.descriptionSource, "body");
  assert.doesNotMatch(JSON.stringify(buildArticleMetadata(seo)), /SYSTEM ENTROPY CHECK|128,450|TERMINAL VELOCITY/);
  assert.doesNotMatch(JSON.stringify(buildArticleJsonLd(seo)), /SYSTEM ENTROPY CHECK|128,450/);

  const candidates = await getRelatedArticleCandidates(article.slug, async () => [{
    ...rawPost, keywords: [rows[0], "monetary"], excerpt: `${rows[1]}\n${after}`,
  }]);
  assert.doesNotMatch(JSON.stringify(candidates), /SYSTEM ENTROPY CHECK|TERMINAL VELOCITY/);
  const candidatesForRanking = [
    { ...article, slug: "unrelated", title: "Entropy terminal velocity", category: "Other", categorySlug: "other", keywords: ["entropy"], legacyBody: "", bodyContent: "terminal velocity" },
    { ...article, slug: "policy", title: "Monetary policy", category: "Other", categorySlug: "other", keywords: [], legacyBody: "", bodyContent: after },
  ];
  assert.equal(computeTopRelatedArticles(article, candidatesForRanking, 1)[0].slug, "policy");

  const rss: RssArticle = {
    slug: article.slug, title: article.title, publishedAt: rawPost.publishedAt,
    seoDescription: rows[0], excerpt: rows[1], bodyPlainText: contaminated,
    bodyRaw: rawPost.legacyBody, categoryTitle: null, authorName: null,
  };
  for (const post of [rss, { ...rss, bodyPlainText: null }, { ...rss, seoDescription: `${rows[0]}\n${after}` }]) {
    assert.doesNotMatch(resolveRssDescription(post), /SYSTEM ENTROPY CHECK|128,450|TERMINAL VELOCITY|alert/);
    assert.match(resolveRssDescription(post), /Euro liquidity/);
    assert.doesNotMatch(buildRssXml([post]), /SYSTEM ENTROPY CHECK|128,450|TERMINAL VELOCITY/);
  }
  console.log("PASS: editorial artifact normalization and downstream public surfaces");
}
void main();
