import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ARCHIVE_PAGE_SIZE,
  getArchivePage,
  parseArchivePage,
} from "../../archive";
import {
  getRelatedArticleCandidates,
  RELATED_ARTICLE_CANDIDATE_LIMIT,
  type ContentItem,
} from "../../content";
import {
  RELATED_ARTICLE_VISIBLE_LIMIT,
  selectRelatedArticles,
} from "../../relatedArticles";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const makeContentItem = (slug: string): ContentItem => ({
  slug,
  title: `Article ${slug}`,
  date: "2026-09-14",
  category: "Macro",
  categorySlug: "macro",
  keywords: ["euro"],
  content: "",
});

async function verifyRelatedCandidateBoundary(): Promise<void> {
  let capturedQuery = "";
  let capturedParams: { currentSlug: string; limit: number } | undefined;
  let providerCalls = 0;
  const oversizedResult = Array.from(
    { length: RELATED_ARTICLE_CANDIDATE_LIMIT + 5 },
    (_, index) => ({
      slug: `candidate-${index}`,
      title: `Candidate ${index}`,
      publishedAt: "2026-09-14T00:00:00.000Z",
      category: "Macro",
      categorySlug: "macro",
      keywords: ["euro"],
      excerpt: "A concise authored excerpt.",
    }),
  );

  const candidates = await getRelatedArticleCandidates(
    "current-article",
    async (query, params) => {
      providerCalls += 1;
      capturedQuery = query;
      capturedParams = params;
      return oversizedResult;
    },
  );

  assert.equal(RELATED_ARTICLE_CANDIDATE_LIMIT, 24);
  assert.equal(providerCalls, 1);
  assert.equal(candidates.length, RELATED_ARTICLE_CANDIDATE_LIMIT);
  assert.deepEqual(capturedParams, {
    currentSlug: "current-article",
    limit: RELATED_ARTICLE_CANDIDATE_LIMIT,
  });
  assert.match(capturedQuery, /slug\.current != \$currentSlug/);
  assert.match(capturedQuery, /defined\(publishedAt\)/);
  assert.match(capturedQuery, /publishedAt <= now\(\)/);
  assert.match(capturedQuery, /!\(_id in path\('drafts\.\*\*'\)\)/);
  assert.match(capturedQuery, /\[0\.\.\.\$limit\]/);
  assert.doesNotMatch(
    capturedQuery,
    /bodyRaw|\bbody\b|mainImage|imageUrl|author->|manualRelatedLinks/,
  );

  const articlePageSource = readSource("src/app/(site)/[slug]/page.tsx");
  assert.doesNotMatch(articlePageSource, /^"use client"/);
  assert.match(articlePageSource, /getRelatedArticleCandidates\(currentPost\.slug\)/);

  const failure = new Error("related provider unavailable");
  await assert.rejects(
    () => getRelatedArticleCandidates("current-article", async () => {
      throw failure;
    }),
    (error) => error === failure,
  );
}

function verifyVisibleRelatedContract(): void {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    makeContentItem(`candidate-${index}`),
  );
  const manual = Array.from({ length: 10 }, (_, index) =>
    makeContentItem(`manual-${index}`),
  );
  const current = { ...makeContentItem("current"), manualRelatedLinks: manual };

  assert.equal(RELATED_ARTICLE_VISIBLE_LIMIT, 8);
  assert.deepEqual(
    selectRelatedArticles(current, candidates).map((article) => article.slug),
    manual.slice(0, RELATED_ARTICLE_VISIBLE_LIMIT).map((article) => article.slug),
  );
  assert.equal(
    selectRelatedArticles(makeContentItem("current"), candidates).length,
    RELATED_ARTICLE_VISIBLE_LIMIT,
  );
  assert.equal(
    selectRelatedArticles(makeContentItem("current"), [
      makeContentItem("current"),
    ]).length,
    0,
  );
}

async function verifyArchiveBoundary(): Promise<void> {
  assert.equal(parseArchivePage(undefined), 1);
  assert.equal(parseArchivePage("invalid"), 1);
  assert.equal(parseArchivePage("0"), 1);
  assert.equal(parseArchivePage("-2"), 1);
  assert.equal(parseArchivePage(["2", "3"]), 1);
  assert.equal(parseArchivePage("2"), 2);
  assert.equal(parseArchivePage("999999"), 1000);

  let capturedQuery = "";
  let capturedParams: { start: number; end: number } | undefined;
  const rows = Array.from({ length: ARCHIVE_PAGE_SIZE + 1 }, (_, index) => ({
    slug: `archive-${index}`,
    title: `Archive ${index}`,
    date: "2026-09-14T00:00:00.000Z",
    category: "Macro",
    categorySlug: "macro",
  }));
  const result = await getArchivePage(2, async (query, params) => {
    capturedQuery = query;
    capturedParams = params;
    return rows;
  });

  assert.equal(ARCHIVE_PAGE_SIZE, 50);
  assert.equal(result.posts.length, ARCHIVE_PAGE_SIZE);
  assert.equal(result.hasNext, true);
  assert.deepEqual(capturedParams, { start: 50, end: 101 });
  assert.match(capturedQuery, /\[\$start\.\.\.\$end\]/);
  assert.match(capturedQuery, /publishedAt <= now\(\)/);
  assert.doesNotMatch(
    capturedQuery,
    /bodyRaw|\bbody\b|mainImage|imageUrl|excerpt/,
  );

  const finalPage = await getArchivePage(1, async () =>
    rows.slice(0, ARCHIVE_PAGE_SIZE),
  );
  assert.equal(finalPage.posts.length, ARCHIVE_PAGE_SIZE);
  assert.equal(finalPage.hasNext, false);

  const failure = new Error("archive provider unavailable");
  await assert.rejects(
    () => getArchivePage(1, async () => {
      throw failure;
    }),
    (error) => error === failure,
  );

  const archiveSource = readSource("src/app/(site)/archive/page.tsx");
  assert.doesNotMatch(archiveSource, /50000/);
  assert.doesNotMatch(archiveSource, /^"use client"/);
  assert.doesNotMatch(archiveSource, /catch\s*\(/);
  assert.match(archiveSource, /aria-label="Archive pagination"/);
  assert.match(archiveSource, /← Previous/);
  assert.match(archiveSource, /Next →/);
  assert.match(
    archiveSource,
    /robots:\s*\{[\s\S]*?index:\s*false,[\s\S]*?follow:\s*true/,
  );

  const sitemapSource = readSource("src/app/sitemap.ts");
  assert.doesNotMatch(sitemapSource, /\{\s*path:\s*"archive"/);
}

async function main(): Promise<void> {
  await verifyRelatedCandidateBoundary();
  verifyVisibleRelatedContract();
  await verifyArchiveBoundary();
  console.log("PASS: SEO-B11A editorial query and payload boundaries");
}

void main();
