import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

import {
  ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  ECB_SOURCE_INSTITUTION,
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../../../events/ecbMonetaryPolicy";

export interface EcbMonetaryPolicyScheduleCandidateV1 {
  readonly sourceInstitution: typeof ECB_SOURCE_INSTITUTION;
  readonly sourceUrl: typeof ECB_GOVERNING_COUNCIL_CALENDAR_URL;
  readonly meetingDate: string;
}

export interface EcbKnownMonetaryPolicyDecisionReferenceInputV1 {
  readonly sourceInstitution: string;
  readonly decisionDate: string;
  readonly documentUrl: string;
}

export interface EcbMonetaryPolicyDecisionReferenceV1 {
  readonly sourceInstitution: typeof ECB_SOURCE_INSTITUTION;
  readonly decisionDate: string;
  readonly documentUrl: string;
}

export interface EcbMonetaryPolicyDocumentCaptureV1 {
  readonly reference: EcbMonetaryPolicyDecisionReferenceV1;
  readonly fetchedAt: number;
  /** Exact response capture identity; deliberately excluded from event semantics. */
  readonly rawCaptureDigest: string;
  /** Digest of normalized visible decision content within the document main element. */
  readonly semanticContentDigest: string;
}

export type EcbSourceParseResultV1<T> =
  | { readonly status: "available"; readonly data: T }
  | { readonly status: "source-malformed"; readonly reason: string };

export type EcbDecisionReferenceValidationResultV1 =
  | {
      readonly status: "available";
      readonly reference: EcbMonetaryPolicyDecisionReferenceV1;
    }
  | { readonly status: "invalid-reference"; readonly reason: string };

export type EcbDecisionDocumentCaptureResultV1 =
  | { readonly status: "available"; readonly data: EcbMonetaryPolicyDocumentCaptureV1 }
  | { readonly status: "invalid-reference"; readonly reason: string }
  | { readonly status: "decision-document-malformed"; readonly reason: string };

export type EcbScheduleIdentityV1 =
  | { readonly status: "initial" }
  | {
      readonly status: "preserve";
      readonly canonicalMeetingDate: string;
    }
  | {
      readonly status: "reconciliation-required";
      readonly priorCanonicalMeetingDate: string;
    };

export type EcbScheduleNormalizationResultV1 =
  | {
      readonly status: "available";
      readonly event: EcbMonetaryPolicyEventFactV1;
    }
  | {
      readonly status: "reconciliation-required";
      readonly priorCanonicalMeetingDate: string;
      readonly currentMeetingDate: string;
    };

export type EcbDecisionAttachmentResultV1 =
  | {
      readonly status: "available";
      readonly event: EcbMonetaryPolicyEventFactV1;
    }
  | {
      readonly status: "invalid-reference";
      readonly reason: string;
    }
  | {
      readonly status: "reconciliation-required";
      readonly canonicalMeetingDate: string;
      readonly currentMeetingDate: string;
      readonly decisionDate: string;
    };

const HTML_PARSER = new XMLParser({
  allowBooleanAttributes: true,
  htmlEntities: true,
  ignoreAttributes: false,
  preserveOrder: true,
  processEntities: {
    enabled: true,
    maxEntityCount: 100,
    maxEntitySize: 1_000,
    maxExpandedLength: 100_000,
    maxTotalExpansions: 1_000,
  },
  stopNodes: ["*.script", "*.style"],
  unpairedTags: ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"],
});
const DAY_TWO_PATTERN = /(\d{2}\/\d{2}\/\d{4})\s+Governing\s+Council\s+of\s+the\s+ECB:\s*monetary\s+policy\s+meeting(?:\s+in\s+[^()]{1,80})?\s+\(Day\s+2\),?\s+followed\s+by\s+press\s+conference/gi;
const DECISION_PATH_PATTERN = /^\/press\/pr\/date\/(\d{4})\/html\/ecb\.mp(\d{6})~[a-f\d]+\.en\.html$/;
const ECB_ORIGIN_PREFIX = "https://www.ecb.europa.eu/";
const SCHEDULE_NON_CONTENT_PATTERNS = Object.freeze([
  /<!--[\s\S]*?(?:-->|$)/g,
  /<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi,
  /<style\b[^>]*>[\s\S]*?(?:<\/style\s*>|$)/gi,
  /<noscript\b[^>]*>[\s\S]*?(?:<\/noscript\s*>|$)/gi,
]);
const HTML_ENTITY_PATTERN = /&(?:#([0-9]{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,31}));/gi;
const HTML_TAG_PATTERN = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const UNICODE_WHITESPACE_PATTERN =
  /[\s\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]+/g;
const COMMON_HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: "&",
  apos: "'",
  colon: ":",
  emsp: " ",
  ensp: " ",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\"",
  thinsp: " ",
});

export function parseEcbMonetaryPolicyScheduleHtmlV1(
  html: string,
): EcbSourceParseResultV1<readonly EcbMonetaryPolicyScheduleCandidateV1[]> {
  const extraction = extractScheduleVisibleText(html);
  if (extraction.status === "source-malformed") return extraction;

  const meetingDates = new Set<string>();

  for (const match of extraction.data.matchAll(DAY_TWO_PATTERN)) {
    const sourceDate = match[1];
    if (sourceDate === undefined) continue;
    const meetingDate = normalizeDayMonthYear(sourceDate);
    if (meetingDate === null) {
      return malformed("ECB calendar contains an invalid Day-2 date.");
    }
    meetingDates.add(meetingDate);
  }

  if (meetingDates.size === 0) {
    return malformed("ECB calendar contains no supported monetary-policy Day-2 entries.");
  }

  return Object.freeze({
    status: "available",
    data: Object.freeze([...meetingDates].sort().map((meetingDate) => Object.freeze({
      sourceInstitution: ECB_SOURCE_INSTITUTION,
      sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
      meetingDate,
    }))),
  });
}

/**
 * The ECB calendar is HTML, not XML. Keep schedule extraction tolerant while
 * making entity expansion one-pass and bounded by the reference length.
 */
function extractScheduleVisibleText(html: string): EcbSourceParseResultV1<string> {
  if (typeof html !== "string" || html.trim().length === 0) {
    return malformed("ECB HTML source is empty.");
  }

  let visibleText = html;
  for (const pattern of SCHEDULE_NON_CONTENT_PATTERNS) {
    visibleText = visibleText.replace(pattern, " ");
  }
  visibleText = visibleText
    .replace(HTML_TAG_PATTERN, " ")
    .replace(HTML_ENTITY_PATTERN, decodeHtmlEntity)
    .replace(UNICODE_WHITESPACE_PATTERN, " ")
    .trim();

  return visibleText.length > 0
    ? Object.freeze({ status: "available", data: visibleText })
    : malformed("ECB HTML source has no visible content.");
}

function decodeHtmlEntity(
  reference: string,
  decimalDigits: string | undefined,
  hexadecimalDigits: string | undefined,
  entityName: string | undefined,
): string {
  if (entityName !== undefined) {
    return COMMON_HTML_ENTITIES[entityName.toLowerCase()] ?? reference;
  }

  const digits = decimalDigits ?? hexadecimalDigits;
  if (digits === undefined) return reference;
  const codePoint = Number.parseInt(digits, decimalDigits === undefined ? 16 : 10);
  if (!Number.isSafeInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return "\ufffd";
  }
  return String.fromCodePoint(codePoint);
}

/** Identity mode must come from the caller's first-capture or persistence context. */
export function normalizeEcbScheduleCandidateV1(
  candidate: EcbMonetaryPolicyScheduleCandidateV1,
  fetchedAt: number,
  identity: EcbScheduleIdentityV1,
): EcbScheduleNormalizationResultV1 {
  if (identity.status === "reconciliation-required") {
    return Object.freeze({
      status: "reconciliation-required",
      priorCanonicalMeetingDate: identity.priorCanonicalMeetingDate,
      currentMeetingDate: candidate.meetingDate,
    });
  }

  const canonicalMeetingDate = identity.status === "preserve"
    ? identity.canonicalMeetingDate
    : candidate.meetingDate;

  return Object.freeze({
    status: "available",
    event: normalizeEcbMonetaryPolicyEventV1({
      canonicalMeetingDate,
      schedule: { meetingDate: candidate.meetingDate, fetchedAt },
      decision: null,
    }),
  });
}

/** Automatic discovery stays deferred until a structured official ECB source is verified. */
export function validateKnownEcbDecisionReferenceV1(
  input: EcbKnownMonetaryPolicyDecisionReferenceInputV1,
): EcbDecisionReferenceValidationResultV1 {
  if (input.sourceInstitution !== ECB_SOURCE_INSTITUTION || !isCivilDate(input.decisionDate)) {
    return invalidReference("Known ECB decision reference has invalid source identity or date.");
  }

  let url: URL;
  try {
    url = new URL(input.documentUrl);
  } catch {
    return invalidReference("Known ECB decision reference has an invalid URL.");
  }
  if (!input.documentUrl.startsWith(ECB_ORIGIN_PREFIX) ||
      url.protocol !== "https:" || url.hostname !== "www.ecb.europa.eu" ||
      url.username || url.password || url.port || url.search || url.hash ||
      url.href !== input.documentUrl) {
    return invalidReference("Known decision URL must be an unqualified official ECB HTTPS URL.");
  }
  const match = DECISION_PATH_PATTERN.exec(url.pathname);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return invalidReference("Known decision URL does not match the ECB monetary-policy document path.");
  }
  const encodedDate = `${match[1].slice(0, 2)}${match[2].slice(0, 2)}-${match[2].slice(2, 4)}-${match[2].slice(4, 6)}`;
  if (!isCivilDate(encodedDate) || match[1] !== encodedDate.slice(0, 4) ||
      encodedDate !== input.decisionDate) {
    return invalidReference("Known decision date does not match the ECB document URL.");
  }
  return Object.freeze({
    status: "available",
    reference: Object.freeze({
      sourceInstitution: ECB_SOURCE_INSTITUTION,
      decisionDate: encodedDate,
      documentUrl: url.href,
    }),
  });
}

export function captureKnownEcbDecisionDocumentHtmlV1(
  html: string,
  reference: EcbKnownMonetaryPolicyDecisionReferenceInputV1,
  fetchedAt: number,
): EcbDecisionDocumentCaptureResultV1 {
  const validation = validateKnownEcbDecisionReferenceV1(reference);
  if (validation.status === "invalid-reference") return validation;
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) {
    return decisionDocumentMalformed("ECB decision-document capture time is invalid.");
  }

  const document = parseHtml(html);
  if (document.status === "source-malformed") {
    return decisionDocumentMalformed(document.reason);
  }
  const mainNodes = findFirstTag(document.data, "main");
  if (mainNodes === null) {
    return decisionDocumentMalformed("ECB decision document has no main content element.");
  }
  const semanticText = collectVisibleText(mainNodes).join(" ").replace(/\s+/g, " ").trim();
  if (!/\bMonetary policy decisions\b/i.test(semanticText)) {
    return decisionDocumentMalformed("ECB decision document has no monetary-policy decision marker.");
  }

  const validatedReference = validation.reference;
  return Object.freeze({
    status: "available",
    data: Object.freeze({
      reference: validatedReference,
      fetchedAt,
      rawCaptureDigest: sha256(html),
      semanticContentDigest: sha256(JSON.stringify([
        "ecb-monetary-policy-decision-content-v1",
        validatedReference.documentUrl,
        validatedReference.decisionDate,
        semanticText,
      ])),
    }),
  });
}

export function attachKnownEcbDecisionCaptureV1(
  scheduleEvent: EcbMonetaryPolicyEventFactV1,
  capture: EcbMonetaryPolicyDocumentCaptureV1,
  firstObservedAt: number,
): EcbDecisionAttachmentResultV1 {
  const validation = validateKnownEcbDecisionReferenceV1(capture.reference);
  if (validation.status === "invalid-reference") return validation;
  if (validation.reference.decisionDate !== scheduleEvent.schedule.meetingDate) {
    return Object.freeze({
      status: "reconciliation-required",
      canonicalMeetingDate: scheduleEvent.canonicalMeetingDate,
      currentMeetingDate: scheduleEvent.schedule.meetingDate,
      decisionDate: validation.reference.decisionDate,
    });
  }
  return Object.freeze({
    status: "available",
    event: normalizeEcbMonetaryPolicyEventV1({
      canonicalMeetingDate: scheduleEvent.canonicalMeetingDate,
      schedule: {
        meetingDate: scheduleEvent.schedule.meetingDate,
        scheduledLocalTime: scheduleEvent.schedule.scheduledLocalTime,
        fetchedAt: scheduleEvent.schedule.fetchedAt,
      },
      decision: {
        decisionDate: validation.reference.decisionDate,
        documentUrl: validation.reference.documentUrl,
        contentDigest: capture.semanticContentDigest,
        fetchedAt: capture.fetchedAt,
        firstObservedAt,
        actualReleasedAt: null,
        rates: null,
      },
    }),
  });
}

/** Reopen only the exact successfully captured bytes; no new source or version scheme. */
export function readCapturedEcbDecisionMainV1(
  html: string,
  capture: EcbMonetaryPolicyDocumentCaptureV1,
): EcbSourceParseResultV1<readonly unknown[]> {
  const reference = validateKnownEcbDecisionReferenceV1(capture.reference);
  if (reference.status !== "available" || !Number.isSafeInteger(capture.fetchedAt) ||
      capture.fetchedAt < 0 || sha256(html) !== capture.rawCaptureDigest) {
    return malformed("Captured ECB document provenance does not match its input.");
  }
  // These bytes have already parsed successfully at capture. Unexpected defects propagate.
  const parseOnly = decisionHtmlWithoutRawText(html);
  if (parseOnly === null) return malformed("ECB HTML has malformed script/style raw text.");
  const parsed: unknown = HTML_PARSER.parse(parseOnly);
  const main = findFirstTag(parsed, "main");
  if (main === null) return malformed("Captured ECB document has no main element.");
  const text = ecbDecisionVisibleTextV1(main);
  if (sha256(JSON.stringify([
    "ecb-monetary-policy-decision-content-v1", reference.reference.documentUrl,
    reference.reference.decisionDate, text,
  ])) !== capture.semanticContentDigest) {
    return malformed("Captured ECB document semantic provenance does not match.");
  }
  return Object.freeze({ status: "available", data: main });
}

/** Same visible-text normalization used by the canonical document capture. */
export function ecbDecisionVisibleTextV1(nodes: readonly unknown[]): string {
  return collectVisibleText(nodes).join(" ").replace(/\s+/g, " ").trim();
}

function parseHtml(html: string): EcbSourceParseResultV1<readonly unknown[]> {
  if (html.trim().length === 0) return malformed("ECB HTML source is empty.");
  const parseOnly = decisionHtmlWithoutRawText(html);
  if (parseOnly === null) return malformed("ECB HTML has malformed script/style raw text.");
  try {
    const parsed: unknown = HTML_PARSER.parse(parseOnly);
    return Array.isArray(parsed) && parsed.length > 0
      ? Object.freeze({ status: "available", data: parsed })
      : malformed("ECB HTML source has an unsupported structure.");
  } catch (error) {
    if (error instanceof ReferenceError || error instanceof TypeError) throw error;
    return malformed("ECB HTML source could not be parsed.");
  }
}

/**
 * Parse-only copy: script/style are HTML raw text, not nested XML. Their bodies
 * end at the first appropriate HTML closing tag, including inside JS strings.
 * HTML escaped-script modes introduced by <!-- are unsupported and fail closed.
 * Scan ordinary tags with quote awareness so attribute/comment text cannot open
 * a raw-text element. All evidence-bearing bytes outside those elements stay intact.
 * The original input alone remains the source of rawCaptureDigest.
 */
function decisionHtmlWithoutRawText(html: string): string | null {
  const parts: string[] = [];
  let copiedThrough = 0;
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start === -1) break;
    if (html.startsWith("<!--", start) || html.startsWith("<![CDATA[", start)) {
      const terminator = html.startsWith("<!--", start) ? "-->" : "]]>";
      const end = html.indexOf(terminator, start + 4);
      if (end === -1) return null;
      cursor = end + terminator.length;
      continue;
    }
    const tag = /^<(\/?)([A-Za-z][A-Za-z0-9:-]*)(?=[\t\n\f\r />])/.exec(html.slice(start));
    if (tag === null && !html.startsWith("<!", start) && !html.startsWith("<?", start)) {
      cursor = start + 1;
      continue;
    }
    const openingEnd = decisionTagEnd(html, start + 1);
    if (openingEnd === null) return null;
    const name = tag?.[2].toLowerCase();
    if (name !== "script" && name !== "style") {
      cursor = openingEnd + 1;
      continue;
    }
    // HTML raw-text elements are not void/self-closing; reject unsupported forms.
    if (tag![1] === "/" || /\/\s*>$/.test(html.slice(start, openingEnd + 1))) return null;
    const closing = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])`, "gi");
    closing.lastIndex = openingEnd + 1;
    const match = closing.exec(html);
    if (match === null) return null;
    // <!-- can enter escaped/double-escaped HTML script states, where the first
    // </script> need not close the element. Reject rather than expose hidden text.
    if (name === "script" && html.slice(openingEnd + 1, match.index).includes("<!--")) return null;
    const closingEnd = decisionTagEnd(html, match.index + 2);
    if (closingEnd === null ||
        !new RegExp(`^</${name}[\\t\\n\\f\\r ]*>$`, "i").test(html.slice(match.index, closingEnd + 1))) {
      return null;
    }
    parts.push(html.slice(copiedThrough, start), `<${name}></${name}>`);
    copiedThrough = closingEnd + 1;
    cursor = copiedThrough;
  }
  return parts.length === 0 ? html : parts.join("") + html.slice(copiedThrough);
}

/** Only locate a tag boundary; never interpret attribute values or embedded code. */
function decisionTagEnd(html: string, start: number): number | null {
  let quote: string | null = null;
  let subsetDepth = 0;
  const declaration = html.startsWith("!", start);
  for (let cursor = start; cursor < html.length; cursor++) {
    const character = html[cursor];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === "\"" || character === "'") quote = character;
    else if (declaration && character === "[") subsetDepth++;
    else if (declaration && character === "]") subsetDepth--;
    else if (character === ">" && subsetDepth === 0) return cursor;
  }
  return null;
}

function collectVisibleText(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectVisibleText(item, output);
    return output;
  }
  if (!isRecord(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    if (key === "#text" && typeof child === "string") output.push(child);
    else if (key !== ":@" && key !== "script" && key !== "style" && key !== "noscript") {
      collectVisibleText(child, output);
    }
  }
  return output;
}

function findFirstTag(value: unknown, tagName: string): readonly unknown[] | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstTag(item, tagName);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const direct = value[tagName];
  if (Array.isArray(direct)) return direct;
  for (const [key, child] of Object.entries(value)) {
    if (key === ":@") continue;
    const found = findFirstTag(child, tagName);
    if (found !== null) return found;
  }
  return null;
}

function normalizeDayMonthYear(value: string): string | null {
  const [day, month, year] = value.split("/");
  if (day === undefined || month === undefined || year === undefined) return null;
  const normalized = `${year}-${month}-${day}`;
  return isCivilDate(normalized) ? normalized : null;
}

function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function malformed<T>(reason: string): EcbSourceParseResultV1<T> {
  return Object.freeze({ status: "source-malformed", reason });
}

function invalidReference(
  reason: string,
): Extract<EcbDecisionReferenceValidationResultV1, { readonly status: "invalid-reference" }> {
  return Object.freeze({ status: "invalid-reference", reason });
}

function decisionDocumentMalformed(
  reason: string,
): Extract<EcbDecisionDocumentCaptureResultV1, { readonly status: "decision-document-malformed" }> {
  return Object.freeze({ status: "decision-document-malformed", reason });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
