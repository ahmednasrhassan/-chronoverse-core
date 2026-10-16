import { ECB_GOVERNING_COUNCIL_CALENDAR_URL, ECB_SOURCE_INSTITUTION } from "../../events/ecbMonetaryPolicy";
import {
  BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1, BOJ_OFFICIAL_SCHEDULE_INPUT_V1,
  ECB_OFFICIAL_DECISION_CLOCK_URL_V1, ECB_OFFICIAL_SCHEDULE_INPUT_V1,
  type BojOfficialScheduleInputV1, type EcbOfficialScheduleInputV1, type OfficialPolicyScheduleContextV1,
} from "../../calendar/officialPolicySchedules";
import { fixtureTimingV1 } from "./fixtures";

/** Row dates match the official pages inspected for Phase 2B1. Version labels,
 * capture clocks, acknowledgements and revisions below are SYNTHETIC test data.
 * Fixtures are neither authenticated captures nor historical ownership evidence. */
export function scheduleContextFixtureV1(canonicalMeetingDate: string): OfficialPolicyScheduleContextV1 {
  return { canonicalMeetingDate, versionId: "synthetic-schedule-v1", sourceVersionId: "synthetic-official-document-v1",
    state: "scheduled", revision: { sequence: 1, supersedesVersionId: null, change: "initial" },
    timing: fixtureTimingV1(), freshnessPolicy: { maximumAgeMilliseconds: 60_000 } };
}
export function ecbScheduleFixtureV1(date = "2026-10-29"): EcbOfficialScheduleInputV1 {
  return { schemaVersion: ECB_OFFICIAL_SCHEDULE_INPUT_V1,
    candidate: { sourceInstitution: ECB_SOURCE_INSTITUTION, sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL, meetingDate: date },
    announcementClock: null, context: scheduleContextFixtureV1(date) };
}
export function ecbClockFixtureV1(date = "2026-10-29", localTime = "14:15"): NonNullable<EcbOfficialScheduleInputV1["announcementClock"]> {
  const timing = fixtureTimingV1();
  return { meetingDate: date, localTime, timeZone: "Europe/Berlin",
    timing: { acquisition: timing.acquisition, evidenceAvailability: timing.evidenceAvailability },
    provenance: { authority: "primary-publisher", publisher: "ecb", sourceUrl: ECB_OFFICIAL_DECISION_CLOCK_URL_V1,
      sourceVersionId: "synthetic-clock-rule-v1", parserVersion: "synthetic-official-rule-extractor-v1" } };
}
export function bojScheduleFixtureV1(): BojOfficialScheduleInputV1 {
  return { schemaVersion: BOJ_OFFICIAL_SCHEDULE_INPUT_V1,
    candidate: { sourceUrl: BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1, meetingStartsOn: "2026-10-29", meetingEndsOn: "2026-10-30" },
    context: scheduleContextFixtureV1("2026-10-30") };
}
