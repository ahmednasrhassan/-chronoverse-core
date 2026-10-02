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
import {
  buildEcbPolicyDecisionEvidenceStateV1,
  reconstructEcbPolicyDecisionEvidenceStateV1,
  type EcbPolicyDecisionEvidenceStateV1,
} from "../../events/ecbPolicyDecisionEvidenceState";
import {
  buildEcbPolicyDecisionLifecycleReadinessV1,
  type BuildEcbPolicyDecisionLifecycleReadinessInputV1,
  type EcbPolicyDecisionLifecycleReadinessV1,
} from "../../events/ecbPolicyDecisionLifecycleReadiness";

// Synthetic official fixtures only: no real decision or market reaction claims.
type Levels = readonly [number, number, number];
type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
const clone = <T>(value: T): Mutable<T> => JSON.parse(JSON.stringify(value));
const unix = (value: string) => Math.floor(Date.parse(value) / 1_000);
const BASE: Levels = [2.5, 2.65, 2.9];
const LOWER: Levels = [2.25, 2.4, 2.65];
const CAPTURE = "2026-09-10T12:16:00Z";
const SCHEDULE_CAPTURE = "2026-09-08T10:00:00Z";
const EVALUATED = "2026-09-10T12:31:00.000Z";

function event(date: string, rates: Levels | null, options: {
  capture?: string; scheduleCapture?: string; released?: string | null;
  scheduleOnly?: boolean; anchor?: string;
} = {}): EcbMonetaryPolicyEventFactV1 {
  const capture = options.capture ?? `${date}T12:16:00Z`;
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.anchor ?? date,
    schedule: { meetingDate: date,
      fetchedAt: unix(options.scheduleCapture ?? `${date}T10:00:00Z`) },
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
  let result: EcbMonetaryPolicyEventMemoryV1 | null = null;
  for (const fact of events) {
    const advanced = advanceEcbMonetaryPolicyEventMemoryV1(result, fact);
    assert.ok(["initialized", "advanced", "unchanged"].includes(advanced.status));
    result = advanced.memory;
  }
  if (result === null) throw new Error("Expected synthetic event history.");
  return result;
}
const history = [memory(event("2026-07-23", BASE))];
const current = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", LOWER,
  { scheduleCapture: SCHEDULE_CAPTURE }));
const schedule = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", null,
  { scheduleOnly: true, scheduleCapture: SCHEDULE_CAPTURE }));
const released = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", LOWER,
  { scheduleCapture: SCHEDULE_CAPTURE, released: CAPTURE }));

function state(snapshot: EcbMonetaryPolicyEventSnapshotV1 | null = current,
  evaluatedAt = EVALUATED, memories: readonly EcbMonetaryPolicyEventMemoryV1[] = history,
  knowledgeCutoff = unix(evaluatedAt) - 1): EcbPolicyDecisionEvidenceStateV1 {
  return buildEcbPolicyDecisionEvidenceStateV1({ current: snapshot, memories,
    knowledgeCutoff, evaluatedAt });
}
function present(value: EcbPolicyDecisionEvidenceStateV1) {
  if (value.canonicalEventId === null) throw new Error("Expected current context.");
  return value;
}
function ready(evidenceState: EcbPolicyDecisionEvidenceStateV1 = state()): EcbPolicyDecisionLifecycleReadinessV1 {
  return buildEcbPolicyDecisionLifecycleReadinessV1({ evidenceState });
}
function rejects<T extends EcbPolicyDecisionEvidenceStateV1>(value: T, edit: (draft: Mutable<T>) => void) {
  const draft = clone(value);
  edit(draft);
  assert.throws(() => ready(draft as unknown as EcbPolicyDecisionEvidenceStateV1),
    (error) => error instanceof TypeError || error instanceof RangeError);
}
function marketBlocked(value: EcbPolicyDecisionLifecycleReadinessV1) {
  assert.deepEqual(value.marketReadiness, {
    observation: { status: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" },
    confirmation: { status: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" },
  });
  assert.deepEqual(value.lifecycleReadiness.advancedTransitions, {
    status: "blocked", reason: "LIFECYCLE_ASSESSMENT_UNAVAILABLE",
    states: ["CONFIRMING", "CONFIRMED", "CONTRADICTED", "INVALIDATED", "REENTRY_WATCH"],
  });
}

// Absent/future current evidence is legitimate domain unavailability, not tampering.
const absent = ready(state(null));
assert.equal(absent.canonicalEventId, null);
assert.equal(absent.evidenceKnownAt, null);
assert.deepEqual(Object.values(absent.officialEvidence), Array(8).fill(false));
assert.deepEqual(absent.temporalReadiness, { phase: null, releaseRelativeWindowsReached: [] });
assert.deepEqual(absent.lifecycleReadiness.structuralEvaluation,
  { status: "blocked", reason: "EVENT_DATA_INCOMPLETE" });
marketBlocked(absent);
const tooEarly = ready(state(released, "2026-09-10T12:15:59.999Z"));
assert.deepEqual(tooEarly.lifecycleReadiness.structuralEvaluation,
  { status: "blocked", reason: "KNOWLEDGE_INCONSISTENT" });
assert.equal(tooEarly.temporalReadiness.phase, null);
marketBlocked(tooEarly);

// Shared clock semantics, including schedule boundaries; no price/trade readiness.
const scheduleBoundaries = [
  ["2026-09-09T12:14:59.999Z", "pre-event"],
  ["2026-09-09T12:15:00.000Z", "t-24h"],
  ["2026-09-09T12:15:00.001Z", "t-24h"],
  ["2026-09-10T11:14:59.999Z", "t-24h"],
  ["2026-09-10T11:15:00.000Z", "t-1h"],
  ["2026-09-10T11:15:00.001Z", "t-1h"],
  ["2026-09-10T11:59:59.999Z", "t-1h"],
  ["2026-09-10T12:00:00.000Z", "t-15m"],
  ["2026-09-10T12:00:00.001Z", "t-15m"],
  ["2026-09-10T12:14:59.999Z", "t-15m"],
  ["2026-09-10T12:15:00.000Z", "release-time-unverified"],
  ["2026-09-10T12:15:00.001Z", "release-time-unverified"],
] as const;
for (const [evaluatedAt, phase] of scheduleBoundaries) {
  const result = ready(state(schedule, evaluatedAt));
  assert.equal(result.temporalReadiness.phase, phase);
  assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, []);
  assert.deepEqual(result.lifecycleReadiness.structuralEvaluation, { status: "eligible" });
  assert.deepEqual(result.officialEvidence, { eventContext: true, schedule: true,
    decisionDocument: false, verifiedRelease: false, currentPolicyFacts: false,
    priorPolicyState: true, decisionDelta: false, mechanicalAssessment: false });
  marketBlocked(result);
}
// Structural eligibility is not a state: the engine still owns WAIT/WATCH and
// INITIAL_REACTION after a known document, even with unverified publication time.
const incomplete = present(state(buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", null,
  { scheduleCapture: SCHEDULE_CAPTURE }))));
const documentOnly = ready(incomplete);
assert.equal(documentOnly.officialEvidence.decisionDocument, true);
assert.equal(documentOnly.officialEvidence.currentPolicyFacts, false);
assert.deepEqual(documentOnly.lifecycleReadiness.structuralEvaluation, { status: "eligible" });
marketBlocked(documentOnly);

const noPriorState = present(state(current, EVALUATED, []));
const noPrior = ready(noPriorState);
assert.deepEqual(noPrior.officialEvidence, { eventContext: true, schedule: true,
  decisionDocument: true, verifiedRelease: false, currentPolicyFacts: true,
  priorPolicyState: false, decisionDelta: false, mechanicalAssessment: false });
assert.deepEqual(noPrior.evidenceState, noPriorState);
const completeState = present(state());
const complete = ready(completeState);
assert.equal(complete.schemaVersion, "ecb-policy-decision-lifecycle-readiness-v1");
assert.equal(complete.semantic, "derived-feature");
assert.equal(complete.feature, "ecb-policy-decision-lifecycle-readiness");
assert.equal(complete.evaluatedAt, completeState.evaluatedAt);
assert.equal(complete.canonicalEventId, completeState.canonicalEventId);
assert.deepEqual(complete.evidenceState, completeState);
assert.equal(complete.evidenceState.current.semantic, "source-fact");
assert.deepEqual(complete.officialEvidence, { eventContext: true, schedule: true,
  decisionDocument: true, verifiedRelease: false, currentPolicyFacts: true,
  priorPolicyState: true, decisionDelta: true, mechanicalAssessment: true });
assert.equal(complete.evidenceKnownAt, unix(CAPTURE));
assert.deepEqual(complete.temporalReadiness.releaseRelativeWindowsReached, []);
marketBlocked(complete);

// Verified release at R and +1ms; R-1ms cannot expose this verified snapshot:
// snapshot knownAt >= releaseAt by the canonical memory contract (tested above).
const windows = ["release", "post-5m", "post-15m", "post-30m", "post-1h"];
const releaseBoundaries = [
  ["2026-09-10T12:16:00.000Z", 0], ["2026-09-10T12:16:00.001Z", 0],
  ["2026-09-10T12:20:59.999Z", 0], ["2026-09-10T12:21:00.000Z", 1],
  ["2026-09-10T12:21:00.001Z", 1], ["2026-09-10T12:30:59.999Z", 1],
  ["2026-09-10T12:31:00.000Z", 2], ["2026-09-10T12:31:00.001Z", 2],
  ["2026-09-10T12:45:59.999Z", 2], ["2026-09-10T12:46:00.000Z", 3],
  ["2026-09-10T12:46:00.001Z", 3], ["2026-09-10T13:15:59.999Z", 3],
  ["2026-09-10T13:16:00.000Z", 4], ["2026-09-10T13:16:00.001Z", 4],
] as const;
for (const [evaluatedAt, index] of releaseBoundaries) {
  const result = ready(state(released, evaluatedAt));
  assert.equal(result.temporalReadiness.phase, windows[index]);
  assert.equal(result.officialEvidence.verifiedRelease, true);
  assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, windows.slice(0, index + 1));
  marketBlocked(result);
}
for (const evaluatedAt of [EVALUATED, "2026-09-10T13:16:00Z", "2026-09-11T13:16:00Z"]) {
  for (const snapshot of [schedule, current]) {
    const result = ready(state(snapshot, evaluatedAt));
    assert.equal(result.temporalReadiness.phase, "release-time-unverified");
    assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, []);
    marketBlocked(result);
  }
}

// Mechanical policy directions never become FX direction, confirmation or contradiction.
for (const [levels, shape] of [
  [[2.75, 2.9, 3.15], "ALL_INCREASED"],
  [LOWER, "ALL_DECREASED"],
  [[2.75, 2.4, 2.9], "MIXED"],
] as const) {
  const evidence = present(state(buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", levels,
    { scheduleCapture: SCHEDULE_CAPTURE, released: CAPTURE })), "2026-09-10T13:16:00Z"));
  assert.equal(evidence.assessment.status, "available");
  if (evidence.assessment.status !== "available") throw new Error("Expected mechanical assessment.");
  assert.equal(evidence.assessment.decisionShape, shape);
  assert.equal(evidence.assessment.commonMove, shape === "MIXED" ? "NO_COMMON_MOVE" : "COMMON_MOVE");
  const result = ready(evidence);
  marketBlocked(result);
  for (const key of ["fxDirection", "interpretation", "signal", "recommendation", "state", "transition"]) {
    assert.equal(Object.hasOwn(result, key), false);
    assert.equal(Object.hasOwn(result.lifecycleReadiness, key), false);
  }
}

// Future schedule, decision capture and verified-release captures cannot be injected
// into an otherwise earlier available state. Legitimate composition suppresses them.
const futureSnapshots = [
  buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", null,
    { scheduleOnly: true, scheduleCapture: "2026-09-10T12:32:00Z" })),
  buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", LOWER,
    { capture: "2026-09-10T12:32:00Z", scheduleCapture: SCHEDULE_CAPTURE })),
  buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", LOWER,
    { capture: "2026-09-10T12:32:00Z", released: CAPTURE, scheduleCapture: SCHEDULE_CAPTURE })),
];
for (const snapshot of futureSnapshots) {
  rejects(completeState, (draft) => { draft.current.snapshot = clone(snapshot); });
  assert.equal(ready(state(snapshot)).lifecycleReadiness.structuralEvaluation.status, "blocked");
}
// Release cannot physically be verified after snapshot knownAt, even by +1ms.
assert.throws(() => buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10", LOWER,
  { scheduleCapture: SCHEDULE_CAPTURE, released: "2026-09-10T12:16:00.001Z" })), TypeError);

// Corrections/verifications enter memory at capture, never retroactively.
const corrected = event("2026-09-10", BASE, { capture: "2026-09-10T12:32:00Z",
  scheduleCapture: SCHEDULE_CAPTURE, released: CAPTURE });
const correctedMemory = memory(current.event, corrected);
const beforeCorrection = selectEcbMonetaryPolicyEventAsKnownAtV1(correctedMemory, unix(EVALUATED));
assert.deepEqual(ready(state(beforeCorrection)), complete);
const afterCorrection = ready(state(selectEcbMonetaryPolicyEventAsKnownAtV1(correctedMemory,
  unix("2026-09-10T12:32:00Z")), "2026-09-10T12:32:00Z"));
assert.equal(afterCorrection.officialEvidence.verifiedRelease, true);
assert.equal(complete.officialEvidence.verifiedRelease, false);
marketBlocked(afterCorrection);

// F1: target schedule capture cannot follow evaluatedAt. F2: prior target binding
// cannot be reused across events, including when incomplete current rates stop delta early.
const other = present(state(buildEcbMonetaryPolicyEventSnapshotV1(event("2026-07-23", BASE)),
  "2026-07-23T12:31:00Z", [memory(event("2026-04-30", BASE))]));
const futurePrior = buildEcbMonetaryPolicyEventSnapshotV1(event("2026-07-23", LOWER,
  { capture: "2026-09-10T12:32:00Z" }));
assert.deepEqual(ready(state(current, EVALUATED,
  [memory(history[0]!.snapshots[0]!.event, futurePrior.event)])), complete);
for (const evidence of [completeState, incomplete]) {
  rejects(evidence, (draft) => {
    assert.equal(draft.prior.status, "available");
    if (draft.prior.status !== "available") throw new Error("Expected prior.");
    draft.prior.targetSnapshot = clone(futureSnapshots[0]!);
  });
  rejects(evidence, (draft) => { draft.prior = clone(other.prior); });
  rejects(evidence, (draft) => {
    if (draft.prior.status !== "available") throw new Error("Expected prior.");
    draft.prior.selectedSnapshot = clone(futurePrior);
  });
  rejects(evidence, (draft) => {
    assert.equal(draft.prior.status, "available");
    if (draft.prior.status !== "available") throw new Error("Expected prior.");
    draft.prior.knowledgeCutoff = unix("2026-09-10T12:32:00Z");
  });
}
assert.throws(() => ready({ ...completeState, prior: { ...completeState.prior,
  knowledgeCutoff: unix("2026-09-10T12:32:00Z") } }), RangeError);

// Every retained layer is reconstructed and the entire state compared.
rejects(completeState, (draft) => { draft.canonicalEventId = "ecb:forged"; });
rejects(completeState, (draft) => { draft.evaluatedAt = "2026-09-10T12:32:00.000Z"; });
rejects(completeState, (draft) => { draft.evidenceKnownAt += 1; });
rejects(completeState, (draft) => { draft.current.snapshot.knownAt -= 1; });
rejects(completeState, (draft) => { draft.current.snapshot.event.schedule.scheduledAt = CAPTURE; });
rejects(completeState, (draft) => {
  const rates = draft.current.snapshot.event.decision?.rates;
  if (!rates) throw new Error("Expected current rates.");
  rates.depositFacility += 0.25;
});
rejects(completeState, (draft) => { draft.clock.phase = "post-1h"; });
rejects(completeState, (draft) => { draft.clock.milestones.schedule.scheduledAt = CAPTURE; });
rejects(completeState, (draft) => {
  if (draft.prior.status !== "available") throw new Error("Expected prior.");
  draft.prior.knownAt += 1;
});
rejects(completeState, (draft) => {
  if (draft.prior.status !== "available") throw new Error("Expected prior.");
  draft.prior.announcement.provenance.sourceVersionId = "forged";
});
rejects(completeState, (draft) => {
  if (draft.delta.status !== "available") throw new Error("Expected delta.");
  draft.delta.aggregate = "ALL_INCREASED";
});
rejects(completeState, (draft) => {
  if (draft.delta.status !== "available") throw new Error("Expected delta.");
  draft.delta.rates.depositFacility.deltaBasisPoints += 1;
});
rejects(completeState, (draft) => {
  if (draft.assessment.status !== "available") throw new Error("Expected assessment.");
  draft.assessment.decisionShape = "MIXED";
});
rejects(completeState, (draft) => {
  if (draft.assessment.status !== "available" || draft.assessment.commonMove !== "COMMON_MOVE") {
    throw new Error("Expected common move.");
  }
  draft.assessment.commonMoveBp += 1;
});
rejects(completeState, (draft) => { draft.assessment = clone(noPriorState.assessment); });
rejects(noPriorState, (draft) => { draft.delta = clone(completeState.delta); });
rejects(noPriorState, (draft) => { draft.assessment = clone(completeState.assessment); });
assert.throws(() => ready({ ...completeState, canonicalEventId: null } as unknown as EcbPolicyDecisionEvidenceStateV1), TypeError);
assert.throws(() => ready({ ...state(null), delta: completeState.delta } as EcbPolicyDecisionEvidenceStateV1), TypeError);
assert.throws(() => ready({ ...completeState, confirmed: true } as EcbPolicyDecisionEvidenceStateV1), TypeError);

// Unavailable prior reasons are preserved without recovering discarded candidates.
// A later incomplete prior blocks stale fallback; malformed/ambiguous histories remain blocked.
const incompletePrior = memory(event("2026-07-23", null));
const ambiguousPrior = memory(event("2026-07-23", LOWER, { anchor: "2026-07-22" }));
const unavailableHistories = [
  [[], "INSUFFICIENT_HISTORY"],
  [[memory(event("2026-04-30", BASE)), incompletePrior], "EVENT_DATA_INCOMPLETE"],
  [[{} as EcbMonetaryPolicyEventMemoryV1], "INVALID_HISTORY"],
  [[...history, ambiguousPrior], "AMBIGUOUS_PRIOR_STATE"],
] as const;
for (const [memories, reason] of unavailableHistories) {
  const evidence = present(state(current, EVALUATED, memories));
  assert.equal(evidence.prior.status, "unavailable");
  if (evidence.prior.status !== "unavailable") throw new Error("Expected unavailable prior.");
  assert.equal(evidence.prior.reason, reason);
  const result = ready(evidence);
  assert.deepEqual(result.evidenceState, evidence);
  assert.equal(result.officialEvidence.priorPolicyState, false);
  assert.equal(result.officialEvidence.decisionDelta, false);
  rejects(evidence, (draft) => {
    if (draft.prior.status !== "unavailable") throw new Error("Expected unavailable prior.");
    draft.prior.evaluatedAt = "2026-09-10T12:32:00.000Z";
  });
  // Swapping a closed reason without its matching dependency reason is contradictory.
  rejects(evidence, (draft) => {
    if (draft.prior.status !== "unavailable") throw new Error("Expected unavailable prior.");
    draft.prior.reason = reason === "INVALID_HISTORY" ? "INSUFFICIENT_HISTORY" : "INVALID_HISTORY";
  });
  marketBlocked(result);
}
rejects(noPriorState, (draft) => { Object.defineProperty(draft.prior, "reason", { value: "UNKNOWN" }); });
rejects(noPriorState, (draft) => { draft.prior.coverage = "global-history" as "provided-history-only"; });
rejects(completeState, (draft) => { draft.schemaVersion = "unknown" as typeof draft.schemaVersion; });
const unsupportedPrecision = ready(state(buildEcbMonetaryPolicyEventSnapshotV1(event("2026-09-10",
  [2.251, 2.4, 2.65], { scheduleCapture: SCHEDULE_CAPTURE }))));
assert.equal(unsupportedPrecision.officialEvidence.currentPolicyFacts, true);
assert.equal(unsupportedPrecision.officialEvidence.decisionDelta, false);
assert.equal(unsupportedPrecision.officialEvidence.mechanicalAssessment, false);
marketBlocked(unsupportedPrecision);

// Contract is closed, including non-enumerable input injection and duplicate clock/evaluation inputs.
for (const key of ["evaluatedAt", "clock", "prior", "delta", "assessment", "marketEvidence", "confirmed", "price"]) {
  const injected = { evidenceState: completeState, [key]: true };
  assert.throws(() => buildEcbPolicyDecisionLifecycleReadinessV1(injected), TypeError);
}
const hiddenInput = { evidenceState: completeState };
Object.defineProperty(hiddenInput, "price", { value: 1 });
assert.throws(() => buildEcbPolicyDecisionLifecycleReadinessV1(hiddenInput), TypeError);
for (const malformed of [null, undefined, [], {}, { evidenceState: null }]) {
  assert.throws(() => buildEcbPolicyDecisionLifecycleReadinessV1(
    malformed as unknown as BuildEcbPolicyDecisionLifecycleReadinessInputV1), TypeError);
}

function deepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  assert.ok(Object.isFrozen(value));
  for (const key of Reflect.ownKeys(value)) deepFrozen(Reflect.get(value, key));
}
function deepUnfrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  assert.equal(Object.isFrozen(value), false);
  for (const key of Reflect.ownKeys(value)) deepUnfrozen(Reflect.get(value, key));
}
function noCallerAliases(value: unknown, caller: unknown): void {
  if (typeof value !== "object" || value === null || typeof caller !== "object" || caller === null) return;
  assert.notEqual(value, caller);
  for (const key of Reflect.ownKeys(value)) noCallerAliases(Reflect.get(value, key), Reflect.get(caller, key));
}
const mutableCaller = clone(completeState);
const before = clone(mutableCaller);
const immutableResult = ready(mutableCaller);
assert.deepEqual(mutableCaller, before);
deepUnfrozen(mutableCaller);
deepFrozen(immutableResult);
noCallerAliases(immutableResult.evidenceState, mutableCaller);
deepFrozen(ready(state(null)));
deepFrozen(ready(noPriorState));
assert.equal(Reflect.set(immutableResult.officialEvidence, "currentPolicyFacts", false), false);
mutableCaller.current.snapshot.knownAt += 1;
assert.equal(immutableResult.evidenceKnownAt, complete.evidenceKnownAt);
assert.deepEqual(ready(completeState), ready(completeState));
assert.deepEqual(reconstructEcbPolicyDecisionEvidenceStateV1(completeState), completeState);
const savedNow = Date.now;
try {
  Date.now = () => { throw new ReferenceError("Wall clock disabled."); };
  assert.deepEqual(ready(completeState), complete);
  assert.deepEqual(ready(state(released, EVALUATED)), ready(state(released, EVALUATED)));
} finally {
  Date.now = savedNow;
}

// Defects escape by identity; no catch or exception-message classification.
for (const defect of [new ReferenceError("fixture defect"), new TypeError("unrelated defect")]) {
  const input = Object.defineProperty({}, "evidenceState", { enumerable: true,
    get() { throw defect; } }) as BuildEcbPolicyDecisionLifecycleReadinessInputV1;
  assert.throws(() => buildEcbPolicyDecisionLifecycleReadinessV1(input), (error) => error === defect);
  const nested = clone(completeState);
  Object.defineProperty(nested.current.snapshot.event.schedule, "fetchedAt", {
    enumerable: true, get() { throw defect; },
  });
  assert.throws(() => ready(nested), (error) => error === defect);
  const priorDefect = clone(completeState);
  if (priorDefect.prior.status !== "available") throw new Error("Expected prior.");
  Object.defineProperty(priorDefect.prior.selectedSnapshot.event.schedule, "fetchedAt", {
    enumerable: true, get() { throw defect; },
  });
  assert.throws(() => ready(priorDefect), (error) => error === defect);
  const proxy = new Proxy({ evidenceState: completeState }, { ownKeys() { throw defect; } });
  assert.throws(() => buildEcbPolicyDecisionLifecycleReadinessV1(proxy), (error) => error === defect);
  const proxiedState = new Proxy(completeState, { get() { throw defect; } });
  assert.throws(() => ready(proxiedState), (error) => error === defect);
}

console.log("ecbPolicyDecisionLifecycleReadiness tests passed");
