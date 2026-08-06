/**
 * Text utilities used by the AI SEO/excerpt generation pipeline.
 * Provides HTML stripping, Portable Text flattening, and a deterministic
 * fallback summarizer used when no AI provider key is configured.
 */

export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

interface PortableTextSpan {
  _type?: string;
  text?: string;
}

interface PortableTextBlock {
  _type: string;
  children?: PortableTextSpan[];
}

export function portableTextToPlainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return (blocks as PortableTextBlock[])
    .filter((block) => block && block._type === "block")
    .map((block) => (block.children || []).map((span) => span.text || "").join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  if (matches && matches.length > 0) return matches.map((s) => s.trim());
  return text ? [text.trim()] : [];
}

export interface FallbackSeoResult {
  excerpt: string;
  seoDescription: string;
}

/**
 * Deterministic, dependency-free summarizer used as a fallback when no
 * AI provider (e.g. OPENAI_API_KEY) is configured. Produces a short
 * "rich excerpt" (2-3 sentences) and a search-engine-friendly meta
 * description capped at ~160 characters.
 */
export function generateFallbackSeo(plainText: string, title: string): FallbackSeoResult {
  const cleaned = (plainText || "").trim();

  if (!cleaned) {
    const genericExcerpt = `${title} — an in-depth analysis from ChronoVerse Capital covering key macroeconomic and financial market developments.`;
    const genericDescription = `${title} | Analysis from ChronoVerse Capital`.slice(0, 160);
    return { excerpt: genericExcerpt, seoDescription: genericDescription };
  }

  const sentences = splitSentences(cleaned);

  let excerpt = sentences.slice(0, 3).join(" ").trim();
  if (!excerpt) excerpt = cleaned.slice(0, 320);
  if (excerpt.length > 320) excerpt = `${excerpt.slice(0, 317).trim()}...`;

  let seoDescription = sentences.slice(0, 2).join(" ").trim();
  if (!seoDescription) seoDescription = cleaned;
  if (seoDescription.length > 160) {
    seoDescription = `${seoDescription.slice(0, 157).trim()}...`;
  }

  return { excerpt, seoDescription };
}
