import assert from "node:assert/strict";
import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  buildEcbMonetaryPolicyEventSnapshotV1,
  selectEcbMonetaryPolicyEventAsKnownAtV1,
  type EcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "../../events/ecbMonetaryPolicyMemory";
import { selectEcbMonetaryPolicyPriorStateAsKnownAtV1 } from "../../events/ecbMonetaryPolicyPriorState";
import { buildEcbPolicyDecisionDeltaV1 } from "../../events/ecbPolicyDecisionDelta";
import { buildEcbPolicyDecisionAssessmentV1 } from "../../events/ecbPolicyDecisionAssessment";
import { buildEcbPolicyDecisionEventClockV1 } from "../../events/ecbPolicyDecisionEventClock";
import {
  buildEcbPolicyDecisionEvidenceStateV1,
  type BuildEcbPolicyDecisionEvidenceStateInputV1,
  type EcbPolicyDecisionEvidenceStateV1,
} from "../../events/ecbPolicyDecisionEvidenceState";

// Synthetic canonical fixtures only; no claims about real ECB decisions or reactions.
type Levels = readonly [number, number, number];
const BASE: Levels = [2.5, 2.65, 2.9];
const LOWER: Levels = [2.25, 2.4, 2.65];
const EVALUATED = "2026-09-10T12:31:00.000Z";
const SCHEDULE_CAPTURE = "2026-09-08T10:00:00Z";
const CURRENT_CAPTURE = "2026-09-10T12:16:00Z";
const PRIOR_CAPTURE = "2026-07-23T12:16:00Z";
const unix = (instant: string) => Math.floor(Date.parse(instant) / 1_000);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function event(date: string, rates: Levels | null, options: {
  capture?: string; scheduleCapture?: string; anchor?: string; released?: string | null;
  scheduleOnly?: boolean;
} = {}): EcbMonetaryPolicyEventFactV1 {
  const capture = options.capture ?? `${date}T12:16:00Z`;
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.anchor ?? date,
    schedule: { meetingDate: date, fetchedAt: unix(options.scheduleCapture ?? `${date}T10:00:00Z`) },
    decision: options.scheduleOnly ? null : {
      decisionDate: date,
      documentUrl: `https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp${date.replace(/-/g, "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt: unix(capture), firstObservedAt: unix(capture),
      actualReleasedAt: options.released ?? null,
      rates: rates === null ? null : { depositFacility: rates[0], mainRefinancingOperations: rates[1],
        marginalLendingFacility: rates[2], effectiveDate: "2026-09-23" },
    },
  });
}
function memory(...events: EcbMonetaryPolicyEventFactV1[]): EcbMonetaryPolicyEventMemoryV1 {
  let state: EcbMonetaryPolicyEventMemoryV1 | null = null;
  for (const captured of events) {
    const result = advanceEcbMonetaryPolicyEventMemoryV1(state, captured);
    assert.ok(["initialized", "advanced", "unchanged"].includes(result.status));
    state = result.memory;
  }
  if (state === null) throw new Error("Expected synthetic history.");
  return state;
}
const priorEvent = event("2026-07-23", BASE);
const history = [memory(priorEvent)];
const currentEvent = event("2026-09-10", LOWER, { scheduleCapture: SCHEDULE_CAPTURE });
const current = buildEcbMonetaryPolicyEventSnapshotV1(currentEvent);
const schedule = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", null,
  { scheduleOnly: true, scheduleCapture: SCHEDULE_CAPTURE }));

function input(selected: EcbMonetaryPolicyEventSnapshotV1 | null = current,
  options: Partial<Omit<BuildEcbPolicyDecisionEvidenceStateInputV1, "current">> = {}):
BuildEcbPolicyDecisionEvidenceStateInputV1 {
  const evaluatedAt = options.evaluatedAt ?? EVALUATED;
  return { current: selected, memories: options.memories ?? history,
    knowledgeCutoff: options.knowledgeCutoff ?? unix(evaluatedAt) - 1, evaluatedAt };
}
function present(result: EcbPolicyDecisionEvidenceStateV1) {
  if (result.canonicalEventId === null) throw new Error(JSON.stringify(result));
  return result;
}
function complete(result: EcbPolicyDecisionEvidenceStateV1) {
  const state = present(result);
  if (state.prior.status !== "available" || state.delta.status !== "available" ||
      state.assessment.status !== "available") throw new Error(JSON.stringify(state));
  return { state, prior: state.prior, delta: state.delta, assessment: state.assessment };
}
function blocked(selected: EcbMonetaryPolicyEventSnapshotV1 | null, evaluatedAt: string,
  reason: string): void {
  const state = buildEcbPolicyDecisionEvidenceStateV1(input(selected, { evaluatedAt }));
  assert.equal(state.canonicalEventId, null);
  assert.equal(state.evidenceKnownAt, null);
  assert.equal(state.current.status, "unavailable");
  if (state.current.status !== "unavailable") throw new Error("Expected absent current evidence.");
  assert.equal(state.current.reason, reason);
  assert.equal("snapshot" in state.current, false);
  assert.deepEqual(state.clock, buildEcbPolicyDecisionEventClockV1({ snapshot: selected, evaluatedAt }));
  for (const dependency of [state.prior, state.delta, state.assessment]) {
    assert.deepEqual(dependency, { status: "not-computed", reason: "CURRENT_EVENT_UNAVAILABLE" });
  }
}

// Schedule, document, rates and verified publication are independent evidence claims.
const scheduleOnly = present(buildEcbPolicyDecisionEvidenceStateV1(input(schedule,
  { evaluatedAt: "2026-09-09T12:15:00Z" })));
assert.equal(scheduleOnly.current.semantic, "source-fact");
assert.equal(scheduleOnly.current.snapshot.event.decision, null);
assert.equal(scheduleOnly.clock.phase, "t-24h");
assert.equal(scheduleOnly.prior.status, "available");
assert.equal(scheduleOnly.delta.status, "unavailable");
if (scheduleOnly.delta.status !== "unavailable") throw new Error("Expected absent current rate facts.");
assert.equal(scheduleOnly.delta.reason, "CURRENT_POLICY_FACTS_UNAVAILABLE");
assert.equal(scheduleOnly.assessment.status, "unavailable");
const passedSchedule = present(buildEcbPolicyDecisionEvidenceStateV1(input(schedule)));
assert.equal(passedSchedule.clock.phase, "release-time-unverified");
assert.equal(passedSchedule.clock.actualReleasedAt, null);
assert.equal(passedSchedule.clock.milestones.release, null);

const noPrior = present(buildEcbPolicyDecisionEvidenceStateV1(input(current, { memories: [] })));
assert.equal(noPrior.current.snapshot.event.availability, "available");
assert.equal(noPrior.clock.status, "available");
assert.deepEqual(noPrior.prior, { status: "unavailable", reason: "INSUFFICIENT_HISTORY",
  coverage: "provided-history-only", knowledgeCutoff: unix(EVALUATED) - 1, evaluatedAt: EVALUATED });
assert.equal(noPrior.delta.status, "unavailable");
if (noPrior.delta.status !== "unavailable" || noPrior.delta.reason !== "PRIOR_STATE_UNAVAILABLE") {
  throw new Error("Expected prior dependency failure.");
}
assert.equal(noPrior.delta.priorReason, "INSUFFICIENT_HISTORY");
assert.equal(noPrior.assessment.status, "unavailable");
if (noPrior.assessment.status !== "unavailable") throw new Error("Expected unavailable assessment.");
assert.equal(noPrior.assessment.reason, "DELTA_UNAVAILABLE");
assert.equal(noPrior.assessment.deltaReason, "PRIOR_STATE_UNAVAILABLE");

const incompleteCurrent = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", null));
const incomplete = present(buildEcbPolicyDecisionEvidenceStateV1(input(incompleteCurrent)));
assert.notEqual(incomplete.current.snapshot.event.decision, null, "decision document captured");
assert.equal(incomplete.current.snapshot.event.decision!.rates, null);
assert.equal(incomplete.prior.status, "available");
assert.equal(incomplete.delta.status, "unavailable");
if (incomplete.delta.status !== "unavailable") throw new Error("Expected incomplete rate facts.");
assert.equal(incomplete.delta.reason, "CURRENT_POLICY_FACTS_UNAVAILABLE");

const full = complete(buildEcbPolicyDecisionEvidenceStateV1(input()));
assert.equal(full.state.schemaVersion, "ecb-policy-decision-evidence-state-v1");
assert.equal(full.state.semantic, "derived-feature");
assert.equal(full.state.feature, "ecb-policy-decision-evidence-state");
assert.equal(full.state.coverage, "provided-history-only");
assert.equal(full.state.clock.phase, "release-time-unverified",
  "verified release is optional for complete supported policy arithmetic");
assert.equal(full.delta.aggregate, "ALL_DECREASED");
assert.equal(full.assessment.commonMove, "COMMON_MOVE");
assert.equal(full.assessment.commonMoveBp, -25, "mechanical move is not lifecycle confirmation");
assert.deepEqual(full.state.current.snapshot, current);
assert.deepEqual(full.prior.targetSnapshot.event.schedule, current.event.schedule);
assert.equal(full.prior.targetSnapshot.event.decision, null);
const directPrior = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: history, target: current.event, knowledgeCutoff: unix(EVALUATED) - 1, evaluatedAt: EVALUATED,
});
const directDelta = buildEcbPolicyDecisionDeltaV1({ current: current.event, prior: directPrior,
  evaluatedAt: EVALUATED });
assert.deepEqual(full.prior, directPrior);
assert.deepEqual(full.delta, directDelta);
assert.deepEqual(full.assessment, buildEcbPolicyDecisionAssessmentV1({ delta: directDelta }));
assert.deepEqual(full.state.clock, buildEcbPolicyDecisionEventClockV1({ snapshot: current,
  evaluatedAt: EVALUATED }));
assert.deepEqual(Object.keys(full.state).sort(), ["schemaVersion", "semantic", "feature", "coverage",
  "evaluatedAt", "canonicalEventId", "evidenceKnownAt", "current", "clock", "prior", "delta", "assessment"].sort());

const verified = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", LOWER,
  { released: CURRENT_CAPTURE, scheduleCapture: SCHEDULE_CAPTURE }));
const withRelease = complete(buildEcbPolicyDecisionEvidenceStateV1(input(verified)));
assert.equal(withRelease.state.clock.phase, "post-15m", "elapsed time only");
assert.equal(withRelease.state.clock.actualReleasedAt, "2026-09-10T12:16:00.000Z");
assert.equal(withRelease.state.current.snapshot.event.decision!.rates!.depositFacility, 2.25);
for (const [time, expected] of [["2026-09-10T12:30:59.999Z", "post-5m"],
  [EVALUATED, "post-15m"], ["2026-09-10T12:31:00.001Z", "post-15m"]] as const) {
  assert.equal(present(buildEcbPolicyDecisionEvidenceStateV1(input(verified,
    { evaluatedAt: time }))).clock.phase, expected);
}

// Null/future current states expose neither their facts nor derived downstream results.
blocked(null, EVALUATED, "EVENT_DATA_INCOMPLETE");
blocked(current, "2026-09-10T12:15:59.999Z", "KNOWLEDGE_INCONSISTENT");
blocked(verified, "2026-09-10T12:15:59.999Z", "KNOWLEDGE_INCONSISTENT");
assert.equal(complete(buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { evaluatedAt: CURRENT_CAPTURE }))).state.evidenceKnownAt, unix(CURRENT_CAPTURE));
const laterRelease = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", LOWER,
  { capture: "2026-09-10T12:40:00Z", released: CURRENT_CAPTURE, scheduleCapture: SCHEDULE_CAPTURE }));
blocked(laterRelease, EVALUATED, "KNOWLEDGE_INCONSISTENT");
const currentHistory = memory(schedule.event, current.event, laterRelease.event);
assert.deepEqual(buildEcbPolicyDecisionEvidenceStateV1(input(
  selectEcbMonetaryPolicyEventAsKnownAtV1(currentHistory, unix(EVALUATED)))), full.state);
assert.equal(present(buildEcbPolicyDecisionEvidenceStateV1(input(laterRelease,
  { evaluatedAt: "2026-09-10T12:40:00Z" }))).clock.phase, "post-15m");

// Future target context cannot change eligibility (F1); timely revisions remain valid.
const intervening = memory(event("2026-09-12", BASE));
const historical = "2026-09-15T12:00:00Z";
const originalTarget = present(buildEcbPolicyDecisionEvidenceStateV1(input(schedule,
  { evaluatedAt: historical, memories: [intervening] })));
assert.equal(originalTarget.prior.status, "unavailable");
const futureRevision = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-17", null,
  { anchor: "2026-09-10", scheduleOnly: true, scheduleCapture: "2026-09-16T12:00:00Z" }));
blocked(futureRevision, historical, "KNOWLEDGE_INCONSISTENT");
const revisedHistory = memory(schedule.event, futureRevision.event);
assert.deepEqual(buildEcbPolicyDecisionEvidenceStateV1(input(
  selectEcbMonetaryPolicyEventAsKnownAtV1(revisedHistory, unix(historical)),
  { evaluatedAt: historical, memories: [intervening] })), originalTarget);
const revised = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-17", LOWER,
  { anchor: "2026-09-10", scheduleCapture: "2026-09-14T12:00:00Z" }));
const revisedState = complete(buildEcbPolicyDecisionEvidenceStateV1(input(revised,
  { evaluatedAt: "2026-09-17T12:30:00Z", memories: [intervening] })));
assert.equal(revisedState.state.canonicalEventId, current.canonicalEventId);
assert.equal(revisedState.prior.decisionDate, "2026-09-12");
assert.equal(revisedState.prior.targetSnapshot.event.schedule.meetingDate, "2026-09-17");

// Historical correction selection and no stale fallback remain owned by the prior selector.
const futureCorrection = event("2026-07-23", LOWER, { capture: "2026-09-10T13:00:00Z" });
const correctedHistory = [memory(priorEvent, futureCorrection)];
assert.deepEqual(buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { memories: correctedHistory })), full.state);
assert.equal(complete(buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { memories: correctedHistory, evaluatedAt: "2026-09-10T13:01:00Z" }))).assessment.commonMoveBp, 0);
const april = memory(event("2026-04-30", BASE));
const latestIncomplete = memory(event("2026-07-23", null, { capture: "2026-09-10T12:29:00Z" }));
const noFallback = present(buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { memories: [april, latestIncomplete] })));
assert.equal(noFallback.prior.status, "unavailable");
if (noFallback.prior.status !== "unavailable") throw new Error("No stale fallback permitted.");
assert.equal(noFallback.prior.reason, "EVENT_DATA_INCOMPLETE");
assert.equal(noFallback.evidenceKnownAt, unix(CURRENT_CAPTURE),
  "unavailable later prior evidence must not inflate included evidence knowledge");
const ambiguous = present(buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { memories: [history[0], memory(event("2026-07-23", LOWER))] })));
assert.equal(ambiguous.prior.status, "unavailable");
if (ambiguous.prior.status !== "unavailable") throw new Error("Expected ambiguous history.");
assert.equal(ambiguous.prior.reason, "AMBIGUOUS_PRIOR_STATE");

// Preserve independent knowledge values; selected prior capture may postdate current capture.
const laterPrior = memory(event("2026-07-23", BASE, { capture: "2026-09-10T12:20:00Z" }));
const distinctKnowledge = complete(buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { memories: [laterPrior] })));
assert.equal(distinctKnowledge.state.current.snapshot.knownAt, unix(CURRENT_CAPTURE));
assert.equal(distinctKnowledge.state.clock.knownAt, unix(CURRENT_CAPTURE));
assert.equal(distinctKnowledge.prior.knownAt, unix("2026-09-10T12:20:00Z"));
assert.equal(distinctKnowledge.delta.knownAt, distinctKnowledge.prior.knownAt);
assert.equal(distinctKnowledge.assessment.knownAt, distinctKnowledge.prior.knownAt);
assert.equal(distinctKnowledge.state.evidenceKnownAt, distinctKnowledge.prior.knownAt);
const excludedLater = complete(buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { memories: [memory(priorEvent, futureCorrection)], knowledgeCutoff: unix(PRIOR_CAPTURE) })));
assert.equal(excludedLater.state.evidenceKnownAt, unix(CURRENT_CAPTURE));
assert.equal(excludedLater.prior.knowledgeCutoff, unix(PRIOR_CAPTURE));

for (const [level, reason] of [[0.001, "UNSUPPORTED_RATE_PRECISION"],
  [1e15, "UNSUPPORTED_RATE_RANGE"]] as const) {
  const unsupported = present(buildEcbPolicyDecisionEvidenceStateV1(input(
    buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", [level, 2.4, 2.65])))));
  assert.equal(unsupported.current.status, "available");
  assert.equal(unsupported.prior.status, "available");
  assert.equal(unsupported.delta.status, "unavailable");
  if (unsupported.delta.status !== "unavailable") throw new Error("Expected unsupported arithmetic.");
  assert.equal(unsupported.delta.reason, reason);
  assert.equal(unsupported.assessment.status, "unavailable");
}

// Current and selected prior caller evidence cannot bypass canonical reconstruction.
for (const mutate of [
  (value: EcbMonetaryPolicyEventSnapshotV1) => Reflect.set(value, "canonicalEventId", "another"),
  (value: EcbMonetaryPolicyEventSnapshotV1) => Reflect.set(value, "knownAt", 0),
  (value: EcbMonetaryPolicyEventSnapshotV1) => Reflect.set(value.event, "sourceVersionId", "0".repeat(64)),
  (value: EcbMonetaryPolicyEventSnapshotV1) => Reflect.set(value.event.schedule, "meetingDate", "2026-09-17"),
  (value: EcbMonetaryPolicyEventSnapshotV1) => Reflect.set(value.event.decision!, "actualReleasedAt", EVALUATED),
]) {
  const tampered = clone(current);
  mutate(tampered);
  assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(input(tampered)), TypeError);
}
for (const mutate of [
  (value: EcbMonetaryPolicyEventMemoryV1) => Reflect.set(value.snapshots[0], "knownAt", 0),
  (value: EcbMonetaryPolicyEventMemoryV1) => Reflect.set(value.snapshots[0].event.decision!.rates!, "depositFacility", 99),
  (value: EcbMonetaryPolicyEventMemoryV1) => Reflect.set(value.snapshots[0].event.decision!, "documentUrl", "https://example.com/decision"),
]) {
  const tampered = clone(history[0]);
  mutate(tampered);
  const state = present(buildEcbPolicyDecisionEvidenceStateV1(input(current, { memories: [tampered] })));
  assert.equal(state.prior.status, "unavailable");
  if (state.prior.status !== "unavailable") throw new Error("Expected rejected history.");
  assert.equal(state.prior.reason, "INVALID_HISTORY");
  assert.equal(state.delta.status, "unavailable");
  assert.equal(state.assessment.status, "unavailable");
}

// Derived results are output-only. Reject injected tampered results and cross-target reuse (F2).
const wrongTarget = present(buildEcbPolicyDecisionEvidenceStateV1(input(history[0].snapshots[0],
  { memories: [april], evaluatedAt: "2026-07-23T12:30:00Z" })));
assert.equal(wrongTarget.prior.status, "available");
const tamperedDelta = clone(full.delta);
Reflect.set(tamperedDelta.rates.depositFacility, "deltaBasisPoints", 999);
const tamperedAssessment = clone(full.assessment);
Reflect.set(tamperedAssessment, "commonMoveBp", 999);
const tamperedClock = clone(withRelease.state.clock);
Reflect.set(tamperedClock, "phase", "post-1h");
Reflect.set(tamperedClock, "evaluatedAt", "2026-09-10T14:00:00Z");
const tamperedTarget = clone(full.prior);
Reflect.set(tamperedTarget.targetSnapshot.event.schedule, "meetingDate", "2026-09-17");
for (const [key, value] of [["prior", wrongTarget.prior], ["prior", tamperedTarget],
  ["delta", tamperedDelta], ["assessment", tamperedAssessment], ["clock", tamperedClock]] as const) {
  assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1({ ...input(), [key]: value }), TypeError);
}
assert.deepEqual(full.prior.targetSnapshot.event.schedule, full.state.current.snapshot.event.schedule);
assert.notEqual(full.prior.targetSnapshot.canonicalEventId, wrongTarget.canonicalEventId);
for (const cutoff of [-1, 1.5, NaN, Infinity]) {
  assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(input(current, { knowledgeCutoff: cutoff })), TypeError);
}
assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { knowledgeCutoff: unix(EVALUATED) + 1 })), RangeError);
assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(input(current,
  { evaluatedAt: "2026-09-10T12:31:00" })), TypeError);

// Deterministic canonical copies; no caller freezing or mutable output aliases.
function assertFrozen(value: unknown, expected: boolean): void {
  if (typeof value !== "object" || value === null) return;
  assert.equal(Object.isFrozen(value), expected);
  for (const nested of Object.values(value)) assertFrozen(nested, expected);
}
const mutable = clone(input());
const before = clone(mutable);
const immutable = complete(buildEcbPolicyDecisionEvidenceStateV1(mutable));
assert.deepEqual(mutable, before);
assertFrozen(mutable, false);
assertFrozen(immutable.state, true);
assert.deepEqual(buildEcbPolicyDecisionEvidenceStateV1(mutable), immutable.state);
assert.deepEqual(buildEcbPolicyDecisionEvidenceStateV1({ ...mutable,
  evaluatedAt: "2026-09-10T14:31:00+02:00" }), immutable.state);
assert.notEqual(immutable.state.current.snapshot, mutable.current);
assert.notEqual(immutable.prior.selectedSnapshot, mutable.memories[0].snapshots[0]);
Reflect.set(mutable.current!.event.decision!.rates!, "depositFacility", 99);
Reflect.set(mutable.memories[0].snapshots[0].event.decision!.rates!, "depositFacility", 99);
assert.equal(immutable.state.current.snapshot.event.decision!.rates!.depositFacility, 2.25);
assert.equal(immutable.prior.selectedSnapshot.event.decision!.rates!.depositFacility, 2.5);
assert.equal(immutable.assessment.commonMoveBp, -25);
assertFrozen(buildEcbPolicyDecisionEvidenceStateV1(input(null)), true);
const originalNow = Date.now;
try {
  Date.now = () => { throw new Error("Hidden current-clock dependency"); };
  assert.deepEqual(buildEcbPolicyDecisionEvidenceStateV1(input()), full.state);
} finally { Date.now = originalNow; }

// Defects propagate exactly, including caller history materialized outside parser catches.
for (const defect of [new ReferenceError("internal defect"), new TypeError("unrelated internal defect")]) {
  const currentFault = clone(current);
  Object.defineProperty(currentFault.event.schedule, "fetchedAt", { get() { throw defect; } });
  assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(input(currentFault)), (error) => error === defect);
  const priorFault = clone(history[0]);
  Object.defineProperty(priorFault.snapshots[0].event.decision!, "rates", { get() { throw defect; } });
  assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(input(current,
    { memories: [priorFault] })), (error) => error === defect);
  const proxy = new Proxy(history[0], {
    get(target, key, receiver) {
      if (key === "snapshots") throw defect;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(input(current,
    { memories: [proxy] })), (error) => error === defect);
  const caller = new Proxy(input(), {
    get(target, key, receiver) {
      if (key === "evaluatedAt") throw defect;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => buildEcbPolicyDecisionEvidenceStateV1(caller), (error) => error === defect);
}

console.log("PASS: ECB evidence-state composition, partial evidence, as-of safety, canonical boundaries and defect propagation");
