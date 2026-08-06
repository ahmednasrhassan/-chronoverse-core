/**
 * Reading Time Helper
 * ---------------------------------------------------------------------------
 * Provides a reusable, dependency-free utility to estimate reading time for
 * article/post content across the site (used by dynamic article pages,
 * listing pages, and RSS/feed generation).
 */

const WORDS_PER_MINUTE = 200;

/**
 * Strips any leftover HTML tags before counting words. Safe to call on
 * already-plain text as well.
 */
function stripTags(input: string): string {
  if (!input) return "";
  return input.replace(/<[^>]*>?/gm, "");
}

/**
 * Calculates the estimated reading time in whole minutes (minimum of 1)
 * based on an average adult reading speed of ~200 words per minute.
 */
export function getReadingTime(text: string, wordsPerMinute: number = WORDS_PER_MINUTE): number {
  const plainText = stripTags(text).trim();
  if (!plainText) return 1;

  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

/**
 * Convenience formatter that returns a ready-to-render label, e.g. "6 min read".
 */
export function formatReadingTime(text: string, wordsPerMinute: number = WORDS_PER_MINUTE): string {
  const minutes = getReadingTime(text, wordsPerMinute);
  return `${minutes} min read`;
}
