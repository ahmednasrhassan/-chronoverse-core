import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ecbMonetaryPolicyCanonicalEventIdV1 } from "../../events/ecbMonetaryPolicy";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { projectCalendarFreeLiteV1, projectCalendarVipDeepV1 } from "../../calendar/projections";
import {
  normalizeBojOfficialScheduleV1, normalizeEcbOfficialScheduleV1,
  type OfficialPolicyScheduleNormalizationV1,
} from "../../calendar/officialPolicySchedules";
import { FIXTURE_ACK_V1, fixtureTimingV1 } from "./fixtures";
import { bojScheduleFixtureV1, ecbClockFixtureV1, ecbScheduleFixtureV1 } from "./officialPolicyScheduleFixtures";

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
function available(result: OfficialPolicyScheduleNormalizationV1) {
  if (result.status !== "available") assert.fail("Expected supported official schedule");
  return result;
}
function invalid(result: OfficialPolicyScheduleNormalizationV1) {
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") assert.fail();
  assert.equal(result.reason, "invalid-schedule");
}

test("ECB parser-compatible Day-2 rows retain canonical identity and date-only precision", () => {
  const input = ecbScheduleFixtureV1();
  const result = available(normalizeEcbOfficialScheduleV1(input));
  assert.equal(result.event.eventId, ecbMonetaryPolicyCanonicalEventIdV1("2026-10-29"));
  assert.deepEqual(plain(result.event.eventTime), { kind: "date-only", date: "2026-10-29", timeZone: "Europe/Berlin" });
  assert.deepEqual(result.meetingDates, ["2026-10-29"]);
  assert.equal(result.event.provenance.sourceUrl, input.candidate.sourceUrl);
  assert.equal(result.event.provenance.sourceVersionId, input.context.sourceVersionId);
  assert.equal(result.supportingEvidence.length, 0);
  assert.equal(result.sourceAuthentication, "not-performed");
  assert.equal(result.historicalOwnership, "not-certified");
});

for (const [date, at] of [
  ["2026-03-28", "2026-03-28T13:15:00.000Z"], ["2026-03-29", "2026-03-29T12:15:00.000Z"],
  ["2026-10-24", "2026-10-24T12:15:00.000Z"], ["2026-10-25", "2026-10-25T13:15:00.000Z"],
  ["2026-10-29", "2026-10-29T13:15:00.000Z"],
] as const) {
  test("explicitly qualified ECB civil clock resolves across DST: " + date, () => {
    // DST test dates are synthetic, not claims of actual meetings.
    const input = { ...ecbScheduleFixtureV1(date), announcementClock: ecbClockFixtureV1(date) };
    const result = available(normalizeEcbOfficialScheduleV1(input));
    assert.deepEqual(plain(result.event.eventTime), { kind: "exact", at,
      timeZone: "Europe/Berlin", localDateTime: date + "T14:15:00" });
    assert.deepEqual(plain(result.supportingEvidence), [{ provenance: input.announcementClock.provenance, timing: input.announcementClock.timing }]);
    assert.deepEqual(plain(result.event.publication), { status: "unavailable", reason: "publication-time-unverified" });
  });
}

test("ECB gap/fold clocks reject rather than guessing an offset", () => {
  for (const date of ["2026-03-29", "2026-10-25"]) {
    invalid(normalizeEcbOfficialScheduleV1({ ...ecbScheduleFixtureV1(date), announcementClock: ecbClockFixtureV1(date, "02:30") }));
  }
});

test("ECB exact schedules need complete, date-matched official Frankfurt clock evidence", () => {
  const input = ecbScheduleFixtureV1();
  const clock = ecbClockFixtureV1();
  for (const announcementClock of [undefined, {}, "14:15", { ...clock, meetingDate: "2026-12-17" },
    { ...clock, timeZone: "UTC" }, { ...clock, localTime: "14:15 CET" },
    { ...clock, localTime: "24:00" }, { ...clock, localTime: "14:15:00" },
    { ...clock, provenance: { ...clock.provenance, publisher: "boj" } },
    { ...clock, provenance: { ...clock.provenance, sourceUrl: input.candidate.sourceUrl } },
    { ...clock, provenance: { ...clock.provenance, sourceVersionId: "" } },
    { ...clock, provenance: { ...clock.provenance, parserVersion: "" } },
    { ...clock, provenance: { ...clock.provenance, authority: "aggregator" } },
    { ...clock, provenance: { ...clock.provenance, extra: "unsupported" } },
  ]) invalid(normalizeEcbOfficialScheduleV1({ ...input, announcementClock }));
});

test("supporting clock evidence cannot be newer than aggregate capture/availability", () => {
  const input = ecbScheduleFixtureV1();
  const clock = ecbClockFixtureV1();
  for (const timing of [
    { ...clock.timing, acquisition: { status: "recorded", completedAt: "2026-10-16T08:00:00.001Z" } },
    { ...clock.timing, evidenceAvailability: { status: "recorded", availableAt: "2026-10-16T08:00:00.101Z" } },
    { ...clock.timing, evidenceAvailability: { status: "recorded", availableAt: "2026-10-16T07:59:59Z" } },
    { ...clock.timing, evidenceAvailability: { status: "unavailable", reason: "availability-time-unavailable" } },
    { ...clock.timing, acquisition: { status: "unavailable", reason: "acquisition-time-unavailable" } },
    { ...clock.timing, persistence: { status: "not-persisted" } },
  ]) invalid(normalizeEcbOfficialScheduleV1({ ...input, announcementClock: { ...clock, timing } }));
  const normalized = available(normalizeEcbOfficialScheduleV1({ ...input, announcementClock: clock })).event;
  const selected = selectCalendarEventAsOfV1({ versions: [normalized],
    knowledgeCutoff: "2026-10-16T08:00:00.199Z", evaluatedAt: FIXTURE_ACK_V1 });
  assert.ok(selected.status === "unavailable" && selected.reason === "not-known-as-of");
});

test("BoJ meeting dates preserve unknown decision time, never a noon or midnight window", () => {
  const input = bojScheduleFixtureV1();
  const result = available(normalizeBojOfficialScheduleV1(input));
  assert.deepEqual(result.meetingDates, ["2026-10-29", "2026-10-30"]);
  assert.deepEqual(plain(result.event.eventTime), { kind: "unknown", expectedDate: "2026-10-30",
    timeZone: "Asia/Tokyo", reason: "announcement-time-unspecified" });
  assert.equal(result.event.eventId, "BOJ:boj-monetary-policy-decision:2026-10-30");
  assert.deepEqual(plain(result.event.relevance), [{ productId: "eurjpy", relationship: "counterparty-policy" }]);
  assert.equal(result.event.referencePeriod, null);
  assert.equal(result.event.effectiveDate, null);
  assert.equal(result.supportingEvidence.length, 0);
  for (const key of ["at", "startsAt", "endsAt"]) assert.equal(key in result.event.eventTime, false);
});

test("BoJ annual schedule PDFs and year/month rollover retain civil dates only", () => {
  const input = bojScheduleFixtureV1();
  for (const [meetingStartsOn, meetingEndsOn] of [
    ["2026-12-31", "2027-01-01"], ["2028-02-29", "2028-03-01"], ["2026-10-30", "2026-10-30"],
  ]) {
    const result = available(normalizeBojOfficialScheduleV1({ ...input,
      candidate: { sourceUrl: "https://www.boj.or.jp/en/mopo/mpmsche_minu/m_ref/mref250731a.pdf", meetingStartsOn, meetingEndsOn } }));
    const time = result.event.eventTime;
    assert.ok(time.kind === "unknown" && time.expectedDate === meetingEndsOn);
    assert.deepEqual(result.meetingDates, meetingStartsOn === meetingEndsOn ? [meetingEndsOn] : [meetingStartsOn, meetingEndsOn]);
    assert.equal(result.event.publication.status, "unavailable");
    // Date encoded in the source document URL is not an event publication time.
    assert.equal(result.event.eventId, "BOJ:boj-monetary-policy-decision:2026-10-30");
  }
});

test("product relevance reuses exactly five launch products with independent rate semantics", () => {
  const ecb = available(normalizeEcbOfficialScheduleV1(ecbScheduleFixtureV1())).event;
  assert.deepEqual(ecb.relevance.map(item => item.productId), ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"]);
  assert.ok(ecb.relevance.every(item => item.relationship === "direct-policy"));
  assert.equal(ecb.family, "policy-decision");
  assert.equal(ecb.effectiveDate, null);
  assert.equal(ecb.referencePeriod, null);
  for (const key of ["rate", "rateDirection", "opportunity", "probability", "reaction", "entry"]) assert.equal(key in ecb, false);
});

test("source bindings reject substitutions, spoofed official hosts, credentials and wrong document classes", () => {
  const ecb = ecbScheduleFixtureV1();
  const boj = bojScheduleFixtureV1();
  for (const sourceUrl of ["http://www.ecb.europa.eu/", "https://www.ecb.europa.eu.attacker.test/",
    ecb.candidate.sourceUrl + "?token=synthetic", ecb.candidate.sourceUrl + "#section",
    "https://user:password@www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
    "https://www.ecb.europa.eu/press/govcdec/html/index.en.html", boj.candidate.sourceUrl]) {
    invalid(normalizeEcbOfficialScheduleV1({ ...ecb, candidate: { ...ecb.candidate, sourceUrl } }));
  }
  for (const sourceUrl of ["http://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm", "https://www.boj.or.jp.attacker.test/",
    boj.candidate.sourceUrl + "?x=1", boj.candidate.sourceUrl + "#section",
    "https://user:password@www.boj.or.jp/en/mopo/mpmsche_minu/index.htm",
    "https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2026/g261030.pdf", ecb.candidate.sourceUrl]) {
    invalid(normalizeBojOfficialScheduleV1({ ...boj, candidate: { ...boj.candidate, sourceUrl } }));
  }
  invalid(normalizeEcbOfficialScheduleV1({ ...ecb, candidate: { ...ecb.candidate, sourceInstitution: "BoJ" } }));
});

test("unsupported fields, event classes, malformed dates and reversed BoJ ranges fail closed", () => {
  const ecb = ecbScheduleFixtureV1();
  const boj = bojScheduleFixtureV1();
  for (const input of [null, undefined, {}, [], { ...ecb, schemaVersion: "v2" },
    { ...ecb, candidate: { ...ecb.candidate, meetingDate: "2026-02-30" } },
    { ...ecb, candidate: { ...ecb.candidate, meetingDate: "2026-10-29T00:00:00Z" } },
    { ...ecb, candidate: { ...ecb.candidate, type: "press-conference" } },
    { ...ecb, context: { ...ecb.context, canonicalMeetingDate: "2026-02-30" } },
    { ...ecb, context: { ...ecb.context, state: "published" } },
    { ...ecb, probability: 90 }, { ...ecb, sourcePublicationAt: "2025-07-31T00:00:00Z" },
  ]) invalid(normalizeEcbOfficialScheduleV1(input));
  for (const input of [null, {}, { ...boj, schemaVersion: "v2" }, { ...boj, announcementClock: "12:00" },
    ...["2026-02-30", "2026-2-03", "To be announced", "", null, "10000-01-01"].map(meetingEndsOn =>
      ({ ...boj, candidate: { ...boj.candidate, meetingEndsOn } })),
    { ...boj, candidate: { ...boj.candidate, meetingStartsOn: "2026-10-31" } },
    { ...boj, candidate: { ...boj.candidate, publicationTime: "08:50" } },
  ]) invalid(normalizeBojOfficialScheduleV1(input));
});

test("rescheduling and explicit cancellation preserve anchors, versions and historical cutoffs", () => {
  for (const [normalize, firstInput, changedCandidate] of [
    [normalizeEcbOfficialScheduleV1, ecbScheduleFixtureV1(), { ...ecbScheduleFixtureV1().candidate, meetingDate: "2026-11-02" }],
    [normalizeBojOfficialScheduleV1, bojScheduleFixtureV1(), { ...bojScheduleFixtureV1().candidate,
      meetingStartsOn: "2026-11-02", meetingEndsOn: "2026-11-03" }],
  ] as const) {
    const first = available(normalize(firstInput)).event;
    const revised = available(normalize({ ...firstInput, candidate: changedCandidate,
      context: { ...firstInput.context, versionId: "synthetic-schedule-v2", sourceVersionId: "synthetic-official-document-v2",
        timing: fixtureTimingV1("2026-10-16T08:01:00Z"),
        revision: { sequence: 2, supersedesVersionId: first.versionId, change: "schedule-revision" } } })).event;
    const cancelled = available(normalize({ ...firstInput, candidate: changedCandidate,
      context: { ...firstInput.context, state: "cancelled", versionId: "synthetic-schedule-v3",
        timing: fixtureTimingV1("2026-10-16T08:02:00Z"),
        revision: { sequence: 3, supersedesVersionId: revised.versionId, change: "cancellation" } } })).event;
    assert.equal(first.eventId, revised.eventId);
    assert.equal(first.eventId, cancelled.eventId);
    assert.notDeepEqual(first.eventTime, revised.eventTime);
    const versions = [cancelled, first, revised];
    for (const [cutoff, expected] of [[FIXTURE_ACK_V1, first.versionId],
      ["2026-10-16T08:01:00.200Z", revised.versionId], ["2026-10-16T08:02:00.200Z", cancelled.versionId]]) {
      const selected = selectCalendarEventAsOfV1({ versions, knowledgeCutoff: cutoff, evaluatedAt: cutoff });
      if (selected.status !== "selected") assert.fail();
      assert.equal(selected.event.versionId, expected);
    }
    const before = selectCalendarEventAsOfV1({ versions, knowledgeCutoff: "2026-10-16T08:00:00.199Z", evaluatedAt: FIXTURE_ACK_V1 });
    assert.ok(before.status === "unavailable" && before.reason === "not-known-as-of");
  }
});

test("normalization preserves distinct clocks, unavailability and unpersisted fail-closed delivery", () => {
  for (const [normalize, input] of [[normalizeEcbOfficialScheduleV1, ecbScheduleFixtureV1()],
    [normalizeBojOfficialScheduleV1, bojScheduleFixtureV1()]] as const) {
    const result = available(normalize(input));
    assert.deepEqual(plain(result.event.timing), input.context.timing);
    assert.equal(result.event.publication.status, "unavailable");
    for (const timing of [
      { ...input.context.timing, persistence: { status: "not-persisted" } },
      { acquisition: { status: "unavailable", reason: "acquisition-time-unavailable" },
        evidenceAvailability: { status: "unavailable", reason: "availability-time-unavailable" },
        persistence: { status: "unavailable", reason: "acknowledgement-unavailable" } },
    ]) {
      const event = available(normalize({ ...input, context: { ...input.context, timing } })).event;
      const selected = selectCalendarEventAsOfV1({ versions: [event], knowledgeCutoff: FIXTURE_ACK_V1, evaluatedAt: FIXTURE_ACK_V1 });
      assert.equal(selected.status, "unavailable");
      assert.equal(projectCalendarFreeLiteV1({ versions: [event], knowledgeCutoff: FIXTURE_ACK_V1,
        evaluatedAt: FIXTURE_ACK_V1 }, FIXTURE_ACK_V1).availability, "unavailable");
    }
    invalid(normalize({ ...input, context: { ...input.context,
      timing: { ...input.context.timing, acquisition: { status: "recorded", completedAt: "2026-10-16T08:01:00Z" } } } }));
  }
});

test("existing Free/VIP allowlists and freshness remain intact for normalized schedules", () => {
  for (const event of [available(normalizeEcbOfficialScheduleV1(ecbScheduleFixtureV1())).event,
    available(normalizeBojOfficialScheduleV1(bojScheduleFixtureV1())).event]) {
    const input = { versions: [event], knowledgeCutoff: FIXTURE_ACK_V1, evaluatedAt: FIXTURE_ACK_V1 };
    const free = projectCalendarFreeLiteV1(input, "2026-10-16T08:01:00.100Z");
    const vip = projectCalendarVipDeepV1(input, FIXTURE_ACK_V1);
    if (free.availability !== "available" || vip.availability !== "available") assert.fail();
    assert.equal(free.event.freshness.status, "stale");
    assert.equal(vip.event.freshness.status, "within-cadence");
    assert.equal(vip.event.publication.status, "unavailable");
    for (const secret of ["recordId", "fixture-internal-persistence-record", "timing", "sourceVersionId", "revision"]) {
      assert.equal(JSON.stringify(free).includes(secret), false);
    }
    assert.equal(JSON.stringify(vip).includes("fixture-internal-persistence-record"), false);
    const noCadence = { ...event, freshnessPolicy: { maximumAgeMilliseconds: null } };
    const result = projectCalendarFreeLiteV1({ ...input, versions: [noCadence] }, FIXTURE_ACK_V1);
    assert.ok(result.availability === "available" && result.event.freshness.status === "unavailable");
  }
});

test("normalized results are detached/frozen; proxies and accessors never execute", () => {
  const input = bojScheduleFixtureV1();
  const result = available(normalizeBojOfficialScheduleV1(input));
  Object.assign(input.candidate, { meetingEndsOn: "2026-12-18" });
  assert.equal(result.event.eventTime.kind, "unknown");
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.event) && Object.isFrozen(result.meetingDates));
  assert.ok(Object.isFrozen(result.event.relevance[0]));
  assert.ok(result.event.eventTime.kind === "unknown" && result.event.eventTime.expectedDate === "2026-10-30");
  let calls = 0;
  const trap = () => { calls++; throw Error("Caller code forbidden"); };
  for (const [normalize, value] of [[normalizeBojOfficialScheduleV1, bojScheduleFixtureV1()],
    [normalizeEcbOfficialScheduleV1, ecbScheduleFixtureV1()]] as const) {
    const proxy = new Proxy(value, { get: trap, getPrototypeOf: trap, ownKeys: trap });
    const revoked = Proxy.revocable(value, {}); revoked.revoke();
    const accessor = Object.defineProperty({ ...value }, "candidate", { enumerable: true, get: trap });
    const nested = { ...value, context: new Proxy(value.context, { get: trap, getPrototypeOf: trap }) };
    for (const bad of [proxy, revoked.proxy, accessor, nested, { ...value, toJSON: trap },
      Object.defineProperty({ ...value }, "hidden", { value: true }), { ...value, [Symbol("extra")]: true }]) invalid(normalize(bad));
  }
  assert.equal(calls, 0);
});

test("normalizers need no network, ambient clock, live owner or storage client", () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  try {
    globalThis.fetch = () => { throw Error("No network"); };
    Date.now = () => { throw Error("No ambient clock"); };
    for (const [normalize, input] of [[normalizeEcbOfficialScheduleV1, ecbScheduleFixtureV1()],
      [normalizeBojOfficialScheduleV1, bojScheduleFixtureV1()]] as const) {
      assert.deepEqual(available(normalize(input)), available(normalize(input)));
    }
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
  const source = readFileSync(new URL("../../calendar/officialPolicySchedules.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.env|fetch\(|Date\.now|new Redis|unstable_cache|ownershipLedger|HistoricalResolution/);
  assert.match(source, /import type .*EcbMonetaryPolicyScheduleCandidateV1/);
});
