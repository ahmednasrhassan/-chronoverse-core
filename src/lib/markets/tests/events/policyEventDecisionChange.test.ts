import { buildPolicyEventDecisionChangeV1, type PolicyEventDecisionChangeV1 } from "../../events/policyEventDecisionChange";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  selectPolicyEventPriorAsKnownAtV1, type SelectPolicyEventPriorInputV1,
  type PolicyEventPriorHistoryV1,
} from "../../events/policyEventPriorSelection";
import { buildBilateralPolicyEventReadinessV1 } from "../../events/bilateralPolicyEventReadiness";
import type { BuildBilateralPolicyStateInputV1 } from "../../events/bilateralPolicyState";
import { ecbMonetaryPolicyCanonicalEventIdV1, normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { advanceEcbMonetaryPolicyEventMemoryV1, buildEcbMonetaryPolicyEventSnapshotV1,
  type EcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";
import { buildEcbPolicyDecisionDeltaV1 } from "../../events/ecbPolicyDecisionDelta";
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
const clone = <T>(value: T): T => structuredClone(value);
const absent = () => ({ status: "unavailable", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null } as const);
const supplied = <S>(snapshot: S) => ({ status: "supplied", snapshot } as const);
const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

function ecb(date = TARGET, capture = TARGET_CAPTURE, options: {
  context?: "rates" | "document" | "schedule"; anchor?: string; level?: number; mro?: number; marginal?: number;
} = {}) {
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.anchor ?? date, schedule: { meetingDate: date, fetchedAt: capture },
    decision: options.context === "schedule" ? null : {
      decisionDate: date,
      documentUrl: `https://www.ecb.europa.eu/press/pr/date/${date.slice(0, 4)}/html/ecb.mp${date.replaceAll("-", "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt: capture, firstObservedAt: capture, actualReleasedAt: null,
      rates: options.context === "document" ? null : { depositFacility: options.level ?? 2.5,
        mainRefinancingOperations: options.mro ?? 2.65, marginalLendingFacility: options.marginal ?? 2.9, effectiveDate: shiftDate(date, 6) },
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
function fomc(date = TARGET, capture = TARGET_CAPTURE, lower = 4.25, upper = lower + 0.25) {
  return buildCanonicalStatisticalSeriesSnapshotV1(buildUsPolicyCanonicalSeriesV1(`fomc:${date}`, [{
    decisionDate: date, targetLower: lower, targetUpper: upper, unit: "percent", action: "maintain",
    statementUrl: fomcDocumentUrlV1(date), implementationNoteUrl: fomcDocumentUrlV1(date, true),
    effectiveDate: shiftDate(date, 1), releaseTimestamp: null,
  }], capture));
}
function boj(date = TARGET, capture = TARGET_CAPTURE, value = 0.5, range = false, lower = 0, upper = 0.1): BojPolicyEvidenceSnapshotV1 {
  const evidence = buildBojPolicyEvidenceV1({ institution: "Bank of Japan", productId: "eurjpy",
    instrument: BOJ_POLICY_INSTRUMENT_V1, decisionDate: date,
    documentKind: date === "2024-03-19" ? "framework-transition" : "guideline-change",
    target: range ? { shape: "range", lower, upper, qualification: "around" }
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

const build = (input = request()) => buildPolicyEventDecisionChangeV1(input);
function reject(input: unknown) { assert.throws(() => buildPolicyEventDecisionChangeV1(input as SelectPolicyEventPriorInputV1)); }
function available(result: PolicyEventDecisionChangeV1) {
  assert.equal(result.change.status, "available");
  if (result.change.status !== "available") throw new Error("Expected available change.");
  return result.change;
}
function unavailable(result: PolicyEventDecisionChangeV1, reason: string) {
  assert.equal(result.change.status, "unavailable");
  if (result.change.status !== "unavailable") throw new Error("Expected unavailable change.");
  assert.equal(result.change.reason, reason);
  return result.change;
}
function operands(product: Product, before: RightSnapshot, after: RightSnapshot, date = TARGET): SelectPolicyEventPriorInputV1 {
  const input = clone(request(product));
  const counterparty = input.readinessInput.policyInput.counterparty;
  Reflect.set(counterparty, "publicationDate" in counterparty ? "publicationDate" : "decisionDate", date);
  Reflect.set(counterparty, "evidence", supplied(after));
  Reflect.set(input, "history", rightHistory(product, [{ date: PRIOR, snapshots: [before] }]));
  return input;
}
function eachObject(value: unknown, check: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  check(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), check);
}

for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
  test(`${product} ${side}: canonical provider binding and focused evidence`, () => {
    const input = request(product, side);
    const result = build(input);
    const readiness = buildBilateralPolicyEventReadinessV1(input.readinessInput);
    available(result);
    assert.equal(result.productId, product);
    assert.equal(result.focusSide, side);
    assert.equal(result.institution, input.history.institution);
    assert.equal(result.change.institution, result.institution);
    assert.deepEqual(result.priorSelection, selectPolicyEventPriorAsKnownAtV1(input));
    assert.equal(result.targetEvidence.status, "available");
    if (result.targetEvidence.status !== "available") throw new Error("Expected target.");
    assert.deepEqual(result.targetEvidence.binding, result.priorSelection.target);
    assert.deepEqual(result.targetEvidence.binding.canonicalReference, readiness.focus.admittedCanonicalReference);
    assert.equal(result.targetEvidence.binding.selectionDate, TARGET);
    assert.equal(result.targetEvidence.binding.knownAt, TARGET_CAPTURE);
    assert.equal(result.targetEvidence.data.policySetting.semantic, "source-fact");
    assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
    assert.equal(result.coverage, "provided-history-only");
    assert.equal(result.selectionBasis, "last-earlier-supplied-announcement");
  });
  test(`${product} ${side}: missing and future target disclose no rejected evidence`, () => {
    for (const future of [false, true]) {
      const input = clone(request(product, side));
      const policy = input.readinessInput.policyInput;
      if (side === "left") Reflect.set(policy, "euro", future ? supplied(ecb(TARGET, unix(AT) + 1)) : absent());
      else Reflect.set(policy.counterparty, "evidence", future ? supplied(rightSnapshot(product, TARGET, unix(AT) + 1)) : absent());
      const result = build(input);
      const change = unavailable(result, "TARGET_CONTEXT_UNAVAILABLE");
      assert.equal(result.evidenceKnownAt, null);
      assert.equal(result.priorSelection.target, null);
      assert.deepEqual(result.targetEvidence, { status: "unavailable",
        targetReason: future ? "KNOWLEDGE_INCONSISTENT" : "NO_CAPTURED_EVIDENCE", upstreamReason: null });
      assert.equal(change.reason, "TARGET_CONTEXT_UNAVAILABLE");
      assert.deepEqual(Object.keys(result.targetEvidence), ["status", "targetReason", "upstreamReason"]);
      assert.ok(!JSON.stringify(result).includes("sourceUrl"));
    }
  });
  test(`${product} ${side}: no prior preserves exact reason without inventing knowledge`, () => {
    const input = request(product, side);
    Reflect.set(input, "history", side === "left" ? { institution: "ECB", memories: [] } : rightHistory(product, []));
    const result = build(input);
    const change = unavailable(result, side === "left" ? "ECB_DELTA_UNAVAILABLE" : "PRIOR_STATE_UNAVAILABLE");
    assert.ok("priorReason" in change);
    assert.equal(change.priorReason, "INSUFFICIENT_HISTORY");
    assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  });
  test(`${product} ${side}: opposite-side availability and facts do not affect output`, () => {
    const input = clone(request(product, side));
    const expected = build(input);
    if (side === "left") Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", absent());
    else Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, unix(AT), { level: 99 })));
    assert.deepEqual(build(input), expected);
  });
}

test("closed root rejects malformed and detached result inputs", () => {
  for (const value of [null, undefined, [], {}, build(), selectPolicyEventPriorAsKnownAtV1(request()),
    { ...request(), readinessInput: buildBilateralPolicyEventReadinessV1(request().readinessInput) }]) reject(value);
  for (const key of ["priorSelection", "policyState", "readiness", "delta", "currentRate", "previousRate", "expectedRate", "marketObservation", "lifecycleAssessment", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const input = request();
      Object.defineProperty(input, key, { value: 1, enumerable });
      reject(input);
    }
  }
});
test("four-FX scope rejects estr, unknown products, unknown and mismatched providers", () => {
  for (const productId of ["estr", "gold", "gbpusd", "toString"]) {
    const input = clone(request());
    Reflect.set(input.readinessInput.policyInput, "productId", productId);
    reject(input);
  }
  for (const institution of ["UNKNOWN", "BoJ", "ECB", "SNB", "BoE"]) reject({ ...request(), history: { institution, histories: [] } });
});
test("target unavailable preserves upstream reason", () => {
  const input = clone(request());
  Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", {
    status: "unavailable", reason: "PRIMARY_SOURCE_UNAVAILABLE", upstreamReason: "official-page-missing" });
  const change = unavailable(build(input), "TARGET_CONTEXT_UNAVAILABLE");
  assert.ok("upstreamReason" in change);
  assert.equal(change.upstreamReason, "official-page-missing");
});
test("forged target envelope fields fail canonical admission", () => {
  for (const product of PRODUCTS) for (const field of ["canonicalSeriesId", "sourceVersionId", "knownAt"]) {
    const input = clone(request(product));
    const evidence = input.readinessInput.policyInput.counterparty.evidence;
    if (evidence.status !== "supplied") throw new Error("Expected fixture.");
    Reflect.set(evidence.snapshot, field, field === "knownAt" ? CUTOFF : "forged");
    reject(input);
  }
  const input = clone(request("eurusd", "left"));
  Reflect.set(input.readinessInput.policyInput, "expectedEcbCanonicalEventId", ecbMonetaryPolicyCanonicalEventIdV1(PRIOR));
  reject(input);
});

for (const product of PRODUCTS) {
  test(`${product}: future revisions and conflicts cannot alter whole output`, () => {
    const input = request(product);
    const expected = build(input);
    const future = rightSnapshot(product, PRIOR, CUTOFF + 1, 1);
    Reflect.set(input, "history", rightHistory(product, [
      { date: PRIOR, snapshots: [future, rightSnapshot(product), future] },
      { date: PRIOR, snapshots: [rightSnapshot(product, PRIOR, CUTOFF + 2, 2)] },
    ]));
    assert.deepEqual(build(input), expected);
    Reflect.set(input, "history", rightHistory(product, [{ date: PRIOR,
      snapshots: [rightSnapshot(product), rightSnapshot(product, PRIOR, CUTOFF + 1, 3)] }]));
    assert.deepEqual(build(input), expected);
  });
  test(`${product}: eligible ambiguity has no older fallback`, () => {
    const input = request(product);
    Reflect.set(input, "history", rightHistory(product, [
      { date: OLDER, snapshots: [rightSnapshot(product, OLDER)] },
      { date: PRIOR, snapshots: [rightSnapshot(product), rightSnapshot(product, PRIOR, CUTOFF, 1)] },
    ]));
    const result = build(input);
    const change = unavailable(result, "PRIOR_STATE_UNAVAILABLE");
    assert.ok("priorReason" in change);
    assert.equal(change.priorReason, "AMBIGUOUS_PRIOR_STATE");
    assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  });
  test(`${product}: malformed selected history throws without older fallback`, () => {
    const input = request(product);
    const malformed = clone(rightSnapshot(product));
    Reflect.set(malformed, "sourceVersionId", "forged");
    Reflect.set(input, "history", rightHistory(product, [
      { date: OLDER, snapshots: [rightSnapshot(product, OLDER)] }, { date: PRIOR, snapshots: [malformed] },
    ]));
    reject(input);
  });
  test(`${product}: revisions rank within announcement, permutations and duplicates are deterministic`, () => {
    const entries = [{ date: OLDER, snapshots: [rightSnapshot(product, OLDER, CUTOFF, 1)] },
      { date: PRIOR, snapshots: [rightSnapshot(product, PRIOR, CUTOFF - 10)] }];
    const input = request(product);
    Reflect.set(input, "history", rightHistory(product, entries));
    const expected = build(input);
    assert.equal(expected.priorSelection.prior.status, "available");
    if (expected.priorSelection.prior.status !== "available") throw new Error("Expected prior.");
    assert.equal(expected.priorSelection.prior.selectionDate, PRIOR);
    Reflect.set(input, "history", rightHistory(product, [entries[1]!, entries[0]!, entries[1]!]));
    assert.deepEqual(build(input), expected);
  });
}

for (const [name, before, after, pattern] of [
  ["increase", [4, 4.25], [4.25, 4.5], "ALL_INCREASED"],
  ["decrease", [4.25, 4.5], [4, 4.25], "ALL_DECREASED"],
  ["unchanged", [4, 4.25], [4, 4.25], "ALL_UNCHANGED"],
  ["mixed signs", [4, 4.5], [4.25, 4.4], "MIXED"],
  ["changed and zero", [4, 4.5], [4.25, 4.5], "MIXED"],
] as const) test(`FOMC ${name}: independent endpoints`, () => {
  const result = build(operands("eurusd", fomc(PRIOR, CUTOFF, ...before), fomc(TARGET, TARGET_CAPTURE, ...after)));
  const change = available(result);
  assert.equal(change.institution, "FOMC");
  if (change.institution !== "FOMC") throw new Error("Expected FOMC.");
  assert.equal(change.aggregate, pattern);
  assert.equal(change.targetLower.previousRate, before[0]);
  assert.equal(change.targetLower.targetRate, after[0]);
  assert.equal(change.targetUpper.previousRate, before[1]);
  assert.equal(change.targetUpper.targetRate, after[1]);
  assert.equal(change.targetLower.deltaBasisPoints, Math.round((after[0] - before[0]) * 100));
  assert.equal(change.targetUpper.deltaBasisPoints, Math.round((after[1] - before[1]) * 100));
  assert.ok(!("midpoint" in change));
  assert.ok(!("representativeRate" in change));
  assert.ok(result.targetEvidence.status === "available" && result.targetEvidence.institution === "FOMC" &&
    result.targetEvidence.data.policySetting.availability === "available");
  assert.equal(result.targetEvidence.data.policySetting.data.action, "maintain");
});

for (const [name, before, after, direction] of [
  ["increase", 0.25, 0.5, "INCREASE"], ["decrease", 0.5, 0.25, "DECREASE"], ["unchanged", 0.5, 0.5, "UNCHANGED"],
] as const) test(`BoJ scalar ${name} preserves around`, () => {
  const result = build(operands("eurjpy", boj(PRIOR, CUTOFF, before), boj(TARGET, TARGET_CAPTURE, after)));
  const change = available(result);
  assert.ok(change.institution === "BoJ" && change.shape === "scalar");
  assert.equal(change.qualification, "around");
  assert.equal(change.nominalTarget.direction, direction);
  assert.deepEqual(Object.keys(change), ["status", "institution", "shape", "qualification", "nominalTarget"]);
});
test("BoJ range compares endpoints, including changed-plus-zero mixed", () => {
  const result = build(operands("eurjpy", boj(PRIOR, CUTOFF, 0, true, 0, 0.5), boj(TARGET, TARGET_CAPTURE, 0, true, 0.1, 0.5)));
  const change = available(result);
  assert.ok(change.institution === "BoJ" && change.shape === "range");
  assert.equal(change.lower.deltaBasisPoints, 10);
  assert.equal(change.upper.deltaBasisPoints, 0);
  assert.equal(change.aggregate, "MIXED");
  assert.equal(change.qualification, "around");
});
for (const fromRange of [false, true]) test(`BoJ ${fromRange ? "range to scalar" : "scalar to range"} retains evidence without arithmetic`, () => {
  const result = build(operands("eurjpy", boj(PRIOR, CUTOFF, 0.5, fromRange), boj(TARGET, TARGET_CAPTURE, 0.5, !fromRange)));
  assert.deepEqual(result.change, { status: "unavailable", institution: "BoJ", reason: "INCOMPATIBLE_POLICY_SHAPES",
    fromShape: fromRange ? "range" : "scalar", toShape: fromRange ? "scalar" : "range" });
  assert.equal(result.priorSelection.prior.status, "available");
  assert.equal(result.targetEvidence.status, "available");
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
});

for (const product of ["eurgbp", "eurchf"] as const) for (const [before, after, direction] of [
  [4, 4.25, "INCREASE"], [4.25, 4, "DECREASE"], [4.25, 4.25, "UNCHANGED"],
] as const) test(`${product}: scalar ${direction} ignores source-reported reduction`, () => {
  const factory = product === "eurgbp" ? boe : snb;
  const result = build(operands(product, factory(PRIOR, CUTOFF, before), factory(TARGET, TARGET_CAPTURE, after)));
  const change = available(result);
  assert.ok(change.institution === "BoE" || change.institution === "SNB");
  const component = change.institution === "BoE" ? change.bankRate : change.policyRate;
  assert.equal(component.direction, direction);
  assert.equal(component.previousRate, before);
  assert.equal(component.targetRate, after);
  assert.equal(component.deltaBasisPoints, (after - before) * 100);
  assert.ok(result.targetEvidence.status === "available" &&
    (result.targetEvidence.institution === "BoE" || result.targetEvidence.institution === "SNB") &&
    result.targetEvidence.data.policySetting.availability === "available");
  assert.equal(result.targetEvidence.data.policySetting.data.decision.action, "reduce");
  assert.equal(result.targetEvidence.data.policySetting.data.decision.changePercentagePoints, 0.25);
});
for (const [before, after, bp] of [[0.5, 0, -50], [0, -0.25, -25], [-0.25, 0.25, 50], [-0.5, -0.25, 25], [0, -0, 0]] as const) {
  test(`SNB signed ${before} -> ${after}`, () => {
    const change = available(build(operands("eurchf", snb(PRIOR, CUTOFF, before), snb(TARGET, TARGET_CAPTURE, after))));
    assert.equal(change.institution, "SNB");
    if (change.institution !== "SNB") throw new Error("Expected SNB.");
    assert.equal(change.policyRate.deltaBasisPoints, bp);
    assert.equal(change.policyRate.deltaPercentagePoints, bp / 100);
    for (const value of Object.values(change.policyRate)) assert.ok(!Object.is(value, -0));
  });
}
test("BoE publication ordering and complete timing/release proof survive", () => {
  const target = boe("2025-05-08", TARGET_CAPTURE, 4.25, { meetingEndDate: "2025-05-07", release: true });
  const input = operands("eurgbp", boe(PRIOR, CUTOFF), target, "2025-05-08");
  Reflect.set(input, "history", rightHistory("eurgbp", [{ date: "2025-04-17", snapshots: [boe("2025-04-17", CUTOFF)] }]));
  const result = build(input);
  available(result);
  assert.ok(result.targetEvidence.status === "available" && result.targetEvidence.institution === "BoE" &&
    result.targetEvidence.data.policySetting.availability === "available");
  const fact = result.targetEvidence.data.policySetting.data;
  assert.equal(result.targetEvidence.binding.selectionDateKind, "publication-date");
  assert.equal(result.targetEvidence.binding.selectionDate, "2025-05-08");
  assert.equal(fact.meetingEndDate, "2025-05-07");
  assert.equal(fact.publicationDate, "2025-05-08");
  assert.equal(fact.releaseTimestamp, boeLondonReleaseTimestampV1("2025-05-08", "12:02", "BST"));
  assert.equal(fact.releaseEvidence?.publicationDate, "2025-05-06");
  assert.equal(fact.effectiveDate, null);
});

for (const product of PRODUCTS) test(`${product}: six-decimal and fractional bp exact arithmetic`, () => {
  const factory = product === "eurusd" ? fomc : product === "eurjpy" ? boj : product === "eurgbp" ? boe : snb;
  for (const [before, after, pp, bp] of [[0.29, 0.3, 0.01, 1], [0.123456, 0.123457, 0.000001, 0.0001],
    [0.123457, 0.123456, -0.000001, -0.0001], [0.123456, 0.123456, 0, 0]] as const) {
    const change = available(build(operands(product, factory(PRIOR, CUTOFF, before), factory(TARGET, TARGET_CAPTURE, after))));
    const component = change.institution === "FOMC" ? change.targetLower
      : change.institution === "BoJ" && change.shape === "scalar" ? change.nominalTarget
        : change.institution === "BoE" ? change.bankRate : change.institution === "SNB" ? change.policyRate : null;
    assert.ok(component);
    assert.equal(component.deltaPercentagePoints, pp);
    assert.equal(component.deltaBasisPoints, bp);
    assert.ok(!Object.is(component.deltaPercentagePoints, -0));
  }
});
for (const product of PRODUCTS) test(`${product}: valid finer precision unavailable with evidence unchanged`, () => {
  const factory = product === "eurusd" ? fomc : product === "eurjpy" ? boj : product === "eurgbp" ? boe : snb;
  for (const finer of [0.1234567, 0.0000001, 0.1 + 0.2]) {
    const target = factory(TARGET, TARGET_CAPTURE, finer);
    const result = build(operands(product, factory(PRIOR, CUTOFF, 0.25), target));
    unavailable(result, "UNSUPPORTED_RATE_PRECISION");
    assert.ok(result.targetEvidence.status === "available");
    assert.deepEqual(result.targetEvidence.data.snapshot, target);
    assert.equal(result.priorSelection.prior.status, "available");
    assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  }
});

for (const [name, options, priorOptions, pattern] of [
  ["increase", { level: 2.5, mro: 2.65, marginal: 2.9 }, { level: 2.25, mro: 2.4, marginal: 2.65 }, "ALL_INCREASED"],
  ["decrease", { level: 2.25, mro: 2.4, marginal: 2.65 }, { level: 2.5, mro: 2.65, marginal: 2.9 }, "ALL_DECREASED"],
  ["unchanged", {}, {}, "ALL_UNCHANGED"], ["mixed", { level: 2.75 }, {}, "MIXED"],
] as const) test(`ECB delegated ${name} parity across three instruments`, () => {
  const input = clone(request("eurusd", "left"));
  Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, options)));
  Reflect.set(input, "history", { institution: "ECB", memories: [memory(ecb(PRIOR, CUTOFF, priorOptions))] });
  const result = build(input);
  const prior = result.priorSelection.prior;
  assert.ok(prior.status === "available" && prior.institution === "ECB");
  const delta = buildEcbPolicyDecisionDeltaV1({ current: ecb(TARGET, TARGET_CAPTURE, options).event,
    prior: { status: "available", coverage: result.coverage, knowledgeCutoff: CUTOFF, evaluatedAt: AT,
      canonicalEventId: prior.canonicalReference.canonicalEventId, eventSourceVersionId: prior.sourceVersionId,
      decisionDate: prior.selectionDate, knownAt: prior.knownAt, selectedSnapshot: prior.snapshot, targetSnapshot: prior.targetBinding,
      announcement: { value: { kind: "ecb-policy-rates", rates: prior.policySetting }, provenance: prior.provenance } }, evaluatedAt: AT });
  assert.ok(delta.status === "available");
  assert.deepEqual(result.change, { status: "available", institution: "ECB", rates: delta.rates, aggregate: delta.aggregate });
  assert.equal(delta.aggregate, pattern);
  assert.deepEqual(Object.keys(delta.rates), ["depositFacility", "mainRefinancingOperations", "marginalLendingFacility"]);
});
for (const context of ["schedule", "document"] as const) test(`ECB ${context} target preserves admitted partial context`, () => {
  const input = clone(request("eurusd", "left"));
  Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { context })));
  const result = build(input);
  const change = unavailable(result, "ECB_DELTA_UNAVAILABLE");
  assert.ok("deltaReason" in change);
  assert.equal(change.deltaReason, "CURRENT_POLICY_FACTS_UNAVAILABLE");
  assert.equal(result.targetEvidence.status, "available");
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
});
test("ECB rescheduled target keeps stable identity distinct from ordering date", () => {
  const input = clone(request("eurusd", "left"));
  Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { anchor: "2025-09-11" })));
  Reflect.set(input.readinessInput.policyInput, "expectedEcbCanonicalEventId", ecbMonetaryPolicyCanonicalEventIdV1("2025-09-11"));
  const result = build(input);
  available(result);
  assert.ok(result.targetEvidence.status === "available" && result.targetEvidence.institution === "ECB");
  assert.equal(result.targetEvidence.binding.selectionDate, TARGET);
  assert.equal(result.targetEvidence.data.snapshot.event.canonicalMeetingDate, "2025-09-11");
});
for (const [level, reason] of [[0.001, "UNSUPPORTED_RATE_PRECISION"], [Number.MAX_SAFE_INTEGER, "UNSUPPORTED_RATE_RANGE"]] as const) {
  test(`ECB preserves delegate ${reason}`, () => {
    const input = clone(request("eurusd", "left"));
    Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { level })));
    const result = build(input);
    const change = unavailable(result, "ECB_DELTA_UNAVAILABLE");
    assert.ok("deltaReason" in change);
    assert.equal(change.deltaReason, reason);
    assert.equal(result.targetEvidence.status, "available");
  });
}
test("ECB incomplete and ambiguous history preserve selector reason without fallback", () => {
  for (const ambiguous of [false, true]) {
    const input = request("eurusd", "left");
    Reflect.set(input, "history", { institution: "ECB", memories: [memory(ecb(OLDER, CUTOFF - 20)),
      memory(ecb(PRIOR, CUTOFF - 10, ambiguous ? {} : { context: "document" })),
      ...(ambiguous ? [memory(ecb(PRIOR, CUTOFF - 10, { level: 2.75 }))] : [])] });
    const result = build(input);
    const change = unavailable(result, "ECB_DELTA_UNAVAILABLE");
    assert.ok("priorReason" in change);
    assert.equal(change.priorReason, ambiguous ? "AMBIGUOUS_PRIOR_STATE" : "EVENT_DATA_INCOMPLETE");
  }
});
test("ECB valid future corrections and branches leave whole result unchanged", () => {
  const input = request("eurusd", "left");
  const expected = build(input);
  Reflect.set(input, "history", { institution: "ECB", memories: [
    memory(ecb(PRIOR, CUTOFF), ecb(PRIOR, CUTOFF + 1, { level: 2.75 })),
    memory(ecb(PRIOR, CUTOFF + 2, { level: 3 })),
  ] });
  assert.deepEqual(build(input), expected);
});

test("inclusive cutoff and subsecond evaluatedAt floor are independent boundaries", () => {
  const input = clone(request());
  Reflect.set(input.readinessInput.policyInput, "evaluatedAt", AT.replace(".000", ".999"));
  Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", supplied(fomc(TARGET, unix(AT))));
  Reflect.set(input, "knowledgeCutoff", unix(AT));
  Reflect.set(input, "history", rightHistory("eurusd", [{ date: PRIOR, snapshots: [fomc(PRIOR, unix(AT))] }]));
  available(build(input));
  Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", supplied(fomc(TARGET, unix(AT) + 1)));
  unavailable(build(input), "TARGET_CONTEXT_UNAVAILABLE");
  Reflect.set(input, "knowledgeCutoff", unix(AT) + 1);
  reject(input);
});
test("prior captured later than target sets retained evidence knowledge", () => {
  const input = clone(request());
  Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", supplied(fomc(TARGET, CUTOFF - 1)));
  assert.equal(build(input).evidenceKnownAt, CUTOFF);
});
test("history is read only by the trusted selector and never re-read by change computation", () => {
  const input = request();
  const history = input.history;
  let reads = 0;
  Object.defineProperty(input, "history", { get() {
    if (++reads > 1) throw new ReferenceError("raw history was re-read");
    return history;
  } });
  available(build(input));
  assert.equal(reads, 1);
});
test("ECB envelope forgery and provider ordering-date disagreement fail closed", () => {
  for (const field of ["canonicalEventId", "eventSourceVersionId", "knownAt"]) {
    const input = clone(request("eurusd", "left"));
    const evidence = input.readinessInput.policyInput.euro;
    assert.ok(evidence.status === "supplied");
    Reflect.set(evidence.snapshot, field, field === "knownAt" ? CUTOFF : "forged");
    reject(input);
  }
  for (const product of PRODUCTS) {
    const input = clone(request(product));
    const counterparty = input.readinessInput.policyInput.counterparty;
    Reflect.set(counterparty, "publicationDate" in counterparty ? "publicationDate" : "decisionDate", PRIOR);
    reject(input);
  }
});
test("independent target rebuild rejects changing canonical snapshot, date, product, focus and time", () => {
  const first = request().readinessInput;
  const variants = [
    { ...first, policyInput: { ...policyInput(), counterparty: { decisionDate: TARGET, evidence: supplied(fomc(TARGET, TARGET_CAPTURE, 4.5)) } } },
    { ...first, policyInput: { ...policyInput(), counterparty: { decisionDate: PRIOR, evidence: supplied(fomc(PRIOR)) } } },
    { ...first, policyInput: { ...policyInput(), counterparty: { decisionDate: TARGET, evidence: supplied(fomc(TARGET, TARGET_CAPTURE + 1)) } } },
    { ...first, policyInput: policyInput("eurjpy") },
    { ...first, focusSide: "left" },
    { ...first, policyInput: { ...policyInput(), evaluatedAt: AT.replace("10:00", "10:01") } },
  ];
  for (const second of variants) {
    let reads = 0;
    const input = request();
    Object.defineProperty(input, "readinessInput", { get: () => ++reads === 1 ? first : second });
    assert.throws(() => build(input), /contexts disagree/);
  }
});
test("ECB independently rebuilt schedule with same decision knowledge must agree", () => {
  const input = request("eurusd", "left");
  const first = input.readinessInput;
  const changed = clone(first);
  const target = ecb(TARGET, TARGET_CAPTURE);
  const recaptured = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: TARGET,
    schedule: { ...target.event.schedule, fetchedAt: TARGET_CAPTURE - 1 }, decision: target.event.decision });
  Reflect.set(changed.policyInput, "euro", supplied(buildEcbMonetaryPolicyEventSnapshotV1(recaptured)));
  let reads = 0;
  Object.defineProperty(input, "readinessInput", { get: () => ++reads === 1 ? first : changed });
  assert.throws(() => build(input), /contexts disagree/);
});
test("unsupported FOMC carrier, EFFR, BoJ regime and Swiss instrument fail validation", () => {
  const carrier = clone(request());
  const evidence = carrier.readinessInput.policyInput.counterparty.evidence;
  assert.ok(evidence.status === "supplied" && "series" in evidence.snapshot);
  Reflect.set(evidence.snapshot.series.observations[0]!, "value", 99);
  reject(carrier);
  const effr = clone(request());
  const effrEvidence = effr.readinessInput.policyInput.counterparty.evidence;
  assert.ok(effrEvidence.status === "supplied");
  Reflect.set(effrEvidence.snapshot, "canonicalSeriesId", "us-policy:effr:2025-09-18");
  reject(effr);
  assert.throws(() => boj("2024-03-18"));
  for (const [product, field, value] of [["eurjpy", "instrument", "JGB yield"], ["eurchf", "instrument", "SARON"],
    ["eurchf", "instrument", "deposit remuneration"], ["eurchf", "instrument", "Libor target"]] as const) {
    const input = clone(request(product));
    const suppliedEvidence = input.readinessInput.policyInput.counterparty.evidence;
    assert.ok(suppliedEvidence.status === "supplied" && "evidence" in suppliedEvidence.snapshot);
    Reflect.set(suppliedEvidence.snapshot.evidence.metadata, field, value);
    reject(input);
  }
});

test("output is detached, deeply frozen, caller unchanged and unfrozen with bidirectional isolation", () => {
  for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
    const input = clone(request(product, side));
    const before = clone(input);
    const callerObjects = new Set<object>();
    eachObject(input, (object) => { assert.ok(!Object.isFrozen(object)); callerObjects.add(object); });
    const result = build(input);
    const expected = clone(result);
    assert.deepEqual(input, before);
    eachObject(input, (object) => assert.ok(!Object.isFrozen(object)));
    eachObject(result, (object) => {
      assert.ok(Object.isFrozen(object));
      assert.ok(!callerObjects.has(object));
      assert.equal(Reflect.set(object, "injected", true), false);
    });
    assert.deepEqual(input, before);
    eachObject(input, (object) => Reflect.set(object, "afterBuild", true));
    assert.deepEqual(result, expected);
  }
});
test("accessor and Proxy programming defects propagate by identity at both rebuilds", () => {
  for (const defect of [new ReferenceError("sentinel"), new TypeError("sentinel")]) {
    const root = new Proxy(request(), { ownKeys() { throw defect; } });
    assert.throws(() => build(root), (error) => error === defect);
    const history = request();
    Object.defineProperty(history, "history", { get() { throw defect; } });
    assert.throws(() => build(history), (error) => error === defect);
    const input = request();
    const readiness = input.readinessInput;
    let reads = 0;
    Object.defineProperty(input, "readinessInput", { get() { if (++reads === 2) throw defect; return readiness; } });
    assert.throws(() => build(input), (error) => error === defect);
  }
});
test("output vocabulary excludes interpretations, opposite-side state and currentness", () => {
  const forbidden = new Set(["policyRateDifference", "differential", "divergence", "convergence", "hypothesis", "surprise",
    "expectation", "fxDirection", "confidence", "recommendation", "marketReaction", "lifecycleState", "latestPolicyCoverage",
    "currentPolicy", "latestPolicy", "midpoint", "representativeRate", "candidateHistory", "policyState", "freshness"]);
  for (const product of PRODUCTS) for (const side of ["left", "right"] as const) {
    const result = build(request(product, side));
    assert.deepEqual(Object.keys(result), ["schemaVersion", "semantic", "feature", "productId", "focusSide", "institution", "evaluatedAt",
      "knowledgeCutoff", "coverage", "selectionBasis", "priorSelection", "targetEvidence", "change", "evidenceKnownAt"]);
    eachObject(result, (object) => {
      for (const key of Reflect.ownKeys(object)) assert.ok(!forbidden.has(String(key)), String(key));
    });
    assert.equal(result.schemaVersion, "policy-event-decision-change-v1");
    assert.equal(result.semantic, "derived-feature");
    assert.equal(result.feature, "policy-event-decision-change");
    assert.ok(!JSON.stringify(result).includes("SOURCE_CONTRADICTION"));
  }
});
test("inactive module has no I/O, persistence, implicit clock, runtime or broad catches", () => {
  const source = readFileSync("src/lib/markets/events/policyEventDecisionChange.ts", "utf8");
  const ast = ts.createSourceFile("policyEventDecisionChange.ts", source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    assert.ok(!ts.isCatchClause(node));
    if (ts.isImportDeclaration(node)) {
      const name = (node.moduleSpecifier as ts.StringLiteral).text;
      assert.ok(!/persistence|runtime|projection|delivery|transport|acquisition|redis|database|node:fs|aws|R2/.test(name));
    }
    if (ts.isCallExpression(node)) assert.ok(!/^(fetch|setTimeout|setInterval|Date\.now)$/.test(node.expression.getText(ast)));
    if (ts.isNewExpression(node) && node.expression.getText(ast) === "Date") assert.ok(node.arguments && node.arguments.length > 0);
    if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), "process.env");
    ts.forEachChild(node, visit);
  }
  visit(ast);
});
