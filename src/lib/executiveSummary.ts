/**
 * AI Executive Summary Engine
 * ----------------------------
 * Deterministic, dependency-free summarizer that distills any article's raw
 * plain text into exactly 3 concise "key takeaway" bullet points. Designed
 * to behave like a lightweight AI executive summary without requiring any
 * external LLM API call — guaranteeing the summary box can always render,
 * even for legacy Blogger-imported posts with unusual formatting.
 *
 * Strategy:
 *   1. Split the raw text into sentences.
 *   2. Score each sentence by a mix of keyword overlap (title/tags) and an
 *      "ideal length" heuristic (prefers punchy, information-dense
 *      sentences over very short or very long ones).
 *   3. Return the top 3 highest-scoring sentences, in their original
 *      reading order (not sorted by score) so the summary still reads
 *      naturally.
 *   4. If fewer than 3 usable sentences exist, pad with a generic,
 *      category/keyword-aware fallback takeaway so the UI never renders an
 *      incomplete summary.
 */

const MIN_SENTENCE_LEN = 35;
const MAX_SENTENCE_LEN = 220;
const IDEAL_SENTENCE_LEN = 130;

function splitIntoSentences(text: string): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const matches = clean.match(/[^.!?]+[.!?]+(\s|$)/g);
  const sentences = (matches && matches.length > 0 ? matches : [clean]).map((s) =>
    s.trim()
  );

  return sentences.filter((s) => s.length >= MIN_SENTENCE_LEN);
}

function truncate(text: string, max = MAX_SENTENCE_LEN): string {
  if (!text || text.length <= max) return text || "";
  const cut = text.substring(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.substring(0, lastSpace) : cut).trim()}…`;
}

function scoreSentence(sentence: string, keywordSet: Set<string>): number {
  const lower = sentence.toLowerCase();
  let score = 0;

  // Keyword overlap — the more title/tag keywords a sentence mentions, the
  // more likely it captures a core "takeaway" of the article.
  for (const kw of keywordSet) {
    if (kw && lower.includes(kw)) score += 3;
  }

  // Ideal length heuristic — penalize very short/very long sentences.
  const lengthPenalty = Math.abs(sentence.length - IDEAL_SENTENCE_LEN) / IDEAL_SENTENCE_LEN;
  score += Math.max(0, 2 - lengthPenalty);

  // Slight boost for sentences containing numbers/percentages/figures,
  // which tend to be the most "executive-summary-worthy" data points.
  if (/\d/.test(sentence)) score += 1;

  return score;
}

/**
 * Generates exactly 3 concise "key takeaway" bullet points summarizing the
 * article. Always returns an array of length 3 (never throws, never
 * returns fewer than 3 items) so the UI component can render safely.
 */
export function generateExecutiveSummary(
  title: string | undefined,
  category: string | undefined,
  rawText: string | undefined,
  keywords: string[] | undefined = []
): string[] {
  try {
    const sentences = splitIntoSentences(rawText || "");

    const keywordSet = new Set(
      [
        ...(title ? title.toLowerCase().split(/\s+/) : []),
        ...(keywords || []).map((k) => (k || "").toLowerCase()),
      ].filter((w) => w.length > 3)
    );

    const scored = sentences.map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence, keywordSet),
    }));

    scored.sort((a, b) => b.score - a.score);

    const top3 = scored
      .slice(0, 3)
      .sort((a, b) => a.index - b.index)
      .map((item) => truncate(item.sentence));

    const safeCategory = category || "macroeconomic";
    const safeTitle = title || "this briefing";
    const safeKeywords = (keywords || []).slice(0, 3).join(", ");

    const FALLBACK_POINTS = [
      `This briefing examines "${safeTitle}" through a ${safeCategory.toLowerCase()} lens, contextualizing recent developments against historical precedent.`,
      safeKeywords
        ? `Key themes covered include: ${safeKeywords}.`
        : `The analysis highlights structural risks and asymmetric opportunities relevant to institutional allocators.`,
      `Readers should treat this as a starting point for further due diligence rather than a standalone investment directive.`,
    ];

    const result = [...top3];
    let fallbackIndex = 0;
    while (result.length < 3 && fallbackIndex < FALLBACK_POINTS.length) {
      const candidate = FALLBACK_POINTS[fallbackIndex];
      if (!result.includes(candidate)) result.push(candidate);
      fallbackIndex++;
    }

    return result.slice(0, 3);
  } catch (err) {
     
    console.error("[executiveSummary] Failed to generate summary, using safe fallback:", err);
    return [
      `This briefing covers "${title || "the article"}" and its implications for macro-aware investors.`,
      `Key considerations include risk positioning, timing, and historical parallels.`,
      `Further research is recommended before acting on any conclusions drawn here.`,
    ];
  }
}
