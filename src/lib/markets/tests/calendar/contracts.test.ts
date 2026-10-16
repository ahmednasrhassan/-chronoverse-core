import assert from "node:assert/strict";
import test from "node:test";
import { CALENDAR_PRODUCTS_V1, type CalendarEventV1, type CalendarTimeV1 } from "../../calendar/contracts";
import { CalendarContractErrorV1, readCalendarEventV1 } from "../../calendar/validation";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { calendarFixtureV1, fixtureTimingV1, revisionFixturesV1, FIXTURE_ACK_V1 } from "./fixtures";

const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const reject = (input: unknown) => assert.throws(() => readCalendarEventV1(input), CalendarContractErrorV1);
const select = (versions: readonly unknown[], knowledgeCutoff = FIXTURE_ACK_V1, evaluatedAt = knowledgeCutoff) =>
  selectCalendarEventAsOfV1({ versions, knowledgeCutoff, evaluatedAt });
const selectedId = (versions: readonly unknown[], cutoff: string) => {
  const result = select(versions, cutoff);
  if (result.status !== "selected") assert.fail(result.reason);
  return result.event.versionId;
};

test("five-product contract is exhaustive and descriptions remain detached, frozen and serializable", () => {
  assert.deepEqual(CALENDAR_PRODUCTS_V1, ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"]);
  for (const productId of CALENDAR_PRODUCTS_V1) {
    const input = calendarFixtureV1({ relevance: [{ productId, relationship: "macro-context" }] });
    const event = readCalendarEventV1(input);
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(event.timing.acquisition), true);
    assert.equal(Object.isFrozen(event.relevance[0]), true);
    assert.equal(event.relevance[0].productId, productId);
    assert.deepEqual(readCalendarEventV1(JSON.parse(JSON.stringify(event))), event);
    Object.assign(input, { title: "later caller mutation" });
    assert.equal(event.title, "Synthetic BoJ announcement");
  }
});

for (const time of [
  { kind: "exact", at: "2026-03-29T01:30:00+01:00", localDateTime: "2026-03-29T01:30:00", timeZone: "Europe/Berlin" },
  { kind: "exact", at: "2026-03-29T03:30:00+02:00", localDateTime: "2026-03-29T03:30:00", timeZone: "Europe/Berlin" },
  { kind: "exact", at: "2026-10-25T02:30:00+02:00", localDateTime: "2026-10-25T02:30:00", timeZone: "Europe/Berlin" },
  { kind: "exact", at: "2026-10-25T02:30:00+01:00", localDateTime: "2026-10-25T02:30:00", timeZone: "Europe/Berlin" },
  { kind: "exact", at: "2026-10-30T00:00:00+09:00", localDateTime: "2026-10-30T00:00:00", timeZone: "Asia/Tokyo" },
  { kind: "exact", at: "2026-03-29T01:30:00.123Z", localDateTime: "2026-03-29T03:30:00.123", timeZone: "Europe/Berlin" },
] satisfies CalendarTimeV1[]) {
  test(`explicit instant and source civil clock agree: ${time.at}`, () => {
    assert.deepEqual(plain(readCalendarEventV1(calendarFixtureV1({ eventTime: time })).eventTime), time);
  });
}

test("DST fold instants stay distinct; missing offsets, gaps and inconsistent civil clocks reject", () => {
  const at = (instant: string, localDateTime = "2026-10-25T02:30:00") => calendarFixtureV1({
    eventTime: { kind: "exact", at: instant, localDateTime, timeZone: "Europe/Berlin" },
  });
  const summer = readCalendarEventV1(at("2026-10-25T02:30:00+02:00"));
  const winter = readCalendarEventV1(at("2026-10-25T02:30:00+01:00"));
  assert.notDeepEqual(summer.eventTime, winter.eventTime);
  reject(at("2026-10-25T02:30:00"));
  reject(at("2026-03-29T02:30:00+01:00", "2026-03-29T02:30:00"));
  reject(at("2026-03-29T03:30:00+01:00", "2026-03-29T03:30:00"));
  reject(at("2026-10-25T02:30:00.100+02:00", "2026-10-25T02:30:00.101"));
});

test("date-only, bounded windows and unknown announcements never acquire invented exact times", () => {
  const times: CalendarTimeV1[] = [
    { kind: "date-only", date: "2026-10-30", timeZone: "Asia/Tokyo" },
    { kind: "date-only", date: "2026-10-30", timeZone: null },
    { kind: "window", startsAt: "2026-03-29T01:30:00+01:00", endsAt: "2026-03-29T03:30:00+02:00", timeZone: "Europe/Berlin" },
    { kind: "unknown", expectedDate: null, timeZone: null, reason: "not-announced" },
    calendarFixtureV1().eventTime,
  ];
  for (const time of times) {
    const result = readCalendarEventV1(calendarFixtureV1({ eventTime: time }));
    assert.deepEqual(plain(result.eventTime), time);
    assert.equal("at" in result.eventTime, false);
    assert.deepEqual(plain(result.publication), { status: "unavailable", reason: "not-published" });
  }
  reject(calendarFixtureV1({ eventTime: { kind: "window", startsAt: "2026-10-16T08:00:00Z",
    endsAt: "2026-10-16T08:00:00Z", timeZone: "UTC" } }));
  reject(calendarFixtureV1({ eventTime: { kind: "date-only", date: "2026-02-30", timeZone: "UTC" } }));
});

test("distinct clocks order completion, availability, and durable acknowledgement without equating publication", () => {
  const input = calendarFixtureV1();
  const event = readCalendarEventV1(input);
  assert.notDeepEqual(event.timing.acquisition, event.timing.evidenceAvailability);
  reject({ ...input, timing: { ...input.timing, evidenceAvailability: { status: "recorded", availableAt: "2026-10-16T07:59:59Z" } } });
  reject({ ...input, timing: { ...input.timing, persistence: { status: "acknowledged", acknowledgedAt: "2026-10-16T08:00:00.099Z", recordId: "fixture" } } });
  for (const timing of [
    { acquisition: { status: "unavailable", reason: "acquisition-time-unavailable" },
      evidenceAvailability: { status: "unavailable", reason: "availability-time-unavailable" }, persistence: { status: "not-persisted" } },
    { ...input.timing, evidenceAvailability: { status: "unavailable", reason: "availability-time-unavailable" }, persistence: { status: "not-persisted" } },
    { ...input.timing, persistence: { status: "unavailable", reason: "acknowledgement-unavailable" } },
  ] as const) {
    readCalendarEventV1({ ...input, timing });
    assert.equal(select([{ ...input, timing }]).status, "unavailable");
  }
  reject({ ...input, timing: { ...input.timing, acquisition: { status: "unavailable", reason: "acquisition-time-unavailable" } } });
});

test("publication timing is independently sourced; uncertainty remains uncertainty", () => {
  const event = calendarFixtureV1({ state: "published", referencePeriod: "2026-09", effectiveDate: "2026-10-17" });
  for (const time of [
    { kind: "exact", at: "2026-10-16T16:59:00+09:00", localDateTime: "2026-10-16T16:59:00", timeZone: "Asia/Tokyo" },
    { kind: "date-only", date: "2026-10-16", timeZone: null },
    { kind: "window", startsAt: "2026-10-16T07:00:00Z", endsAt: "2026-10-16T07:59:00Z", timeZone: "UTC" },
  ] satisfies Exclude<CalendarTimeV1, { kind: "unknown" }>[]) {
    const result = readCalendarEventV1({ ...event, publication: { status: "recorded", time, provenance: event.provenance } });
    assert.equal(result.publication.status, "recorded");
  }
  const unverified = readCalendarEventV1({ ...event, publication: { status: "unavailable", reason: "publication-time-unverified" } });
  assert.equal(unverified.publication.status, "unavailable");
  reject(event); // Published and explicitly not-published contradict each other.
  reject({ ...event, publication: { status: "recorded", time: { kind: "exact", at: "2026-10-16T09:00:00Z",
    localDateTime: "2026-10-16T09:00:00", timeZone: "UTC" }, provenance: event.provenance } });
  reject({ ...event, publication: { status: "recorded", time: event.eventTime, provenance: event.provenance } });
});

test("primary publisher bindings reject substitutes, credentials, queries, spoofed hosts and extra fields", () => {
  const event = calendarFixtureV1();
  for (const sourceUrl of ["http://www.boj.or.jp/", "https://www.boj.or.jp.attacker.test/", "https://www.boj.or.jp@attacker.test/",
    "https://user:password@www.boj.or.jp/", "https://www.boj.or.jp/?key=fixture", "https://www.boj.or.jp/#fragment", "https://www.boj.or.jp:8443/"]) {
    reject({ ...event, provenance: { ...event.provenance, sourceUrl } });
  }
  reject({ ...event, provenance: { ...event.provenance, publisher: "marketstack" } });
  reject({ ...event, provenance: { ...event.provenance, token: "synthetic-private-token" } });
  reject({ ...event, provenance: { ...event.provenance, publisher: "ecb" } });
});

test("native \u20acSTR benchmark relevance is limited to the existing rate product", () => {
  const event = calendarFixtureV1({ eventId: "fixture:estr:publication", family: "benchmark-publication",
    referencePeriod: "2026-10-15", eventTime: { kind: "date-only", date: "2026-10-16", timeZone: "Europe/Berlin" },
    provenance: { authority: "primary-publisher", publisher: "ecb", sourceUrl: "https://www.ecb.europa.eu/",
      sourceVersionId: "synthetic-estr", parserVersion: "offline-fixture-v1" },
    relevance: [{ productId: "estr", relationship: "benchmark-publication" }] });
  assert.equal(readCalendarEventV1(event).referencePeriod, "2026-10-15");
  reject({ ...event, relevance: [{ productId: "eurusd", relationship: "benchmark-publication" }] });
  reject({ ...event, relevance: [{ productId: "estr", relationship: "macro-context" }] });
  reject({ ...event, rateDirection: "bullish", probability: 80 });
  reject({ ...event, relevance: [{ productId: "gold", relationship: "macro-context" }] });
  reject({ ...event, relevance: [event.relevance[0], event.relevance[0]] });
});

test("historical cutoff uses acknowledgement, inclusive at the millisecond, with no backdating", () => {
  const first = calendarFixtureV1();
  for (const cutoff of ["2026-10-16T07:59:59Z", "2026-10-16T08:00:00Z", "2026-10-16T08:00:00.100Z", "2026-10-16T08:00:00.199Z"]) {
    const result = select([first], cutoff);
    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") assert.equal(result.reason, "not-known-as-of");
  }
  assert.equal(selectedId([first], FIXTURE_ACK_V1), first.versionId);
  assert.equal(selectedId([first], "2026-10-16T10:00:00.200+02:00"), first.versionId);
  const result = select([first]);
  assert.equal(result.sourceAuthentication, "not-performed");
  assert.equal(result.historicalOwnership, "not-certified");
  assert.equal(result.scope, "provided-history-only");
  assert.equal(select([first], "2026-10-16T09:00:00Z", FIXTURE_ACK_V1).status, "unavailable");
});

test("revisions, cancellation and reinstatement preserve identity and earlier selections", () => {
  const versions = revisionFixturesV1();
  const cutoffs = [FIXTURE_ACK_V1, "2026-10-16T08:01:00.200Z", "2026-10-16T08:02:00.200Z",
    "2026-10-16T08:03:00.200Z", "2026-11-02T01:00:00.200Z"];
  cutoffs.forEach((cutoff, index) => assert.equal(selectedId([...versions].reverse(), cutoff), versions[index].versionId));
  assert.equal(selectedId([versions[0]], FIXTURE_ACK_V1), selectedId(versions, FIXTURE_ACK_V1));
  const cancelled = select(versions, cutoffs[2]);
  if (cancelled.status !== "selected") assert.fail();
  assert.equal(cancelled.event.state, "cancelled");
  assert.equal(new Set(versions.map(event => event.eventId)).size, 1);
});

test("incomplete, conflicting and unacknowledged chains cannot fall back to an older event", () => {
  const [first, second, third, fourth] = revisionFixturesV1();
  for (const versions of [
    [second], [first, third], [first, first], [first, { ...second, eventId: "another-event" }],
    [first, { ...second, timing: first.timing }],
    [first, { ...second, revision: { ...second.revision, supersedesVersionId: "wrong-version" } }],
    [first, { ...second, timing: { ...second.timing, persistence: { status: "not-persisted" } } }],
    [first, second, third, { ...fourth, revision: { ...fourth.revision, change: "schedule-revision" } }],
  ]) assert.equal(select(versions, "2026-11-03T00:00:00Z").status, "unavailable");
  const noHistory = select([]);
  if (noHistory.status !== "unavailable") assert.fail();
  assert.equal(noHistory.reason, "no-captured-history");
});

test("unsupported objects reject without invoking getters, proxy traps or serializers", () => {
  let calls = 0;
  const event = calendarFixtureV1();
  const getter = Object.defineProperty({ ...event }, "eventTime", { enumerable: true, get() { calls++; throw Error(); } });
  const proxy = new Proxy(event, { ownKeys() { calls++; throw Error(); }, getPrototypeOf() { calls++; throw Error(); }, get() { calls++; throw Error(); } });
  const revoked = Proxy.revocable(event, {}); revoked.revoke();
  const cycle: Record<string, unknown> = { ...event }; cycle.cycle = cycle;
  const sparse = { ...event, relevance: new Array(1) };
  const hidden = Object.defineProperty({ ...event }, "hidden", { value: "fixture", enumerable: false });
  const symbol = { ...event, [Symbol("extra")]: "fixture" };
  for (const input of [null, [], new Date(0), getter, proxy, revoked.proxy, cycle, sparse, hidden, symbol,
    { ...event, toJSON() { calls++; return {}; } }, { ...event, title: undefined },
    { ...event, title: "x".repeat(2_049) }, { ...event, freshnessPolicy: { maximumAgeMilliseconds: Infinity } },
    { ...event, timing: { ...event.timing, acquisition: { status: "recorded", completedAt: "2026-10-16T08:00:00-00:00" } } },
  ]) reject(input);
  assert.equal(calls, 0);
});

test("no network or ambient wall clock is needed for contract validation and replay", () => {
  const versions = revisionFixturesV1();
  const expected = select(versions);
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  try {
    Date.now = () => { throw new Error("Ambient clock forbidden"); };
    globalThis.fetch = () => { throw new Error("Network forbidden"); };
    assert.deepEqual(select(versions), expected);
    assert.deepEqual(readCalendarEventV1(versions[0]), readCalendarEventV1(versions[0]));
  } finally { Date.now = originalNow; globalThis.fetch = originalFetch; }
});

test("overflowing freshness, invalid revision and unknown discriminants fail closed", () => {
  const event = calendarFixtureV1();
  for (const input of [
    { ...event, freshnessPolicy: { maximumAgeMilliseconds: Number.MAX_SAFE_INTEGER } },
    { ...event, freshnessPolicy: { maximumAgeMilliseconds: 0 } },
    { ...event, revision: { sequence: 0, supersedesVersionId: null, change: "initial" } },
    { ...event, revision: { sequence: 1, supersedesVersionId: "unknown", change: "initial" } },
    { ...event, revision: { sequence: 2, supersedesVersionId: event.versionId, change: "schedule-revision" } },
    { ...event, eventTime: { kind: "approximate", date: "2026-10-30" } },
    { ...event, eventTime: { kind: "date-only", date: "2026-10-30", timeZone: "Europe/Unsupported" } },
  ]) reject(input);
  assert.equal(select(Array.from({ length: 129 }, () => calendarFixtureV1())).status, "unavailable");
  assert.equal(select([calendarFixtureV1({ timing: fixtureTimingV1("2026-10-17T00:00:00Z") })]).status, "unavailable");
});

// Preserve compile-time discriminant checks alongside runtime malformed inputs.
const unknownSchedule: CalendarTimeV1 = calendarFixtureV1().eventTime;
const typedEvent: CalendarEventV1 = calendarFixtureV1({ eventTime: unknownSchedule });
void typedEvent;


