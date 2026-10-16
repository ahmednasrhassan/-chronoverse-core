import "server-only";

import {
  ECB_DECISION_TIMEZONE, ECB_GOVERNING_COUNCIL_CALENDAR_URL, ECB_SOURCE_INSTITUTION,
  ecbMonetaryPolicyCanonicalEventIdV1, ecbScheduledInstantV1,
} from "../events/ecbMonetaryPolicy";
import type { EcbMonetaryPolicyScheduleCandidateV1 } from "../providers/ecb/monetaryPolicy/parser";
import {
  CALENDAR_EVENT_SCHEMA_V1, CALENDAR_PRODUCTS_V1,
  type CalendarCaptureTimingV1, type CalendarEventV1, type CalendarProvenanceV1, type CalendarTimeV1,
} from "./contracts";
import { calendarInstantV1, calendarRecordV1, readCalendarEventV1, snapshotCalendarDataV1 } from "./validation";

export const OFFICIAL_POLICY_SCHEDULE_NORMALIZER_V1 = "official-policy-schedule-normalizer-v1" as const;
export const ECB_OFFICIAL_SCHEDULE_INPUT_V1 = "ecb-official-schedule-input-v1" as const;
export const BOJ_OFFICIAL_SCHEDULE_INPUT_V1 = "boj-official-schedule-input-v1" as const;
export const ECB_OFFICIAL_DECISION_CLOCK_URL_V1 = "https://www.ecb.europa.eu/press/govcdec/html/index.en.html";
export const BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1 = "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm";

/** All clocks/identities are caller-supplied descriptions, never receipts.
 * Identity reconciliation and revision-chain admission remain separate duties. */
export interface OfficialPolicyScheduleContextV1 {
  readonly versionId: string;
  readonly sourceVersionId: string;
  readonly canonicalMeetingDate: string;
  readonly state: "scheduled" | "cancelled";
  readonly revision: CalendarEventV1["revision"];
  readonly timing: CalendarEventV1["timing"];
  readonly freshnessPolicy: CalendarEventV1["freshnessPolicy"];
}

export interface OfficialPolicyScheduleSupportingEvidenceV1 {
  readonly provenance: CalendarProvenanceV1;
  readonly timing: Pick<CalendarCaptureTimingV1, "acquisition" | "evidenceAvailability">;
}

export interface EcbOfficialScheduleInputV1 {
  readonly schemaVersion: typeof ECB_OFFICIAL_SCHEDULE_INPUT_V1;
  /** Directly compatible with the existing ECB schedule parser's passive row. */
  readonly candidate: EcbMonetaryPolicyScheduleCandidateV1;
  /** Null retains date-only precision. Never default to the current ECB clock.
   * A captured official rule must explicitly be qualified for this meeting date
   * and Frankfurt civil time. Its provenance stays separate from the date source. */
  readonly announcementClock: null | {
    readonly meetingDate: string;
    readonly localTime: string;
    readonly timeZone: typeof ECB_DECISION_TIMEZONE;
    readonly provenance: CalendarProvenanceV1;
    readonly timing: OfficialPolicyScheduleSupportingEvidenceV1["timing"];
  };
  readonly context: OfficialPolicyScheduleContextV1;
}

export interface BojOfficialScheduleInputV1 {
  readonly schemaVersion: typeof BOJ_OFFICIAL_SCHEDULE_INPUT_V1;
  /** Extracted civil dates, not release instants or bounded clock windows. */
  readonly candidate: {
    readonly sourceUrl: string;
    readonly meetingStartsOn: string;
    readonly meetingEndsOn: string;
  };
  readonly context: OfficialPolicyScheduleContextV1;
}

export type OfficialPolicyScheduleNormalizationV1 = {
  readonly schemaVersion: typeof OFFICIAL_POLICY_SCHEDULE_NORMALIZER_V1;
  readonly scope: "provided-schedule-only";
  readonly sourceAuthentication: "not-performed";
  readonly historicalOwnership: "not-certified";
} & (
  | { readonly status: "available"; readonly event: CalendarEventV1;
      /** Precisely the source's meeting dates; never synthetic midnight instants. */
      readonly meetingDates: readonly string[];
      readonly supportingEvidence: readonly OfficialPolicyScheduleSupportingEvidenceV1[] }
  | { readonly status: "unavailable"; readonly reason: "invalid-schedule" }
);

const scope = Object.freeze({ schemaVersion: OFFICIAL_POLICY_SCHEDULE_NORMALIZER_V1,
  scope: "provided-schedule-only", sourceAuthentication: "not-performed", historicalOwnership: "not-certified" } as const);
const contextKeys = ["versionId", "sourceVersionId", "canonicalMeetingDate", "state", "revision", "timing", "freshnessPolicy"];
const unavailable: OfficialPolicyScheduleNormalizationV1 = Object.freeze({
  ...scope, status: "unavailable", reason: "invalid-schedule",
});

function invalid(): never { throw new TypeError("Unsupported official policy schedule."); }
function civilDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  calendarInstantV1(value + "T00:00:00Z");
  return value;
}
function context(value: unknown): OfficialPolicyScheduleContextV1 {
  const data = calendarRecordV1(value, contextKeys);
  civilDate(data.canonicalMeetingDate);
  if (data.state !== "scheduled" && data.state !== "cancelled") invalid();
  // Remaining fields are validated by the canonical event reader, on this same snapshot.
  return data as unknown as OfficialPolicyScheduleContextV1;
}
function provenance(publisher: "ecb" | "boj", sourceUrl: string, sourceVersionId: string): CalendarProvenanceV1 {
  return { authority: "primary-publisher", publisher, sourceUrl, sourceVersionId,
    parserVersion: OFFICIAL_POLICY_SCHEDULE_NORMALIZER_V1 };
}
function event(
  publisher: "ecb" | "boj", sourceUrl: string, data: OfficialPolicyScheduleContextV1, eventTime: CalendarTimeV1,
): CalendarEventV1 {
  return readCalendarEventV1({
    schemaVersion: CALENDAR_EVENT_SCHEMA_V1, semantic: "source-fact-description",
    eventId: publisher === "ecb" ? ecbMonetaryPolicyCanonicalEventIdV1(data.canonicalMeetingDate)
      : "BOJ:boj-monetary-policy-decision:" + data.canonicalMeetingDate,
    versionId: data.versionId, title: publisher === "ecb" ? "ECB monetary policy decision" : "BoJ monetary policy decision",
    family: "policy-decision", state: data.state, eventTime,
    // A scheduled date or clock proves neither publication nor an economic effective date.
    publication: { status: "unavailable", reason: "publication-time-unverified" },
    referencePeriod: null, effectiveDate: null,
    provenance: provenance(publisher, sourceUrl, data.sourceVersionId),
    timing: data.timing, revision: data.revision, freshnessPolicy: data.freshnessPolicy,
    relevance: publisher === "ecb" ? CALENDAR_PRODUCTS_V1.map(productId => ({ productId, relationship: "direct-policy" }))
      : [{ productId: "eurjpy", relationship: "counterparty-policy" }],
  });
}
function available(
  normalized: CalendarEventV1, meetingDates: readonly string[], supportingEvidence: readonly OfficialPolicyScheduleSupportingEvidenceV1[],
): OfficialPolicyScheduleNormalizationV1 {
  return snapshotCalendarDataV1({ ...scope, status: "available", event: normalized,
    meetingDates, supportingEvidence }) as OfficialPolicyScheduleNormalizationV1;
}

/** Pure normalization of already-extracted official rows; no fetch/cache/store or implicit clock.
 * Entire input is detached before inspecting it. Bad/missing evidence never upgrades precision. */
export function normalizeEcbOfficialScheduleV1(input: unknown): OfficialPolicyScheduleNormalizationV1 {
  try {
    const data = calendarRecordV1(snapshotCalendarDataV1(input), ["schemaVersion", "candidate", "announcementClock", "context"]);
    if (data.schemaVersion !== ECB_OFFICIAL_SCHEDULE_INPUT_V1) invalid();
    const row = calendarRecordV1(data.candidate, ["sourceInstitution", "sourceUrl", "meetingDate"]);
    if (row.sourceInstitution !== ECB_SOURCE_INSTITUTION || row.sourceUrl !== ECB_GOVERNING_COUNCIL_CALENDAR_URL) invalid();
    const date = civilDate(row.meetingDate);
    const capture = context(data.context);
    let time: CalendarTimeV1 = { kind: "date-only", date, timeZone: ECB_DECISION_TIMEZONE };
    const supporting: OfficialPolicyScheduleSupportingEvidenceV1[] = [];
    if (data.announcementClock !== null) {
      const clock = calendarRecordV1(data.announcementClock, ["meetingDate", "localTime", "timeZone", "provenance", "timing"]);
      if (clock.meetingDate !== date || clock.timeZone !== ECB_DECISION_TIMEZONE || typeof clock.localTime !== "string") invalid();
      const binding = calendarRecordV1(clock.provenance, ["authority", "publisher", "sourceUrl", "sourceVersionId", "parserVersion"]);
      if (binding.publisher !== "ecb" || binding.sourceUrl !== ECB_OFFICIAL_DECISION_CLOCK_URL_V1) invalid();
      time = { kind: "exact", at: ecbScheduledInstantV1(date, clock.localTime),
        timeZone: ECB_DECISION_TIMEZONE, localDateTime: date + "T" + clock.localTime + ":00" };
      const checked = event("ecb", row.sourceUrl, capture, time);
      // Reuse all canonical provenance checks, including closed keys and version labels.
      const clockTiming = calendarRecordV1(clock.timing, ["acquisition", "evidenceAvailability"]);
      const clockChecked = readCalendarEventV1({ ...checked, provenance: binding,
        timing: { ...clockTiming, persistence: { status: "not-persisted" } } });
      const clockAcquisition = clockChecked.timing.acquisition;
      const clockAvailability = clockChecked.timing.evidenceAvailability;
      const acquisition = checked.timing.acquisition;
      const availability = checked.timing.evidenceAvailability;
      // Aggregate timing must bound every supporting source, preventing look-ahead.
      if (clockAcquisition.status !== "recorded" || clockAvailability.status !== "recorded" ||
        acquisition.status !== "recorded" || availability.status !== "recorded" ||
        calendarInstantV1(clockAcquisition.completedAt) > calendarInstantV1(acquisition.completedAt) ||
        calendarInstantV1(clockAvailability.availableAt) > calendarInstantV1(availability.availableAt)) invalid();
      supporting.push({ provenance: clockChecked.provenance,
        timing: { acquisition: clockAcquisition, evidenceAvailability: clockAvailability } });
    }
    return available(event("ecb", row.sourceUrl, capture, time), [date], supporting);
  } catch { return unavailable; }
}

export function normalizeBojOfficialScheduleV1(input: unknown): OfficialPolicyScheduleNormalizationV1 {
  try {
    const data = calendarRecordV1(snapshotCalendarDataV1(input), ["schemaVersion", "candidate", "context"]);
    if (data.schemaVersion !== BOJ_OFFICIAL_SCHEDULE_INPUT_V1) invalid();
    const row = calendarRecordV1(data.candidate, ["sourceUrl", "meetingStartsOn", "meetingEndsOn"]);
    if (typeof row.sourceUrl !== "string") invalid();
    // Only the inspected English meeting index and annual official schedule PDFs.
    if (row.sourceUrl !== BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1 &&
      !/^https:\/\/www\.boj\.or\.jp\/en\/mopo\/mpmsche_minu\/m_ref\/mref\d{6}a\.pdf$/.test(row.sourceUrl)) invalid();
    const first = civilDate(row.meetingStartsOn);
    const last = civilDate(row.meetingEndsOn);
    if (last < first) invalid();
    const normalized = event("boj", row.sourceUrl, context(data.context), {
      kind: "unknown", expectedDate: last, timeZone: "Asia/Tokyo", reason: "announcement-time-unspecified",
    });
    return available(normalized, first === last ? [first] : [first, last], []);
  } catch { return unavailable; }
}
