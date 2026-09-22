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

export function parseEcbMonetaryPolicyScheduleHtmlV1(
  html: string,
): EcbSourceParseResultV1<readonly EcbMonetaryPolicyScheduleCandidateV1[]> {
  const document = parseHtml(html);
  if (document.status === "source-malformed") return document;

  const visibleText = collectVisibleText(document.data).join(" ").replace(/\s+/g, " ").trim();
  const meetingDates = new Set<string>();

  for (const match of visibleText.matchAll(DAY_TWO_PATTERN)) {
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

function parseHtml(html: string): EcbSourceParseResultV1<readonly unknown[]> {
  if (html.trim().length === 0) return malformed("ECB HTML source is empty.");
  try {
    const parsed: unknown = HTML_PARSER.parse(html);
    return Array.isArray(parsed) && parsed.length > 0
      ? Object.freeze({ status: "available", data: parsed })
      : malformed("ECB HTML source has an unsupported structure.");
  } catch {
    return malformed("ECB HTML source could not be parsed.");
  }
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
