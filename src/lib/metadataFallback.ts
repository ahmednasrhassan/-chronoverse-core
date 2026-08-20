/**
 * Automated Metadata Fallback Engine
 * -----------------------------------
 * Deterministic, dependency-free helpers used to guarantee that legacy
 * (Blogger-imported) and otherwise under-authored posts never ship without
 * an SEO description, tags, or a category — even when an editor hasn't
 * filled in the corresponding fields in Sanity.
 *
 * All functions operate on plain text that has already had HTML tags
 * stripped (see `stripHtml` in `src/lib/content.ts`), keeping this module
 * free of any HTML-parsing concerns.
 */

// ---------------------------------------------------------------------------
// 1. Excerpt / Meta Description Fallback
// ---------------------------------------------------------------------------

/**
 * Generates a clean 150–160 character excerpt from the first "paragraph" of
 * plain text (approximated as the leading run of sentences that fits within
 * the target length). Falls back to a hard word-boundary truncation for
 * text with no sentence punctuation (common in some legacy Blogger exports).
 */
export function generateExcerpt(rawText: string, minLen = 150, maxLen = 160): string {
  const text = (rawText || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;

  // Sentence-aware accumulation: keep adding whole sentences from the first
  // paragraph until we hit the target length window.
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];

  let excerpt = "";
  for (const sentence of sentences) {
    const candidate = `${excerpt}${sentence}`.trim();
    if (candidate.length > maxLen) break;
    excerpt = `${candidate} `;
    if (excerpt.trim().length >= minLen) break;
  }
  excerpt = excerpt.trim();

  // No single sentence fit cleanly (e.g. one giant run-on sentence) — hard
  // truncate at the nearest word boundary within the target window.
  if (!excerpt) {
    let truncated = text.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > minLen * 0.6) truncated = truncated.substring(0, lastSpace);
    return `${truncated.trim()}...`;
  }

  // If we stopped short of the full text, and didn't end on natural
  // punctuation, append an ellipsis to signal truncation.
  if (excerpt.length < text.length && !/[.!?]$/.test(excerpt)) {
    excerpt = `${excerpt}...`;
  }

  return excerpt;
}

// ---------------------------------------------------------------------------
// 2. Tags Fallback — top key terms/phrases extracted from title + body
// ---------------------------------------------------------------------------

const TAG_STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy",
  "did", "its", "let", "put", "say", "she", "too", "use", "with", "this",
  "that", "from", "have", "will", "your", "what", "when", "make", "like",
  "time", "just", "know", "take", "into", "year", "good", "some", "them",
  "than", "then", "look", "only", "come", "over", "also", "back", "after",
  "work", "well", "even", "want", "because", "these", "give", "most",
  "about", "which", "their", "would", "there", "could", "other", "more",
  "been", "being", "such", "each", "very", "while", "where", "should",
  "were", "does", "doing", "having", "here", "further", "during", "before",
]);

/**
 * Extracts the top N most frequent, significant terms from the title and
 * body plain text to serve as automated fallback tags when no tags/keywords
 * are defined in Sanity. Title words are weighted more heavily since they
 * best represent the post's core subject.
 */
export function generateFallbackTags(title: string, bodyText: string, limit = 6): string[] {
  const titleWeighted = `${title || ""} ${title || ""}`; // count title words twice
  const combined = `${titleWeighted} ${bodyText || ""}`.toLowerCase();

  const words = combined
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !TAG_STOPWORDS.has(word));

  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

// ---------------------------------------------------------------------------
// 3. Category Fallback — keyword-based classification
// ---------------------------------------------------------------------------

/** The final fallback category when no keyword match is found at all. */
export const DEFAULT_FALLBACK_CATEGORY = "General Analysis";

/**
 * Ordered keyword → category map. Order matters when a post's content
 * happens to match keywords from multiple categories — the first matching
 * entry wins.
 */
const CATEGORY_KEYWORD_MAP: Array<{ category: string; keywords: string[] }> = [
  {
    category: "Macroeconomics",
    keywords: [
      "macro", "fed", "federal reserve", "inflation", "gdp", "interest rate",
      "recession", "central bank", "monetary policy", "unemployment", "cpi",
      "stagflation", "fiscal policy",
    ],
  },
  {
    category: "Markets & Trading",
    keywords: [
      "stock market", "equities", "trading", "nasdaq", "s&p 500", "bull market",
      "bear market", "volatility", "portfolio", "hedge fund",
    ],
  },
  {
    category: "Geopolitics",
    keywords: [
      "geopolitic", "war", "sanction", "conflict", "diplomacy", "trade war",
      "election",
    ],
  },
  {
    category: "Crypto & Digital Assets",
    keywords: [
      "crypto", "bitcoin", "blockchain", "ethereum", "defi", "stablecoin",
      "nft",
    ],
  },
  {
    category: "Corporate & Earnings",
    keywords: [
      "earnings", "quarterly report", "revenue", "ceo", "merger",
      "acquisition", "ipo",
    ],
  },
];

/**
 * Dynamically assigns a default category based on simple keyword matching
 * against the post's plain-text content (and optionally its title). Falls
 * back to `DEFAULT_FALLBACK_CATEGORY` ("General Analysis") when no keyword
 * match is found — ensuring legacy posts without an assigned Sanity
 * category still surface a meaningful, topic-relevant label instead of a
 * generic "Uncategorized" placeholder.
 */
export function resolveFallbackCategory(text: string): string {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return DEFAULT_FALLBACK_CATEGORY;

  for (const { category, keywords } of CATEGORY_KEYWORD_MAP) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return category;
    }
  }

  return DEFAULT_FALLBACK_CATEGORY;
}

/**
 * Converts a human-readable category label into a URL-safe slug, mirroring
 * the slugification convention used by Sanity's `slug.current` fields.
 */
export function slugifyCategory(category: string): string {
  return (category || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "") || "general-analysis";
}
