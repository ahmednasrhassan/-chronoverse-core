/**
 * Automated Relevance Engine for Internal Linking
 * ------------------------------------------------
 * Implements a lightweight, dependency-free content-relevance algorithm used
 * to power the automatic "Related Intelligence / Internal Links" block that
 * renders directly below the `legacyBody` HTML section on post pages.
 *
 * How it works:
 *  1. The current post's category, tags/keywords, title words, and the
 *     plain-text content extracted from `legacyBody`/`legacyHtml` (via
 *     `stripHtml`) are tokenized into a weighted "relevance profile".
 *  2. Every other fetched Sanity article is scored against that profile
 *     using simple keyword/category/title overlap matching.
 *  3. Articles are ranked by score (ties broken by most recent) and the
 *     TOP N (default 8) are returned.
 *
 * This is intentionally a deterministic, explainable heuristic (no external
 * AI/embedding calls) so it can run safely at build/request time for every
 * post page.
 */

import { stripHtml, type ContentItem } from "@/lib/content";

// Common English stopwords filtered out of title/content tokenization so
// they don't pollute the relevance scoring with noise words.
const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy",
  "did", "its", "let", "put", "say", "she", "too", "use", "with", "this",
  "that", "from", "have", "will", "your", "what", "when", "make", "like",
  "time", "just", "know", "take", "into", "year", "good", "some", "them",
  "than", "then", "look", "only", "come", "over", "also", "back", "after",
  "work", "well", "even", "want", "because", "these", "give", "most",
  "about", "which", "their", "would", "there", "could", "other", "more",
  "been", "being", "such", "each", "very", "into", "than", "while", "where",
]);

/**
 * Tokenize free text into lowercase, deduplicated, stopword-filtered words.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

interface RelevanceProfile {
  category: string;
  categorySlug?: string;
  keywords: Set<string>;
  titleWords: Set<string>;
  contentWords: Set<string>;
}

/**
 * Builds a weighted relevance profile for a given post, extracting plain
 * text from `legacyBody` (falling back to `bodyContent`/`content`) via
 * `stripHtml` so raw HTML tags never pollute the matching algorithm.
 */
function buildProfile(post: ContentItem): RelevanceProfile {
  const rawText = stripHtml(post.legacyBody || post.bodyContent || post.content || "");

  return {
    category: (post.category || "").toLowerCase(),
    categorySlug: post.categorySlug?.toLowerCase(),
    keywords: new Set((post.keywords || []).map((kw) => kw.toLowerCase().trim())),
    titleWords: new Set(tokenize(post.title || "")),
    // Cap content tokens to the first ~400 words for performance — plenty
    // of signal for keyword-overlap scoring without processing entire
    // legacy articles on every request.
    contentWords: new Set(tokenize(rawText).slice(0, 400)),
  };
}

function intersectionSize<T>(a: Set<T>, b: Set<T>): number {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count += 1;
  }
  return count;
}

/**
 * Scores a candidate article against the current post's relevance profile.
 * Weighting favors exact category matches highest, followed by shared
 * tags/keywords, shared title words, and finally shared body-content
 * keywords (capped to avoid long legacy posts dominating purely on length).
 */
function scoreCandidate(current: RelevanceProfile, candidate: RelevanceProfile): number {
  let score = 0;

  // Strongest signal: identical category.
  if (
    current.categorySlug &&
    candidate.categorySlug &&
    current.categorySlug === candidate.categorySlug
  ) {
    score += 10;
  } else if (current.category && candidate.category && current.category === candidate.category) {
    score += 10;
  }

  // Shared explicit tags/keywords — strong topical signal.
  score += intersectionSize(current.keywords, candidate.keywords) * 5;

  // Shared title words — likely covering the same subject.
  score += intersectionSize(current.titleWords, candidate.titleWords) * 3;

  // Shared body-content keywords — weaker but useful contextual signal,
  // capped so extremely long legacy posts don't dominate purely on volume.
  const contentOverlap = intersectionSize(current.contentWords, candidate.contentWords);
  score += Math.min(contentOverlap, 12) * 1;

  return score;
}

/**
 * Computes the TOP N most relevant internal articles for `currentPost` out
 * of `allArticles`, using automated category/tag/title/content keyword
 * matching. Excludes the current post itself. Falls back to the most
 * recently published posts if nothing scores above zero, so the block
 * always has content to render.
 */
export function computeTopRelatedArticles(
  currentPost: ContentItem,
  allArticles: ContentItem[],
  limit: number = 8
): ContentItem[] {
  const candidates = allArticles.filter((item) => item.slug !== currentPost.slug);
  if (candidates.length === 0) return [];

  const currentProfile = buildProfile(currentPost);

  const scored = candidates
    .map((candidate) => ({
      article: candidate,
      score: scoreCandidate(currentProfile, buildProfile(candidate)),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: most recently published first.
      return a.article.date < b.article.date ? 1 : -1;
    });

  const relevant = scored.filter((entry) => entry.score > 0);

  const ranked = (relevant.length > 0 ? relevant : scored).slice(0, limit);

  return ranked.map((entry) => entry.article);
}
