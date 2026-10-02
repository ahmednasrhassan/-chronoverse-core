import assert from "node:assert/strict";
import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  buildEcbMonetaryPolicyEventSnapshotV1,
} from "../../events/ecbMonetaryPolicyMemory";
import {
  selectEcbMonetaryPolicyPriorStateAsKnownAtV1,
  type EcbMonetaryPolicyPriorStateResultV1,
} from "../../events/ecbMonetaryPolicyPriorState";
import {
  buildEcbPolicyDecisionDeltaV1,
  type EcbPolicyDecisionDeltaResultV1,
} from "../../events/ecbPolicyDecisionDelta";

// Synthetic captured facts; these fixtures do not assert actual ECB decisions.
type Levels = readonly [number, number, number];
const BASE: Levels = [2.5, 2.65, 2.9];
const PRIOR_CAPTURE = Date.parse("2026-07-23T12:16:00Z") / 1_000;
const CURRENT_CAPTURE = Date.parse("2026-09-10T12:16:00Z") / 1_000;
const EVALUATED_AT = "2026-09-10T12:30:00.000Z";
const KEYS = ["depositFacility", "mainRefinancingOperations", "marginalLendingFacility"] as const;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function event(levels: Levels | null, options: {
  date?: string; anchor?: string; fetchedAt?: number; scheduleFetchedAt?: number;
  effectiveDate?: string | null;
} = {}): EcbMonetaryPolicyEventFactV1 {
  const date = options.date ?? "2026-09-10";
  const fetchedAt = options.fetchedAt ?? CURRENT_CAPTURE;
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.anchor ?? date,
    schedule: { meetingDate: date, fetchedAt: options.scheduleFetchedAt ?? fetchedAt - 1 },
    decision: {
      decisionDate: date,
      documentUrl: `https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp${date.replace(/-/g, "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt, firstObservedAt: fetchedAt, actualReleasedAt: null,
      rates: levels === null ? null : {
        depositFacility: levels[0], mainRefinancingOperations: levels[1], marginalLendingFacility: levels[2],
        effectiveDate: options.effectiveDate === undefined ? "2026-09-16" : options.effectiveDate,
      },
    },
  });
}

function memory(fact: EcbMonetaryPolicyEventFactV1) {
  return advanceEcbMonetaryPolicyEventMemoryV1(null, fact).memory;
}

function selectPrior(previous: Levels | null, current = event(BASE), options: {
  fetchedAt?: number; knowledgeCutoff?: number; effectiveDate?: string | null;
} = {}) {
  return selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
    memories: [memory(event(previous, { date: "2026-07-23", fetchedAt: options.fetchedAt ?? PRIOR_CAPTURE,
      effectiveDate: options.effectiveDate === undefined ? null : options.effectiveDate }))],
    target: current, knowledgeCutoff: options.knowledgeCutoff ?? CURRENT_CAPTURE - 1,
    evaluatedAt: EVALUATED_AT,
  });
}

function available(result: EcbPolicyDecisionDeltaResultV1) {
  if (result.status !== "available") throw new Error(JSON.stringify(result));
  return result;
}

function priorAvailable(result: EcbMonetaryPolicyPriorStateResultV1) {
  if (result.status !== "available") throw new Error(JSON.stringify(result));
  return result;
}

function derive(previous: Levels, current: Levels) {
  const captured = event(current);
  return buildEcbPolicyDecisionDeltaV1({ current: captured, prior: selectPrior(previous, captured), evaluatedAt: EVALUATED_AT });
}

function expectRates(previous: Levels, current: Levels, bp: Levels,
  aggregate: Extract<EcbPolicyDecisionDeltaResultV1, { status: "available" }>["aggregate"]) {
  const result = available(derive(previous, current));
  assert.equal(result.aggregate, aggregate);
  KEYS.forEach((key, index) => {
    assert.deepEqual(result.rates[key], {
      previousRate: previous[index] === 0 ? 0 : previous[index],
      currentRate: current[index] === 0 ? 0 : current[index],
      deltaPercentagePoints: bp[index] / 100, deltaBasisPoints: bp[index],
      direction: bp[index] > 0 ? "INCREASE" : bp[index] < 0 ? "DECREASE" : "UNCHANGED",
    });
    for (const value of [result.rates[key].previousRate, result.rates[key].currentRate,
      result.rates[key].deltaPercentagePoints, result.rates[key].deltaBasisPoints]) {
      assert.equal(Object.is(value, -0), false);
    }
  });
  return result;
}

function unavailable(result: EcbPolicyDecisionDeltaResultV1, reason: string) {
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") throw new Error("Expected no partial delta.");
  assert.equal(result.reason, reason);
  assert.equal("rates" in result, false);
  assert.equal("aggregate" in result, false);
}

expectRates(BASE, BASE, [0, 0, 0], "ALL_UNCHANGED");
expectRates(BASE, [2.75, 2.9, 3.15], [25, 25, 25], "ALL_INCREASED");
expectRates(BASE, [2.25, 2.4, 2.65], [-25, -25, -25], "ALL_DECREASED");
expectRates(BASE, [2.75, 2.4, 2.9], [25, -25, 0], "MIXED");
expectRates(BASE, [2.75, 2.9, 3.4], [25, 25, 50], "ALL_INCREASED");
expectRates([-0.5, -0.25, -0.01], [-0.25, 0, 0.01], [25, 25, 2], "ALL_INCREASED");
expectRates([-0, 0, -0.25], [0, -0, -0.25], [0, 0, 0], "ALL_UNCHANGED");
expectRates([0.01, 0.1, 0.29], [0.02, 0.11, 0.3], [1, 1, 1], "ALL_INCREASED");
expectRates([0.29, -0.01, 2.65], [0.1, -0.02, 2.9], [-19, -1, 25], "MIXED");
for (const unsupported of [0.001, 0.1 + 0.2, 1e-7]) {
  unavailable(derive(BASE, [unsupported, 2.65, 2.9]), "UNSUPPORTED_RATE_PRECISION");
  unavailable(derive([2.5, 2.65, unsupported], BASE), "UNSUPPORTED_RATE_PRECISION");
}
unavailable(derive(BASE, [1e15, 2.65, 2.9]), "UNSUPPORTED_RATE_RANGE");
unavailable(derive(BASE, [1e21, 2.65, 2.9]), "UNSUPPORTED_RATE_RANGE");
unavailable(derive([-8e13, 0, 0], [8e13, 0, 0]), "UNSUPPORTED_RATE_RANGE");

const current = event(BASE, { effectiveDate: "2026-09-23" });
const prior = priorAvailable(selectPrior(BASE, current));
const unchanged = available(buildEcbPolicyDecisionDeltaV1({ current, prior, evaluatedAt: EVALUATED_AT }));
assert.equal(unchanged.semantic, "derived-feature");
assert.equal(unchanged.feature, "ecb-policy-decision-delta");
assert.equal(unchanged.coverage, "provided-history-only");
assert.deepEqual(unchanged.prior, prior);
assert.deepEqual(unchanged.current.announcement.value.rates, current.decision!.rates);
assert.deepEqual(unchanged.current.announcement.provenance, {
  provider: "ecb", source: "ECB", originalPublisher: "ECB", substitution: { status: "none" },
  sourceUrl: current.decision!.documentUrl, sourceVersionId: current.decision!.sourceVersionId,
  fetchedAt: CURRENT_CAPTURE,
});
assert.equal(unchanged.current.canonicalEventId, current.canonicalEventId);
assert.equal(unchanged.current.eventSourceVersionId, current.sourceVersionId);
assert.equal(unchanged.current.decisionDate, "2026-09-10");
assert.equal(unchanged.prior.announcement.value.rates.effectiveDate, null);
assert.equal(unchanged.current.announcement.value.rates.effectiveDate, "2026-09-23");
assert.equal(unchanged.knownAt, CURRENT_CAPTURE);
const exactEvaluatedAt = new Date(CURRENT_CAPTURE * 1_000).toISOString();
const exactPrior = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [memory(event(BASE, { date: "2026-07-23", fetchedAt: PRIOR_CAPTURE }))],
  target: current, knowledgeCutoff: CURRENT_CAPTURE - 1, evaluatedAt: exactEvaluatedAt,
});
assert.equal(available(buildEcbPolicyDecisionDeltaV1({ current, prior: exactPrior,
  evaluatedAt: exactEvaluatedAt })).knownAt, CURRENT_CAPTURE);
unavailable(buildEcbPolicyDecisionDeltaV1({ current: event(BASE, { fetchedAt: CURRENT_CAPTURE + 1 }),
  prior: exactPrior, evaluatedAt: new Date(CURRENT_CAPTURE * 1_000 + 999).toISOString(),
}), "KNOWLEDGE_INCONSISTENT");
assert.equal("inForce" in unchanged, false);
assert.equal("surprise" in unchanged, false);

// F2: genuine selections for different targets cannot be interchanged.
const aprilCapture = Date.parse("2026-04-30T12:16:00Z") / 1_000;
const aprilEvent = event([3, 3.15, 3.4], { date: "2026-04-30", fetchedAt: aprilCapture });
const julyEvent = event([2.75, 2.9, 3.15], { date: "2026-07-23", fetchedAt: PRIOR_CAPTURE });
const julyTarget = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-07-23",
  schedule: { meetingDate: "2026-07-23", fetchedAt: PRIOR_CAPTURE - 1 },
});
const septemberTarget = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-10", fetchedAt: Date.parse("2026-09-08T12:00:00Z") / 1_000 },
});
const policyHistory = [memory(aprilEvent), memory(julyEvent), memory(current)];
const genuineJulyPrior = priorAvailable(selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: policyHistory, target: julyTarget, knowledgeCutoff: PRIOR_CAPTURE - 1,
  evaluatedAt: "2026-07-23T12:30:00Z",
}));
const genuineSeptemberPrior = priorAvailable(selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: policyHistory, target: septemberTarget, knowledgeCutoff: CURRENT_CAPTURE - 1,
  evaluatedAt: EVALUATED_AT,
}));
assert.equal(genuineJulyPrior.canonicalEventId, aprilEvent.canonicalEventId);
assert.equal(genuineSeptemberPrior.canonicalEventId, julyEvent.canonicalEventId);
const septemberDelta = available(buildEcbPolicyDecisionDeltaV1({ current,
  prior: genuineSeptemberPrior, evaluatedAt: EVALUATED_AT,
}));
for (const key of KEYS) assert.equal(septemberDelta.rates[key].deltaBasisPoints, -25);
assert.equal(septemberDelta.rates.depositFacility.previousRate, 2.75);
assert.equal(septemberDelta.rates.depositFacility.currentRate, 2.5);
assert.equal(septemberDelta.aggregate, "ALL_DECREASED");
unavailable(buildEcbPolicyDecisionDeltaV1({ current, prior: genuineJulyPrior,
  evaluatedAt: EVALUATED_AT }), "EVENT_IDENTITY_CONFLICT");

// A timely revision retains its original identity and progresses to an observed
// decision with the same schedule version; capture and decision versions may change.
const revisedSchedule = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-17", fetchedAt: Date.parse("2026-09-14T12:00:00Z") / 1_000 },
});
const interveningEvent = event([2.75, 2.9, 3.15], { date: "2026-09-12",
  fetchedAt: Date.parse("2026-09-12T12:16:00Z") / 1_000,
});
const revisedSelection = priorAvailable(selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [memory(julyEvent), memory(interveningEvent)], target: revisedSchedule,
  knowledgeCutoff: Date.parse("2026-09-15T12:00:00Z") / 1_000,
  evaluatedAt: "2026-09-15T12:00:00Z",
}));
const revisedDecision = event(BASE, { anchor: "2026-09-10", date: "2026-09-17",
  fetchedAt: Date.parse("2026-09-17T12:16:00Z") / 1_000,
});
const revisedAssessment = "2026-09-17T12:30:00Z";
const validRevisionDelta = available(buildEcbPolicyDecisionDeltaV1({ current: revisedDecision,
  prior: revisedSelection, evaluatedAt: revisedAssessment,
}));
assert.equal(validRevisionDelta.current.canonicalEventId, current.canonicalEventId);
assert.equal(validRevisionDelta.current.decisionDate, "2026-09-17");
assert.equal(validRevisionDelta.prior.decisionDate, "2026-09-12");
assert.equal(validRevisionDelta.prior.targetSnapshot.event.canonicalMeetingDate, "2026-09-10");
for (const key of KEYS) assert.equal(validRevisionDelta.rates[key].deltaBasisPoints, -25);
unavailable(buildEcbPolicyDecisionDeltaV1({ current: revisedDecision, prior: genuineSeptemberPrior,
  evaluatedAt: revisedAssessment }), "EVENT_IDENTITY_CONFLICT");

// Canonical reconstruction rejects contradictory target metadata without catches.
const missingTarget = clone(prior);
Reflect.deleteProperty(missingTarget, "targetSnapshot");
const badTargetIdentity = clone(prior);
Reflect.set(badTargetIdentity.targetSnapshot.event, "canonicalEventId", "another-target");
const badTargetMeeting = clone(prior);
Reflect.set(badTargetMeeting.targetSnapshot.event.schedule, "meetingDate", "2026-09-17");
const badTargetKnowledge = clone(prior);
Reflect.set(badTargetKnowledge.targetSnapshot, "knownAt", CURRENT_CAPTURE - 2);
const badTargetCapture = clone(prior);
Reflect.set(badTargetCapture.targetSnapshot.event.schedule, "fetchedAt", CURRENT_CAPTURE - 2);
const badTargetVersion = clone(prior);
Reflect.set(badTargetVersion.targetSnapshot, "eventSourceVersionId", "0".repeat(64));
const badTargetScheduleVersion = clone(prior);
Reflect.set(badTargetScheduleVersion.targetSnapshot.event.schedule, "sourceVersionId", "0".repeat(64));
const badTargetProvenance = clone(prior);
Reflect.set(badTargetProvenance.targetSnapshot.event.schedule, "sourceUrl", "https://example.com/calendar");
for (const invalid of [missingTarget, badTargetIdentity, badTargetMeeting, badTargetKnowledge,
  badTargetCapture, badTargetVersion, badTargetScheduleVersion, badTargetProvenance,
  { ...prior, targetSnapshot: buildEcbMonetaryPolicyEventSnapshotV1(current) }]) {
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: invalid,
    evaluatedAt: EVALUATED_AT }), TypeError);
}

// Internally coherent identity/schedule replacements still disagree with current.
for (const target of [
  normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-03", schedule: current.schedule }),
  normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-10",
    schedule: { meetingDate: "2026-09-17", fetchedAt: current.schedule.fetchedAt } }),
  normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-10",
    schedule: { ...current.schedule, scheduledLocalTime: "14:30" } }),
]) {
  unavailable(buildEcbPolicyDecisionDeltaV1({ current,
    prior: { ...prior, targetSnapshot: buildEcbMonetaryPolicyEventSnapshotV1(target) },
    evaluatedAt: EVALUATED_AT }), "EVENT_IDENTITY_CONFLICT");
}
const assessmentSecond = Date.parse(EVALUATED_AT) / 1_000;
const targetAt = (fetchedAt: number) => buildEcbMonetaryPolicyEventSnapshotV1(
  normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-10",
    schedule: { ...current.schedule, fetchedAt } }),
);
const targetBoundaryPrior = priorAvailable(selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [memory(julyEvent)], target: targetAt(assessmentSecond).event,
  knowledgeCutoff: CURRENT_CAPTURE - 1, evaluatedAt: EVALUATED_AT,
}));
assert.equal(available(buildEcbPolicyDecisionDeltaV1({ current, prior: targetBoundaryPrior,
  evaluatedAt: EVALUATED_AT })).knownAt, assessmentSecond,
"derived knowledge includes required target evidence even when its recapture follows current capture");
unavailable(buildEcbPolicyDecisionDeltaV1({ current,
  prior: { ...targetBoundaryPrior, targetSnapshot: targetAt(assessmentSecond + 1) },
  evaluatedAt: "2026-09-10T12:31:00Z" }), "KNOWLEDGE_INCONSISTENT");
unavailable(buildEcbPolicyDecisionDeltaV1({ current,
  prior: { ...targetBoundaryPrior, evaluatedAt: "2026-09-10T12:29:59.999Z" },
  evaluatedAt: EVALUATED_AT }), "KNOWLEDGE_INCONSISTENT");

const context = { target: current, knowledgeCutoff: CURRENT_CAPTURE - 1, evaluatedAt: EVALUATED_AT };
const old = event(BASE, { date: "2026-07-23", fetchedAt: PRIOR_CAPTURE });
const conflict = event([2.75, 2.9, 3.15], { date: "2026-07-23", fetchedAt: PRIOR_CAPTURE + 1 });
const malformed = clone(memory(old));
Reflect.set(malformed.snapshots[0], "knownAt", 0);
const priorFailures = [
  selectEcbMonetaryPolicyPriorStateAsKnownAtV1({ ...context, memories: [] }),
  selectPrior(null, current),
  selectEcbMonetaryPolicyPriorStateAsKnownAtV1({ ...context, memories: [memory(old), memory(conflict)] }),
  selectEcbMonetaryPolicyPriorStateAsKnownAtV1({ ...context, memories: [malformed] }),
];
assert.deepEqual(priorFailures.map((item) => item.status === "unavailable" ? item.reason : null),
  ["INSUFFICIENT_HISTORY", "EVENT_DATA_INCOMPLETE", "AMBIGUOUS_PRIOR_STATE", "INVALID_HISTORY"]);
for (const missing of priorFailures) {
  const result = buildEcbPolicyDecisionDeltaV1({ current, prior: missing, evaluatedAt: EVALUATED_AT });
  unavailable(result, "PRIOR_STATE_UNAVAILABLE");
  if (result.status !== "unavailable" || result.reason !== "PRIOR_STATE_UNAVAILABLE" || missing.status !== "unavailable") {
    throw new Error("Expected the exact unavailable prior reason.");
  }
  assert.equal(result.priorReason, missing.reason);
}
unavailable(buildEcbPolicyDecisionDeltaV1({ current: event(null), prior, evaluatedAt: EVALUATED_AT }),
  "CURRENT_POLICY_FACTS_UNAVAILABLE");
const scheduleOnly = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-10", fetchedAt: CURRENT_CAPTURE } });
unavailable(buildEcbPolicyDecisionDeltaV1({ current: scheduleOnly, prior, evaluatedAt: EVALUATED_AT }),
  "CURRENT_POLICY_FACTS_UNAVAILABLE");

const missingRate = clone(current);
Reflect.deleteProperty(missingRate.decision!.rates!, "marginalLendingFacility");
assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current: missingRate, prior, evaluatedAt: EVALUATED_AT }), TypeError);
const missingPriorRate = clone(prior);
Reflect.deleteProperty(missingPriorRate.announcement.value.rates, "mainRefinancingOperations");
assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: missingPriorRate, evaluatedAt: EVALUATED_AT }), TypeError);
for (const badRate of [NaN, Infinity]) {
  const invalid = clone(current);
  Reflect.set(invalid.decision!.rates!, "depositFacility", badRate);
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current: invalid, prior, evaluatedAt: EVALUATED_AT }), TypeError);
}
for (const field of ["sourceVersionId", "canonicalEventId"] as const) {
  const invalid = clone(current);
  Reflect.set(invalid, field, "contradictory");
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current: invalid, prior, evaluatedAt: EVALUATED_AT }), TypeError);
}
const badCurrentSource = clone(current);
Reflect.set(badCurrentSource.decision!, "documentUrl", "https://example.com/decision.html");
assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current: badCurrentSource, prior, evaluatedAt: EVALUATED_AT }), TypeError);
for (const provenance of [
  { ...prior.announcement.provenance, provider: "other" },
  { ...prior.announcement.provenance, sourceUrl: "https://example.com/decision.html" },
  { ...prior.announcement.provenance, sourceVersionId: "missing-version" },
]) {
  const invalid = clone(prior);
  Reflect.set(invalid.announcement, "provenance", provenance);
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: invalid, evaluatedAt: EVALUATED_AT }), TypeError);
}

for (const contradictory of [
  { ...prior, canonicalEventId: current.canonicalEventId },
  { ...prior, decisionDate: "2026-09-10" },
  { ...prior, decisionDate: "2026-10-29" },
]) {
  unavailable(buildEcbPolicyDecisionDeltaV1({ current, prior: contradictory, evaluatedAt: EVALUATED_AT }),
    "EVENT_IDENTITY_CONFLICT");
}
const rescheduled = event(BASE, { anchor: "2026-09-03" });
assert.equal(available(buildEcbPolicyDecisionDeltaV1({ current: rescheduled,
  prior: selectPrior(BASE, rescheduled), evaluatedAt: EVALUATED_AT })).current.decisionDate, "2026-09-10");

// P1: changing only the summary date must not relabel later selected evidence.
const octoberCapture = Date.parse("2026-10-29T12:16:00Z") / 1_000;
const octoberEvaluation = "2026-10-30T12:30:00Z";
const octoberEvent = event([2.75, 2.9, 3.15], { date: "2026-10-29", fetchedAt: octoberCapture });
const decemberTarget = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: "2026-12-17",
  schedule: { meetingDate: "2026-12-17", fetchedAt: octoberCapture },
});
const octoberPrior = priorAvailable(selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [memory(octoberEvent)], target: decemberTarget,
  knowledgeCutoff: octoberCapture, evaluatedAt: octoberEvaluation,
}));
const decemberEvent = event([3, 3.15, 3.4], { date: "2026-12-17",
  fetchedAt: Date.parse("2026-12-17T12:16:00Z") / 1_000,
});
assert.equal(available(buildEcbPolicyDecisionDeltaV1({ current: decemberEvent, prior: octoberPrior,
  evaluatedAt: "2026-12-17T12:30:00Z" })).rates.depositFacility.deltaBasisPoints, 25);
unavailable(buildEcbPolicyDecisionDeltaV1({ current, prior: octoberPrior,
  evaluatedAt: octoberEvaluation }), "EVENT_IDENTITY_CONFLICT");
const falsifiedDate = { ...octoberPrior, decisionDate: "2026-07-23" };
assert.ok(falsifiedDate.decisionDate < current.decision!.decisionDate);
assert.deepEqual({ ...falsifiedDate, decisionDate: octoberPrior.decisionDate }, octoberPrior);
assert.equal(falsifiedDate.selectedSnapshot, octoberPrior.selectedSnapshot);
assert.equal(falsifiedDate.announcement, octoberPrior.announcement);
unavailable(buildEcbPolicyDecisionDeltaV1({ current, prior: falsifiedDate,
  evaluatedAt: octoberEvaluation }), "EVENT_IDENTITY_CONFLICT");
unavailable(buildEcbPolicyDecisionDeltaV1({ current: decemberEvent, prior: falsifiedDate,
  evaluatedAt: "2026-12-17T12:30:00Z" }), "EVENT_IDENTITY_CONFLICT");

// P2: the canonical prior schedule capture is later than current knowledge.
const delayedPriorEvent = event(BASE, { date: "2026-07-23", fetchedAt: PRIOR_CAPTURE,
  scheduleFetchedAt: CURRENT_CAPTURE + 60,
});
const delayedPriorMemory = memory(delayedPriorEvent);
const delayedPrior = priorAvailable(selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [delayedPriorMemory], target: current,
  knowledgeCutoff: CURRENT_CAPTURE + 60, evaluatedAt: EVALUATED_AT,
}));
assert.equal(delayedPrior.knownAt, delayedPriorMemory.snapshots[0].knownAt);
assert.equal(delayedPrior.selectedSnapshot.knownAt, CURRENT_CAPTURE + 60);
assert.equal(available(buildEcbPolicyDecisionDeltaV1({ current, prior: delayedPrior,
  evaluatedAt: EVALUATED_AT })).knownAt, CURRENT_CAPTURE + 60);
const falsifiedKnowledge = { ...delayedPrior, knownAt: PRIOR_CAPTURE };
assert.ok(falsifiedKnowledge.knownAt < CURRENT_CAPTURE && CURRENT_CAPTURE < delayedPrior.knownAt);
assert.deepEqual({ ...falsifiedKnowledge, knownAt: delayedPrior.knownAt }, delayedPrior);
assert.equal(falsifiedKnowledge.selectedSnapshot, delayedPrior.selectedSnapshot);
assert.equal(falsifiedKnowledge.announcement, delayedPrior.announcement);
unavailable(buildEcbPolicyDecisionDeltaV1({ current, prior: falsifiedKnowledge,
  evaluatedAt: EVALUATED_AT }), "KNOWLEDGE_INCONSISTENT");

// Selected prior evidence can legitimately have a different identity anchor.
const revisedPriorEvent = event(BASE, { anchor: "2026-07-23", date: "2026-07-30",
  fetchedAt: Date.parse("2026-07-30T12:16:00Z") / 1_000,
});
const revisedCurrent = event([2.75, 2.9, 3.15], { anchor: "2026-09-03" });
const revisedPrior = priorAvailable(selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
  memories: [memory(revisedPriorEvent)], target: revisedCurrent,
  knowledgeCutoff: CURRENT_CAPTURE - 1, evaluatedAt: EVALUATED_AT,
}));
const revisedDelta = available(buildEcbPolicyDecisionDeltaV1({ current: revisedCurrent,
  prior: revisedPrior, evaluatedAt: EVALUATED_AT,
}));
assert.equal(revisedDelta.prior.canonicalEventId, revisedPriorEvent.canonicalEventId);
assert.equal(revisedDelta.prior.selectedSnapshot.event.canonicalMeetingDate, "2026-07-23");
assert.equal(revisedDelta.prior.decisionDate, "2026-07-30");
assert.equal(revisedDelta.current.canonicalEventId, revisedCurrent.canonicalEventId);
assert.equal(revisedDelta.current.decisionDate, "2026-09-10");
assert.equal(revisedDelta.aggregate, "ALL_INCREASED");
for (const key of KEYS) assert.equal(revisedDelta.rates[key].deltaBasisPoints, 25);

// Snapshot metadata and nested canonical versions must agree with reconstruction.
const missingSnapshot = clone(prior);
Reflect.deleteProperty(missingSnapshot, "selectedSnapshot");
const badSnapshotKnowledge = clone(prior);
Reflect.set(badSnapshotKnowledge.selectedSnapshot, "knownAt", PRIOR_CAPTURE - 1);
const badSnapshotVersion = clone(prior);
Reflect.set(badSnapshotVersion.selectedSnapshot.event, "sourceVersionId", "0".repeat(64));
for (const invalid of [missingSnapshot, badSnapshotKnowledge, badSnapshotVersion]) {
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: invalid, evaluatedAt: EVALUATED_AT }), TypeError);
}
unavailable(buildEcbPolicyDecisionDeltaV1({ current,
  prior: { ...prior, eventSourceVersionId: "0".repeat(64) }, evaluatedAt: EVALUATED_AT,
}), "EVENT_IDENTITY_CONFLICT");

const laterSchedule = event(BASE, { scheduleFetchedAt: CURRENT_CAPTURE + 45 });
assert.equal(available(buildEcbPolicyDecisionDeltaV1({ current: laterSchedule, prior,
  evaluatedAt: EVALUATED_AT })).knownAt, CURRENT_CAPTURE + 45);
const laterPrior = priorAvailable(selectPrior(BASE, current, {
  fetchedAt: CURRENT_CAPTURE + 60, knowledgeCutoff: CURRENT_CAPTURE + 60,
}));
assert.equal(available(buildEcbPolicyDecisionDeltaV1({ current, prior: laterPrior,
  evaluatedAt: EVALUATED_AT })).knownAt, CURRENT_CAPTURE + 60);
unavailable(buildEcbPolicyDecisionDeltaV1({ current: event(BASE, {
  fetchedAt: Date.parse(EVALUATED_AT) / 1_000 + 1,
}), prior, evaluatedAt: EVALUATED_AT }), "KNOWLEDGE_INCONSISTENT");
for (const contradictory of [
  { ...prior, knownAt: prior.knowledgeCutoff + 1 },
  { ...prior, knownAt: prior.announcement.provenance.fetchedAt - 1 },
  { ...prior, evaluatedAt: "2026-09-10T12:30:01Z" },
  { ...prior, knowledgeCutoff: Date.parse(EVALUATED_AT) / 1_000 + 1 },
]) {
  unavailable(buildEcbPolicyDecisionDeltaV1({ current, prior: contradictory, evaluatedAt: EVALUATED_AT }),
    "KNOWLEDGE_INCONSISTENT");
}
assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior,
  evaluatedAt: "2026-09-10T12:30:00" }), TypeError);
assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current,
  prior: { ...prior, knowledgeCutoff: 1.5 }, evaluatedAt: EVALUATED_AT }), TypeError);

const mutable = { current: clone(current), prior: clone(prior), evaluatedAt: EVALUATED_AT };
const before = clone(mutable);
const result = available(buildEcbPolicyDecisionDeltaV1(mutable));
assert.deepEqual(buildEcbPolicyDecisionDeltaV1(mutable), result);
assert.deepEqual(buildEcbPolicyDecisionDeltaV1({ ...mutable, evaluatedAt: "2026-09-10T14:30:00+02:00" }), result);
assert.deepEqual(mutable, before);
assert.equal(Object.isFrozen(mutable.current.decision!.rates), false);
assert.equal(Object.isFrozen(mutable.prior.announcement.provenance), false);
assert.equal(Object.isFrozen(mutable.prior.selectedSnapshot.event.schedule), false);
assert.equal(Object.isFrozen(mutable.prior.targetSnapshot.event.schedule), false);
for (const object of [result, result.rates, result.rates.depositFacility, result.current,
  result.prior, result.current.announcement.value.rates, result.prior.announcement.provenance,
  result.prior.announcement.provenance.substitution, result.prior.selectedSnapshot,
  result.prior.selectedSnapshot.event, result.prior.selectedSnapshot.event.schedule,
  result.prior.selectedSnapshot.event.decision!.rates, result.prior.targetSnapshot,
  result.prior.targetSnapshot.event, result.prior.targetSnapshot.event.schedule]) {
  assert.equal(Object.isFrozen(object), true);
}
Reflect.set(mutable.prior.announcement.value.rates, "depositFacility", 99);
assert.equal(result.prior.announcement.value.rates.depositFacility, 2.5);
Reflect.set(mutable.prior.selectedSnapshot.event.schedule, "fetchedAt", 0);
assert.equal(result.prior.selectedSnapshot.event.schedule.fetchedAt, PRIOR_CAPTURE - 1);
assert.notEqual(result.prior.targetSnapshot, mutable.prior.targetSnapshot);
Reflect.set(mutable.prior.targetSnapshot.event.schedule, "meetingDate", "2026-09-17");
assert.equal(result.prior.targetSnapshot.event.schedule.meetingDate, "2026-09-10");

for (const defect of [new ReferenceError("internal defect"), new TypeError("internal defect")]) {
  const currentFault = clone(current);
  Object.defineProperty(currentFault.decision!, "rates", { get() { throw defect; } });
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current: currentFault, prior, evaluatedAt: EVALUATED_AT }),
    (error) => error === defect);
  const priorFault = clone(prior);
  Object.defineProperty(priorFault.announcement.value, "rates", { get() { throw defect; } });
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: priorFault, evaluatedAt: EVALUATED_AT }),
    (error) => error === defect);
  const snapshotFault = clone(prior);
  Object.defineProperty(snapshotFault.selectedSnapshot.event.decision!, "rates", { get() { throw defect; } });
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: snapshotFault, evaluatedAt: EVALUATED_AT }),
    (error) => error === defect);
  const proxyFault = clone(prior);
  const schedule = proxyFault.selectedSnapshot.event.schedule;
  Reflect.set(proxyFault.selectedSnapshot.event, "schedule", new Proxy(schedule, {
    get(target, key, receiver) {
      if (key === "fetchedAt") throw defect;
      return Reflect.get(target, key, receiver);
    },
  }));
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: proxyFault, evaluatedAt: EVALUATED_AT }),
    (error) => error === defect);
  const targetFault = clone(prior);
  Object.defineProperty(targetFault.targetSnapshot.event.schedule, "fetchedAt", { get() { throw defect; } });
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: targetFault, evaluatedAt: EVALUATED_AT }),
    (error) => error === defect);
  const targetProxyFault = clone(prior);
  Reflect.set(targetProxyFault.targetSnapshot, "event", new Proxy(targetProxyFault.targetSnapshot.event, {
    get(target, key, receiver) {
      if (key === "schedule") throw defect;
      return Reflect.get(target, key, receiver);
    },
  }));
  assert.throws(() => buildEcbPolicyDecisionDeltaV1({ current, prior: targetProxyFault, evaluatedAt: EVALUATED_AT }),
    (error) => error === defect);
}

console.log("PASS: exact ECB announced-policy deltas, precision, atomic evidence, knowledge and defect propagation");
