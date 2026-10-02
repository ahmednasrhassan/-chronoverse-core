import assert from "node:assert/strict";
import { normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  buildEcbMonetaryPolicyEventSnapshotV1,
  selectEcbMonetaryPolicyEventAsKnownAtV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "../../events/ecbMonetaryPolicyMemory";
import {
  buildEcbPolicyDecisionEventClockV1,
  type EcbPolicyDecisionEventClockResultV1,
} from "../../events/ecbPolicyDecisionEventClock";
import { deriveEventClockV1, type EventPhaseV1 } from "../../events/eventClock";

// Synthetic canonical official-source-shaped evidence; no claims about real decisions.
const SCHEDULED = "2026-09-10T12:15:00.000Z";
const RELEASED = "2026-09-10T12:16:00.000Z";
const SCHEDULE_CAPTURE = "2026-09-08T10:00:00.000Z";
const unix = (instant: string) => Date.parse(instant) / 1_000;
const iso = (milliseconds: number) => new Date(milliseconds).toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function snapshot(options: {
  meetingDate?: string; localTime?: string; scheduleCapture?: string;
  decisionCapture?: string; firstObserved?: string; released?: string | null;
} = {}): EcbMonetaryPolicyEventSnapshotV1 {
  const date = options.meetingDate ?? "2026-09-10";
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: "2026-09-10",
    schedule: { meetingDate: date, scheduledLocalTime: options.localTime,
      fetchedAt: unix(options.scheduleCapture ?? SCHEDULE_CAPTURE) },
    decision: options.decisionCapture === undefined ? null : {
      decisionDate: date,
      documentUrl: `https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp${date.replace(/-/g, "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt: unix(options.decisionCapture),
      firstObservedAt: unix(options.firstObserved ?? options.decisionCapture),
      actualReleasedAt: options.released ?? null,
      rates: { depositFacility: 2, mainRefinancingOperations: 2.15,
        marginalLendingFacility: 2.4, effectiveDate: "2026-09-16" },
    },
  }));
}

function evaluate(selected: EcbMonetaryPolicyEventSnapshotV1 | null, evaluatedAt: string) {
  return buildEcbPolicyDecisionEventClockV1({ snapshot: selected, evaluatedAt });
}
function available(selected: EcbMonetaryPolicyEventSnapshotV1, evaluatedAt: string) {
  const result = evaluate(selected, evaluatedAt);
  if (result.status !== "available") throw new Error(JSON.stringify(result));
  assert.deepEqual({ evaluatedAt: result.evaluatedAt, phase: result.phase,
    schedule: result.milestones.schedule, release: result.milestones.release },
  deriveEventClockV1({ scheduledAt: selected.event.schedule.scheduledAt,
    actualReleasedAt: selected.event.decision?.actualReleasedAt ?? null, evaluatedAt }),
  "ECB wrapper preserves the generic clock exactly");
  return result;
}
function unavailable(result: EcbPolicyDecisionEventClockResultV1, reason: string) {
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") throw new Error("Expected unavailable clock.");
  assert.equal(result.reason, reason);
  assert.deepEqual(Object.keys(result).sort(),
    ["schemaVersion", "semantic", "feature", "evaluatedAt", "status", "reason"].sort());
  assert.equal(Object.isFrozen(result), true);
}

const scheduled = snapshot();
const scheduleMs = Date.parse(SCHEDULED);
const preBoundaries: readonly [number, EventPhaseV1, EventPhaseV1][] = [
  [scheduleMs - 24 * 3_600_000, "pre-event", "t-24h"],
  [scheduleMs - 3_600_000, "t-24h", "t-1h"],
  [scheduleMs - 15 * 60_000, "t-1h", "t-15m"],
  [scheduleMs, "t-15m", "release-time-unverified"],
];
for (const [boundary, before, at] of preBoundaries) {
  assert.equal(available(scheduled, iso(boundary - 1)).phase, before);
  assert.equal(available(scheduled, iso(boundary)).phase, at);
  assert.equal(available(scheduled, iso(boundary + 1)).phase, at);
}
for (const evaluatedAt of [SCHEDULED, "2026-09-10T13:15:00Z", "2026-09-20T12:15:00Z"]) {
  const result = available(scheduled, evaluatedAt);
  assert.equal(result.phase, "release-time-unverified");
  assert.equal(result.scheduledAt, SCHEDULED);
  assert.equal(result.actualReleasedAt, null);
  assert.equal(result.milestones.release, null, "scheduled time never starts release windows");
}
const observed = snapshot({ decisionCapture: "2026-09-10T12:20:00Z",
  firstObserved: "2026-09-10T12:17:00Z" });
const observedResult = available(observed, "2026-09-16T12:20:00Z");
assert.equal(observedResult.phase, "release-time-unverified");
assert.equal(observedResult.actualReleasedAt, null);
assert.equal(observedResult.milestones.release, null,
  "fetch, first observation, meeting and effective dates cannot substitute for release");

// The canonical contract permits verified publication, including early/delayed release.
const verified = snapshot({ decisionCapture: RELEASED, released: RELEASED });
const releaseMs = Date.parse(RELEASED);
const releaseBoundaries: readonly [number, EventPhaseV1, EventPhaseV1][] = [
  [releaseMs + 5 * 60_000, "release", "post-5m"],
  [releaseMs + 15 * 60_000, "post-5m", "post-15m"],
  [releaseMs + 30 * 60_000, "post-15m", "post-30m"],
  [releaseMs + 3_600_000, "post-30m", "post-1h"],
];
unavailable(evaluate(verified, iso(releaseMs - 1)), "KNOWLEDGE_INCONSISTENT");
assert.equal(available(scheduled, iso(releaseMs - 1)).phase, "release-time-unverified");
assert.equal(available(verified, RELEASED).phase, "release");
assert.equal(available(verified, iso(releaseMs + 1)).phase, "release");
for (const [boundary, before, at] of releaseBoundaries) {
  assert.equal(available(verified, iso(boundary - 1)).phase, before);
  assert.equal(available(verified, iso(boundary)).phase, at);
  assert.equal(available(verified, iso(boundary + 1)).phase, at);
}
assert.equal(available(verified, "2026-09-20T12:15:00Z").phase, "post-1h");
assert.deepEqual(available(verified, RELEASED).milestones, {
  schedule: { t24hAt: "2026-09-09T12:15:00.000Z", t1hAt: "2026-09-10T11:15:00.000Z",
    t15mAt: "2026-09-10T12:00:00.000Z", scheduledAt: SCHEDULED },
  release: { releaseAt: RELEASED, post5mAt: "2026-09-10T12:21:00.000Z",
    post15mAt: "2026-09-10T12:31:00.000Z", post30mAt: "2026-09-10T12:46:00.000Z",
    post1hAt: "2026-09-10T13:16:00.000Z" },
});
for (const released of ["2026-09-10T12:10:00Z", SCHEDULED, "2026-09-10T12:45:00Z"]) {
  const captured = snapshot({ decisionCapture: released, released });
  assert.equal(available(captured, released).phase, "release");
  assert.equal(available(captured, iso(Date.parse(released) + 5 * 60_000)).phase, "post-5m");
}
const fractional = snapshot({ decisionCapture: "2026-09-10T12:16:01Z",
  released: "2026-09-10T12:16:00.500Z" });
for (const [offset, phase] of [[-1, "release"], [0, "post-5m"], [1, "post-5m"]] as const) {
  assert.equal(available(fractional, iso(releaseMs + 500 + 5 * 60_000 + offset)).phase, phase);
}

// Whole-state capture, rather than publication or first observation, gates knowledge.
const historical = "2026-09-10T12:18:00Z";
const historicalClock = available(scheduled, historical);
const later = snapshot({ decisionCapture: "2026-09-10T12:20:00Z",
  firstObserved: "2026-09-10T12:17:00Z", released: RELEASED });
unavailable(evaluate(later, historical), "KNOWLEDGE_INCONSISTENT");
unavailable(evaluate(later, "2026-09-10T12:19:59.999Z"), "KNOWLEDGE_INCONSISTENT");
assert.equal(available(later, "2026-09-10T12:20:00Z").phase, "release");
assert.equal(available(later, "2026-09-10T12:21:00Z").phase, "post-5m");
assert.deepEqual(available(scheduled, historical), historicalClock);
let memory = advanceEcbMonetaryPolicyEventMemoryV1(null, scheduled.event).memory;
memory = advanceEcbMonetaryPolicyEventMemoryV1(memory, later.event).memory;
const selectedHistorical = selectEcbMonetaryPolicyEventAsKnownAtV1(memory, unix(historical));
assert.deepEqual(evaluate(selectedHistorical, historical), historicalClock);
const selectedLater = selectEcbMonetaryPolicyEventAsKnownAtV1(memory, unix("2026-09-10T12:21:00Z"));
assert.deepEqual(evaluate(selectedLater, "2026-09-10T12:21:00Z"),
  available(later, "2026-09-10T12:21:00Z"));

// Stable identity across both meeting-date and local-clock revisions.
const revision = snapshot({ meetingDate: "2026-09-17", scheduleCapture: "2026-09-10T12:00:00Z" });
assert.equal(revision.canonicalEventId, scheduled.canonicalEventId);
assert.notEqual(revision.eventSourceVersionId, scheduled.eventSourceVersionId);
assert.equal(available(revision, SCHEDULED).phase, "pre-event");
assert.equal(available(revision, SCHEDULED).scheduledAt, "2026-09-17T12:15:00.000Z");
const timeRevision = snapshot({ localTime: "15:15", scheduleCapture: "2026-09-10T12:00:00Z" });
assert.equal(available(timeRevision, SCHEDULED).phase, "t-1h");
const futureRevision = snapshot({ meetingDate: "2026-09-17", scheduleCapture: "2026-09-10T12:30:00Z" });
unavailable(evaluate(futureRevision, historical), "KNOWLEDGE_INCONSISTENT");
assert.deepEqual(available(scheduled, historical), historicalClock);
unavailable(evaluate(revision, "2026-09-10T11:59:59.999Z"), "KNOWLEDGE_INCONSISTENT");
assert.equal(available(revision, "2026-09-10T12:00:00Z").phase, "pre-event");
const revisedMemory = advanceEcbMonetaryPolicyEventMemoryV1(
  advanceEcbMonetaryPolicyEventMemoryV1(null, scheduled.event).memory, futureRevision.event,
).memory;
assert.deepEqual(evaluate(selectEcbMonetaryPolicyEventAsKnownAtV1(revisedMemory, unix(historical)),
  historical), historicalClock);
unavailable(evaluate(scheduled, iso(unix(SCHEDULE_CAPTURE) * 1_000 - 1)), "KNOWLEDGE_INCONSISTENT");
assert.equal(available(scheduled, SCHEDULE_CAPTURE).knownAt, unix(SCHEDULE_CAPTURE));
const scheduleCapturedLater = snapshot({ scheduleCapture: "2026-09-10T12:20:00Z",
  decisionCapture: RELEASED, released: RELEASED });
unavailable(evaluate(scheduleCapturedLater, historical), "KNOWLEDGE_INCONSISTENT");
assert.equal(available(scheduleCapturedLater, "2026-09-10T12:20:00Z").knownAt,
  unix("2026-09-10T12:20:00Z"));
unavailable(evaluate(null, historical), "EVENT_DATA_INCOMPLETE");

// Reject malformed metadata, provenance, chronology and undeclared caller fields.
const mutations: readonly ((value: EcbMonetaryPolicyEventSnapshotV1) => void)[] = [
  (value) => Reflect.set(value, "schemaVersion", "invented"),
  (value) => Reflect.set(value, "canonicalEventId", "another-event"),
  (value) => Reflect.set(value.event, "canonicalEventId", "another-event"),
  (value) => Reflect.set(value, "eventSourceVersionId", "0".repeat(64)),
  (value) => Reflect.set(value.event, "sourceVersionId", "0".repeat(64)),
  (value) => Reflect.set(value, "knownAt", value.knownAt - 1),
  (value) => Reflect.set(value, "knownAt", value.knownAt + 1),
  (value) => Reflect.set(value.event.schedule, "scheduledAt", "2026-09-10T12:16:00Z"),
  (value) => Reflect.set(value.event.schedule, "sourceUrl", "https://example.com/calendar"),
  (value) => Reflect.set(value.event.schedule, "fetchedAt", -1),
  (value) => Reflect.set(value.event.schedule, "sourceVersionId", "0".repeat(64)),
  (value) => Reflect.set(value.event, "eventFamily", "another-family"),
  (value) => Reflect.set(value.event.decision!, "sourceInstitution", "another-institution"),
  (value) => Reflect.set(value.event.decision!, "documentUrl", "https://example.com/decision"),
  (value) => Reflect.set(value.event.decision!, "firstObservedAt", value.knownAt + 1),
  (value) => Reflect.set(value.event.decision!, "actualReleasedAt", "2026-09-10T12:16:00.001Z"),
  (value) => Reflect.set(value.event.decision!, "actualReleasedAt", "2026-02-30T12:16:00Z"),
  (value) => Reflect.set(value.event.decision!, "decisionDate", "2026-09-17"),
  (value) => Reflect.set(value.event.decision!.rates!, "depositFacility", NaN),
  (value) => Reflect.set(value, "extraCallerData", { mutable: true }),
  (value) => Reflect.set(value.event.schedule, "extraCallerData", { mutable: true }),
  (value) => Reflect.deleteProperty(value.event, "schedule"),
];
for (const mutate of mutations) {
  const altered = clone(verified);
  mutate(altered);
  assert.throws(() => evaluate(altered, "2026-09-20T12:15:00Z"), TypeError);
}
for (const evaluatedAt of ["invalid", "2026-02-30T12:16:00Z", "2026-09-10T12:16:00", ""]) {
  assert.throws(() => evaluate(scheduled, evaluatedAt), TypeError);
  assert.throws(() => evaluate(null, evaluatedAt), TypeError);
}
assert.throws(() => evaluate(undefined as unknown as EcbMonetaryPolicyEventSnapshotV1, historical), TypeError);
assert.throws(() => evaluate(verified.event as unknown as EcbMonetaryPolicyEventSnapshotV1, historical), TypeError);

// Determinism includes timezone normalization and no hidden current-clock dependency.
const assessed = available(verified, "2026-09-10T12:31:00Z");
assert.equal(assessed.schemaVersion, "ecb-policy-decision-event-clock-v1");
assert.equal(assessed.semantic, "derived-feature");
assert.equal(assessed.feature, "ecb-policy-decision-event-clock");
assert.equal(assessed.phase, "post-15m", "elapsed time is not market confirmation");
assert.equal(assessed.canonicalEventId, verified.canonicalEventId);
assert.equal(assessed.eventSourceVersionId, verified.eventSourceVersionId);
assert.deepEqual(available(verified, "2026-09-10T14:31:00+02:00"), assessed);
const originalNow = Date.now;
try {
  Date.now = () => { throw new Error("Hidden current-clock dependency"); };
  assert.deepEqual(available(verified, "2026-09-10T12:31:00Z"), assessed);
} finally { Date.now = originalNow; }
assert.deepEqual(Object.keys(assessed).sort(), ["schemaVersion", "semantic", "feature", "evaluatedAt",
  "status", "canonicalEventId", "eventSourceVersionId", "knownAt", "scheduledAt", "actualReleasedAt",
  "phase", "milestones"].sort(), "only timing fields, no signals, reaction or lifecycle assessment");

function assertDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeepFrozen(nested);
}
function assertDeepMutable(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  assert.equal(Object.isFrozen(value), false);
  for (const nested of Object.values(value)) assertDeepMutable(nested);
}
const mutable = clone(verified);
const before = clone(mutable);
const immutable = available(mutable, "2026-09-10T12:31:00Z");
assert.deepEqual(mutable, before);
assertDeepMutable(mutable);
assertDeepFrozen(immutable);
Reflect.set(mutable.event.schedule, "scheduledAt", "2026-09-17T12:15:00Z");
Reflect.set(mutable.event.decision!, "actualReleasedAt", null);
assert.equal(immutable.scheduledAt, SCHEDULED);
assert.equal(immutable.actualReleasedAt, RELEASED);
assert.equal(Reflect.set(immutable.milestones.schedule, "scheduledAt", "invented"), false);
assert.equal(Reflect.set(immutable.milestones.release!, "releaseAt", "invented"), false);

// Accessor/Proxy defects must escape unchanged, including during canonical validation.
for (const defect of [new ReferenceError("internal defect"), new TypeError("unrelated internal defect")]) {
  const accessor = clone(verified);
  Object.defineProperty(accessor.event.schedule, "fetchedAt", { get() { throw defect; } });
  assert.throws(() => evaluate(accessor, RELEASED), (error) => error === defect);
  const metadataAccessor = clone(verified);
  Object.defineProperty(metadataAccessor, "knownAt", { get() { throw defect; } });
  assert.throws(() => evaluate(metadataAccessor, RELEASED), (error) => error === defect);
  const proxy = new Proxy(verified, {
    get(target, key, receiver) {
      if (key === "event") throw defect;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => evaluate(proxy, RELEASED), (error) => error === defect);
}

console.log("PASS: ECB event clock, exact time boundaries, knowledge safety, rescheduling and defect propagation");
