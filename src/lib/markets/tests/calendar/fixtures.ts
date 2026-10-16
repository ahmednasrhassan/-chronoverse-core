import {
  CALENDAR_EVENT_SCHEMA_V1,
  type CalendarCaptureTimingV1, type CalendarEventV1,
} from "../../calendar/contracts";

/** Entirely synthetic. These dates/times are not claims about official releases. */
export const FIXTURE_COMPLETION_V1 = "2026-10-16T08:00:00.000Z";
export const FIXTURE_AVAILABILITY_V1 = "2026-10-16T08:00:00.100Z";
export const FIXTURE_ACK_V1 = "2026-10-16T08:00:00.200Z";

export function fixtureTimingV1(completedAt = FIXTURE_COMPLETION_V1): CalendarCaptureTimingV1 {
  const ms = Date.parse(completedAt);
  return {
    acquisition: { status: "recorded", completedAt },
    evidenceAvailability: { status: "recorded", availableAt: new Date(ms + 100).toISOString() },
    persistence: { status: "acknowledged", acknowledgedAt: new Date(ms + 200).toISOString(),
      recordId: "fixture-internal-persistence-record" },
  };
}

export function calendarFixtureV1(patch: Partial<CalendarEventV1> = {}): CalendarEventV1 {
  return {
    schemaVersion: CALENDAR_EVENT_SCHEMA_V1,
    semantic: "source-fact-description",
    eventId: "fixture:boj:decision:001", versionId: "fixture-version-1",
    title: "Synthetic BoJ announcement", family: "policy-decision", state: "scheduled",
    eventTime: { kind: "unknown", expectedDate: "2026-10-30", timeZone: "Asia/Tokyo",
      reason: "announcement-time-unspecified" },
    publication: { status: "unavailable", reason: "not-published" },
    referencePeriod: null, effectiveDate: null,
    provenance: { authority: "primary-publisher", publisher: "boj",
      sourceUrl: "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm",
      sourceVersionId: "synthetic-source-version", parserVersion: "offline-fixture-v1" },
    timing: fixtureTimingV1(), revision: { sequence: 1, supersedesVersionId: null, change: "initial" },
    relevance: [{ productId: "eurjpy", relationship: "counterparty-policy" }],
    freshnessPolicy: { maximumAgeMilliseconds: 60_000 },
    ...patch,
  };
}

export function revisionFixturesV1(): readonly CalendarEventV1[] {
  const first = calendarFixtureV1();
  const revised = calendarFixtureV1({ versionId: "fixture-version-2", timing: fixtureTimingV1("2026-10-16T08:01:00Z"),
    eventTime: { kind: "date-only", date: "2026-11-02", timeZone: "Asia/Tokyo" },
    revision: { sequence: 2, supersedesVersionId: first.versionId, change: "schedule-revision" } });
  const cancelled = calendarFixtureV1({ ...revised, state: "cancelled", versionId: "fixture-version-3",
    timing: fixtureTimingV1("2026-10-16T08:02:00Z"),
    revision: { sequence: 3, supersedesVersionId: revised.versionId, change: "cancellation" } });
  const reinstated = calendarFixtureV1({ ...revised, versionId: "fixture-version-4",
    timing: fixtureTimingV1("2026-10-16T08:03:00Z"),
    revision: { sequence: 4, supersedesVersionId: cancelled.versionId, change: "reinstatement" } });
  const published = calendarFixtureV1({ ...reinstated, state: "published", versionId: "fixture-version-5",
    timing: fixtureTimingV1("2026-11-02T01:00:00Z"),
    publication: { status: "recorded", time: { kind: "exact", at: "2026-11-02T00:59:00Z",
      localDateTime: "2026-11-02T09:59:00", timeZone: "Asia/Tokyo" }, provenance: first.provenance },
    revision: { sequence: 5, supersedesVersionId: reinstated.versionId, change: "publication-update" } });
  return [first, revised, cancelled, reinstated, published];
}
