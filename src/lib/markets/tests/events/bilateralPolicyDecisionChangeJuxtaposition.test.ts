import { buildBilateralPolicyDecisionChangeJuxtapositionV1, type BuildBilateralPolicyDecisionChangeJuxtapositionInputV1 } from "../../events/bilateralPolicyDecisionChangeJuxtaposition";
import { buildPolicyEventDecisionChangeV1 } from "../../events/policyEventDecisionChange";
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

const RIGHT_DATE = "2025-09-25";
function request(productId: Product = "eurusd", focusSide: "left" | "right" = "left"):
BuildBilateralPolicyDecisionChangeJuxtapositionInputV1 {
  const base = { evaluatedAt: AT, expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(TARGET),
    euro: supplied(ecb()) };
  let policyInput: BuildBilateralPolicyStateInputV1;
  switch (productId) {
    case "eurusd": policyInput = { ...base, productId, counterparty: { decisionDate: RIGHT_DATE, evidence: supplied(fomc(RIGHT_DATE)) } }; break;
    case "eurjpy": policyInput = { ...base, productId, counterparty: { decisionDate: RIGHT_DATE, evidence: supplied(boj(RIGHT_DATE)) } }; break;
    case "eurgbp": policyInput = { ...base, productId, counterparty: { publicationDate: RIGHT_DATE, evidence: supplied(boe(RIGHT_DATE)) } }; break;
    case "eurchf": policyInput = { ...base, productId, counterparty: { decisionDate: RIGHT_DATE, evidence: supplied(snb(RIGHT_DATE)) } }; break;
  }
  const history = rightHistory(productId, [{ date: PRIOR, snapshots: [rightSnapshot(productId)] }]);
  assert.ok(history.institution !== "ECB");
  return { readinessInput: { policyInput, focusSide }, knowledgeCutoff: CUTOFF,
    leftHistory: { institution: "ECB", memories: [memory(ecb(PRIOR, CUTOFF))] }, rightHistory: history };
}
const build = (input = request()) => buildBilateralPolicyDecisionChangeJuxtapositionV1(input);
function reject(value: unknown) {
  assert.throws(() => buildBilateralPolicyDecisionChangeJuxtapositionV1(value as BuildBilateralPolicyDecisionChangeJuxtapositionInputV1));
}
function eachObject(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), visit);
}
function setRight(input: ReturnType<typeof request>, snapshot: RightSnapshot, date = RIGHT_DATE) {
  const counterparty = input.readinessInput.policyInput.counterparty;
  Reflect.set(counterparty, "publicationDate" in counterparty ? "publicationDate" : "decisionDate", date);
  Reflect.set(counterparty, "evidence", supplied(snapshot));
}
function emptyHistory(input: ReturnType<typeof request>, side: "left" | "right") {
  if (side === "left") Reflect.set(input, "leftHistory", { institution: "ECB", memories: [] });
  else Reflect.set(input, "rightHistory", { institution: input.rightHistory.institution, histories: [] });
}

for (const product of PRODUCTS) for (const focusSide of ["left", "right"] as const) {
  test(`${product} ${focusSide}: whole-child parity, product binding and distinct target identities`, () => {
    const input = request(product, focusSide);
    const result = build(input);
    for (const side of ["left", "right"] as const) {
      const expected = buildPolicyEventDecisionChangeV1({
        readinessInput: { policyInput: input.readinessInput.policyInput, focusSide: side },
        knowledgeCutoff: input.knowledgeCutoff, history: side === "left" ? input.leftHistory : input.rightHistory,
      });
      assert.deepEqual(result[side], expected);
      assert.equal(result[side].productId, product);
      assert.equal(result[side].evaluatedAt, result.evaluatedAt);
      assert.equal(result[side].knowledgeCutoff, result.knowledgeCutoff);
      assert.equal(result[side].priorSelection.knowledgeCutoff, CUTOFF);
    }
    assert.equal(result.left.institution, "ECB");
    assert.equal(result.right.institution, input.rightHistory.institution);
    assert.equal(result.availability, "available");
    assert.deepEqual(result.missingChangePaths, []);
    assert.equal(result.left.priorSelection.target?.selectionDate, TARGET);
    assert.equal(result.right.priorSelection.target?.selectionDate, RIGHT_DATE);
    assert.notDeepEqual(result.left.priorSelection.target?.canonicalReference, result.right.priorSelection.target?.canonicalReference);
    assert.deepEqual(result.focus, { semantic: "request-metadata", side: focusSide,
      admittedTarget: result[focusSide].priorSelection.target });
    assert.equal(result.basis, "explicitly-supplied-decisions");
    assert.equal(result.coverage, "provided-history-only");
    assert.equal(result.alignment, "shared-assessment-time-and-prior-cutoff");
  });
}

test("closed schema has only evidence composition fields", () => {
  const result = build();
  assert.equal(result.schemaVersion, "bilateral-policy-decision-change-juxtaposition-v1");
  assert.equal(result.semantic, "derived-feature");
  assert.equal(result.feature, "bilateral-policy-decision-change-juxtaposition");
  assert.deepEqual(Object.keys(result), ["schemaVersion", "semantic", "feature", "productId", "evaluatedAt",
    "knowledgeCutoff", "basis", "coverage", "alignment", "focus", "left", "right", "availability", "missingChangePaths", "evidenceKnownAt"]);
});
test("root rejects detached results and all unknown fields, including hidden fields and symbols", () => {
  for (const value of [null, undefined, [], {}, build(), { ...request(), readinessInput: build().left }]) reject(value);
  for (const key of ["left", "right", "priorSelection", "policyState", "assessment", "comparison", "differential", "marketData",
    "leftEvaluatedAt", "rightEvaluatedAt", "leftKnowledgeCutoff", "rightKnowledgeCutoff", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const input = request();
      Object.defineProperty(input, key, { value: 1, enumerable });
      reject(input);
    }
  }
});
test("reject estr, unknown/sixth products and invalid focus", () => {
  for (const productId of ["estr", "gold", "gbpusd", "toString"]) {
    const input = request();
    Reflect.set(input.readinessInput.policyInput, "productId", productId);
    reject(input);
  }
  for (const focusSide of ["both", undefined, null]) reject({ ...request(), readinessInput: { ...request().readinessInput, focusSide } });
});
for (const product of PRODUCTS) test(`${product}: both history institutions are locked even without target admission`, () => {
  for (const side of ["left", "right"] as const) {
    const expected = side === "left" ? "ECB" : request(product).rightHistory.institution;
    for (const institution of ["ECB", "FOMC", "BoJ", "BoE", "SNB", "UNKNOWN"]) {
      if (institution === expected) continue;
      for (const missing of [false, true]) {
        const input = request(product);
        if (missing) {
          Reflect.set(input.readinessInput.policyInput, "euro", absent());
          Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", absent());
        }
        Reflect.set(input, side === "left" ? "leftHistory" : "rightHistory",
          institution === "ECB" ? { institution, memories: [] } : { institution, histories: [] });
        reject(input);
      }
    }
  }
});

test("K is inclusive, may equal floor(subsecond T), and never follows T", () => {
  const input = request();
  Reflect.set(input.readinessInput.policyInput, "evaluatedAt", AT.replace(".000", ".999"));
  Reflect.set(input, "knowledgeCutoff", unix(AT));
  Reflect.set(input, "leftHistory", { institution: "ECB", memories: [memory(ecb(PRIOR, unix(AT)))] });
  Reflect.set(input, "rightHistory", rightHistory("eurusd", [{ date: PRIOR, snapshots: [fomc(PRIOR, unix(AT))] }]));
  const result = build(input);
  assert.equal(result.availability, "available");
  assert.equal(result.left.priorSelection.prior.status, "available");
  assert.equal(result.right.priorSelection.prior.status, "available");
  assert.equal(result.evidenceKnownAt, unix(AT));
  Reflect.set(input, "knowledgeCutoff", unix(AT) + 1);
  assert.throws(() => build(input), RangeError);
});
test("invalid K and side-specific temporal fields fail closed", () => {
  for (const knowledgeCutoff of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null, "1"]) reject({ ...request(), knowledgeCutoff });
  for (const key of ["leftEvaluatedAt", "rightEvaluatedAt", "leftKnowledgeCutoff", "rightKnowledgeCutoff"]) {
    const input = request();
    Reflect.set(input.readinessInput, key, AT);
    reject(input);
  }
});
test("targets known after K but by T remain admitted; equivalent ISO offsets normalize", () => {
  const input = request();
  const result = build(input);
  assert.equal(result.availability, "available");
  assert.equal(result.left.targetEvidence.status, "available");
  assert.equal(result.right.targetEvidence.status, "available");
  assert.ok(TARGET_CAPTURE > CUTOFF);
  Reflect.set(input.readinessInput.policyInput, "evaluatedAt", "2026-10-05T13:00:00+03:00");
  assert.deepEqual(build(input), result);
});

for (const product of PRODUCTS) for (const missing of ["left", "right", "both"] as const) {
  for (const future of [false, true]) test(`${product} ${missing} ${future ? "future" : "absent"} target: no leaked admission`, () => {
    const input = request(product, missing === "right" ? "right" : "left");
    if (missing !== "right") Reflect.set(input.readinessInput.policyInput, "euro",
      future ? supplied(ecb(TARGET, unix(AT) + 1)) : absent());
    if (missing !== "left") Reflect.set(input.readinessInput.policyInput.counterparty, "evidence",
      future ? supplied(rightSnapshot(product, RIGHT_DATE, unix(AT) + 1)) : absent());
    const result = build(input);
    assert.equal(result.availability, missing === "both" ? "unavailable" : "partial");
    assert.deepEqual(result.missingChangePaths, missing === "both" ? ["left.change", "right.change"] : [`${missing}.change`]);
    assert.equal(result.evidenceKnownAt, missing === "both" ? null : TARGET_CAPTURE);
    assert.equal(result.focus.admittedTarget, null);
    for (const side of ["left", "right"] as const) {
      if (missing !== "both" && side !== missing) continue;
      assert.deepEqual(result[side].targetEvidence, { status: "unavailable",
        targetReason: future ? "KNOWLEDGE_INCONSISTENT" : "NO_CAPTURED_EVIDENCE", upstreamReason: null });
      assert.equal(result[side].priorSelection.target, null);
      assert.equal(result[side].evidenceKnownAt, null);
      assert.ok(!JSON.stringify(result[side]).includes("sourceUrl"));
    }
    assert.ok(!JSON.stringify(result).includes(String(unix(AT) + 1)));
    assert.equal(new Set(result.missingChangePaths).size, result.missingChangePaths.length);
  });
}
for (const missing of ["left", "right", "both"] as const) test(`${missing} missing prior retains admitted targets and exact nested reasons`, () => {
  const input = request();
  if (missing !== "right") emptyHistory(input, "left");
  if (missing !== "left") emptyHistory(input, "right");
  const result = build(input);
  assert.equal(result.availability, "partial");
  assert.equal(result.left.targetEvidence.status, "available");
  assert.equal(result.right.targetEvidence.status, "available");
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  assert.deepEqual(result.missingChangePaths, missing === "both" ? ["left.change", "right.change"] : [`${missing}.change`]);
  if (missing !== "right") assert.deepEqual(result.left.change, { status: "unavailable", institution: "ECB",
    reason: "ECB_DELTA_UNAVAILABLE", deltaReason: "PRIOR_STATE_UNAVAILABLE", priorReason: "INSUFFICIENT_HISTORY" });
  if (missing !== "left") assert.deepEqual(result.right.change, { status: "unavailable", institution: "FOMC",
    reason: "PRIOR_STATE_UNAVAILABLE", priorReason: "INSUFFICIENT_HISTORY" });
});
for (const context of ["schedule", "document"] as const) test(`ECB ${context}-only target counts as admitted partial context`, () => {
  const input = request();
  Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { context })));
  Reflect.set(input.readinessInput.policyInput.counterparty, "evidence", absent());
  const result = build(input);
  assert.equal(result.availability, "partial");
  assert.equal(result.left.targetEvidence.status, "available");
  assert.equal(result.evidenceKnownAt, TARGET_CAPTURE);
  assert.notEqual(result.focus.admittedTarget, null);
  assert.deepEqual(result.missingChangePaths, ["left.change", "right.change"]);
});
for (const ambiguous of [false, true]) test(`ECB ${ambiguous ? "ambiguous" : "incomplete"} immediate supplied prior has no older fallback`, () => {
  const input = request();
  Reflect.set(input, "leftHistory", { institution: "ECB", memories: [memory(ecb(OLDER, CUTOFF - 20)),
    memory(ecb(PRIOR, CUTOFF - 10, ambiguous ? {} : { context: "document" })),
    ...(ambiguous ? [memory(ecb(PRIOR, CUTOFF - 10, { level: 2.75 }))] : [])] });
  const result = build(input);
  assert.equal(result.availability, "partial");
  assert.ok(result.left.change.status === "unavailable" && result.left.change.reason === "ECB_DELTA_UNAVAILABLE");
  assert.equal(result.left.change.priorReason, ambiguous ? "AMBIGUOUS_PRIOR_STATE" : "EVENT_DATA_INCOMPLETE");
});
for (const product of PRODUCTS) test(`${product}: counterparty ambiguity retains exact reason without older fallback`, () => {
  const input = request(product);
  Reflect.set(input, "rightHistory", rightHistory(product, [
    { date: OLDER, snapshots: [rightSnapshot(product, OLDER)] },
    { date: PRIOR, snapshots: [rightSnapshot(product), rightSnapshot(product, PRIOR, CUTOFF, 1)] },
  ]));
  const result = build(input);
  assert.deepEqual(result.right.change, { status: "unavailable", institution: input.rightHistory.institution,
    reason: "PRIOR_STATE_UNAVAILABLE", priorReason: "AMBIGUOUS_PRIOR_STATE" });
  assert.deepEqual(result.missingChangePaths, ["right.change"]);
});

for (const later of ["left", "right"] as const) test(`${later} later admitted knowledge determines envelope knowledge`, () => {
  const input = request();
  if (later === "left") Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, unix(AT))));
  else setRight(input, fomc(RIGHT_DATE, unix(AT)));
  assert.equal(build(input).evidenceKnownAt, unix(AT));
});
test("prior known later than target contributes, missing priors do not invent knowledge", () => {
  const input = request();
  Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, CUTOFF - 20)));
  setRight(input, fomc(RIGHT_DATE, CUTOFF - 10));
  assert.equal(build(input).evidenceKnownAt, CUTOFF);
  emptyHistory(input, "left");
  assert.equal(build(input).evidenceKnownAt, CUTOFF);
  emptyHistory(input, "right");
  assert.equal(build(input).evidenceKnownAt, CUTOFF - 10);
});
for (const product of PRODUCTS) test(`${product}: future revisions and conflicting branches preserve whole output`, () => {
  const input = request(product);
  const expected = build(input);
  Reflect.set(input, "leftHistory", { institution: "ECB", memories: [
    memory(ecb(PRIOR, CUTOFF), ecb(PRIOR, CUTOFF + 1, { level: 2.75 })),
    memory(ecb(PRIOR, CUTOFF + 2, { level: 3 })),
  ] });
  assert.deepEqual(build(input), expected);
  Reflect.set(input, "rightHistory", rightHistory(product, [
    { date: PRIOR, snapshots: [rightSnapshot(product), rightSnapshot(product, PRIOR, CUTOFF + 1, 1)] },
    { date: PRIOR, snapshots: [rightSnapshot(product, PRIOR, CUTOFF + 2, 2)] },
  ]));
  assert.deepEqual(build(input), expected);
});
for (const product of PRODUCTS) test(`${product}: old decision dates never backdate a later capture`, () => {
  const input = request(product);
  Reflect.set(input.readinessInput.policyInput, "evaluatedAt", "2025-10-01T10:00:00Z");
  Reflect.set(input, "knowledgeCutoff", unix("2025-10-01T10:00:00Z"));
  const result = build(input);
  assert.equal(result.availability, "unavailable");
  assert.equal(result.evidenceKnownAt, null);
  assert.equal(result.focus.admittedTarget, null);
});

test("ECB three component mixed pattern survives without selecting an instrument", () => {
  const input = request();
  Reflect.set(input.readinessInput.policyInput, "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { level: 2.75 })));
  const result = build(input);
  assert.ok(result.left.change.status === "available" && result.left.change.institution === "ECB");
  assert.equal(result.left.change.aggregate, "MIXED");
  assert.deepEqual(Object.keys(result.left.change.rates), ["depositFacility", "mainRefinancingOperations", "marginalLendingFacility"]);
});
test("FOMC unequal endpoint movements survive unchanged", () => {
  const input = request();
  setRight(input, fomc(RIGHT_DATE, TARGET_CAPTURE, 4.3, 4.5));
  const result = build(input);
  assert.ok(result.right.change.status === "available" && result.right.change.institution === "FOMC");
  assert.equal(result.right.change.targetLower.deltaBasisPoints, 5);
  assert.equal(result.right.change.targetUpper.deltaBasisPoints, 0);
  assert.equal(result.right.change.aggregate, "MIXED");
});
for (const range of [false, true]) test(`BoJ ${range ? "range" : "scalar"} around structure survives`, () => {
  const input = request("eurjpy");
  setRight(input, boj(RIGHT_DATE, TARGET_CAPTURE, 0.75, range, 0.1, 0.5));
  Reflect.set(input, "rightHistory", rightHistory("eurjpy", [{ date: PRIOR, snapshots: [boj(PRIOR, CUTOFF, 0.5, range, 0, 0.5)] }]));
  const result = build(input);
  assert.ok(result.right.change.status === "available" && result.right.change.institution === "BoJ");
  assert.equal(result.right.change.shape, range ? "range" : "scalar");
  assert.equal(result.right.change.qualification, "around");
  if (result.right.change.shape === "range") {
    assert.equal(result.right.change.lower.deltaBasisPoints, 10);
    assert.equal(result.right.change.upper.deltaBasisPoints, 0);
  }
});
for (const fromRange of [false, true]) test(`BoJ shape transition ${fromRange} remains unavailable with evidence intact`, () => {
  const input = request("eurjpy");
  setRight(input, boj(RIGHT_DATE, TARGET_CAPTURE, 0.5, !fromRange));
  Reflect.set(input, "rightHistory", rightHistory("eurjpy", [{ date: PRIOR, snapshots: [boj(PRIOR, CUTOFF, 0.5, fromRange)] }]));
  const result = build(input);
  assert.equal(result.availability, "partial");
  assert.deepEqual(result.right.change, { status: "unavailable", institution: "BoJ", reason: "INCOMPATIBLE_POLICY_SHAPES",
    fromShape: fromRange ? "range" : "scalar", toShape: fromRange ? "scalar" : "range" });
  assert.equal(result.right.targetEvidence.status, "available");
  assert.equal(result.right.priorSelection.prior.status, "available");
});
test("BoE meeting/publication dates, release proof and null effectiveness stay distinct", () => {
  const input = request("eurgbp");
  setRight(input, boe("2025-05-08", TARGET_CAPTURE, 4.25, { release: true }), "2025-05-08");
  Reflect.set(input, "rightHistory", rightHistory("eurgbp", [{ date: "2025-04-17", snapshots: [boe("2025-04-17", CUTOFF)] }]));
  const result = build(input);
  const target = result.right.targetEvidence;
  assert.ok(target.status === "available" && target.institution === "BoE" && target.data.policySetting.availability === "available");
  assert.equal(target.binding.selectionDateKind, "publication-date");
  assert.equal(target.data.timing.meetingEndDate, "2025-05-07");
  assert.equal(target.data.timing.publicationDate, "2025-05-08");
  assert.equal(target.data.timing.releaseTimestamp, boeLondonReleaseTimestampV1("2025-05-08", "12:02", "BST"));
  assert.equal(target.data.timing.effectiveDate, null);
  assert.equal(target.data.policySetting.data.releaseEvidence?.sourceUrl, BOE_MAY_2025_RELEASE_NOTICE_URL_V1);
});
for (const [before, after, bp] of [[-0.5, -0.25, 25], [0, -0.25, -25], [-0.25, 0.25, 50], [0, 0, 0]] as const) {
  test(`SNB signed ${before} to ${after} preserved without release inference`, () => {
    const input = request("eurchf");
    setRight(input, snb(RIGHT_DATE, TARGET_CAPTURE, after));
    Reflect.set(input, "rightHistory", rightHistory("eurchf", [{ date: PRIOR, snapshots: [snb(PRIOR, CUTOFF, before)] }]));
    const result = build(input);
    assert.ok(result.right.change.status === "available" && result.right.change.institution === "SNB");
    assert.equal(result.right.change.policyRate.deltaBasisPoints, bp);
    assert.ok(result.right.targetEvidence.status === "available" && result.right.targetEvidence.institution === "SNB");
    assert.equal(result.right.targetEvidence.data.timing.releaseTimestamp, null);
  });
}

test("histories are read exactly once by their trusted child builders", () => {
  const input = request();
  for (const key of ["leftHistory", "rightHistory"] as const) {
    const history = input[key];
    let reads = 0;
    Object.defineProperty(input, key, { get() { if (++reads > 1) throw new Error("history re-read"); return history; } });
  }
  assert.equal(build(input).availability, "available");
});
test("independent canonical rebuild disagreement fails for changed facts, dates, versions, product and time", () => {
  const first = request().readinessInput.policyInput;
  const variants = [clone(first), clone(first), clone(first), request("eurjpy").readinessInput.policyInput, clone(first), clone(first)];
  Reflect.set(variants[0], "euro", supplied(ecb(TARGET, TARGET_CAPTURE, { level: 2.75 })));
  Reflect.set(variants[1]!.counterparty, "evidence", supplied(fomc(RIGHT_DATE, TARGET_CAPTURE, 4.5)));
  Reflect.set(variants[2]!.counterparty, "evidence", supplied(fomc(PRIOR, TARGET_CAPTURE)));
  Reflect.set(variants[2]!.counterparty, "decisionDate", PRIOR);
  Reflect.set(variants[4], "evaluatedAt", AT.replace("10:00", "10:01"));
  Reflect.set(variants[5], "euro", supplied(ecb(TARGET, TARGET_CAPTURE + 1)));
  for (const [index, later] of variants.entries()) {
    const input = request();
    let reads = 0;
    Object.defineProperty(input.readinessInput, "policyInput", { get: () => ++reads === 1 ? first : later });
    // A changed product can fail even earlier at the trusted history binding.
    assert.throws(() => build(input), index === 3 ? TypeError : /contexts disagree/);
  }
});
test("admission disagreement in either direction fails even when both contexts are canonically valid", () => {
  for (const firstAbsent of [false, true]) {
    const input = request();
    const admitted = input.readinessInput.policyInput;
    const missing = clone(admitted);
    Reflect.set(missing, "euro", absent());
    let reads = 0;
    Object.defineProperty(input.readinessInput, "policyInput", { get: () => (++reads === 1) === firstAbsent ? missing : admitted });
    assert.throws(() => build(input), /contexts disagree/);
  }
});
test("canonical envelope forgery propagates rather than becoming unavailable", () => {
  for (const field of ["knownAt", "eventSourceVersionId", "canonicalEventId"]) {
    const input = clone(request());
    const euro = input.readinessInput.policyInput.euro;
    assert.ok(euro.status === "supplied");
    Reflect.set(euro.snapshot, field, field === "knownAt" ? 0 : "forged");
    assert.throws(() => build(input));
  }
});
test("accessor and Proxy defects propagate by exact identity", () => {
  for (const error of [new ReferenceError("sentinel"), new TypeError("sentinel")]) {
    assert.throws(() => build(new Proxy(request(), { ownKeys() { throw error; } })), (caught) => caught === error);
    for (const key of ["readinessInput", "knowledgeCutoff", "leftHistory", "rightHistory"] as const) {
      const input = request();
      Object.defineProperty(input, key, { get() { throw error; } });
      assert.throws(() => build(input), (caught) => caught === error);
    }
    const input = request();
    const original = input.readinessInput.policyInput;
    let reads = 0;
    Object.defineProperty(input.readinessInput, "policyInput", { get() { if (++reads > 1) throw error; return original; } });
    assert.throws(() => build(input), (caught) => caught === error);
  }
});
for (const product of PRODUCTS) test(`${product}: recursively frozen, detached, deterministic and caller isolated`, () => {
  const input = clone(request(product));
  const before = clone(input);
  const caller = new Set<object>();
  eachObject(input, (object) => { caller.add(object); assert.ok(!Object.isFrozen(object)); });
  const result = build(input);
  const expected = clone(result);
  assert.deepEqual(result, build(input));
  assert.deepEqual(input, before);
  eachObject(input, (object) => assert.ok(!Object.isFrozen(object)));
  eachObject(result, (object) => {
    assert.ok(Object.isFrozen(object));
    assert.ok(!caller.has(object));
    assert.equal(Reflect.set(object, "injected", 99), false);
  });
  assert.deepEqual(input, before);
  eachObject(input, (object) => Reflect.set(object, "afterBuild", true));
  assert.deepEqual(result, expected);
});
test("output vocabulary contains no comparison, interpretation, currentness or combined event identity", () => {
  const forbidden = new Set(["policyRateDifference", "changeDifferential", "differential", "spread", "gap", "divergence", "convergence",
    "stance", "hawkish", "dovish", "hypothesis", "fxDirection", "confidence", "conviction", "recommendation", "surprise", "expectation",
    "consensus", "marketReaction", "latestPolicyCoverage", "currentPolicy", "latestPolicy", "combinedEventId", "comparison",
    "representativeRate", "midpoint", "ruleVersion", "effectiveFrom", "effectiveTo", "policyState", "freshness"]);
  for (const product of PRODUCTS) for (const focus of ["left", "right"] as const) {
    const result = build(request(product, focus));
    eachObject(result, (object) => { for (const key of Reflect.ownKeys(object)) assert.ok(!forbidden.has(String(key)), String(key)); });
    assert.doesNotMatch(JSON.stringify(result), /\b(?:hawkish|dovish|bullish|bearish|BUY|SELL|WAIT|simultaneous|paired)\b/);
    assert.ok(result.missingChangePaths.every((path) => path === "left.change" || path === "right.change"));
  }
});
test("all products operate with network and implicit clock disabled", () => {
  const fetchBefore = globalThis.fetch;
  const nowBefore = Date.now;
  const inputs = PRODUCTS.map((product) => request(product));
  try {
    globalThis.fetch = () => { throw new Error("network used"); };
    Date.now = () => { throw new Error("implicit clock used"); };
    for (const input of inputs) assert.equal(build(input).availability, "available");
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; }
});
test("static inactivity and composition-only operations", () => {
  const source = readFileSync("src/lib/markets/events/bilateralPolicyDecisionChangeJuxtaposition.ts", "utf8");
  const ast = ts.createSourceFile("juxtaposition.ts", source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    assert.ok(!ts.isCatchClause(node));
    if (ts.isImportDeclaration(node)) {
      const name = (node.moduleSpecifier as ts.StringLiteral).text;
      assert.ok(!/persistence|runtime|projection|delivery|transport|acquisition|redis|database|node:fs|aws|R2|eventLifecycle/i.test(name));
    }
    if (ts.isCallExpression(node)) assert.ok(!/^(fetch|setTimeout|setInterval|Date\.now)$/.test(node.expression.getText(ast)));
    if (ts.isNewExpression(node) && node.expression.getText(ast) === "Date") assert.ok(node.arguments && node.arguments.length > 0);
    if (ts.isPropertyAccessExpression(node)) {
      assert.notEqual(node.getText(ast), "process.env");
      // Child policy arithmetic remains wholly inside the existing child builder.
      assert.ok(!/\.(deltaBasisPoints|deltaPercentagePoints|rates|targetLower|targetUpper|nominalTarget|bankRate|policyRate)$/.test(node.getText(ast)));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
});
