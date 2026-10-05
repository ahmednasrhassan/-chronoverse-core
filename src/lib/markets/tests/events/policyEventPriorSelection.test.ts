import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  selectPolicyEventPriorAsKnownAtV1, type SelectPolicyEventPriorInputV1,
  type PolicyEventPriorHistoryV1, type PolicyEventPriorSelectionV1,
} from "../../events/policyEventPriorSelection";
import { buildBilateralPolicyEventReadinessV1 } from "../../events/bilateralPolicyEventReadiness";
import type { BuildBilateralPolicyStateInputV1 } from "../../events/bilateralPolicyState";
import { ecbMonetaryPolicyCanonicalEventIdV1, normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { advanceEcbMonetaryPolicyEventMemoryV1, buildEcbMonetaryPolicyEventSnapshotV1,
  type EcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";
import { selectEcbMonetaryPolicyPriorStateAsKnownAtV1 } from "../../events/ecbMonetaryPolicyPriorState";
import { buildCanonicalStatisticalSeriesSnapshotV1,
  type CanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { buildUsPolicyCanonicalSeriesV1 } from "../../providers/federalReserve/canonical";
import { fomcDocumentUrlV1 } from "../../providers/federalReserve/transport";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import { BOJ_POLICY_INSTRUMENT_V1 } from "../../providers/boj/facts";
import { bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { buildBoeBankRateEvidenceV1 } from "../../providers/boe/canonical";
import { BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1, boeLondonReleaseTimestampV1 } from "../../providers/boe/facts";
import { BOE_MAY_2025_RELEASE_NOTICE_URL_V1, boeBankRateDocumentUrlV1 } from "../../providers/boe/transport";
import { buildSnbPolicyEvidenceV1 } from "../../providers/snb/canonical";
import { snbPolicyDocumentUrlV1 } from "../../providers/snb/transport";
import type { BojPolicyEvidenceSnapshotV1 } from "../../persistence/bojPolicyVintageRedis";
import type { BoeBankRateEvidenceSnapshotV1 } from "../../persistence/boeBankRateVintageRedis";
import type { SnbPolicyEvidenceSnapshotV1 } from "../../persistence/snbPolicyVintageRedis";

// Synthetic supplied canonical evidence, never claims about acquired official decisions.
const PRODUCTS = ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const;
type Product = (typeof PRODUCTS)[number];
const AT = "2026-10-05T10:00:00.000Z";
const unix = (instant: string) => Math.floor(Date.parse(instant) / 1000);
const CUTOFF = unix(AT) - 60;
const TARGET_CAPTURE = CUTOFF + 30;
const TARGET = "2025-09-18";
const PRIOR = "2025-07-24";
const OLDER = "2025-04-17";
const LATER = "2025-10-30";
const clone = <T>(value: T): T => structuredClone(value);
const absent = () => ({ status: "unavailable", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null } as const);
const supplied = <S>(snapshot: S) => ({ status: "supplied", snapshot } as const);
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

function ecb(date = TARGET, capture = TARGET_CAPTURE, options: {
  context?: "rates" | "document" | "schedule"; anchor?: string; level?: number;
} = {}) {
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.anchor ?? date, schedule: { meetingDate: date, fetchedAt: capture },
    decision: options.context === "schedule" ? null : {
      decisionDate: date,
      documentUrl: `https://www.ecb.europa.eu/press/pr/date/${date.slice(0, 4)}/html/ecb.mp${date.replaceAll("-", "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt: capture, firstObservedAt: capture, actualReleasedAt: null,
      rates: options.context === "document" ? null : { depositFacility: options.level ?? 2.5,
        mainRefinancingOperations: 2.65, marginalLendingFacility: 2.9, effectiveDate: shiftDate(date, 6) },
    },
  }));
}
function memory(...snapshots: EcbMonetaryPolicyEventSnapshotV1[]) {
  let result = advanceEcbMonetaryPolicyEventMemoryV1(null, snapshots[0]!.event).memory;
  for (const snapshot of snapshots.slice(1)) {
    const next = advanceEcbMonetaryPolicyEventMemoryV1(result, snapshot.event);
    if (next.status !== "advanced" && next.status !== "unchanged") throw new Error("Invalid synthetic revision sequence.");
    result = next.memory;
  }
  return result;
}
function fomc(date = TARGET, capture = TARGET_CAPTURE, lower = 4.25) {
  return buildCanonicalStatisticalSeriesSnapshotV1(buildUsPolicyCanonicalSeriesV1(`fomc:${date}`, [{
    decisionDate: date, targetLower: lower, targetUpper: lower + 0.25, unit: "percent", action: "maintain",
    statementUrl: fomcDocumentUrlV1(date), implementationNoteUrl: fomcDocumentUrlV1(date, true),
    effectiveDate: shiftDate(date, 1), releaseTimestamp: null,
  }], capture));
}
function boj(date = TARGET, capture = TARGET_CAPTURE, value = 0.5, range = false): BojPolicyEvidenceSnapshotV1 {
  const evidence = buildBojPolicyEvidenceV1({ institution: "Bank of Japan", productId: "eurjpy",
    instrument: BOJ_POLICY_INSTRUMENT_V1, decisionDate: date,
    documentKind: date === "2024-03-19" ? "framework-transition" : "guideline-change",
    target: range ? { shape: "range", lower: 0, upper: 0.1, qualification: "around" }
      : { shape: "scalar", value, qualification: "around" }, unit: "percent",
    sourceUrl: bojPolicyDocumentUrlV1(date), releaseTimestamp: null, effectiveDate: shiftDate(date, 1),
  }, capture);
  return { schemaVersion: "boj-policy-evidence-snapshot-v1", evidence,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: capture };
}
function boe(date = TARGET, capture = TARGET_CAPTURE, rate = 4.25, options: {
  meetingEndDate?: string; release?: boolean;
} = {}): BoeBankRateEvidenceSnapshotV1 {
  const evidence = buildBoeBankRateEvidenceV1({ institution: "Bank of England", committee: "Monetary Policy Committee",
    productId: "eurgbp", instrument: "Bank Rate", documentId: `monetary-policy-summary-and-minutes:${date.slice(0, 7)}`,
    meetingEndDate: options.meetingEndDate ?? shiftDate(date, -1), publicationDate: date,
    decision: { action: "reduce", rate, changePercentagePoints: 0.25 }, unit: "percent",
    sourceUrl: boeBankRateDocumentUrlV1(date), effectiveDate: null,
    releaseTimestamp: options.release ? boeLondonReleaseTimestampV1(date, "12:02", "BST") : null,
    releaseEvidence: options.release ? { sourceUrl: BOE_MAY_2025_RELEASE_NOTICE_URL_V1,
      documentTitle: BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1, publicationDate: "2025-05-06", localTime: "12:02", timezone: "BST" } : null,
  }, capture);
  return { schemaVersion: "boe-bank-rate-evidence-snapshot-v1", evidence,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: capture };
}
function snb(date = TARGET, capture = TARGET_CAPTURE, rate = 0): SnbPolicyEvidenceSnapshotV1 {
  const sourceUrl = snbPolicyDocumentUrlV1(date);
  const evidence = buildSnbPolicyEvidenceV1({ institution: "Swiss National Bank", decisionBody: "Governing Board",
    productId: "eurchf", instrument: "SNB policy rate", documentId: sourceUrl.slice(sourceUrl.lastIndexOf("/") + 1),
    documentTitle: `Monetary policy assessment of ${Number(date.slice(8))} ${new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))} ${date.slice(0, 4)}`,
    decisionDate: date, publicationDate: date, decision: { action: "reduce", rate, changePercentagePoints: 0.25 },
    unit: "percent", sourceUrl, releaseTimestamp: null, effectiveDate: shiftDate(date, 1),
  }, capture);
  return { schemaVersion: "snb-policy-evidence-snapshot-v1", evidence,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: capture };
}
type RightSnapshot = ReturnType<typeof fomc | typeof boj | typeof boe | typeof snb>;
function rightSnapshot(product: Product, date = PRIOR, capture = CUTOFF, variant = 0): RightSnapshot {
  switch (product) {
    case "eurusd": return fomc(date, capture, 4.25 + variant * 0.25);
    case "eurjpy": return boj(date, capture, 0.5 + variant * 0.25);
    case "eurgbp": return boe(date, capture, 4.25 + variant * 0.25);
    case "eurchf": return snb(date, capture, variant * 0.25);
  }
}
// Product-specific casts keep fixture construction compact; production discriminants are tested below.
function rightHistory(product: Product, entries: readonly { date: string; snapshots: readonly RightSnapshot[] }[]): PolicyEventPriorHistoryV1 {
  switch (product) {
    case "eurusd": return { institution: "FOMC", histories: entries.map((e) => ({ decisionDate: e.date, snapshots: e.snapshots as readonly CanonicalStatisticalSeriesSnapshotV1[] })) };
    case "eurjpy": return { institution: "BoJ", histories: entries.map((e) => ({ decisionDate: e.date, snapshots: e.snapshots as readonly BojPolicyEvidenceSnapshotV1[] })) };
    case "eurgbp": return { institution: "BoE", histories: entries.map((e) => ({ publicationDate: e.date, snapshots: e.snapshots as readonly BoeBankRateEvidenceSnapshotV1[] })) };
    case "eurchf": return { institution: "SNB", histories: entries.map((e) => ({ decisionDate: e.date, snapshots: e.snapshots as readonly SnbPolicyEvidenceSnapshotV1[] })) };
  }
}
function policyInput(productId: Product = "eurusd"): BuildBilateralPolicyStateInputV1 {
  const base = { evaluatedAt: AT, expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(TARGET), euro: supplied(ecb()) };
  switch (productId) {
    case "eurusd": return { ...base, productId, counterparty: { decisionDate: TARGET, evidence: supplied(fomc()) } };
    case "eurjpy": return { ...base, productId, counterparty: { decisionDate: TARGET, evidence: supplied(boj()) } };
    case "eurgbp": return { ...base, productId, counterparty: { publicationDate: TARGET, evidence: supplied(boe()) } };
    case "eurchf": return { ...base, productId, counterparty: { decisionDate: TARGET, evidence: supplied(snb()) } };
  }
}
function request(product: Product = "eurusd", focusSide: "left" | "right" = "right"): SelectPolicyEventPriorInputV1 {
  return { readinessInput: { policyInput: policyInput(product), focusSide }, knowledgeCutoff: CUTOFF,
    history: focusSide === "left" ? { institution: "ECB", memories: [memory(ecb(PRIOR, CUTOFF))] }
      : rightHistory(product, [{ date: PRIOR, snapshots: [rightSnapshot(product)] }]) };
}
const select = (input = request()) => selectPolicyEventPriorAsKnownAtV1(input);
function reject(input: unknown) { assert.throws(() => selectPolicyEventPriorAsKnownAtV1(input as SelectPolicyEventPriorInputV1)); }
function available(result: PolicyEventPriorSelectionV1) {
  assert.equal(result.prior.status, "available");
  if (result.prior.status !== "available") throw new Error("Expected prior.");
  return result.prior;
}
function unavailable(result: PolicyEventPriorSelectionV1, reason: string) {
  assert.equal(result.prior.status, "unavailable");
  if (result.prior.status !== "unavailable") throw new Error("Expected unavailable prior.");
  assert.equal(result.prior.reason, reason);
  if (reason !== "TARGET_CONTEXT_UNAVAILABLE") assert.deepEqual(result.prior, { status: "unavailable", reason });
}
function eachObject(value: unknown, check: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  check(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), check);
}

for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
  test(`${product} ${side} admits only its rebuilt focused target`, () => {
    const candidate = request(product, side);
    const readiness = buildBilateralPolicyEventReadinessV1(candidate.readinessInput);
    const result = select(candidate);
    const prior = available(result);
    assert.equal(result.productId, product);
    assert.equal(result.focusSide, side);
    assert.equal(result.institution, candidate.history.institution);
    assert.equal(prior.institution, result.institution);
    assert.deepEqual(result.target?.canonicalReference, readiness.focus.admittedCanonicalReference);
    assert.equal(result.target?.knownAt, TARGET_CAPTURE);
    assert.equal(result.target?.selectionDate, TARGET);
    assert.equal(prior.selectionDate, PRIOR);
    assert.equal(prior.knownAt, CUTOFF);
    assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
    assert.equal(result.coverage, "provided-history-only");
    assert.equal(result.selectionBasis, "last-earlier-supplied-announcement");
  });
}
test("closed root shape and output vocabulary", () => {
  assert.deepEqual(Object.keys(select()), ["schemaVersion", "semantic", "feature", "productId", "focusSide", "institution",
    "evaluatedAt", "knowledgeCutoff", "coverage", "selectionBasis", "target", "prior", "evidenceKnownAt"]);
  assert.equal(select().schemaVersion, "policy-event-prior-selection-v1");
  assert.equal(select().semantic, "derived-feature");
  assert.equal(select().feature, "policy-event-prior-selection");
  for (const value of [null, undefined, [], {}, { ...request(), readinessInput: select() }]) reject(value);
});
test("reject extra enumerable, hidden and symbol root fields", () => {
  for (const key of ["delta", "evaluatedAt", "knownAt", "readiness", Symbol("injection")]) {
    for (const enumerable of [true, false]) {
      const input = request();
      Object.defineProperty(input, key, { value: true, enumerable });
      reject(input);
    }
  }
});
test("reject estr, unknown products and wrong-provider histories", () => {
  for (const productId of ["estr", "gold", "gbpusd", "toString"]) reject({ ...request(),
    readinessInput: { ...request().readinessInput, policyInput: { ...policyInput(), productId } } });
  const histories = [request("eurusd", "left").history, ...PRODUCTS.map((p) => request(p).history)];
  for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
    const candidate = request(product, side);
    for (const history of histories) if (history.institution !== candidate.history.institution) reject({ ...candidate, history });
  }
});
test("cutoff is an explicit safe integer and cannot follow canonical evaluation", () => {
  for (const knowledgeCutoff of [undefined, null, "1", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, unix(AT) + 1])
    reject({ ...request(), knowledgeCutoff });
  unavailable(select({ ...request(), knowledgeCutoff: 0 }), "INSUFFICIENT_HISTORY");
  const input = request();
  Reflect.set(input.readinessInput.policyInput, "evaluatedAt", "2026-10-05T09:59:59.999Z");
  reject({ ...input, knowledgeCutoff: unix(AT) });
  Reflect.set(input.readinessInput.policyInput, "evaluatedAt", "2026-10-05T13:00:00+03:00");
  assert.deepEqual(select(input), select());
});
test("history containers and entries reject detached fields and malformed revisions", () => {
  for (const history of [null, [], {}, { ...request().history, extra: true }, { institution: "FOMC", histories: null }]) reject({ ...request(), history });
  for (const key of ["hidden", Symbol("hidden")]) {
    const input = request(); Object.defineProperty(input.history, key, { value: true }); reject(input);
  }
  for (const entry of [{}, { decisionDate: PRIOR, snapshots: [] }, { decisionDate: "2025-02-30", snapshots: [fomc(PRIOR, CUTOFF)] },
    { decisionDate: PRIOR, snapshots: null }, { decisionDate: PRIOR, snapshots: [null] }, { decisionDate: PRIOR, snapshots: [fomc(PRIOR, CUTOFF)], extra: true }])
    reject({ ...request(), history: { institution: "FOMC", histories: [entry] } });
  for (const key of ["hidden", Symbol("hidden")]) {
    const entry = { decisionDate: PRIOR, snapshots: [fomc(PRIOR, CUTOFF)] };
    Object.defineProperty(entry, key, { value: true });
    reject({ ...request(), history: { institution: "FOMC", histories: [entry] } });
  }
});

for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
  test(`${product} ${side} unavailable/future focus cannot borrow opposite facts or request identity`, () => {
    for (const future of [false, true]) {
      const input = clone(request(product, side));
      const policy = input.readinessInput.policyInput;
      if (side === "left") Reflect.set(policy, "euro", future ? supplied(ecb(TARGET, unix(AT) + 1)) : absent());
      else Reflect.set(policy.counterparty, "evidence", future ? supplied(rightSnapshot(product, TARGET, unix(AT) + 1)) : absent());
      const result = select(input);
      unavailable(result, "TARGET_CONTEXT_UNAVAILABLE");
      assert.equal(result.target, null);
      assert.equal(result.evidenceKnownAt, null);
      assert.deepEqual(result.prior, { status: "unavailable", reason: "TARGET_CONTEXT_UNAVAILABLE",
        targetReason: future ? "KNOWLEDGE_INCONSISTENT" : "NO_CAPTURED_EVIDENCE", upstreamReason: null });
      assert.doesNotMatch(JSON.stringify(result), /canonicalEventId|canonicalSeriesId|sourceVersionId|knownAt|2025-/);
    }
  });
}
test("unavailable target preserves admitted diagnostic and never inspects candidate evidence", () => {
  const input = request();
  Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", { status: "unavailable",
    reason: "PERSISTENCE_UNAVAILABLE", upstreamReason: "capture-read-failed" });
  if (input.history.institution !== "FOMC") throw new Error("Expected FOMC");
  Object.defineProperty(input.history.histories[0]!, "snapshots", { get() { throw new Error("No target must not inspect history"); } });
  assert.deepEqual(select(input).prior, { status: "unavailable", reason: "TARGET_CONTEXT_UNAVAILABLE",
    targetReason: "PERSISTENCE_UNAVAILABLE", upstreamReason: "capture-read-failed" });
});
test("canonical target mismatch and derived readiness injection cannot manufacture identity", () => {
  const input = request();
  Reflect.set(input.readinessInput.policyInput.counterparty, "decisionDate", PRIOR); reject(input);
  const left = request("eurusd", "left");
  Reflect.set(left.readinessInput.policyInput, "expectedEcbCanonicalEventId", ecbMonetaryPolicyCanonicalEventIdV1(PRIOR)); reject(left);
  reject({ ...request(), readinessInput: buildBilateralPolicyEventReadinessV1(request().readinessInput) });
});

for (const product of PRODUCTS) {
  test(`${product} only earlier as-known announcements are eligible`, () => {
    const input = request(product);
    for (const entries of [[], ...[TARGET, LATER].map((date) => [{ date, snapshots: [rightSnapshot(product, date)] }])])
      unavailable(select({ ...input, history: rightHistory(product, entries) }), "INSUFFICIENT_HISTORY");
    const entries = [TARGET, LATER, PRIOR].map((date) => ({ date, snapshots: [rightSnapshot(product, date)] }));
    assert.equal(available(select({ ...input, history: rightHistory(product, entries) })).selectionDate, PRIOR);
  });
  test(`${product} exact cutoff and later target capture remain independent`, () => {
    const input = request(product);
    for (const offset of [-1, 0, 1]) {
      const snapshot = rightSnapshot(product, PRIOR, CUTOFF + offset);
      const result = select({ ...input, history: rightHistory(product, [{ date: PRIOR, snapshots: [snapshot] }]) });
      if (offset > 0) unavailable(result, "INSUFFICIENT_HISTORY");
      else assert.equal(available(result).knownAt, CUTOFF + offset);
      assert.equal(result.target?.knownAt, TARGET_CAPTURE);
    }
  });
  test(`${product} selects revisions before ranking and suppresses future correction evidence`, () => {
    const input = request(product);
    const original = rightSnapshot(product, PRIOR, CUTOFF - 10);
    const correction = rightSnapshot(product, PRIOR, CUTOFF + 1, 1);
    const entries = [{ date: PRIOR, snapshots: [correction, original] }];
    const earlier = select({ ...input, history: rightHistory(product, [{ date: PRIOR, snapshots: [original] }]) });
    const withFuture = select({ ...input, history: rightHistory(product, entries) });
    assert.deepEqual(withFuture, earlier);
    assert.equal(JSON.stringify(withFuture).includes(correction.sourceVersionId), false);
    assert.equal(available(select({ ...input, knowledgeCutoff: CUTOFF + 1, history: rightHistory(product, entries) })).sourceVersionId,
      correction.sourceVersionId);
    assert.deepEqual(select({ ...input, history: rightHistory(product, [{ date: PRIOR, snapshots: [correction] }]) }).prior,
      select({ ...input, history: rightHistory(product, []) }).prior);
    eachObject(withFuture, (object) => {
      for (const key of ["candidateCount", "candidates", "histories", "rejected", "inventory"]) assert.equal(Object.hasOwn(object, key), false);
    });
  });
  test(`${product} announcement date outranks capture time across all permutations`, () => {
    const old = { date: OLDER, snapshots: [rightSnapshot(product, OLDER, CUTOFF, 1)] };
    const next = { date: PRIOR, snapshots: [rightSnapshot(product, PRIOR, CUTOFF - 100)] };
    const futureKnown = { date: "2025-08-21", snapshots: [rightSnapshot(product, "2025-08-21", CUTOFF + 1)] };
    const permutations = [[old, next, futureKnown], [old, futureKnown, next], [next, old, futureKnown],
      [next, futureKnown, old], [futureKnown, old, next], [futureKnown, next, old]];
    const expected = select({ ...request(product), history: rightHistory(product, permutations[0]!) });
    assert.equal(available(expected).selectionDate, PRIOR);
    assert.equal(available(expected).knownAt, CUTOFF - 100);
    for (const entries of permutations) assert.deepEqual(select({ ...request(product), history: rightHistory(product, entries) }), expected);
  });
  test(`${product} revision order and identical duplicate histories are harmless`, () => {
    const original = rightSnapshot(product, PRIOR, CUTOFF - 10);
    const correction = rightSnapshot(product, PRIOR, CUTOFF, 1);
    const entries = [{ date: PRIOR, snapshots: [original, correction] }];
    const expected = select({ ...request(product), history: rightHistory(product, entries) });
    for (const snapshots of [[correction, original], [original, correction, correction], [correction, original, original]]) {
      const entry = { date: PRIOR, snapshots };
      assert.deepEqual(select({ ...request(product), history: rightHistory(product, [entry, clone(entry)]) }), expected);
    }
  });
  test(`${product} conflicting as-of branches and same-capture conflicts are order-independent`, () => {
    const original = rightSnapshot(product, PRIOR, CUTOFF - 10);
    const correction = rightSnapshot(product, PRIOR, CUTOFF, 1);
    const branches = [{ date: PRIOR, snapshots: [original] }, { date: PRIOR, snapshots: [correction] }];
    for (const entries of [branches, [...branches].reverse()]) unavailable(select({ ...request(product),
      history: rightHistory(product, entries) }), "AMBIGUOUS_PRIOR_STATE");
    for (const capture of [CUTOFF, CUTOFF + 1]) {
      const variants = [rightSnapshot(product, PRIOR, capture), rightSnapshot(product, PRIOR, capture, 1)];
      for (const snapshots of [variants, [...variants].reverse()]) {
        const result = select({ ...request(product), history: rightHistory(product, [{ date: PRIOR, snapshots: [original, ...snapshots] }]) });
        if (capture <= CUTOFF) unavailable(result, "AMBIGUOUS_PRIOR_STATE");
        else assert.deepEqual(result, select({ ...request(product), history: rightHistory(product, [{ date: PRIOR, snapshots: [original] }]) }));
      }
    }
  });
  test(`${product} future branch differences cannot create historical ambiguity`, () => {
    const original = rightSnapshot(product, PRIOR, CUTOFF - 10);
    const branch1 = { date: PRIOR, snapshots: [original, rightSnapshot(product, PRIOR, CUTOFF + 1, 1)] };
    const branch2 = { date: PRIOR, snapshots: [original, rightSnapshot(product, PRIOR, CUTOFF + 1, 2)] };
    assert.deepEqual(select({ ...request(product), history: rightHistory(product, [branch1, branch2]) }),
      select({ ...request(product), history: rightHistory(product, [{ date: PRIOR, snapshots: [original] }]) }));
  });
}

test("ECB delegates genuine prior result including schedule binding and three instruments", () => {
  const input = request("eurusd", "left");
  if (input.history.institution !== "ECB") throw new Error("Expected ECB history");
  const direct = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({ memories: input.history.memories,
    target: ecb().event, knowledgeCutoff: CUTOFF, evaluatedAt: AT });
  if (direct.status !== "available") throw new Error("Expected direct prior");
  const prior = available(select(input));
  if (prior.institution !== "ECB") throw new Error("Expected ECB prior");
  assert.deepEqual(prior.snapshot, direct.selectedSnapshot);
  assert.deepEqual(prior.targetBinding, direct.targetSnapshot);
  assert.deepEqual(prior.policySetting, direct.announcement.value.rates);
  assert.deepEqual(prior.provenance, direct.announcement.provenance);
  assert.deepEqual(prior.policySetting, { depositFacility: 2.5, mainRefinancingOperations: 2.65,
    marginalLendingFacility: 2.9, unit: "percent", effectiveDate: shiftDate(PRIOR, 6) });
});
test("ECB empty, target-only and equal/later histories preserve existing eligibility", () => {
  for (const memories of [[], [memory(ecb(TARGET, CUTOFF))], [memory(ecb(LATER, CUTOFF))]])
    unavailable(select({ ...request("eurusd", "left"), history: { institution: "ECB", memories } }), "INSUFFICIENT_HISTORY");
});
test("ECB inclusive knowledge, later target capture and correction cutoffs", () => {
  const original = ecb(PRIOR, CUTOFF - 10);
  const correction = ecb(PRIOR, CUTOFF + 1, { level: 3 });
  const histories = { institution: "ECB", memories: [memory(original, correction)] } as const;
  const input = request("eurusd", "left");
  assert.deepEqual(select({ ...input, history: histories }), select({ ...input, history: { institution: "ECB", memories: [memory(original)] } }));
  assert.equal(available(select({ ...input, knowledgeCutoff: CUTOFF + 1, history: histories })).sourceVersionId, correction.eventSourceVersionId);
  assert.equal(available(select(input)).knownAt, CUTOFF);
  unavailable(select({ ...input, history: { institution: "ECB", memories: [memory(correction)] } }), "INSUFFICIENT_HISTORY");
});
test("ECB schedule-only target and rescheduling preserve stable event identity", () => {
  const input = request("eurusd", "left");
  const rescheduled = ecb("2025-09-25", TARGET_CAPTURE, { context: "schedule", anchor: TARGET });
  Reflect.set(input.readinessInput.policyInput, "euro", supplied(rescheduled));
  const intervening = memory(ecb("2025-09-19", CUTOFF));
  const self = memory(ecb(TARGET, CUTOFF));
  const result = select({ ...input, history: { institution: "ECB", memories: [self, intervening] } });
  const prior = available(result);
  assert.equal(prior.selectionDate, "2025-09-19");
  assert.equal(result.target?.selectionDate, "2025-09-25");
  assert.equal(result.target?.canonicalReference.kind, "ecb-event");
  if (result.target?.canonicalReference.kind !== "ecb-event" || prior.institution !== "ECB") throw new Error("Expected ECB");
  assert.equal(result.target.canonicalReference.canonicalEventId, ecbMonetaryPolicyCanonicalEventIdV1(TARGET));
  assert.equal(prior.targetBinding.event.canonicalMeetingDate, TARGET);
  assert.equal(prior.targetBinding.event.decision, null);
});
test("ECB incomplete immediate prior blocks older-complete fallback; ambiguity and invalid history remain exact", () => {
  const input = request("eurusd", "left");
  const older = memory(ecb(OLDER, CUTOFF - 10));
  const incomplete = memory(ecb(PRIOR, CUTOFF, { context: "document" }));
  unavailable(select({ ...input, history: { institution: "ECB", memories: [older, incomplete] } }), "EVENT_DATA_INCOMPLETE");
  const complete = memory(ecb(PRIOR, CUTOFF));
  const conflicting = memory(ecb(PRIOR, CUTOFF, { level: 3 }));
  for (const memories of [[complete, conflicting], [conflicting, complete]])
    unavailable(select({ ...input, history: { institution: "ECB", memories } }), "AMBIGUOUS_PRIOR_STATE");
  const bad = clone(complete); Reflect.set(bad.snapshots[0]!, "knownAt", 0);
  unavailable(select({ ...input, history: { institution: "ECB", memories: [bad] } }), "INVALID_HISTORY");
});
test("ECB later correction of old announcement cannot outrank newer decision; duplicate/order parity", () => {
  const older = memory(ecb(OLDER, CUTOFF, { level: 3 }));
  const later = memory(ecb(PRIOR, CUTOFF - 10));
  const expected = select({ ...request("eurusd", "left"), history: { institution: "ECB", memories: [older, later] } });
  assert.equal(available(expected).selectionDate, PRIOR);
  for (const memories of [[later, older], [older, later, clone(later)]])
    assert.deepEqual(select({ ...request("eurusd", "left"), history: { institution: "ECB", memories } }), expected);
});

test("FOMC preserves both range bounds, action, annotation and provenance", () => {
  const original = fomc(PRIOR, CUTOFF);
  const prior = available(select());
  if (prior.institution !== "FOMC") throw new Error("Expected FOMC");
  assert.equal(prior.policySetting.targetLower, 4.25);
  assert.equal(prior.policySetting.targetUpper, 4.5);
  assert.equal(prior.policySetting.action, "maintain");
  assert.equal(prior.selectionDateKind, "decision-date");
  assert.deepEqual(prior.snapshot, original);
  assert.deepEqual(prior.provenance, original.series.metadata);
  assert.equal(prior.snapshot.series.observations[0]!.officialStatus, original.series.observations[0]!.officialStatus);
  assert.equal(Object.hasOwn(prior.policySetting, "value"), false);
  assert.equal(Object.hasOwn(prior.policySetting, "midpoint"), false);
});
test("EFFR and a numeric carrier without canonical FOMC annotation cannot substitute", () => {
  const effr = buildCanonicalStatisticalSeriesSnapshotV1(buildUsPolicyCanonicalSeriesV1("effr", [{
    observationDate: PRIOR, rate: 4.33, unit: "percent", volumeInBillions: null,
    volumeUnit: "billions of U.S. dollars", targetLower: null, targetUpper: null, footnoteId: null, revisionIndicator: null,
  }], CUTOFF));
  reject({ ...request(), history: { institution: "FOMC", histories: [{ decisionDate: PRIOR, snapshots: [effr] }] } });
  const bare = clone(fomc(PRIOR, CUTOFF)); Reflect.deleteProperty(bare.series.observations[0]!, "officialStatus");
  reject({ ...request(), history: { institution: "FOMC", histories: [{ decisionDate: PRIOR, snapshots: [bare] }] } });
});
test("BoJ retains scalar and qualified range without a midpoint or action", () => {
  const scalar = available(select(request("eurjpy")));
  if (scalar.institution !== "BoJ") throw new Error("Expected BoJ");
  assert.deepEqual(scalar.policySetting.target, { shape: "scalar", value: 0.5, qualification: "around" });
  const range = boj("2024-03-19", CUTOFF, 0, true);
  const prior = available(select({ ...request("eurjpy"), history: { institution: "BoJ", histories: [{ decisionDate: "2024-03-19", snapshots: [range] }] } }));
  if (prior.institution !== "BoJ") throw new Error("Expected BoJ");
  assert.deepEqual(prior.policySetting.target, { shape: "range", lower: 0, upper: 0.1, qualification: "around" });
  assert.deepEqual(prior.snapshot, range);
  assert.equal(Object.hasOwn(prior.policySetting, "action"), false);
  assert.equal(Object.hasOwn(prior.policySetting.target, "midpoint"), false);
});
test("BoE orders publication dates even when meeting-end order differs; retains timing proof", () => {
  const early = boe("2025-05-08", CUTOFF, 4.25, { release: true });
  const late = boe(PRIOR, CUTOFF - 10, 4, { meetingEndDate: "2025-04-01" });
  const input = request("eurgbp");
  const prior = available(select({ ...input, history: { institution: "BoE", histories: [
    { publicationDate: "2025-05-08", snapshots: [early] }, { publicationDate: PRIOR, snapshots: [late] },
  ] } }));
  assert.equal(prior.selectionDate, PRIOR);
  const withProof = available(select({ ...input, history: { institution: "BoE", histories: [{ publicationDate: "2025-05-08", snapshots: [early] }] } }));
  if (withProof.institution !== "BoE") throw new Error("Expected BoE");
  assert.equal(withProof.selectionDateKind, "publication-date");
  assert.equal(withProof.policySetting.meetingEndDate, "2025-05-07");
  assert.equal(withProof.policySetting.publicationDate, "2025-05-08");
  assert.equal(withProof.policySetting.releaseTimestamp, unix("2025-05-08T11:02:00Z"));
  assert.equal(withProof.policySetting.effectiveDate, null);
  assert.deepEqual(withProof.policySetting.decision, { action: "reduce", rate: 4.25, changePercentagePoints: 0.25 });
  assert.deepEqual(withProof.snapshot, early);
  assert.equal(withProof.policySetting.releaseEvidence?.sourceUrl, BOE_MAY_2025_RELEASE_NOTICE_URL_V1);
});
test("BoE conflicting monthly dates cannot resolve by order or manufacture a prior from target document", () => {
  const a = { publicationDate: "2025-07-24", snapshots: [boe("2025-07-24", CUTOFF)] };
  const b = { publicationDate: "2025-07-25", snapshots: [boe("2025-07-25", CUTOFF)] };
  for (const histories of [[a, b], [b, a]]) unavailable(select({ ...request("eurgbp"),
    history: { institution: "BoE", histories } }), "AMBIGUOUS_PRIOR_STATE");
  unavailable(select({ ...request("eurgbp"), history: { institution: "BoE", histories: [
    { publicationDate: "2025-09-17", snapshots: [boe("2025-09-17", CUTOFF)] },
  ] } }), "AMBIGUOUS_PRIOR_STATE");
  const future = { publicationDate: "2025-07-25", snapshots: [boe("2025-07-25", CUTOFF + 1)] };
  assert.deepEqual(select({ ...request("eurgbp"), history: { institution: "BoE", histories: [a, future] } }),
    select({ ...request("eurgbp"), history: { institution: "BoE", histories: [a] } }));
});
test("SNB positive, zero and negative scalar facts preserve separate timing and source change", () => {
  for (const rate of [0.5, 0, -0.75]) {
    const snapshot = snb(PRIOR, CUTOFF, rate);
    const prior = available(select({ ...request("eurchf"), history: { institution: "SNB", histories: [{ decisionDate: PRIOR, snapshots: [snapshot] }] } }));
    if (prior.institution !== "SNB") throw new Error("Expected SNB");
    assert.equal(prior.policySetting.decision.rate, rate);
    assert.equal(prior.policySetting.decision.action, "reduce");
    assert.equal(prior.policySetting.decision.changePercentagePoints, 0.25);
    assert.equal(prior.policySetting.decisionDate, PRIOR);
    assert.equal(prior.policySetting.publicationDate, PRIOR);
    assert.equal(prior.policySetting.effectiveDate, shiftDate(PRIOR, 1));
    assert.equal(prior.policySetting.releaseTimestamp, null);
    assert.deepEqual(prior.snapshot, snapshot);
  }
});

for (const product of PRODUCTS) {
  test(`${product} canonical history tampering and incomplete later facts fail without stale fallback`, () => {
    for (const field of ["sourceVersionId", "canonicalSeriesId", "knownAt"]) {
      const snapshot = clone(rightSnapshot(product)); Reflect.set(snapshot, field, field === "knownAt" ? 0 : "forged");
      reject({ ...request(product), history: rightHistory(product, [{ date: PRIOR, snapshots: [snapshot] }]) });
    }
    const bad = clone(rightSnapshot(product));
    const metadata = "series" in bad ? bad.series.metadata : bad.evidence.metadata;
    Reflect.set(metadata, "sourceUrl", "https://example.com/forged");
    reject({ ...request(product), history: rightHistory(product, [{ date: PRIOR, snapshots: [bad] }]) });
    const incomplete = clone(rightSnapshot(product));
    if ("series" in incomplete) Reflect.deleteProperty(incomplete.series.observations[0]!, "officialStatus");
    else Reflect.deleteProperty(incomplete.evidence.fact, "target" in incomplete.evidence.fact ? "target" : "decision");
    const older = { date: OLDER, snapshots: [rightSnapshot(product, OLDER, CUTOFF - 10)] };
    reject({ ...request(product), history: rightHistory(product, [older, { date: PRIOR, snapshots: [incomplete] }]) });
    for (const key of ["hidden", Symbol("injection")]) {
      const hidden = clone(rightSnapshot(product)); Object.defineProperty(hidden, key, { value: true });
      reject({ ...request(product), history: rightHistory(product, [{ date: PRIOR, snapshots: [hidden] }]) });
    }
  });
}
test("BoJ unsupported regime and Swiss substitute instruments reject through source contracts", () => {
  const unsupported = clone(boj(PRIOR, CUTOFF)); Reflect.set(unsupported.evidence.fact, "decisionDate", "2024-03-18");
  reject({ ...request("eurjpy"), history: { institution: "BoJ", histories: [{ decisionDate: "2024-03-18", snapshots: [unsupported] }] } });
  for (const instrument of ["SARON", "deposit-remuneration", "three-month-CHF-Libor"]) {
    const snapshot = clone(snb(PRIOR, CUTOFF)); Reflect.set(snapshot.evidence.fact, "instrument", instrument);
    reject({ ...request("eurchf"), history: { institution: "SNB", histories: [{ decisionDate: PRIOR, snapshots: [snapshot] }] } });
  }
});
test("null release and future effectiveness neither fabricate timing nor suppress known announcement", () => {
  const snapshot = boj(PRIOR, CUTOFF);
  const evidence = buildBojPolicyEvidenceV1({ ...snapshot.evidence.fact, effectiveDate: "2027-01-01" }, CUTOFF);
  const futureEffective: BojPolicyEvidenceSnapshotV1 = { ...snapshot, evidence, sourceVersionId: evidence.metadata.sourceVersionId };
  const prior = available(select({ ...request("eurjpy"), history: { institution: "BoJ", histories: [{ decisionDate: PRIOR, snapshots: [futureEffective] }] } }));
  if (prior.institution !== "BoJ") throw new Error("Expected BoJ");
  assert.equal(prior.policySetting.releaseTimestamp, null);
  assert.equal(prior.policySetting.effectiveDate, "2027-01-01");
});
test("no analytics, lifecycle, market confirmation or latest/current coverage is manufactured", () => {
  for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
    const result = select(request(product, side));
    eachObject(result, (object) => {
      for (const key of ["delta", "policyDelta", "differential", "policyRateDifference", "midpoint", "commonMove", "surprise",
        "assessment", "direction", "confidence", "recommendation", "state", "confirmation", "latestPolicyCoverage",
        "currentPolicy", "historyComplete", "immediateOfficialPredecessor", "phase", "clock", "releaseRelativeWindowsReached", "nextReviewAt"])
        assert.equal(Object.hasOwn(object, key), false);
    });
    for (const key of ["schedule", "releaseTimestamp", "eventClock", "lifecycle", "marketReadiness"])
      assert.equal(Object.hasOwn(result, key), false);
    assert.equal(result.coverage, "provided-history-only");
    assert.equal(result.selectionBasis, "last-earlier-supplied-announcement");
  }
});
for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
  test(`${product} ${side} deterministic deep output and bidirectional mutation isolation`, () => {
    const input = clone(request(product, side)); const before = clone(input);
    const result = select(input);
    assert.deepEqual(select(input), result);
    assert.deepEqual(input, before);
    eachObject(input, (object) => assert.equal(Object.isFrozen(object), false));
    eachObject(result, (object) => assert.equal(Object.isFrozen(object), true));
    const prior = available(result);
    assert.equal(Reflect.set(prior, "knownAt", 0), false);
    assert.equal(Reflect.set(prior.policySetting, "invented", 1), false);
    assert.equal(Reflect.set(prior.provenance, "sourceUrl", "changed"), false);
    assert.deepEqual(input, before);
    Reflect.set(input, "knowledgeCutoff", 0);
    if (input.history.institution === "ECB") Reflect.set(input.history.memories[0]!.snapshots[0]!.event.decision!.rates!, "depositFacility", 99);
    else {
      const snapshot = input.history.histories[0]!.snapshots[0]!;
      const metadata = "series" in snapshot ? snapshot.series.metadata : snapshot.evidence.metadata;
      Reflect.set(metadata, "sourceUrl", "changed");
    }
    assert.deepEqual(result, select(before));
  });
}
test("unexpected accessor, Proxy and canonical dependency defects propagate by identity", () => {
  for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect")]) {
    const input = request(); Object.defineProperty(input, "readinessInput", { get() { throw defect; } });
    assert.throws(() => select(input), (error) => error === defect);
    assert.throws(() => select(new Proxy(request(), { ownKeys() { throw defect; } })), (error) => error === defect);
    for (const product of PRODUCTS) {
      const snapshot = clone(rightSnapshot(product));
      const metadata = "series" in snapshot ? snapshot.series.metadata : snapshot.evidence.metadata;
      Object.defineProperty(metadata, "fetchedAt", { get() { throw defect; } });
      assert.throws(() => select({ ...request(product), history: rightHistory(product, [{ date: PRIOR, snapshots: [snapshot] }]) }), (error) => error === defect);
    }
    const left = clone(request("eurusd", "left"));
    if (left.history.institution !== "ECB") throw new Error("Expected ECB");
    Object.defineProperty(left.history.memories[0]!.snapshots[0]!.event.schedule, "fetchedAt", { get() { throw defect; } });
    assert.throws(() => select(left), (error) => error === defect);
  }
});
test("no network, persistence, implicit clock or lifecycle execution dependency", () => {
  const beforeFetch = globalThis.fetch; const beforeNow = Date.now;
  try {
    globalThis.fetch = () => { throw new Error("Unexpected network"); };
    Date.now = () => { throw new Error("Unexpected wall clock"); };
    for (const product of PRODUCTS) for (const side of ["left", "right"] as const) available(select(request(product, side)));
  } finally { globalThis.fetch = beforeFetch; Date.now = beforeNow; }
  const source = readFileSync("src/lib/markets/events/policyEventPriorSelection.ts", "utf8");
  const file = ts.createSourceFile("policyEventPriorSelection.ts", source, ts.ScriptTarget.Latest, true);
  for (const statement of file.statements.filter(ts.isImportDeclaration)) {
    const path = (statement.moduleSpecifier as ts.StringLiteral).text;
    if (path.includes("persistence")) assert.ok(statement.importClause?.isTypeOnly);
    if (!statement.importClause?.isTypeOnly) assert.doesNotMatch(path, /runtime|Acquisition|projection|delivery|redis/i);
  }
  assert.match(source, /buildBilateralPolicyEventReadinessV1\(input\.readinessInput\)/);
  assert.match(source, /selectEcbMonetaryPolicyPriorStateAsKnownAtV1\(/);
  assert.doesNotMatch(source, /fetch\s*\(|Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|set(?:Timeout|Interval)\s*\(|readAsKnownAt\s*\(|evaluateEventLifecycleV1|deriveEventClockV1|readFileSync/);
  assert.doesNotMatch(source, /readinessInput\.policyInput/);
});
