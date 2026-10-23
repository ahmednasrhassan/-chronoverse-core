import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FreeHomePageContent, ResearchArticles } from "../FreeHomePageContent";
import type { ContentItem } from "../../../lib/content";

const articles: ContentItem[] = ["first", "second", "third"].map((slug) => ({
  slug: `published-${slug}`,
  title: `Published research ${slug}`,
  date: "2026-10-22",
  category: "Financial History",
  keywords: [],
  content: "Published article fixture.",
  cardImageUrl: `https://cdn.sanity.io/images/fixture/production/${slug}.webp`,
  imageAlt: `Editorial photograph ${slug}`,
}));
const research = createElement(ResearchArticles, { articles });
const html = renderToStaticMarkup(createElement(FreeHomePageContent, {
  researchPreview: research,
}));
const imageSources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)]
  .map(([, src]) => decodeURIComponent(decodeURIComponent(src)));

assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
assert.match(html, /Independent Market Research &amp; Intelligence/);
assert.match(html, /href="\/reports"[^>]*>Explore Research/);
assert.doesNotMatch(html, /href="\/markets"|Explore Free Market Tools/);
assert.ok(html.indexOf("</h1>") < html.indexOf('id="latest-research-title"'));

assert.ok(html.indexOf('id="latest-research-title"') < html.indexOf('id="newsletter-title"'));
assert.equal((html.match(/<article\b/g) ?? []).length, 3);
for (const article of articles) {
  assert.ok(html.includes(`href="/${article.slug}"`));
  assert.ok(html.includes(article.title));
  assert.ok(html.includes(article.category));
  assert.ok(html.includes(`dateTime="${article.date}"`));
  assert.ok(imageSources.some((src) => src.includes(article.cardImageUrl!)));
  assert.ok(html.includes(`alt="${article.imageAlt}"`));
}
assert.match(html, /View All Research/);
assert.match(html, /href="\/freshness"/);
assert.doesNotMatch(html, /href="(?:\/pricing|\/vip|\/premium|https?:\/\/(?:shop|vault)\.)|Explore VIP|Browse Dossiers/);

const empty = renderToStaticMarkup(createElement(ResearchArticles, { articles: [] }));
assert.match(empty, /No published research is available/);
assert.doesNotMatch(empty, /<article\b|<img\b/);
console.log("PASS: editorial hierarchy, real article fields, linked tools and honest empty state");
