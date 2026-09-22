import { createHash } from "node:crypto";

export const ECB_MONETARY_POLICY_EVENT_FAMILY = "ecb-monetary-policy-decision" as const;
export const ECB_SOURCE_INSTITUTION = "ECB" as const;
export const ECB_GOVERNING_COUNCIL_CALENDAR_URL =
  "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" as const;
export const ECB_DECISION_TIMEZONE = "Europe/Berlin" as const;
export const ECB_DECISION_TIMEZONE_WORDING = "ECB/Frankfurt local time (CET/CEST)" as const;
export const ECB_CURRENT_DECISION_LOCAL_TIME = "14:15" as const;

export const ECB_POLICY_RATE_SERIES = Object.freeze({
  depositFacility: "FM.B.U2.EUR.4F.KR.DFR.LEV",
  mainRefinancingOperations: "FM.B.U2.EUR.4F.KR.MRR_FR.LEV",
  marginalLendingFacility: "FM.B.U2.EUR.4F.KR.MLFR.LEV",
} as const);

export interface EcbPolicyRateFactsV1 {
  readonly depositFacility: number;
  readonly mainRefinancingOperations: number;
  readonly marginalLendingFacility: number;
  readonly unit: "percent";
  /** Economic effective date, never a publication timestamp. */
  readonly effectiveDate: string | null;
}

export interface EcbAnnouncedPolicyRatesInputV1 {
  readonly depositFacility: number;
  readonly mainRefinancingOperations: number;
  readonly marginalLendingFacility: number;
  readonly effectiveDate: string | null;
}

export interface EcbMonetaryPolicyScheduleFactV1 {
  readonly meetingDate: string;
  readonly scheduledAt: string;
  readonly scheduledLocalTime: string;
  readonly scheduledTimezone: typeof ECB_DECISION_TIMEZONE;
  readonly sourceTimezoneWording: typeof ECB_DECISION_TIMEZONE_WORDING;
  readonly sourceUrl: typeof ECB_GOVERNING_COUNCIL_CALENDAR_URL;
  /** Unix seconds; capture metadata is excluded from semantic versions. */
  readonly fetchedAt: number;
  readonly sourceVersionId: string;
}

export interface EcbMonetaryPolicyDecisionFactV1 {
  readonly decisionDate: string;
  readonly sourceInstitution: typeof ECB_SOURCE_INSTITUTION;
  readonly documentUrl: string;
  readonly contentDigest: string;
  /** Unix seconds; first observation is not the actual release instant. */
  readonly fetchedAt: number;
  readonly firstObservedAt: number;
  readonly actualReleasedAt: string | null;
  readonly rates: EcbPolicyRateFactsV1 | null;
  readonly sourceVersionId: string;
}

export interface EcbMonetaryPolicyEventFactV1 {
  readonly schemaVersion: "ecb-monetary-policy-event-v1";
  readonly canonicalEventId: string;
  /** Persist this first captured Governing Council date to retain identity across schedule revisions. */
  readonly canonicalMeetingDate: string;
  readonly eventFamily: typeof ECB_MONETARY_POLICY_EVENT_FAMILY;
  readonly sourceInstitution: typeof ECB_SOURCE_INSTITUTION;
  readonly schedule: EcbMonetaryPolicyScheduleFactV1;
  readonly decision: EcbMonetaryPolicyDecisionFactV1 | null;
  readonly availability: "partial" | "available";
  readonly sourceVersionId: string;
}

export interface EcbMonetaryPolicyEventInputV1 {
  readonly canonicalMeetingDate: string;
  readonly schedule: {
    readonly meetingDate: string;
    readonly scheduledLocalTime?: string;
    readonly fetchedAt: number;
  };
  readonly decision?: {
    readonly decisionDate: string;
    readonly documentUrl: string;
    /** SHA-256 digest of the observed official document, without storing its text. */
    readonly contentDigest: string;
    readonly fetchedAt: number;
    readonly firstObservedAt: number;
    /** Verified absolute publication instant; never inferred from schedule or capture metadata. */
    readonly actualReleasedAt?: string | null;
    readonly rates: EcbAnnouncedPolicyRatesInputV1 | null;
  } | null;
}

const ECB_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: ECB_DECISION_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The anchor date is supplied by the first capture and retained by future captures. */
export function ecbMonetaryPolicyCanonicalEventIdV1(canonicalMeetingDate: string): string {
  assertCivilDate(canonicalMeetingDate, "canonical meeting date");
  return `${ECB_SOURCE_INSTITUTION}:${ECB_MONETARY_POLICY_EVENT_FAMILY}:${canonicalMeetingDate}`;
}

export function normalizeEcbMonetaryPolicyEventV1(
  input: EcbMonetaryPolicyEventInputV1,
): EcbMonetaryPolicyEventFactV1 {
  const canonicalEventId = ecbMonetaryPolicyCanonicalEventIdV1(input.canonicalMeetingDate);
  const meetingDate = assertCivilDate(input.schedule.meetingDate, "meeting date");
  const scheduledLocalTime = input.schedule.scheduledLocalTime ?? ECB_CURRENT_DECISION_LOCAL_TIME;
  const scheduledAt = ecbScheduledInstantV1(meetingDate, scheduledLocalTime);
  const scheduleFetchedAt = assertCaptureTime(input.schedule.fetchedAt, "schedule fetchedAt");
  const scheduleVersionId = digest([
    "ecb-monetary-policy-schedule-v1", meetingDate, scheduledLocalTime,
    ECB_DECISION_TIMEZONE, ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  ]);
  const schedule: EcbMonetaryPolicyScheduleFactV1 = Object.freeze({
    meetingDate,
    scheduledAt,
    scheduledLocalTime,
    scheduledTimezone: ECB_DECISION_TIMEZONE,
    sourceTimezoneWording: ECB_DECISION_TIMEZONE_WORDING,
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    fetchedAt: scheduleFetchedAt,
    sourceVersionId: scheduleVersionId,
  });

  let decision: EcbMonetaryPolicyDecisionFactV1 | null = null;
  if (input.decision != null) {
    const decisionDate = assertCivilDate(input.decision.decisionDate, "decision date");
    if (decisionDate !== meetingDate) {
      throw new TypeError("Decision date must match the captured meeting date.");
    }
    const documentUrl = assertEcbDecisionUrl(input.decision.documentUrl);
    const contentDigest = assertDigest(input.decision.contentDigest);
    const fetchedAt = assertCaptureTime(input.decision.fetchedAt, "decision fetchedAt");
    const firstObservedAt = assertCaptureTime(input.decision.firstObservedAt, "decision firstObservedAt");
    if (firstObservedAt > fetchedAt) {
      throw new TypeError("Decision firstObservedAt cannot follow fetchedAt.");
    }
    const actualReleasedAt = input.decision.actualReleasedAt == null
      ? null
      : normalizeAbsoluteInstant(input.decision.actualReleasedAt, "actualReleasedAt");
    const rates = normalizeRates(input.decision.rates);
    const sourceVersionId = digest([
      "ecb-monetary-policy-decision-v1", decisionDate, documentUrl, contentDigest,
      actualReleasedAt,
      rates?.depositFacility ?? null, rates?.mainRefinancingOperations ?? null,
      rates?.marginalLendingFacility ?? null, rates?.effectiveDate ?? null,
    ]);
    decision = Object.freeze({
      decisionDate,
      sourceInstitution: ECB_SOURCE_INSTITUTION,
      documentUrl,
      contentDigest,
      fetchedAt,
      firstObservedAt,
      actualReleasedAt,
      rates,
      sourceVersionId,
    });
  }

  return Object.freeze({
    schemaVersion: "ecb-monetary-policy-event-v1",
    canonicalEventId,
    canonicalMeetingDate: input.canonicalMeetingDate,
    eventFamily: ECB_MONETARY_POLICY_EVENT_FAMILY,
    sourceInstitution: ECB_SOURCE_INSTITUTION,
    schedule,
    decision,
    availability: decision?.rates ? "available" : "partial",
    sourceVersionId: digest([
      "ecb-monetary-policy-event-v1", canonicalEventId,
      scheduleVersionId, decision?.sourceVersionId ?? null,
    ]),
  });
}

/** Resolve a Frankfurt civil clock to exactly one UTC instant, rejecting DST gaps/folds. */
export function ecbScheduledInstantV1(meetingDate: string, localTime: string): string {
  assertCivilDate(meetingDate, "meeting date");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    throw new TypeError("Scheduled local time must be HH:mm.");
  }
  const [year, month, day] = meetingDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const matches = [1, 2]
    .map((offsetHours) => new Date(localAsUtc - offsetHours * 3_600_000))
    .filter((candidate) => {
      const parts = Object.fromEntries(ECB_CLOCK.formatToParts(candidate)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}` === meetingDate &&
        `${parts.hour}:${parts.minute}` === localTime;
    });
  if (matches.length !== 1) {
    throw new TypeError("Scheduled Frankfurt local time is ambiguous or nonexistent.");
  }
  return matches[0].toISOString();
}

function normalizeRates(input: EcbAnnouncedPolicyRatesInputV1 | null): EcbPolicyRateFactsV1 | null {
  if (input === null) return null;
  for (const value of [input.depositFacility, input.mainRefinancingOperations, input.marginalLendingFacility]) {
    if (!Number.isFinite(value)) throw new TypeError("Announced policy rates must be finite.");
  }
  const effectiveDate = input.effectiveDate === null
    ? null : assertCivilDate(input.effectiveDate, "rate effective date");
  return Object.freeze({
    depositFacility: input.depositFacility,
    mainRefinancingOperations: input.mainRefinancingOperations,
    marginalLendingFacility: input.marginalLendingFacility,
    unit: "percent",
    effectiveDate,
  });
}

function assertCivilDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError(`Invalid ${label}.`);
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) throw new TypeError(`Invalid ${label}.`);
  return value;
}

function assertCaptureTime(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Invalid ${label}.`);
  return value;
}

function normalizeAbsoluteInstant(value: string, label: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (match === null) throw new TypeError(`Invalid ${label}.`);
  assertCivilDate(match[1], label);
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new TypeError(`Invalid ${label}.`);
  return new Date(instant).toISOString();
}

function assertDigest(value: string): string {
  if (!/^[a-f\d]{64}$/i.test(value)) throw new TypeError("Invalid decision content digest.");
  return value.toLowerCase();
}

function assertEcbDecisionUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError("Invalid ECB decision URL."); }
  if (url.protocol !== "https:" || url.hostname !== "www.ecb.europa.eu" ||
      !url.pathname.startsWith("/press/pr/date/") || !url.pathname.endsWith(".html") ||
      url.username || url.password || url.search || url.hash || url.port) {
    throw new TypeError("Decision URL must identify an official ECB press release.");
  }
  return url.href;
}

function digest(parts: readonly (string | number | null)[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
