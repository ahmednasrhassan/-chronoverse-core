/**
 * Deterministically selects up to three source sentences from an article.
 * It never pads the result with claims that are absent from the source text.
 */

const MIN_SENTENCE_LEN = 35;
const MAX_SENTENCE_LEN = 220;
const IDEAL_SENTENCE_LEN = 130;

function splitIntoSentences(text: string): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const matches = clean.match(/[^.!?]+[.!?]+(\s|$)/g);
  const sentences = (matches && matches.length > 0 ? matches : [clean]).map(
    (sentence) => sentence.trim(),
  );

  return sentences.filter((sentence) => sentence.length >= MIN_SENTENCE_LEN);
}

function truncate(text: string, max = MAX_SENTENCE_LEN): string {
  if (!text || text.length <= max) return text || "";
  const cut = text.substring(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.substring(0, lastSpace) : cut).trim()}...`;
}

function scoreSentence(sentence: string, keywordSet: Set<string>): number {
  const lower = sentence.toLowerCase();
  let score = 0;

  for (const keyword of keywordSet) {
    if (keyword && lower.includes(keyword)) score += 3;
  }

  const lengthPenalty =
    Math.abs(sentence.length - IDEAL_SENTENCE_LEN) / IDEAL_SENTENCE_LEN;
  score += Math.max(0, 2 - lengthPenalty);

  if (/\d/.test(sentence)) score += 1;

  return score;
}

/** Selects source-derived passages only; an empty source produces no summary. */
export function generateExecutiveSummary(
  title: string | undefined,
  _category: string | undefined,
  rawText: string | undefined,
  keywords: string[] | undefined = [],
): string[] {
  const sentences = splitIntoSentences(rawText || "");
  const keywordSet = new Set(
    [
      ...(title ? title.toLowerCase().split(/\s+/) : []),
      ...(keywords || []).map((keyword) => (keyword || "").toLowerCase()),
    ].filter((word) => word.length > 3),
  );

  return sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence, keywordSet),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index)
    .map((item) => truncate(item.sentence));
}
