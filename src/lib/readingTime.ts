/**
 * Reading Time Helper
 * ---------------------------------------------------------------------------
 * Provides a reusable, dependency-free utility to estimate reading time for
 * article/post content across the site (used by dynamic article pages,
 * listing pages, and RSS/feed generation).
 * Fully supports raw strings, HTML content, Markdown, and Sanity PortableText block arrays.
 */

const WORDS_PER_MINUTE = 200;

/**
 * Normalizes input content (raw string, HTML, or Sanity PortableText blocks)
 * into a single clean plain-text string.
 */
function extractPlainText(input: unknown): string {
  if (!input) return "";

  if (typeof input === "string") {
    return input.replace(/<[^>]*>?/gm, "");
  }

  if (Array.isArray(input)) {
    return input
      .map((block) => {
        if (!block || typeof block !== "object") return "";

        // Standard Sanity PortableText block
        if ("children" in block && Array.isArray((block as { children: unknown[] }).children)) {
          return (block as { children: Array<{ text?: string }> }).children
            .map((child) => child?.text || "")
            .join(" ");
        }

        // Direct string array item fallback
        if (typeof block === "string") {
          return block;
        }

        return "";
      })
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

/**
 * Calculates the estimated reading time in whole minutes (minimum of 1)
 * based on an average reading speed of ~200 words per minute.
 */
export function getReadingTime(
  content: unknown,
  wordsPerMinute: number = WORDS_PER_MINUTE
): number {
  const plainText = extractPlainText(content).trim();
  if (!plainText) return 1;

  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

/**
 * Convenience formatter that returns a ready-to-render label, e.g. "6 min read".
 */
export function formatReadingTime(
  content: unknown,
  wordsPerMinute: number = WORDS_PER_MINUTE
): string {
  const minutes = getReadingTime(content, wordsPerMinute);
  return `${minutes} min read`;
}