import { buildBilateralPolicyDecisionDirectionV1, type BuildBilateralPolicyDecisionDirectionInputV1 } from "../../events/bilateralPolicyDecisionDirection";
import { buildBilateralPolicyDecisionChangeJuxtapositionV1, type BuildBilateralPolicyDecisionChangeJuxtapositionInputV1 } from "../../events/bilateralPolicyDecisionChangeJuxtaposition";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import type { PolicyEventPriorHistoryV1 } from "../../events/policyEventPriorSelection";
import type { BuildBilateralPolicyStateInputV1 } from "../../events/bilateralPolicyState";
import { ecbMonetaryPolicyCanonicalEventIdV1, normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { advanceEcbMonetaryPolicyEventMemoryV1, buildEcbMonetaryPolicyEventSnapshotV1,
  type EcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";
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
const TARGET = "2026-09-10";
const PRIOR = "2026-04-30";
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

const RIGHT_DATES = { eurusd: "2025-01-29", eurjpy: "2025-09-25", eurgbp: "2026-09-17", eurchf: "2025-09-25" } as const;
const RIGHT_PRIORS = { eurusd: "2024-12-18", eurjpy: "2025-07-24", eurgbp: "2025-05-08", eurchf: "2025-07-24" } as const;
function baseRequest(productId: Product = "eurusd", focusSide: "left" | "right" = "left"):
BuildBilateralPolicyDecisionChangeJuxtapositionInputV1 {
  const RIGHT_DATE = RIGHT_DATES[productId];
  const priorDate = RIGHT_PRIORS[productId];
  const base = { evaluatedAt: AT, expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(TARGET),
    euro: supplied(ecb()) };
  let policyInput: BuildBilateralPolicyStateInputV1;
  switch (productId) {
    case "eurusd": policyInput = { ...base, productId, counterparty: { decisionDate: RIGHT_DATE, evidence: supplied(fomc(RIGHT_DATE)) } }; break;
    case "eurjpy": policyInput = { ...base, productId, counterparty: { decisionDate: RIGHT_DATE, evidence: supplied(boj(RIGHT_DATE)) } }; break;
    case "eurgbp": policyInput = { ...base, productId, counterparty: { publicationDate: RIGHT_DATE, evidence: supplied(boe(RIGHT_DATE)) } }; break;
    case "eurchf": policyInput = { ...base, productId, counterparty: { decisionDate: RIGHT_DATE, evidence: supplied(snb(RIGHT_DATE)) } }; break;
  }
  const history = rightHistory(productId, [{ date: priorDate, snapshots: [rightSnapshot(productId, priorDate)] }]);
  assert.ok(history.institution !== "ECB");
  return { readinessInput: { policyInput, focusSide }, knowledgeCutoff: CUTOFF,
    leftHistory: { institution: "ECB", memories: [memory(ecb(PRIOR, CUTOFF))] }, rightHistory: history };
}

const METHOD_KNOWLEDGE = unix(AT) - 10;
function request(product: Product = "eurusd"): BuildBilateralPolicyDecisionDirectionInputV1 {
  return clone({ juxtapositionInput: baseRequest(product), methodologyKnownAt: METHOD_KNOWLEDGE });
}
const build = (input = request()) => buildBilateralPolicyDecisionDirectionV1(input);
function reject(value: unknown) {
  assert.throws(() => buildBilateralPolicyDecisionDirectionV1(value as BuildBilateralPolicyDecisionDirectionInputV1));
}
function setEcb(input: ReturnType<typeof request>, rates: readonly [number, number, number], date = TARGET, capture = TARGET_CAPTURE) {
  Reflect.set(input.juxtapositionInput.readinessInput.policyInput, "euro",
    supplied(ecb(date, capture, { level: rates[0], mro: rates[1], marginal: rates[2] })));
  Reflect.set(input.juxtapositionInput.readinessInput.policyInput, "expectedEcbCanonicalEventId", ecbMonetaryPolicyCanonicalEventIdV1(date));
}
function setRight(input: ReturnType<typeof request>, snapshot: RightSnapshot, date: string = RIGHT_DATES[input.juxtapositionInput.readinessInput.policyInput.productId]) {
  const counterparty = input.juxtapositionInput.readinessInput.policyInput.counterparty;
  Reflect.set(counterparty, "publicationDate" in counterparty ? "publicationDate" : "decisionDate", date);
  Reflect.set(counterparty, "evidence", supplied(snapshot));
}
function setPrior(input: ReturnType<typeof request>, snapshot: RightSnapshot, date: string = RIGHT_PRIORS[input.juxtapositionInput.readinessInput.policyInput.productId]) {
  const product = input.juxtapositionInput.readinessInput.policyInput.productId;
  Reflect.set(input.juxtapositionInput, "rightHistory", rightHistory(product, [{ date, snapshots: [snapshot] }]));
}
function emptyHistory(input: ReturnType<typeof request>, side: "left" | "right") {
  const upstream = input.juxtapositionInput;
  Reflect.set(upstream, side === "left" ? "leftHistory" : "rightHistory", side === "left"
    ? { institution: "ECB", memories: [] } : { institution: upstream.rightHistory.institution, histories: [] });
}
function eachObject(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), visit);
}

for (const product of PRODUCTS) test(product + ": exact input, immutable method identity and whole upstream parity", () => {
  const input = request(product);
  const result = build(input);
  assert.equal(result.schemaVersion, "bilateral-policy-decision-direction-v1");
  assert.equal(result.semantic, "derived-feature");
  assert.equal(result.interpretation, "chronoverse-methodology-bound");
  assert.equal(result.methodologyId, "modern-bilateral-policy-decision-direction-v1");
  assert.equal(result.methodologyVersion, 1);
  assert.equal(result.methodologyKnowledge, "as-known-under-supplied-adoption");
  assert.equal(result.productId, product);
  assert.equal(result.left.institution, "ECB");
  assert.equal(result.right.institution, input.juxtapositionInput.rightHistory.institution);
  assert.equal(result.availability, "available");
  assert.deepEqual(result.missingDirectionPaths, []);
  assert.deepEqual(result.relationship, { leftDirection: "UNCHANGED", rightDirection: "UNCHANGED" });
  assert.deepEqual(result.juxtaposition, buildBilateralPolicyDecisionChangeJuxtapositionV1(input.juxtapositionInput));
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  assert.equal(result.methodologyKnownAt, METHOD_KNOWLEDGE);
  assert.equal(result.evaluatedAt, AT);
  assert.equal(result.knowledgeCutoff, CUTOFF);
  assert.ok(result.methodologyKnownAt > result.knowledgeCutoff);
  assert.ok(result.methodologyKnownAt < unix(result.evaluatedAt));
  assert.ok(result.methodologyKnownAt > result.evidenceKnownAt!);
  assert.equal(result.coverage, "provided-history-only");
  assert.equal(result.basis, "target-minus-selected-earlier-supplied-announcement");
});

test("closed root rejects detached outputs and unknown enumerable, hidden and symbol overrides", () => {
  for (const value of [null, undefined, [], {}, build(), baseRequest(), { ...request(), juxtapositionInput: build().juxtaposition }]) reject(value);
  for (const key of ["leftDirection", "rightDirection", "counterparty", "ecbComponent", "methodologyId", "methodologyVersion",
    "leftEvaluatedAt", "rightEvaluatedAt", "evaluatedAt", "knowledgeCutoff", "left", "right", "metadata", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const input = request();
      Object.defineProperty(input, key, { value: 1, enumerable });
      reject(input);
    }
  }
  for (const key of ["ecbComponent", "counterpartyInstitution", "leftDirection", "leftKnowledgeCutoff"]) {
    const input = request();
    Reflect.set(input.juxtapositionInput, key, 1);
    reject(input);
  }
});
test("invalid and estr products cannot enter bilateral methodology", () => {
  for (const productId of ["estr", "gold", "gbpusd", "toString"]) {
    const input = request();
    Reflect.set(input.juxtapositionInput.readinessInput.policyInput, "productId", productId);
    reject(input);
  }
});
for (const product of PRODUCTS) test(product + ": histories remain institution-bound", () => {
  for (const side of ["left", "right"] as const) {
    const input = request(product);
    Reflect.set(input.juxtapositionInput, side === "left" ? "leftHistory" : "rightHistory",
      side === "left" ? { institution: "SNB", histories: [] } : { institution: "ECB", memories: [] });
    reject(input);
  }
});
test("methodology knowledge requires explicit nonnegative safe integer", () => {
  for (const methodologyKnownAt of [undefined, null, "1", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    reject({ ...request(), methodologyKnownAt });
  }
});
test("method adoption at floor(subsecond T) succeeds and after T throws without changing historical output", () => {
  const input = request();
  Reflect.set(input.juxtapositionInput.readinessInput.policyInput, "evaluatedAt", AT.replace(".000", ".999"));
  Reflect.set(input, "methodologyKnownAt", unix(AT));
  const result = build(input);
  assert.equal(result.methodologyKnownAt, unix(AT));
  assert.equal(result.evaluatedAt, AT.replace(".000", ".999"));
  assert.equal(result.knowledgeCutoff, CUTOFF);
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  for (const methodologyKnownAt of [unix(AT) + 1, unix(AT) + 100]) {
    assert.throws(() => build({ ...input, methodologyKnownAt }), RangeError);
    assert.deepEqual(build(input), result);
  }
});
test("integer K boundary and canonical ISO normalization remain independent of adoption", () => {
  const input = request();
  const upstream = input.juxtapositionInput;
  Reflect.set(upstream.readinessInput.policyInput, "evaluatedAt", AT.replace(".000", ".999"));
  Reflect.set(upstream, "knowledgeCutoff", unix(AT));
  Reflect.set(upstream, "leftHistory", { institution: "ECB", memories: [memory(ecb(PRIOR, unix(AT)))] });
  setPrior(input, fomc(RIGHT_PRIORS.eurusd, unix(AT)));
  const result = build(input);
  assert.equal(result.knowledgeCutoff, unix(AT));
  assert.equal(result.evidenceKnownAt, unix(AT));
  Reflect.set(upstream.readinessInput.policyInput, "evaluatedAt", "2026-10-05T13:00:00.999+03:00");
  assert.deepEqual(build(input), result);
  Reflect.set(upstream, "knowledgeCutoff", unix(AT) + 1);
  assert.throws(() => build(input), RangeError);
});
test("different supplied target dates and unequal prior intervals are retained without pairing", () => {
  const result = build();
  assert.equal(result.juxtaposition.left.priorSelection.target?.selectionDate, TARGET);
  assert.equal(result.juxtaposition.right.priorSelection.target?.selectionDate, RIGHT_DATES.eurusd);
  assert.equal(result.juxtaposition.left.priorSelection.prior.status, "available");
  assert.equal(result.juxtaposition.right.priorSelection.prior.status, "available");
  assert.equal(result.juxtaposition.alignment, "shared-assessment-time-and-prior-cutoff");
  assert.doesNotMatch(JSON.stringify(result), /\b(?:paired|simultaneous|combinedEventId)\b/);
});

for (const [rates, direction] of [
  [[2.75, 2.65, 2.9], "INCREASE"],
  [[2.25, 3, 2.9], "DECREASE"],
  [[2.5, 3, 3.2], "UNCHANGED"],
] as const) test("ECB selects named DFR " + direction + " while other components differ", () => {
  const input = request();
  setEcb(input, rates);
  const result = build(input);
  assert.equal(result.left.direction, direction);
  const change = result.juxtaposition.left.change;
  assert.ok(change.status === "available" && change.institution === "ECB");
  assert.equal(change.aggregate, "MIXED");
  assert.deepEqual(Object.keys(change.rates), ["depositFacility", "mainRefinancingOperations", "marginalLendingFacility"]);
  assert.equal(change.rates.depositFacility.direction, direction);
});
for (const context of ["document", "schedule"] as const) test("ECB " + context + " without canonical DFR stays unavailable", () => {
  const input = request();
  Reflect.set(input.juxtapositionInput.readinessInput.policyInput, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { context })));
  const result = build(input);
  assert.deepEqual(result.left, { institution: "ECB", direction: "UNAVAILABLE",
    reason: "SIDE_DIRECTION_UNAVAILABLE", canonicalReason: "ECB_DELTA_UNAVAILABLE" });
  assert.equal(result.availability, "partial");
  assert.equal(result.relationship, null);
});

for (const [before, after, direction] of [
  [[4, 4.25], [4.25, 4.5], "INCREASE"],
  [[4.25, 4.5], [4, 4.25], "DECREASE"],
  [[4.25, 4.5], [4.25, 4.5], "UNCHANGED"],
  [[4, 4.5], [4.25, 4.5], "MIXED"],
  [[4.25, 4.5], [4, 4.5], "MIXED"],
  [[4, 4.5], [4.25, 4.4], "MIXED"],
] as const) test("FOMC endpoint pattern " + before.join("/") + " to " + after.join("/"), () => {
  const input = request();
  setPrior(input, fomc(RIGHT_PRIORS.eurusd, CUTOFF, ...before));
  setRight(input, fomc(RIGHT_DATES.eurusd, TARGET_CAPTURE, ...after));
  const result = build(input);
  assert.equal(result.right.direction, direction);
  const target = result.juxtaposition.right.targetEvidence;
  assert.ok(target.status === "available" && target.institution === "FOMC" && target.data.policySetting.availability === "available");
  assert.equal(target.data.policySetting.data.action, "maintain");
  assert.deepEqual(result.relationship, { leftDirection: "UNCHANGED", rightDirection: direction });
});
test("EFFR cannot substitute for the canonical FOMC target range", () => {
  const input = request();
  setRight(input, buildCanonicalStatisticalSeriesSnapshotV1(buildUsPolicyCanonicalSeriesV1("effr", [{
    observationDate: RIGHT_DATES.eurusd, rate: 4.33, unit: "percent", volumeInBillions: null,
    volumeUnit: "billions of U.S. dollars", targetLower: null, targetUpper: null, footnoteId: null, revisionIndicator: null,
  }], TARGET_CAPTURE)));
  reject(input);
});

for (const [before, after, direction] of [[0.25, 0.5, "INCREASE"], [0.5, 0.25, "DECREASE"], [0.5, 0.5, "UNCHANGED"]] as const) {
  test("BoJ scalar " + direction + " retains around", () => {
    const input = request("eurjpy");
    setPrior(input, boj(RIGHT_PRIORS.eurjpy, CUTOFF, before));
    setRight(input, boj(RIGHT_DATES.eurjpy, TARGET_CAPTURE, after));
    const result = build(input);
    assert.equal(result.right.direction, direction);
    const change = result.juxtaposition.right.change;
    assert.ok(change.status === "available" && change.institution === "BoJ" && change.shape === "scalar");
    assert.equal(change.qualification, "around");
  });
}
for (const [before, after, direction] of [
  [[0, 0.25], [0.1, 0.5], "INCREASE"],
  [[0.1, 0.5], [0, 0.25], "DECREASE"],
  [[0, 0.5], [0, 0.5], "UNCHANGED"],
  [[0, 0.5], [0.1, 0.5], "MIXED"],
  [[0, 0.5], [0.1, 0.4], "MIXED"],
] as const) test("BoJ qualified range " + before.join("/") + " to " + after.join("/"), () => {
  const input = request("eurjpy");
  setPrior(input, boj(RIGHT_PRIORS.eurjpy, CUTOFF, 0, true, ...before));
  setRight(input, boj(RIGHT_DATES.eurjpy, TARGET_CAPTURE, 0, true, ...after));
  const result = build(input);
  assert.equal(result.right.direction, direction);
  const change = result.juxtaposition.right.change;
  assert.ok(change.status === "available" && change.institution === "BoJ" && change.shape === "range");
  assert.equal(change.qualification, "around");
});
for (const fromRange of [false, true]) test("BoJ incompatible shape " + fromRange + " preserves unavailability", () => {
  const input = request("eurjpy");
  setPrior(input, boj(RIGHT_PRIORS.eurjpy, CUTOFF, 0.5, fromRange));
  setRight(input, boj(RIGHT_DATES.eurjpy, TARGET_CAPTURE, 0.5, !fromRange));
  const result = build(input);
  assert.deepEqual(result.right, { institution: "BoJ", direction: "UNAVAILABLE",
    reason: "SIDE_DIRECTION_UNAVAILABLE", canonicalReason: "INCOMPATIBLE_POLICY_SHAPES" });
  assert.equal(result.availability, "partial");
  assert.equal(result.relationship, null);
  assert.equal(result.juxtaposition.right.priorSelection.prior.status, "available");
});

for (const [before, after, direction] of [[4, 4.25, "INCREASE"], [4.25, 4, "DECREASE"], [4.25, 4.25, "UNCHANGED"]] as const) {
  test("BoE Bank Rate " + direction + " keeps separate reported reduction", () => {
    const input = request("eurgbp");
    setPrior(input, boe(RIGHT_PRIORS.eurgbp, CUTOFF, before));
    setRight(input, boe(RIGHT_DATES.eurgbp, TARGET_CAPTURE, after));
    const result = build(input);
    assert.equal(result.right.direction, direction);
    const target = result.juxtaposition.right.targetEvidence;
    assert.ok(target.status === "available" && target.institution === "BoE" && target.data.policySetting.availability === "available");
    assert.equal(target.data.policySetting.data.decision.action, "reduce");
    assert.equal(target.data.policySetting.data.decision.changePercentagePoints, 0.25);
    assert.equal(target.data.timing.effectiveDate, null);
  });
}
for (const [before, after, direction] of [
  [-0.25, -0.5, "DECREASE"], [-0.5, -0.25, "INCREASE"], [-0.25, 0, "INCREASE"],
  [0, 0.25, "INCREASE"], [0.25, 0, "DECREASE"], [0, -0.25, "DECREASE"],
  [-0.25, 0.25, "INCREASE"], [0.25, -0.25, "DECREASE"],
  [-0.25, -0.25, "UNCHANGED"], [0, 0, "UNCHANGED"], [0.25, 0.25, "UNCHANGED"],
] as const) test("SNB signed " + before + " to " + after + " follows canonical direction", () => {
  const input = request("eurchf");
  setPrior(input, snb(RIGHT_PRIORS.eurchf, CUTOFF, before));
  setRight(input, snb(RIGHT_DATES.eurchf, TARGET_CAPTURE, after));
  const result = build(input);
  assert.equal(result.right.direction, direction);
  const target = result.juxtaposition.right.targetEvidence;
  assert.ok(target.status === "available" && target.institution === "SNB" && target.data.policySetting.availability === "available");
  assert.equal(target.data.policySetting.data.decision.action, "reduce");
  assert.equal(target.data.timing.releaseTimestamp, null);
});
for (const [product, instrument] of [["eurjpy", "complementary-deposit-facility"], ["eurchf", "SARON"], ["eurchf", "CHF Libor target range"]] as const) {
  test(product + ": rejects substitute " + instrument, () => {
    const input = request(product);
    const evidence = input.juxtapositionInput.readinessInput.policyInput.counterparty.evidence;
    assert.ok(evidence.status === "supplied" && "evidence" in evidence.snapshot);
    Reflect.set(evidence.snapshot.evidence.fact, "instrument", instrument);
    reject(input);
  });
}
for (const [product, preDate] of [["eurjpy", "2024-03-18"], ["eurchf", "2019-06-12"]] as const) {
  test(product + ": pre-regime supplied facts fail canonical admission", () => {
    const input = request(product);
    const evidence = input.juxtapositionInput.readinessInput.policyInput.counterparty.evidence;
    assert.ok(evidence.status === "supplied" && "evidence" in evidence.snapshot);
    Reflect.set(input.juxtapositionInput.readinessInput.policyInput.counterparty, "decisionDate", preDate);
    Reflect.set(evidence.snapshot.evidence.fact, "decisionDate", preDate);
    reject(input);
  });
}

for (const direction of ["INCREASE", "DECREASE", "UNCHANGED"] as const) {
  for (const right of ["INCREASE", "DECREASE", "UNCHANGED"] as const) {
    test("Cartesian relationship " + direction + "/" + right, () => {
      const input = request("eurgbp");
      setEcb(input, [direction === "INCREASE" ? 2.75 : direction === "DECREASE" ? 2.25 : 2.5, 2.65, 2.9]);
      setRight(input, boe(RIGHT_DATES.eurgbp, TARGET_CAPTURE, right === "INCREASE" ? 4.5 : right === "DECREASE" ? 4 : 4.25));
      assert.deepEqual(build(input).relationship, { leftDirection: direction, rightDirection: right });
    });
  }
}
for (const missing of ["left", "right", "both"] as const) test(missing + ": unavailable priors control direction completeness", () => {
  const input = request();
  if (missing !== "right") emptyHistory(input, "left");
  if (missing !== "left") emptyHistory(input, "right");
  const result = build(input);
  assert.equal(result.availability, missing === "both" ? "unavailable" : "partial");
  assert.equal(result.relationship, null);
  assert.deepEqual(result.missingDirectionPaths, missing === "both" ? ["left.direction", "right.direction"] : [missing + ".direction"]);
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  assert.equal(result.juxtaposition.availability, "partial");
});
test("admitted target without any available direction is unavailable, with evidence knowledge retained", () => {
  const input = request();
  emptyHistory(input, "left");
  Reflect.set(input.juxtapositionInput.readinessInput.policyInput.counterparty, "evidence", absent());
  const result = build(input);
  assert.equal(result.availability, "unavailable");
  assert.equal(result.juxtaposition.availability, "partial");
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  assert.deepEqual(result.missingDirectionPaths, ["left.direction", "right.direction"]);
});
for (const product of PRODUCTS) for (const missing of ["left", "right", "both"] as const) {
  test(product + ": absent " + missing + " target exposes no relationship", () => {
    const input = request(product);
    if (missing !== "right") Reflect.set(input.juxtapositionInput.readinessInput.policyInput, "euro", absent());
    if (missing !== "left") Reflect.set(input.juxtapositionInput.readinessInput.policyInput.counterparty, "evidence", absent());
    const result = build(input);
    assert.equal(result.availability, missing === "both" ? "unavailable" : "partial");
    assert.equal(result.relationship, null);
    assert.equal(result.evidenceKnownAt, missing === "both" ? null : TARGET_CAPTURE);
    assert.deepEqual(result.missingDirectionPaths, missing === "both" ? ["left.direction", "right.direction"] : [missing + ".direction"]);
  });
}
for (const which of ["target", "prior"] as const) test("ECB unqualified " + which + " date does not borrow qualification from capture", () => {
  const input = request();
  if (which === "target") setEcb(input, [2.75, 2.65, 2.9], "2026-09-18");
  else Reflect.set(input.juxtapositionInput, "leftHistory", { institution: "ECB", memories: [memory(ecb("2025-07-24", CUTOFF))] });
  const result = build(input);
  assert.equal(result.left.direction, "UNAVAILABLE");
  assert.deepEqual(result.left, { institution: "ECB", direction: "UNAVAILABLE", reason: "METHODOLOGY_DATE_NOT_QUALIFIED" });
  assert.equal(result.availability, "partial");
  assert.equal(result.relationship, null);
  assert.equal(result.juxtaposition.left.change.status, "available");
});
for (const product of ["eurusd", "eurgbp"] as const) for (const which of ["target", "prior"] as const) {
  test(product + ": unqualified " + which + " date preserves canonical evidence", () => {
    const input = request(product);
    const factory = product === "eurusd" ? fomc : boe;
    const date = which === "target" ? "2026-09-25" : "2023-04-17";
    if (which === "target") setRight(input, factory(date, TARGET_CAPTURE), date);
    else setPrior(input, factory(date, CUTOFF), date);
    const result = build(input);
    assert.deepEqual(result.right, { institution: input.juxtapositionInput.rightHistory.institution,
      direction: "UNAVAILABLE", reason: "METHODOLOGY_DATE_NOT_QUALIFIED" });
    assert.equal(result.availability, "partial");
    assert.equal(result.juxtaposition.right.change.status, "available");
  });
}
test("both unqualified dates give unavailable interpretation without erasing retained knowledge", () => {
  const input = request();
  setEcb(input, [2.75, 2.65, 2.9], "2026-09-18");
  setRight(input, fomc("2026-09-25", TARGET_CAPTURE), "2026-09-25");
  const result = build(input);
  assert.equal(result.availability, "unavailable");
  assert.equal(result.relationship, null);
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  assert.equal(result.juxtaposition.availability, "available");
});
test("sparse supplied history cannot turn computed direction into target action", () => {
  // Only July 2023 and January 2025 are supplied; intervening announcements are absent.
  const input = request();
  setPrior(input, fomc("2023-07-26", CUTOFF, 4, 4.25), "2023-07-26");
  const result = build(input);
  assert.equal(result.right.direction, "INCREASE");
  assert.equal(result.coverage, "provided-history-only");
  assert.equal(result.basis, "target-minus-selected-earlier-supplied-announcement");
  assert.equal(result.juxtaposition.right.selectionBasis, "last-earlier-supplied-announcement");
  const target = result.juxtaposition.right.targetEvidence;
  assert.ok(target.status === "available" && target.institution === "FOMC" && target.data.policySetting.availability === "available");
  assert.equal(target.data.policySetting.data.action, "maintain");
});

for (const product of PRODUCTS) test(product + ": future history revisions and conflicting branches preserve the entire interpretation", () => {
  const input = request(product);
  const expected = build(input);
  Reflect.set(input.juxtapositionInput, "leftHistory", { institution: "ECB", memories: [
    memory(ecb(PRIOR, CUTOFF), ecb(PRIOR, CUTOFF + 1, { level: 3 })),
    memory(ecb(PRIOR, CUTOFF + 2, { level: 3.25 })),
  ] });
  assert.deepEqual(build(input), expected);
  const date = RIGHT_PRIORS[product];
  Reflect.set(input.juxtapositionInput, "rightHistory", rightHistory(product, [
    { date, snapshots: [rightSnapshot(product, date), rightSnapshot(product, date, CUTOFF + 1, 1)] },
    { date, snapshots: [rightSnapshot(product, date, CUTOFF + 2, 2)] },
  ]));
  assert.deepEqual(build(input), expected);
});
for (const product of PRODUCTS) for (const missing of ["left", "right", "both"] as const) {
  test(product + ": future " + missing + " target facts cannot affect whole historical result", () => {
    const input = request(product);
    let expected: ReturnType<typeof build> | undefined;
    for (const variant of [1, 2]) {
      if (missing !== "right") setEcb(input, [variant, 2.65, 2.9], TARGET, unix(AT) + variant);
      if (missing !== "left") setRight(input, rightSnapshot(product, RIGHT_DATES[product], unix(AT) + variant, variant));
      const result = build(input);
      assert.equal(result.relationship, null);
      assert.equal(result.availability, missing === "both" ? "unavailable" : "partial");
      assert.equal(result.evidenceKnownAt, missing === "both" ? null : TARGET_CAPTURE);
      assert.ok(!JSON.stringify(result).includes(String(unix(AT) + variant)));
      if (expected === undefined) expected = result;
      else assert.deepEqual(result, expected);
    }
  });
}

test("root temporal and upstream history accessors are captured without downstream rereads", () => {
  const input = request();
  for (const key of ["juxtapositionInput", "methodologyKnownAt"] as const) {
    const value = input[key];
    let reads = 0;
    Object.defineProperty(input, key, { get() { if (++reads > 1) throw new ReferenceError("root reread"); return value; } });
  }
  assert.equal(build(input).availability, "available");
  const next = request();
  for (const key of ["leftHistory", "rightHistory"] as const) {
    const history = next.juxtapositionInput[key];
    let reads = 0;
    Object.defineProperty(next.juxtapositionInput, key, { get() { if (++reads > 1) throw new Error("history reread"); return history; } });
  }
  assert.equal(build(next).availability, "available");
});
test("accessor and Proxy programming defects preserve exact identity", () => {
  for (const error of [new ReferenceError("sentinel"), new TypeError("sentinel")]) {
    assert.throws(() => build(new Proxy(request(), { ownKeys() { throw error; } })), (caught) => caught === error);
    for (const key of ["methodologyKnownAt", "juxtapositionInput"] as const) {
      const input = request();
      Object.defineProperty(input, key, { get() { throw error; } });
      assert.throws(() => build(input), (caught) => caught === error);
    }
  }
});
test("canonical rebuild mismatch and forged component evidence throw", () => {
  const input = request();
  const first = input.juxtapositionInput.readinessInput.policyInput;
  const later = clone(first);
  Reflect.set(later, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { level: 3 })));
  let reads = 0;
  Object.defineProperty(input.juxtapositionInput.readinessInput, "policyInput", { get: () => ++reads === 1 ? first : later });
  assert.throws(() => build(input), /contexts disagree/);
  const forged = request();
  const euro = forged.juxtapositionInput.readinessInput.policyInput.euro;
  assert.ok(euro.status === "supplied" && euro.snapshot.event.decision?.rates);
  Reflect.deleteProperty(euro.snapshot.event.decision.rates, "depositFacility");
  reject(forged);
});
for (const product of PRODUCTS) test(product + ": recursively frozen and bidirectionally isolated from callers", () => {
  const input = request(product);
  const before = clone(input);
  const callers = new Set<object>();
  eachObject(input, (object) => { callers.add(object); assert.ok(!Object.isFrozen(object)); });
  const result = build(input);
  const expected = clone(result);
  assert.deepEqual(input, before);
  eachObject(result, (object) => {
    assert.ok(Object.isFrozen(object));
    assert.ok(!callers.has(object));
    assert.equal(Reflect.set(object, "injected", 99), false);
  });
  assert.deepEqual(input, before);
  eachObject(input, (object) => { assert.ok(!Object.isFrozen(object)); Reflect.set(object, "later", true); });
  assert.deepEqual(result, expected);
});
test("all products operate with network and implicit clock disabled", () => {
  const inputs = PRODUCTS.map((product) => request(product));
  const fetchBefore = globalThis.fetch;
  const nowBefore = Date.now;
  try {
    globalThis.fetch = () => { throw new Error("network used"); };
    Date.now = () => { throw new Error("clock used"); };
    for (const input of inputs) assert.equal(build(input).availability, "available");
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; }
});
test("output excludes economic labels, inferred event pairing and representative rates", () => {
  const forbidden = new Set(["policyDifferential", "changeDifferential", "spread", "gap", "widening", "narrowing",
    "divergence", "convergence", "tightening", "easing", "hawkish", "dovish", "bullish", "bearish",
    "fxDirection", "recommendation", "confidence", "entry", "exit", "surprise", "consensus", "currentPolicy", "latestPolicy",
    "inForcePolicy", "representativeFedRate", "fedMidpoint", "bojMidpoint", "midpoint", "stance", "combinedEventId"]);
  for (const product of PRODUCTS) {
    const result = build(request(product));
    eachObject(result, (object) => { for (const key of Reflect.ownKeys(object)) assert.ok(!forbidden.has(String(key)), String(key)); });
    assert.doesNotMatch(JSON.stringify(result), /\b(?:DIVERGING|CONVERGING|SAME_STANCE|OPPOSING_STANCE|RELATIVE_TIGHTENING|RELATIVE_EASING|TIGHTEN|EASE|NEUTRAL|simultaneous|paired)\b/);
  }
});
test("production performs no rate arithmetic, source-action selection, I/O or catch masking", () => {
  const source = readFileSync("src/lib/markets/events/bilateralPolicyDecisionDirection.ts", "utf8");
  const ast = ts.createSourceFile("direction.ts", source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    assert.ok(!ts.isCatchClause(node));
    if (ts.isImportDeclaration(node)) assert.ok(!/persistence|runtime|projection|delivery|transport|acquisition|redis|node:fs|aws|R2/i.test((node.moduleSpecifier as ts.StringLiteral).text));
    if (ts.isCallExpression(node)) assert.ok(!/^(fetch|setTimeout|setInterval|Date\.now)$/.test(node.expression.getText(ast)));
    if (ts.isPropertyAccessExpression(node)) {
      assert.notEqual(node.getText(ast), "process.env");
      assert.ok(!/\.(deltaBasisPoints|deltaPercentagePoints|previousRate|targetRate|currentRate|action)$/.test(node.getText(ast)));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
});
