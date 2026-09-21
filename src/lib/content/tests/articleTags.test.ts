import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { getSanityArticles } from "../../content";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const baseRawPost = {
  slug: "tagged-article",
  title: "Tagged article",
  publishedAt: "2026-09-21T08:00:00.000Z",
  updatedAt: "2026-09-21T09:00:00.000Z",
  category: "Macroeconomics",
  categorySlug: "macroeconomics",
  content: null,
  legacyBody: null,
  imageUrl: null,
  author: null,
};

function verifyNativeTagAuthoringContract(): void {
  const schemaSource = readSource("src/sanity/schemaTypes/post.ts");
  const tagsField = schemaSource.slice(
    schemaSource.indexOf("name: 'tags'"),
    schemaSource.indexOf("name: 'mainImage'"),
  );

  assert.match(tagsField, /type: 'array'/);
  assert.match(tagsField, /defineArrayMember\(\{[\s\S]*type: 'string'/);
  assert.match(tagsField, /options: \{ layout: 'tags' \}/);
  assert.match(tagsField, /press Enter/);
  assert.match(tagsField, /Free-form tags are supported/);
  assert.match(tagsField, /Rule\.unique\(\)\.warning/);
  assert.match(tagsField, /Rule\.max\(12\)\.warning/);
  assert.match(tagsField, /Rule\.max\(48\)\.warning/);
  assert.doesNotMatch(tagsField, /components\s*:/);
  assert.doesNotMatch(tagsField, /options:[\s\S]*list\s*:/);
}

async function verifyTagMappingContract(): Promise<void> {
  const authoredTags = ["Macro Liquidity", "Bitcoin", "EUR/USD"];
  const [taggedArticle] = await getSanityArticles(async () => [
    {
      ...baseRawPost,
      keywords: authoredTags,
      legacyBody: "<h1>Legacy heading</h1><p>Legacy body remains intact.</p>",
    },
  ]);

  assert.deepEqual(
    taggedArticle.keywords,
    authoredTags,
    "authored tag spelling, case, order, and multiplicity must survive mapping",
  );
  assert.match(taggedArticle.legacyBody || "", /<h2>Legacy heading<\/h2>/);
  assert.match(taggedArticle.legacyBody || "", /Legacy body remains intact\./);

  const [untaggedArticle] = await getSanityArticles(async () => [
    {
      ...baseRawPost,
      slug: "untagged-article",
      title: "Liquidity conditions remain stable",
      keywords: null,
      legacyBody: "<p>Liquidity conditions remain stable across markets.</p>",
    },
  ]);

  assert.ok(Array.isArray(untaggedArticle.keywords));
  assert.ok(untaggedArticle.keywords.length > 0);
}

function verifyPublicDataFlow(): void {
  const contentSource = readSource("src/lib/content.ts");
  const articlePageSource = readSource("src/app/(site)/[slug]/page.tsx");
  const articleSeoSource = readSource("src/lib/seo/article.ts");

  assert.ok(
    (contentSource.match(/"keywords": coalesce\(tags, keywords, \[\]\)/g) || [])
      .length >= 3,
    "every post projection must retain authored tags and legacy keywords",
  );
  assert.match(contentSource, /keywords: resolvedKeywords/);
  assert.match(
    articlePageSource,
    /const displayTags = \(currentPost\.keywords \|\| \[\]\)\.slice\(0, 8\)/,
  );
  assert.match(articlePageSource, /displayTags\.map\(\(tag\) =>/);
  assert.match(articlePageSource, /keywords: article\.keywords/);
  assert.match(articleSeoSource, /keywords: \[\.\.\.article\.keywords\]/);
}

async function main(): Promise<void> {
  verifyNativeTagAuthoringContract();
  await verifyTagMappingContract();
  verifyPublicDataFlow();
  console.log("PASS: Sanity article tags authoring and data flow");
}

void main();
