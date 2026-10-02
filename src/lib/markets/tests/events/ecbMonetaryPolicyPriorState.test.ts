import assert from "node:assert/strict";
import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
  type EcbPolicyRateFactsV1,
} from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventMemoryV1,
} from "../../events/ecbMonetaryPolicyMemory";
import {
  selectEcbMonetaryPolicyPriorStateAsKnownAtV1,
  type EcbMonetaryPolicyPriorStateResultV1,
  type SelectEcbMonetaryPolicyPriorStateInputV1,
} from "../../events/ecbMonetaryPolicyPriorState";

// Synthetic captured facts only; dates/rates are not claims about real ECB history.
const unix = (instant: string) => Date.parse(instant) / 1_000;
const EVALUATED_AT = "2026-08-20T12:00:00.000Z";
const CUTOFF = unix(EVALUATED_AT);
const RATES: EcbPolicyRateFactsV1 = {
  depositFacility: 2.5, mainRefinancingOperations: 2.65,
  marginalLendingFacility: 2.9, unit: "percent", effectiveDate: "2026-09-16",
};
const OLD_RATES: EcbPolicyRateFactsV1 = {
  depositFacility: 3, mainRefinancingOperations: 3.15,
  marginalLendingFacility: 3.4, unit: "percent", effectiveDate: null,
};
const TARGET = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-10", fetchedAt: CUTOFF - 100 },
});

function announced(date: string, fetchedAt: number, options: {
  rates?: EcbPolicyRateFactsV1 | null;
  canonicalMeetingDate?: string;
  scheduleFetchedAt?: number;
  firstObservedAt?: number;
} = {}): EcbMonetaryPolicyEventFactV1 {
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.canonicalMeetingDate ?? date,
    schedule: { meetingDate: date, fetchedAt: options.scheduleFetchedAt ?? fetchedAt - 1 },
    decision: {
      decisionDate: date,
      documentUrl: `https://www.ecb.europa.eu/press/pr/date/${date.slice(0, 4)}/html/ecb.mp${date.replace(/-/g, "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt,
      firstObservedAt: options.firstObservedAt ?? fetchedAt,
      actualReleasedAt: null,
      rates: options.rates === undefined ? RATES : options.rates,
    },
  });
}

function memory(...events: EcbMonetaryPolicyEventFactV1[]): EcbMonetaryPolicyEventMemoryV1 {
  let result: EcbMonetaryPolicyEventMemoryV1 | null = null;
  for (const event of events) {
    const advance = advanceEcbMonetaryPolicyEventMemoryV1(result, event);
    if (advance.status !== "initialized" && advance.status !== "advanced" && advance.status !== "unchanged") {
      throw new Error(`Invalid synthetic history: ${advance.status}`);
    }
    result = advance.memory;
  }
  if (result === null) throw new Error("Expected a nonempty synthetic history.");
  return result;
}

function select(memories: readonly EcbMonetaryPolicyEventMemoryV1[],
  overrides: Partial<SelectEcbMonetaryPolicyPriorStateInputV1> = {}) {
  return selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
    memories, target: TARGET, knowledgeCutoff: CUTOFF, evaluatedAt: EVALUATED_AT, ...overrides,
  });
}

function available(result: EcbMonetaryPolicyPriorStateResultV1) {
  if (result.status !== "available") throw new Error(JSON.stringify(result));
  return result;
}

function unavailable(memories: readonly EcbMonetaryPolicyEventMemoryV1[],
  reason: Extract<EcbMonetaryPolicyPriorStateResultV1, { status: "unavailable" }>["reason"]) {
  assert.deepEqual(select(memories), {
    status: "unavailable", reason, coverage: "provided-history-only",
    knowledgeCutoff: CUTOFF, evaluatedAt: EVALUATED_AT,
  });
}

const aEvent = announced("2026-04-30", unix("2026-05-01T12:00:00Z"), { rates: OLD_RATES });
const bEvent = announced("2026-07-23", unix("2026-07-23T12:16:00Z"));
const a = memory(aEvent);
const b = memory(bEvent);
const chosen = available(select([b, a]));
assert.equal(chosen.canonicalEventId, bEvent.canonicalEventId);
assert.equal(chosen.decisionDate, "2026-07-23");
assert.deepEqual(chosen.announcement.value, { kind: "ecb-policy-rates", rates: RATES });
assert.deepEqual(chosen.announcement.provenance, {
  provider: "ecb", source: "ECB", originalPublisher: "ECB", substitution: { status: "none" },
  sourceUrl: bEvent.decision!.documentUrl, sourceVersionId: bEvent.decision!.sourceVersionId,
  fetchedAt: bEvent.decision!.fetchedAt,
});
assert.equal(chosen.knownAt, b.snapshots[0].knownAt);
assert.equal(chosen.eventSourceVersionId, bEvent.sourceVersionId);
assert.deepEqual(chosen.selectedSnapshot, b.snapshots[0]);
assert.equal(chosen.coverage, "provided-history-only");
assert.equal(chosen.knowledgeCutoff, CUTOFF);
assert.equal(chosen.evaluatedAt, EVALUATED_AT);
assert.equal("inForce" in chosen, false);
assert.ok(unix(`${RATES.effectiveDate}T00:00:00Z`) > CUTOFF,
  "future economic effective time does not suppress an already known announcement");

for (const histories of [[a, b], [b, a], [a, b, a], [b, a, b]]) {
  assert.deepEqual(select(histories), chosen, "ordering and identical duplicates do not change selection");
}
assert.deepEqual(select([a, b], { evaluatedAt: "2026-08-20T14:00:00+02:00" }), chosen);

// Corrections must not rewrite what was known before their capture.
const corrected = announced("2026-07-23", CUTOFF + 60, { rates: OLD_RATES });
const correctedHistory = memory(bEvent, corrected);
assert.deepEqual(select([a, correctedHistory]), chosen);
assert.deepEqual(select([correctedHistory, b]), chosen,
  "a future branch does not make identical historical selections ambiguous");
assert.deepEqual(available(select([correctedHistory], {
  knowledgeCutoff: CUTOFF + 60, evaluatedAt: "2026-08-20T12:01:00Z",
})).announcement.value.rates, OLD_RATES);

const exact = memory(announced("2026-07-23", CUTOFF));
assert.equal(available(select([exact])).knownAt, CUTOFF);
const future = memory(announced("2026-07-23", CUTOFF + 1));
unavailable([future], "INSUFFICIENT_HISTORY");
assert.equal(available(select([future, a])).canonicalEventId, aEvent.canonicalEventId);
unavailable([memory(announced("2026-04-30", CUTOFF + 1))], "INSUFFICIENT_HISTORY");
// Snapshot knowledge is the existing max of schedule/decision capture, not first observation.
const laterSchedule = memory(announced("2026-07-23", CUTOFF - 10, {
  scheduleFetchedAt: CUTOFF + 1, firstObservedAt: CUTOFF - 100,
}));
unavailable([laterSchedule], "INSUFFICIENT_HISTORY");
const selectedLaterSchedule = available(select([laterSchedule], {
  knowledgeCutoff: CUTOFF + 1, evaluatedAt: "2026-08-20T12:00:01Z",
}));
assert.deepEqual(selectedLaterSchedule.selectedSnapshot, laterSchedule.snapshots[0]);
assert.equal(selectedLaterSchedule.knownAt, CUTOFF + 1);
assert.equal(selectedLaterSchedule.selectedSnapshot.event.schedule.fetchedAt, CUTOFF + 1);

const revisedPriorEvent = announced("2026-07-30", unix("2026-07-30T12:16:00Z"), {
  canonicalMeetingDate: "2026-07-23",
});
const revisedPrior = available(select([memory(revisedPriorEvent)]));
assert.equal(revisedPrior.canonicalEventId, bEvent.canonicalEventId);
assert.equal(revisedPrior.decisionDate, "2026-07-30");
assert.deepEqual(revisedPrior.selectedSnapshot.event, revisedPriorEvent);

const self = memory(announced("2026-09-10", CUTOFF - 1));
const later = memory(announced("2026-10-29", CUTOFF - 1));
unavailable([self], "INSUFFICIENT_HISTORY");
unavailable([later], "INSUFFICIENT_HISTORY");
assert.deepEqual(select([self, later, b, a]), chosen);
const recapturedA = memory(announced("2026-04-30", CUTOFF - 1, {
  rates: OLD_RATES, firstObservedAt: aEvent.decision!.firstObservedAt,
}));
assert.deepEqual(select([recapturedA, b]), chosen,
  "the newer decision outranks a more recently captured older decision");

// Stable target identity still excludes itself after a schedule revision.
const rescheduledTarget = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-17", fetchedAt: unix("2026-09-11T12:00:00Z") },
});
const septemberCutoff = unix("2026-09-15T12:00:00Z");
const septemberPrior = announced("2026-09-12", unix("2026-09-12T12:00:00Z"));
const rescheduledResult = available(select([
  memory(announced("2026-09-10", unix("2026-09-10T12:16:00Z"))), memory(septemberPrior),
], { target: rescheduledTarget, knowledgeCutoff: septemberCutoff, evaluatedAt: "2026-09-15T12:00:00Z" }));
assert.equal(rescheduledResult.canonicalEventId, septemberPrior.canonicalEventId);
assert.equal(rescheduledResult.decisionDate, "2026-09-12");
assert.equal(rescheduledTarget.canonicalEventId, TARGET.canonicalEventId);

// F1: a September 16 schedule revision cannot rewrite a September 15 assessment.
// The September 12 decision changes eligibility only if the revised date is trusted.
const originalSeptemberTarget = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-10", fetchedAt: unix("2026-09-08T12:00:00Z") },
});
const futureSeptemberTarget = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-17", fetchedAt: unix("2026-09-16T12:00:00Z") },
});
const septemberQuery = { knowledgeCutoff: septemberCutoff, evaluatedAt: "2026-09-15T12:00:00Z" };
const septemberHistory = [memory(septemberPrior)];
assert.deepEqual(select(septemberHistory, { ...septemberQuery, target: originalSeptemberTarget }), {
  status: "unavailable", reason: "INSUFFICIENT_HISTORY", coverage: "provided-history-only",
  knowledgeCutoff: septemberCutoff, evaluatedAt: "2026-09-15T12:00:00.000Z",
});
assert.deepEqual(select(septemberHistory, { ...septemberQuery, target: futureSeptemberTarget }), {
  status: "unavailable", reason: "EVENT_DATA_INCOMPLETE", coverage: "provided-history-only",
  knowledgeCutoff: septemberCutoff, evaluatedAt: "2026-09-15T12:00:00.000Z",
});
assert.equal(rescheduledResult.targetSnapshot.event.canonicalMeetingDate, "2026-09-10");
assert.equal(rescheduledResult.targetSnapshot.event.schedule.meetingDate, "2026-09-17");
assert.equal(rescheduledResult.targetSnapshot.event.decision, null);
assert.equal(rescheduledResult.targetSnapshot.knownAt, rescheduledTarget.schedule.fetchedAt);

const exactTarget = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-17", fetchedAt: septemberCutoff },
});
assert.equal(available(select(septemberHistory, { ...septemberQuery, target: exactTarget })).decisionDate,
  "2026-09-12", "target capture exactly at evaluatedAt is inclusive");
assert.equal(available(select(septemberHistory, { ...septemberQuery, target: exactTarget,
  evaluatedAt: "2026-09-15T12:00:00.999Z",
})).decisionDate, "2026-09-12");
assert.deepEqual(select(septemberHistory, { target: exactTarget, knowledgeCutoff: septemberCutoff - 1,
  evaluatedAt: "2026-09-15T11:59:59.999Z",
}), {
  status: "unavailable", reason: "EVENT_DATA_INCOMPLETE", coverage: "provided-history-only",
  knowledgeCutoff: septemberCutoff - 1, evaluatedAt: "2026-09-15T11:59:59.999Z",
}, "assessment must not be rounded up to the target capture second");

// knowledgeCutoff applies to candidates, evaluatedAt applies to the supplied target.
// A schedule captured after the history cutoff is valid if known by assessment.
const earlierCutoff = unix("2026-09-12T13:00:00Z");
const laterKnownTarget = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-17", fetchedAt: unix("2026-09-14T12:00:00Z") },
});
assert.equal(available(select([...septemberHistory,
  memory(announced("2026-09-13", unix("2026-09-14T12:00:00Z"))),
], { ...septemberQuery, target: laterKnownTarget, knowledgeCutoff: earlierCutoff })).decisionDate,
"2026-09-12", "later target knowledge must not advance candidate history knowledge");

// A revised civil date cannot override retained, contradictory schedule facts.
const octoberCutoff = unix("2026-10-02T12:00:00Z");
const intervening = memory(announced("2026-10-01", octoberCutoff - 1));
const octoberQuery = { knowledgeCutoff: octoberCutoff, evaluatedAt: "2026-10-02T12:00:00Z" };
const contradictoryTarget = {
  ...TARGET, schedule: { ...TARGET.schedule, meetingDate: "2026-10-29" },
};
assert.equal(select([intervening], octoberQuery).status, "unavailable");
assert.throws(() => select([intervening], {
  ...octoberQuery, target: contradictoryTarget,
}), TypeError, "inconsistent target facts must not admit the intervening decision");
const validOctoberTarget = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: TARGET.canonicalMeetingDate,
  schedule: { meetingDate: "2026-10-29", fetchedAt: octoberCutoff - 1 },
});
assert.equal(validOctoberTarget.canonicalEventId, TARGET.canonicalEventId);
assert.equal(available(select([intervening], {
  ...octoberQuery, target: validOctoberTarget,
})).decisionDate, "2026-10-01");
// Independently inconsistent source version/provenance must also be rejected.
for (const schedule of [
  { ...validOctoberTarget.schedule, sourceVersionId: TARGET.schedule.sourceVersionId },
  { ...validOctoberTarget.schedule, sourceUrl: "https://example.com/calendar" },
]) {
  assert.throws(() => select([intervening], {
    ...octoberQuery, target: { ...validOctoberTarget, schedule } as typeof TARGET,
  }), TypeError);
}

const incomplete = memory(announced("2026-07-23", bEvent.decision!.fetchedAt, { rates: null }));
unavailable([a, incomplete], "EVENT_DATA_INCOMPLETE");
unavailable([incomplete, a], "EVENT_DATA_INCOMPLETE");
// A schedule alone is not an observed decision, even when it precedes the target.
const scheduleOnly = memory(normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-08-27",
  schedule: { meetingDate: "2026-08-27", fetchedAt: CUTOFF - 10 },
}));
unavailable([scheduleOnly], "INSUFFICIENT_HISTORY");
assert.deepEqual(select([scheduleOnly, b]), chosen);

const preciseRates: EcbPolicyRateFactsV1 = {
  depositFacility: -0.25, mainRefinancingOperations: 0,
  marginalLendingFacility: 0.1, unit: "percent", effectiveDate: null,
};
assert.deepEqual(available(select([memory(announced("2026-07-23", CUTOFF - 1, {
  rates: preciseRates,
}))])).announcement.value.rates, preciseRates);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const conflicting = memory(announced("2026-07-23", CUTOFF - 1, { rates: OLD_RATES }));
for (const histories of [[b, conflicting], [conflicting, b]]) {
  unavailable(histories, "AMBIGUOUS_PRIOR_STATE");
}
// Same semantic version is insufficient when capture/knowledge metadata disagree.
const differentCapture = memory(announced("2026-07-23", CUTOFF - 1));
assert.equal(differentCapture.snapshots[0].eventSourceVersionId, b.snapshots[0].eventSourceVersionId);
unavailable([b, differentCapture], "AMBIGUOUS_PRIOR_STATE");
unavailable([differentCapture, b], "AMBIGUOUS_PRIOR_STATE");
assert.deepEqual(select([clone(b), b, a]), chosen);
const differentOwner = memory(announced("2026-07-23", bEvent.decision!.fetchedAt, {
  canonicalMeetingDate: "2026-07-16",
}));
unavailable([b, differentOwner], "AMBIGUOUS_PRIOR_STATE");
unavailable([differentOwner, b], "AMBIGUOUS_PRIOR_STATE");
unavailable([b, incomplete], "AMBIGUOUS_PRIOR_STATE");
const conflictingDate = memory(announced("2026-10-29", CUTOFF - 1, {
  canonicalMeetingDate: "2026-07-23",
}));
unavailable([b, conflictingDate], "AMBIGUOUS_PRIOR_STATE");
unavailable([conflictingDate, b], "AMBIGUOUS_PRIOR_STATE");

// Malformed history is rejected even if another supplied history has usable rates.
const badProvenance = clone(b);
(badProvenance.snapshots[0].event.decision as { documentUrl: string }).documentUrl = "https://example.com/decision.html";
const badKnowledge = clone(b);
(badKnowledge.snapshots[0] as { knownAt: number }).knownAt -= 1;
const partialRates = clone(b);
Reflect.deleteProperty(partialRates.snapshots[0].event.decision!.rates!, "marginalLendingFacility");
const badStructure = clone(b);
Reflect.set(badStructure, "snapshots", null);
for (const malformed of [badStructure, badProvenance, badKnowledge, partialRates]) {
  unavailable([a, malformed], "INVALID_HISTORY");
  unavailable([malformed, a], "INVALID_HISTORY");
}
for (const histories of [[b, conflicting, badProvenance], [badProvenance, conflicting, b]]) {
  unavailable(histories, "INVALID_HISTORY");
}
unavailable([], "INSUFFICIENT_HISTORY");

// No mutation or alias freezing of supplied histories, including duplicate inputs.
const mutable = [clone(b), clone(a)];
const before = clone(mutable);
assert.deepEqual(select(mutable), chosen);
assert.deepEqual(mutable, before);
assert.equal(Object.isFrozen(mutable[0]), false);
assert.equal(Object.isFrozen(mutable[0].snapshots[0].event.decision!.rates), false);
assert.equal(Object.isFrozen(chosen), true);
assert.equal(Object.isFrozen(chosen.announcement), true);
assert.equal(Object.isFrozen(chosen.announcement.value), true);
assert.equal(Object.isFrozen(chosen.announcement.value.rates), true);
assert.equal(Object.isFrozen(chosen.announcement.provenance), true);
assert.equal(Object.isFrozen(chosen.announcement.provenance.substitution), true);
assert.equal(Object.isFrozen(chosen.selectedSnapshot), true);
assert.equal(Object.isFrozen(chosen.selectedSnapshot.event.schedule), true);
assert.equal(Object.isFrozen(chosen.selectedSnapshot.event.decision!.rates), true);
assert.notEqual(chosen.selectedSnapshot, b.snapshots[0]);
const mutableTarget = clone(TARGET);
const targetBefore = clone(mutableTarget);
const copiedTargetResult = available(select(mutable, { target: mutableTarget }));
assert.deepEqual(mutableTarget, targetBefore);
assert.equal(Object.isFrozen(mutableTarget.schedule), false);
for (const object of [copiedTargetResult.targetSnapshot, copiedTargetResult.targetSnapshot.event,
  copiedTargetResult.targetSnapshot.event.schedule]) assert.equal(Object.isFrozen(object), true);
assert.notEqual(copiedTargetResult.targetSnapshot.event.schedule, mutableTarget.schedule);
Reflect.set(mutableTarget.schedule, "meetingDate", "2026-10-29");
assert.equal(copiedTargetResult.targetSnapshot.event.schedule.meetingDate, "2026-09-10");

for (const knowledgeCutoff of [-1, 1.5, NaN, Infinity]) {
  assert.throws(() => select([b], { knowledgeCutoff }), TypeError);
}
assert.throws(() => select([b], { knowledgeCutoff: CUTOFF + 1 }), RangeError);
assert.throws(() => select([b], { evaluatedAt: "2026-08-20T11:59:59Z" }), RangeError);
for (const evaluatedAt of ["2026-02-30T12:00:00Z", "2026-08-20", "2026-08-20T12:00:00"]) {
  assert.throws(() => select([b], { evaluatedAt }), TypeError);
}
assert.throws(() => select([b], { target: { ...TARGET, canonicalEventId: "another-event" } }), TypeError);
assert.throws(() => select([b], { target: { ...TARGET,
  schedule: { ...TARGET.schedule, meetingDate: "2026-02-30" },
} }), TypeError);

// Defects outside explicit data validation must propagate without conversion.
for (const defect of [new ReferenceError("internal defect"), new TypeError("internal defect")]) {
  const exploding = new Proxy([b], {
    get(target, key, receiver) {
      if (key === "0") throw defect;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => select(exploding), (error) => error === defect);

  // Enter memory validation with a normal histories array. The required field
  // access inside the supplied memory, rather than array iteration, throws.
  const explodingMemory = new Proxy(b, {
    get(target, key, receiver) {
      if (key === "snapshots") throw defect;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => select([explodingMemory]), (error) => error === defect);
  const nested = clone(b);
  Object.defineProperty(nested.snapshots[0].event.decision!, "rates", {
    get() { throw defect; },
  });
  assert.throws(() => select([nested]), (error) => error === defect);
  const targetFault = clone(TARGET);
  Object.defineProperty(targetFault.schedule, "fetchedAt", { get() { throw defect; } });
  assert.throws(() => select([b], { target: targetFault }), (error) => error === defect);
  const targetProxy = new Proxy(TARGET, {
    get(target, key, receiver) {
      if (key === "schedule") throw defect;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.throws(() => select([b], { target: targetProxy }), (error) => error === defect);
}

console.log("PASS: prior ECB announcement as-of selection, atomic provenance, no stale fallback, ambiguity and knowledge safety");
