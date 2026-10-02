import assert from "node:assert/strict";
import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  buildEcbMonetaryPolicyEventSnapshotV1,
} from "../../events/ecbMonetaryPolicyMemory";
import { selectEcbMonetaryPolicyPriorStateAsKnownAtV1 } from "../../events/ecbMonetaryPolicyPriorState";
import {
  buildEcbPolicyDecisionDeltaV1,
  reconstructAvailableEcbPolicyDecisionDeltaV1,
  type EcbPolicyDecisionDeltaResultV1,
} from "../../events/ecbPolicyDecisionDelta";
import {
  buildEcbPolicyDecisionAssessmentV1,
  type EcbPolicyDecisionAssessmentResultV1,
} from "../../events/ecbPolicyDecisionAssessment";

// Synthetic captured official-source-shaped fixtures; no claims about real decisions.
type Levels = readonly [number, number, number];
type AvailableDelta = Extract<EcbPolicyDecisionDeltaResultV1, { status: "available" }>;
const BASE: Levels = [2.5, 2.65, 2.9];
const PRIOR_CAPTURE = Date.parse("2026-07-23T12:16:00Z") / 1_000;
const CURRENT_CAPTURE = Date.parse("2026-09-10T12:16:00Z") / 1_000;
const EVALUATED_AT = "2026-09-10T12:30:00.000Z";
const KEYS = ["depositFacility", "mainRefinancingOperations", "marginalLendingFacility"] as const;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function event(levels: Levels, date: string, fetchedAt: number,
  options: { anchor?: string; scheduleFetchedAt?: number } = {}): EcbMonetaryPolicyEventFactV1 {
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.anchor ?? date,
    schedule: { meetingDate: date, fetchedAt: options.scheduleFetchedAt ?? fetchedAt - 1 },
    decision: {
      decisionDate: date,
      documentUrl: `https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp${date.replace(/-/g, "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt, firstObservedAt: fetchedAt,
      actualReleasedAt: null,
      rates: { depositFacility: levels[0], mainRefinancingOperations: levels[1],
        marginalLendingFacility: levels[2], effectiveDate: "2026-09-23" },
    },
  });
}

function deltaFor(previous: Levels, current: Levels, options: {
  targetCapture?: number; priorScheduleCapture?: number; evaluatedAt?: string; anchor?: string;
} = {}): AvailableDelta {
  const captured = event(current, "2026-09-10", CURRENT_CAPTURE, { anchor: options.anchor });
  const target = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: captured.canonicalMeetingDate,
    schedule: { ...captured.schedule, fetchedAt: options.targetCapture ?? CURRENT_CAPTURE - 1 },
  });
  const priorEvent = event(previous, "2026-07-23", PRIOR_CAPTURE, {
    scheduleFetchedAt: options.priorScheduleCapture,
  });
  const evaluatedAt = options.evaluatedAt ?? EVALUATED_AT;
  const prior = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
    memories: [advanceEcbMonetaryPolicyEventMemoryV1(null, priorEvent).memory], target,
    knowledgeCutoff: Math.max(CURRENT_CAPTURE - 1, options.priorScheduleCapture ?? 0), evaluatedAt,
  });
  const delta = buildEcbPolicyDecisionDeltaV1({ current: captured, prior, evaluatedAt });
  if (delta.status !== "available") throw new Error(JSON.stringify(delta));
  return delta;
}

function available(delta: EcbPolicyDecisionDeltaResultV1) {
  const result = buildEcbPolicyDecisionAssessmentV1({ delta });
  if (result.status !== "available") throw new Error(JSON.stringify(result));
  return result;
}

function unavailable(result: EcbPolicyDecisionAssessmentResultV1, deltaReason: string) {
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") throw new Error("Expected unavailable assessment.");
  assert.equal(result.reason, "DELTA_UNAVAILABLE");
  assert.equal(result.deltaReason, deltaReason);
  for (const field of ["rates", "decisionShape", "commonMove", "commonMoveBp", "knownAt"]) {
    assert.equal(field in result, false);
  }
}

const cases: readonly [Levels, Levels, AvailableDelta["aggregate"], number | null][] = [
  [BASE, [2.75, 2.9, 3.15], "ALL_INCREASED", 25],
  [BASE, [2.25, 2.4, 2.65], "ALL_DECREASED", -25],
  [[-0, 0, -0.25], [0, -0, -0.25], "ALL_UNCHANGED", 0],
  [BASE, [2.75, 2.9, 3], "ALL_INCREASED", null], // +25 / +25 / +10
  [BASE, [2.75, 2.65, 2.65], "MIXED", null], // +25 / 0 / -25
  [[0.01, 0.1, 0.29], [0.02, 0.11, 0.3], "ALL_INCREASED", 1],
  [BASE, [2.25, 2.4, 2.8], "ALL_DECREASED", null],
];
for (const [previous, current, shape, commonBp] of cases) {
  const delta = deltaFor(previous, current);
  const result = available(delta);
  assert.equal(result.schemaVersion, "ecb-policy-decision-assessment-v1");
  assert.equal(result.semantic, "derived-feature");
  assert.equal(result.feature, "ecb-policy-decision-mechanical-assessment");
  assert.equal(result.coverage, "provided-history-only");
  assert.equal(result.decisionShape, shape);
  assert.equal(result.decisionShape, delta.aggregate);
  assert.equal(result.commonMove, commonBp === null ? "NO_COMMON_MOVE" : "COMMON_MOVE");
  assert.equal(result.commonMoveBp, commonBp);
  assert.equal(result.commonMovePercentagePoints, commonBp === null ? null : commonBp / 100);
  assert.deepEqual(result.rates, delta.rates);
  assert.deepEqual(result.delta, delta);
  assert.equal(result.knownAt, delta.knownAt);
  assert.equal(result.evaluatedAt, delta.evaluatedAt);
  assert.deepEqual(available(delta), result, "assessment is deterministic");
  assert.equal(Object.is(result.commonMoveBp, -0), false);
  assert.equal(Object.is(result.commonMovePercentagePoints, -0), false);
  for (const key of KEYS) {
    for (const value of Object.values(result.rates[key])) assert.equal(Object.is(value, -0), false);
  }
}

const genuine = deltaFor(BASE, [2.75, 2.9, 3.15]);
assert.deepEqual(reconstructAvailableEcbPolicyDecisionDeltaV1(genuine), genuine);
assert.deepEqual(genuine.currentSnapshot.event.decision!.rates, genuine.current.announcement.value.rates);

// Focused contradictions start from genuine output and must never become AVAILABLE.
const mutations: readonly ((delta: AvailableDelta) => void)[] = [
  (delta) => Reflect.set(delta, "aggregate", "ALL_DECREASED"),
  (delta) => Reflect.set(delta.rates.depositFacility, "deltaBasisPoints", 26),
  (delta) => Reflect.set(delta.rates.depositFacility, "deltaPercentagePoints", 0.26),
  (delta) => Reflect.set(delta.rates.depositFacility, "direction", "DECREASE"),
  (delta) => Reflect.set(delta.current, "canonicalEventId", delta.prior.canonicalEventId),
  (delta) => Reflect.set(delta.prior, "canonicalEventId", delta.current.canonicalEventId),
  (delta) => Reflect.set(delta.prior.targetSnapshot.event.schedule, "meetingDate", "2026-09-17"),
  (delta) => Reflect.set(delta, "knownAt", delta.knownAt - 1),
  (delta) => Reflect.set(delta, "knownAt", delta.knownAt + 1),
  (delta) => Reflect.set(delta.currentSnapshot, "knownAt", delta.currentSnapshot.knownAt - 1),
  (delta) => Reflect.set(delta.currentSnapshot.event, "sourceVersionId", "0".repeat(64)),
  (delta) => Reflect.set(delta.current.announcement.provenance, "sourceUrl", "https://example.com/decision.html"),
  (delta) => Reflect.set(delta.prior, "extraCallerData", { mutable: true }),
  (delta) => Reflect.deleteProperty(delta, "currentSnapshot"),
  (delta) => Reflect.deleteProperty(delta.prior, "selectedSnapshot"),
  (delta) => Reflect.deleteProperty(delta.prior, "targetSnapshot"),
];
for (const mutate of mutations) {
  const altered = clone(genuine);
  mutate(altered);
  assert.throws(() => available(altered), TypeError);
}
const zeroDelta = clone(deltaFor(BASE, BASE));
Reflect.set(zeroDelta.rates.depositFacility, "deltaBasisPoints", -0);
assert.throws(() => available(zeroDelta), TypeError);
const fabricated = { ...genuine, rates: { depositFacility: { deltaBasisPoints: 25 } } };
assert.throws(() => available(fabricated as AvailableDelta), TypeError);

// F1/F2 remain enforced when reconstructing caller-supplied delta evidence.
const futureTarget = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-17", fetchedAt: Date.parse("2026-09-16T12:00:00Z") / 1_000 },
});
assert.throws(() => available({ ...genuine, prior: { ...genuine.prior,
  targetSnapshot: buildEcbMonetaryPolicyEventSnapshotV1(futureTarget),
} }), TypeError);
const julyCurrent = event(BASE, "2026-07-23", PRIOR_CAPTURE);
const aprilEvent = event([3, 3.15, 3.4], "2026-04-30", Date.parse("2026-04-30T12:16:00Z") / 1_000);
const julyPrior = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [advanceEcbMonetaryPolicyEventMemoryV1(null, aprilEvent).memory], target: julyCurrent,
  knowledgeCutoff: PRIOR_CAPTURE - 1, evaluatedAt: "2026-07-23T12:30:00Z",
});
if (julyPrior.status !== "available") throw new Error("Expected genuine July selection.");
assert.throws(() => available({ ...genuine, prior: julyPrior }), TypeError);
assert.equal(available(deltaFor(BASE, BASE, { anchor: "2026-09-03" })).decisionShape, "ALL_UNCHANGED",
  "rescheduled identity anchors remain compatible");

// Knowledge includes target and prior schedule capture, independently of effective dates.
const assessedSecond = Date.parse(EVALUATED_AT) / 1_000;
assert.equal(available(deltaFor(BASE, BASE, { targetCapture: assessedSecond })).knownAt, assessedSecond);
assert.equal(available(deltaFor(BASE, BASE, { priorScheduleCapture: CURRENT_CAPTURE + 60 })).knownAt,
  CURRENT_CAPTURE + 60);
const exactTime = new Date(CURRENT_CAPTURE * 1_000).toISOString();
assert.equal(available(deltaFor(BASE, BASE, { evaluatedAt: exactTime })).knownAt, CURRENT_CAPTURE);
assert.throws(() => available({ ...genuine,
  evaluatedAt: new Date(CURRENT_CAPTURE * 1_000 - 1).toISOString(),
}), TypeError, "sub-second evaluation before required evidence fails closed");
assert.throws(() => available({ ...genuine, evaluatedAt: "2026-09-10T12:30:00" }), TypeError);

// An unavailable delta yields no partial assessment, including unsupported numbers.
const currentEvent = event(BASE, "2026-09-10", CURRENT_CAPTURE);
const emptyPrior = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [], target: currentEvent, knowledgeCutoff: CURRENT_CAPTURE - 1, evaluatedAt: EVALUATED_AT,
});
const missingDelta = buildEcbPolicyDecisionDeltaV1({ current: currentEvent, prior: emptyPrior,
  evaluatedAt: EVALUATED_AT,
});
unavailable(buildEcbPolicyDecisionAssessmentV1({ delta: missingDelta }), "PRIOR_STATE_UNAVAILABLE");
for (const [unsupported, reason] of [[0.001, "UNSUPPORTED_RATE_PRECISION"],
  [1e15, "UNSUPPORTED_RATE_RANGE"]] as const) {
  const invalidCurrent = event([unsupported, 2.65, 2.9], "2026-09-10", CURRENT_CAPTURE);
  const delta = buildEcbPolicyDecisionDeltaV1({ current: invalidCurrent, prior: genuine.prior,
    evaluatedAt: EVALUATED_AT,
  });
  unavailable(buildEcbPolicyDecisionAssessmentV1({ delta }), reason);
}
const invalidUnavailable = clone(missingDelta);
Reflect.set(invalidUnavailable, "reason", "invented-reason");
assert.throws(() => buildEcbPolicyDecisionAssessmentV1({ delta: invalidUnavailable }), TypeError);

// Deep immutability without changing or freezing any caller-owned evidence.
function assertDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeepFrozen(nested);
}
const mutable = clone(genuine);
const before = clone(mutable);
const immutable = available(mutable);
assert.deepEqual(mutable, before);
for (const object of [mutable, mutable.rates, mutable.currentSnapshot.event.schedule,
  mutable.prior.selectedSnapshot.event.decision!.rates, mutable.prior.targetSnapshot.event.schedule,
  mutable.prior.announcement.provenance]) assert.equal(Object.isFrozen(object), false);
assertDeepFrozen(immutable);
assert.notEqual(immutable.delta, mutable);
assert.notEqual(immutable.delta.prior.targetSnapshot.event.schedule, mutable.prior.targetSnapshot.event.schedule);
Reflect.set(mutable.rates.depositFacility, "deltaBasisPoints", 99);
Reflect.set(mutable.currentSnapshot.event.decision!.rates!, "depositFacility", 99);
assert.equal(immutable.commonMoveBp, 25);
assert.equal(immutable.delta.currentSnapshot.event.decision!.rates!.depositFacility, 2.75);
assert.equal(Reflect.set(immutable.rates.depositFacility, "deltaBasisPoints", 99), false);

// Accessor/Proxy programming defects escape unchanged; no domain conversion.
for (const defect of [new ReferenceError("internal defect"), new TypeError("internal defect")]) {
  const accessor = clone(genuine);
  Object.defineProperty(accessor.rates.depositFacility, "deltaBasisPoints", { get() { throw defect; } });
  assert.throws(() => available(accessor), (error) => error === defect);
  const evidenceAccessor = clone(genuine);
  Object.defineProperty(evidenceAccessor.currentSnapshot.event.decision!, "rates", { get() { throw defect; } });
  assert.throws(() => available(evidenceAccessor), (error) => error === defect);
  const proxy = new Proxy(genuine, {
    get(target, key, receiver) {
      if (key === "prior") throw defect;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => available(proxy), (error) => error === defect);
}

console.log("PASS: ECB mechanical decision assessment, exact common moves, reconstructed evidence and defect propagation");
