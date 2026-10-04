import type { PortableTextBlock } from "@portabletext/types";

const MARKER = /SYSTEM ENTROPY CHECK[ \t]*(?::|\/\/)?[ \t]*/g;
// Only known diagnostic values are consumed, never arbitrary article prose.
const FIELD = /(?:BTC(?:\/USD)?|GOLD|OIL|US10Y(?: YIELD)?|VIX):[ \t]*[$€£]?[+-]?\d[\d,]*(?:\.\d+)?%?|GLOBAL DEBT:[ \t]*TERMINAL VELOCITY|CURRENT ECHO:[ \t]*\d{4}|STATUS:[ \t]*HISTORICAL PIVOT DECRYPTION|PROTOCOL:[ \t]*NIXON-SHOCK/y;
const DATE = /\d{2}-[A-Z]{3}-\d{4}/y;
const SEPARATOR = /[ \t]*(?:\||\/\/)[ \t]*/y;
const GEAR = /\[Gear \d{2}\/\d{2}\]/y;

type Range = readonly [number, number];

function tokenEnd(text: string, start: number, patterns: RegExp[]): number {
  for (const pattern of patterns) {
    pattern.lastIndex = start;
    if (pattern.test(text)) return pattern.lastIndex;
  }
  return start;
}

function artifactRanges(text: string): Range[] {
  const ranges: Range[] = [];
  // Local match state makes repeated calls deterministic.
  const marker = new RegExp(MARKER.source, "g");
  for (let match = marker.exec(text); match; match = marker.exec(text)) {
    let start = match.index;
    let end = marker.lastIndex;
    const wrapper = text[start - 1] === "[" ? "]" : "";
    if (wrapper) start -= 1;

    end = tokenEnd(text, end, [DATE, FIELD, GEAR]);
    while (true) {
      // A dated diagnostic can close its wrapper before the remaining fields.
      if (wrapper && text[end] === wrapper) end += 1;
      SEPARATOR.lastIndex = end;
      if (!SEPARATOR.exec(text)) break;
      const next = SEPARATOR.lastIndex;
      const nextEnd = tokenEnd(text, next, [FIELD, GEAR]);
      if (nextEnd === next) break;
      end = nextEnd;
    }
    if (wrapper && text[end] === wrapper) end += 1;
    ranges.push([start, end]);
    marker.lastIndex = end;
  }
  return ranges;
}

/**
 * Removes imported diagnostic rows at ingestion, before text is flattened or
 * truncated. HTML tags are retained; block/line boundaries stop consumption.
 * This is an editorial transform, not an HTML sanitizer.
 */
export function normalizeEditorialArtifacts(value: string): string {
  if (!value.includes("SYSTEM ENTROPY CHECK")) {
    // A marker may be split over inline HTML tags.
    if (!value.includes("SYSTEM")) return value;
  }
  const positions: number[] = [];
  let text = "";
  const tokens = /<[^>]*>|[^<]+|</g;
  for (const token of value.matchAll(tokens)) {
    if (/^<[^>]*>$/.test(token[0])) {
      if (/^<\/?(?:p|div|h[1-6]|li|tr|td|blockquote|section|br|hr)\b/i.test(token[0])) {
        text += "\n";
        positions.push(-1);
      }
    } else {
      for (let index = 0; index < token[0].length; index += 1) {
        text += token[0][index];
        positions.push(token.index! + index);
      }
    }
  }
  const removed = new Set<number>();
  for (const [start, end] of artifactRanges(text)) {
    for (let index = start; index < end; index += 1) removed.add(positions[index]);
  }
  if (removed.size === 0) return value;
  return value.split("").filter((_, index) => !removed.has(index)).join("");
}

/** Preserve Portable Text keys, marks, embeds and blocks; only trim known text. */
export function normalizeEditorialBlocks(body: PortableTextBlock[]): PortableTextBlock[] {
  return body.map((block) => {
    if (block._type !== "block" || !Array.isArray(block.children)) return block;
    const text = block.children.map((child) =>
      child._type === "span" && typeof child.text === "string" ? child.text : "\n",
    ).join("");
    const ranges = artifactRanges(text);
    if (ranges.length === 0) return block;
    let offset = 0;
    return {
      ...block,
      children: block.children.map((child) => {
        if (child._type !== "span" || typeof child.text !== "string") {
          offset += 1;
          return child;
        }
        const start = offset;
        offset += child.text.length;
        return {
          ...child,
          text: child.text.split("").filter((_, index) =>
            !ranges.some(([from, to]) => start + index >= from && start + index < to),
          ).join(""),
        };
      }),
    };
  });
}
