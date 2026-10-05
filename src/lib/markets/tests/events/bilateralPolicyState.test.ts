import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import {
  buildBilateralPolicyStateV1,
  type BuildBilateralPolicyStateInputV1,
  type InputUnavailableReason,
  type SuppliedEvidence,
} from "../../events/bilateralPolicyState";
import {
  ECB_POLICY_RATE_SERIES, ecbMonetaryPolicyCanonicalEventIdV1,
  normalizeEcbMonetaryPolicyEventV1,
} from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { buildUsPolicyCanonicalSeriesV1 } from "../../providers/federalReserve/canonical";
import { fomcDocumentUrlV1 } from "../../providers/federalReserve/transport";
import type { FomcFactV1 } from "../../providers/federalReserve/fomc";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import { BOJ_POLICY_INSTRUMENT_V1, type BojPolicyFactV1 } from "../../providers/boj/facts";
import { bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { buildBoeBankRateEvidenceV1 } from "../../providers/boe/canonical";
import {
  BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1, boeLondonReleaseTimestampV1, type BoeBankRateFactV1,
} from "../../providers/boe/facts";
import { BOE_MAY_2025_RELEASE_NOTICE_URL_V1, boeBankRateDocumentUrlV1 } from "../../providers/boe/transport";
import { buildSnbPolicyEvidenceV1 } from "../../providers/snb/canonical";
import type { SnbPolicyFactV1 } from "../../providers/snb/facts";
import { snbPolicyDocumentUrlV1 } from "../../providers/snb/transport";
import type { FxProjectionProductIdV1 } from "../../projections/types";

// Synthetic canonical fixtures only; never claims of acquired live policy facts.
const AS_OF = "2026-10-05T10:00:00.000Z";
const CAPTURE = "2026-10-05T09:00:00Z";
const ECB_DATE = "2026-09-10";
const FED_DATE = "2025-01-29";
const BOJ_DATE = "2025-01-24";
const BOE_DATE = "2025-05-08";
const SNB_DATE = "2025-06-19";
const products = ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const;
const unix = (instant: string) => Math.floor(Date.parse(instant) / 1000);
const clone = <T>(value: T): T => structuredClone(value);
const supplied = <S>(snapshot: S): SuppliedEvidence<S> => ({ status: "supplied", snapshot });
const absent = (reason: InputUnavailableReason = "RUNTIME_INACTIVE", upstreamReason: string | null = null) =>
  ({ status: "unavailable", reason, upstreamReason } as const);

function ecb(capture = CAPTURE, context: "rates" | "schedule" | "document" = "rates") {
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: ECB_DATE,
    schedule: { meetingDate: ECB_DATE, fetchedAt: unix(capture) },
    decision: context === "schedule" ? null : {
      decisionDate: ECB_DATE,
      documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~abc123.en.html",
      contentDigest: "a".repeat(64), fetchedAt: unix(capture), firstObservedAt: unix(capture),
      actualReleasedAt: "2026-09-10T12:15:00Z",
      rates: context === "document" ? null : { depositFacility: 2, mainRefinancingOperations: 2.15,
        marginalLendingFacility: 2.4, effectiveDate: "2026-09-16" },
    },
  }));
}

function fomc(capture = CAPTURE) {
  const fact: FomcFactV1 = { decisionDate: FED_DATE, targetLower: 4.25, targetUpper: 4.5,
    unit: "percent", action: "maintain", statementUrl: fomcDocumentUrlV1(FED_DATE),
    implementationNoteUrl: fomcDocumentUrlV1(FED_DATE, true), effectiveDate: "2025-01-30",
    releaseTimestamp: unix("2025-01-29T19:00:00Z") };
  return buildCanonicalStatisticalSeriesSnapshotV1(
    buildUsPolicyCanonicalSeriesV1(`fomc:${FED_DATE}`, [fact], unix(capture)),
  );
}

function boj(capture = CAPTURE, range = false) {
  const date = range ? "2024-03-19" : BOJ_DATE;
  const fact: BojPolicyFactV1 = { institution: "Bank of Japan", productId: "eurjpy",
    instrument: BOJ_POLICY_INSTRUMENT_V1, decisionDate: date,
    documentKind: range ? "framework-transition" : "guideline-change",
    target: range ? { shape: "range", lower: 0, upper: 0.1, qualification: "around" }
      : { shape: "scalar", value: 0.5, qualification: "around" },
    unit: "percent", sourceUrl: bojPolicyDocumentUrlV1(date), releaseTimestamp: null,
    effectiveDate: range ? "2024-03-20" : "2025-01-27" };
  const evidence = buildBojPolicyEvidenceV1(fact, unix(capture));
  return { schemaVersion: "boj-policy-evidence-snapshot-v1" as const,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, knownAt: unix(capture),
    sourceVersionId: evidence.metadata.sourceVersionId, evidence };
}

function boe(capture = CAPTURE, release = false) {
  const fact: BoeBankRateFactV1 = { institution: "Bank of England", committee: "Monetary Policy Committee",
    productId: "eurgbp", instrument: "Bank Rate", documentId: "monetary-policy-summary-and-minutes:2025-05",
    meetingEndDate: "2025-05-07", publicationDate: BOE_DATE,
    decision: { action: "reduce", rate: 4.25, changePercentagePoints: 0.25 },
    unit: "percent", sourceUrl: boeBankRateDocumentUrlV1(BOE_DATE), effectiveDate: null,
    releaseTimestamp: release ? boeLondonReleaseTimestampV1(BOE_DATE, "12:02", "BST") : null,
    releaseEvidence: release ? { sourceUrl: BOE_MAY_2025_RELEASE_NOTICE_URL_V1,
      documentTitle: BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1, publicationDate: "2025-05-06",
      localTime: "12:02", timezone: "BST" } : null };
  const evidence = buildBoeBankRateEvidenceV1(fact, unix(capture));
  return { schemaVersion: "boe-bank-rate-evidence-snapshot-v1" as const,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, knownAt: unix(capture),
    sourceVersionId: evidence.metadata.sourceVersionId, evidence };
}

function snb(capture = CAPTURE, rate = 0) {
  const sourceUrl = snbPolicyDocumentUrlV1(SNB_DATE);
  const fact: SnbPolicyFactV1 = { institution: "Swiss National Bank", decisionBody: "Governing Board",
    productId: "eurchf", instrument: "SNB policy rate", documentId: sourceUrl.slice(sourceUrl.lastIndexOf("/") + 1),
    documentTitle: "Monetary policy assessment of 19 June 2025", decisionDate: SNB_DATE, publicationDate: SNB_DATE,
    decision: { action: "reduce", rate, changePercentagePoints: 0.25 }, unit: "percent",
    sourceUrl, releaseTimestamp: null, effectiveDate: "2025-06-20" };
  const evidence = buildSnbPolicyEvidenceV1(fact, unix(capture));
  return { schemaVersion: "snb-policy-evidence-snapshot-v1" as const,
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, knownAt: unix(capture),
    sourceVersionId: evidence.metadata.sourceVersionId, evidence };
}

function input(productId: FxProjectionProductIdV1 = "eurusd", capture = CAPTURE): BuildBilateralPolicyStateInputV1 {
  const base = { evaluatedAt: AS_OF, expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(ECB_DATE),
    euro: supplied(ecb()) };
  switch (productId) {
    case "eurusd": return { ...base, productId, counterparty: { decisionDate: FED_DATE, evidence: supplied(fomc(capture)) } };
    case "eurjpy": return { ...base, productId, counterparty: { decisionDate: BOJ_DATE, evidence: supplied(boj(capture)) } };
    case "eurgbp": return { ...base, productId, counterparty: { publicationDate: BOE_DATE, evidence: supplied(boe(capture)) } };
    case "eurchf": return { ...base, productId, counterparty: { decisionDate: SNB_DATE, evidence: supplied(snb(capture)) } };
  }
}

function available<T extends { readonly availability: string }>(side: T): Extract<T, { availability: "available" }> {
  assert.equal(side.availability, "available");
  return side as Extract<T, { availability: "available" }>;
}
function fedData(candidate = input()) {
  const result = buildBilateralPolicyStateV1(candidate);
  assert.equal(result.productId, "eurusd");
  if (result.productId !== "eurusd") throw new Error("Wrong fixture product");
  return available(result.right).data;
}
function bojData(candidate = input("eurjpy")) {
  const result = buildBilateralPolicyStateV1(candidate);
  if (result.productId !== "eurjpy") throw new Error("Wrong fixture product");
  return available(result.right).data;
}
function boeData(candidate = input("eurgbp")) {
  const result = buildBilateralPolicyStateV1(candidate);
  if (result.productId !== "eurgbp") throw new Error("Wrong fixture product");
  return available(result.right).data;
}
function snbData(candidate = input("eurchf")) {
  const result = buildBilateralPolicyStateV1(candidate);
  if (result.productId !== "eurchf") throw new Error("Wrong fixture product");
  return available(result.right).data;
}
function reject(candidate: unknown) {
  assert.throws(() => buildBilateralPolicyStateV1(candidate as BuildBilateralPolicyStateInputV1));
}
function eachObject(value: unknown, check: (value: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  check(value);
  for (const nested of Object.values(value)) eachObject(nested, check);
}
function moduleSource() {
  return readFileSync(resolve("src/lib/markets/events/bilateralPolicyState.ts"), "utf8");
}

for (const [product, instrument] of [
  ["eurusd", "federal-funds-target-range"], ["eurjpy", BOJ_POLICY_INSTRUMENT_V1],
  ["eurgbp", "Bank Rate"], ["eurchf", "SNB policy rate"],
] as const) {
  test(`pairing: ${product} binds ECB and ${instrument}`, () => {
    const result = buildBilateralPolicyStateV1(input(product));
    assert.equal(result.productId, product);
    assert.equal(available(result.right).data.instrument, instrument);
    assert.deepEqual(available(result.left).data.instrument, ECB_POLICY_RATE_SERIES);
  });
}
test("reject estr", () => reject({ ...input(), productId: "estr" }));
test("reject unknown/sixth product", () => reject({ ...input(), productId: "gbpusd" }));
test("deterministic identical output", () => {
  const candidate = input();
  assert.deepEqual(buildBilateralPolicyStateV1(candidate), buildBilateralPolicyStateV1(candidate));
});
test("caller objects remain unchanged and unfrozen", () => {
  const candidate = clone(input());
  const before = clone(candidate);
  buildBilateralPolicyStateV1(candidate);
  assert.deepEqual(candidate, before);
  eachObject(candidate, (value) => assert.equal(Object.isFrozen(value), false));
});
test("output is deeply immutable and detached", () => {
  const candidate = clone(input());
  const result = buildBilateralPolicyStateV1(candidate);
  eachObject(result, (value) => assert.ok(Object.isFrozen(value)));
  const left = available(result.left).data;
  if (candidate.euro.status !== "supplied") throw new Error("Expected supplied fixture");
  assert.notEqual(left.snapshot, candidate.euro.snapshot);
  Reflect.set(candidate.euro.snapshot.event.decision!.rates!, "depositFacility", 99);
  assert.equal(left.policySetting.data.depositFacility, 2);
  assert.equal(Reflect.set(left.policySetting.data, "depositFacility", 99), false);
});
test("ECB complete structured rates retained", () => {
  const left = available(buildBilateralPolicyStateV1(input()).left).data;
  assert.deepEqual(left.policySetting.data, ecb().event.decision!.rates);
  assert.equal(left.policySetting.semantic, "source-fact");
});
test("ECB retains all three distinct instrument identities", () => {
  const left = available(buildBilateralPolicyStateV1(input()).left).data;
  assert.deepEqual(Object.keys(left.instrument), ["depositFacility", "mainRefinancingOperations", "marginalLendingFacility"]);
  assert.equal(left.policySetting.data.mainRefinancingOperations, 2.15);
  assert.equal(left.policySetting.data.marginalLendingFacility, 2.4);
});
test("ECB schedule-only context is partial", () => {
  const result = buildBilateralPolicyStateV1({ ...input(), euro: supplied(ecb(CAPTURE, "schedule")) });
  assert.equal(result.left.availability, "partial");
  if (result.left.availability !== "partial") throw new Error("Expected partial");
  assert.deepEqual(result.left.missing, ["decisionDocument", "policySetting"]);
  assert.equal(result.left.data.policySetting.availability, "unavailable");
  assert.equal(result.left.data.timing.decisionDate, null);
  assert.equal(result.left.data.timing.actualReleasedAt, null);
});
test("ECB decision document without rates is partial", () => {
  const result = buildBilateralPolicyStateV1({ ...input(), euro: supplied(ecb(CAPTURE, "document")) });
  assert.equal(result.left.availability, "partial");
  if (result.left.availability !== "partial") throw new Error("Expected partial");
  assert.deepEqual(result.left.missing, ["policySetting"]);
  assert.equal(result.left.data.timing.decisionDate, ECB_DATE);
  assert.equal(result.left.data.timing.effectiveDate, null);
});
test("ECB wrong expected event identity rejected", () => reject({ ...input(),
  expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1("2026-07-23") }));
test("ECB malformed snapshot rejected", () => {
  const snapshot = clone(ecb());
  Reflect.set(snapshot, "eventSourceVersionId", "tampered");
  reject({ ...input(), euro: supplied(snapshot) });
});
test("ECB supplies no generic comparison operand", () => {
  const left = available(buildBilateralPolicyStateV1(input()).left).data;
  assert.equal(Object.hasOwn(left.policySetting.data, "rate"), false);
  assert.equal(Object.hasOwn(left, "comparisonOperand"), false);
});
test("ECB source timing distinctions preserved", () => {
  const left = available(buildBilateralPolicyStateV1(input()).left).data;
  assert.deepEqual(left.timing, { scheduledAt: ecb().event.schedule.scheduledAt,
    decisionDate: ECB_DATE, actualReleasedAt: "2026-09-10T12:15:00.000Z", effectiveDate: "2026-09-16" });
});
test("Fed full FOMC fact recovered from annotation", () => {
  const fact = fedData().policySetting.data;
  assert.equal(fact.action, "maintain");
  assert.equal(fact.unit, "percent");
  assert.equal(fact.statementUrl, fomcDocumentUrlV1(FED_DATE));
});
test("Fed preserves both target bounds", () => {
  const fact = fedData().policySetting.data;
  assert.equal(fact.targetLower, 4.25);
  assert.equal(fact.targetUpper, 4.5);
});
test("Fed EFFR cannot substitute", () => {
  const series = buildUsPolicyCanonicalSeriesV1("effr", [{ observationDate: FED_DATE, rate: 4.33,
    unit: "percent", volumeInBillions: null, volumeUnit: "billions of U.S. dollars",
    targetLower: 4.25, targetUpper: 4.5, footnoteId: null, revisionIndicator: null }], unix(CAPTURE));
  reject({ ...input(), counterparty: { decisionDate: FED_DATE,
    evidence: supplied(buildCanonicalStatisticalSeriesSnapshotV1(series)) } });
});
test("Fed malformed annotation rejected", () => {
  const snapshot = clone(fomc());
  Reflect.set(snapshot.series.observations[0], "officialStatus", "invalid-json");
  reject({ ...input(), counterparty: { decisionDate: FED_DATE, evidence: supplied(snapshot) } });
});
test("Fed wrong decision date rejected", () => reject({ ...input(), counterparty: {
  decisionDate: "2025-01-30", evidence: supplied(fomc()) } }));
test("Fed tampered content identity rejected even when envelope and metadata agree", () => {
  const snapshot = clone(fomc());
  Reflect.set(snapshot, "sourceVersionId", "us-policy-evidence-v1:sha256:" + "0".repeat(64));
  Reflect.set(snapshot.series.metadata, "sourceVersionId", snapshot.sourceVersionId);
  reject({ ...input(), counterparty: { decisionDate: FED_DATE, evidence: supplied(snapshot) } });
});
test("Fed exposes no midpoint or representative scalar", () => {
  const fact = fedData().policySetting.data;
  for (const key of ["midpoint", "rate", "representativeRate", "differential"]) assert.equal(Object.hasOwn(fact, key), false);
});
test("Fed rejects numeric carrier without complete annotation", () => {
  const snapshot = clone(fomc());
  Reflect.deleteProperty(snapshot.series.observations[0], "officialStatus");
  reject({ ...input(), counterparty: { decisionDate: FED_DATE, evidence: supplied(snapshot) } });
});
test("Fed preserves release/effective/decision timing", () => assert.deepEqual(fedData().timing, {
  decisionDate: FED_DATE, releaseTimestamp: unix("2025-01-29T19:00:00Z"), effectiveDate: "2025-01-30",
}));
test("BoJ scalar remains scalar", () => assert.deepEqual(bojData().policySetting.data.target,
  { shape: "scalar", value: 0.5, qualification: "around" }));
test("BoJ range remains range", () => {
  const snapshot = boj(CAPTURE, true);
  const data = bojData({ ...input("eurjpy"), productId: "eurjpy", counterparty: {
    decisionDate: snapshot.evidence.fact.decisionDate, evidence: supplied(snapshot) } });
  assert.deepEqual(data.policySetting.data.target, { shape: "range", lower: 0, upper: 0.1, qualification: "around" });
});
test("BoJ around qualification preserved", () => assert.equal(bojData().policySetting.data.target.qualification, "around"));
test("BoJ range has no midpoint/representative scalar", () => {
  const snapshot = boj(CAPTURE, true);
  const target = bojData({ ...input("eurjpy"), productId: "eurjpy", counterparty: {
    decisionDate: "2024-03-19", evidence: supplied(snapshot) } }).policySetting.data.target;
  for (const key of ["value", "midpoint", "rate"]) assert.equal(Object.hasOwn(target, key), false);
});
test("BoJ wrong identity rejected", () => {
  const snapshot = clone(boj());
  Reflect.set(snapshot, "canonicalSeriesId", "wrong");
  reject({ ...input("eurjpy"), counterparty: { decisionDate: BOJ_DATE, evidence: supplied(snapshot) } });
});
test("BoJ unsupported historical regime rejected", () => reject({ ...input("eurjpy"),
  counterparty: { decisionDate: "2020-01-01", evidence: supplied(boj()) } }));
test("BoE scalar Bank Rate retained with source action/change", () => {
  const data = boeData();
  assert.equal(data.instrument, "Bank Rate");
  assert.deepEqual(data.policySetting.data.decision, { action: "reduce", rate: 4.25, changePercentagePoints: 0.25 });
});
test("BoE meeting end date retained separately", () => assert.equal(boeData().timing.meetingEndDate, "2025-05-07"));
test("BoE publication date retained separately", () => {
  const timing = boeData().timing;
  assert.equal(timing.publicationDate, BOE_DATE);
  assert.notEqual(timing.publicationDate, timing.meetingEndDate);
  assert.equal(Object.hasOwn(timing, "decisionDate"), false);
});
test("BoE null effective date remains null", () => {
  assert.equal(boeData().timing.effectiveDate, null);
  assert.equal(boeData().policySetting.data.effectiveDate, null);
});
test("BoE event-specific release timing/proof retained", () => {
  const data = boeData({ ...input("eurgbp"), productId: "eurgbp", counterparty: {
    publicationDate: BOE_DATE, evidence: supplied(boe(CAPTURE, true)) } });
  assert.equal(data.timing.releaseTimestamp, unix("2025-05-08T11:02:00Z"));
  assert.deepEqual(data.snapshot.evidence.fact.releaseEvidence, boe(CAPTURE, true).evidence.fact.releaseEvidence);
});
test("BoE wrong publication date rejected", () => reject({ ...input("eurgbp"), counterparty: {
  publicationDate: "2025-05-07", evidence: supplied(boe()) } }));
test("BoE missing release instant is not synthesized", () => assert.equal(boeData().timing.releaseTimestamp, null));
test("SNB zero scalar preserved", () => assert.equal(snbData().policySetting.data.decision.rate, 0));
test("SNB negative modern scalar preserved", () => {
  const data = snbData({ ...input("eurchf"), productId: "eurchf", counterparty: {
    decisionDate: SNB_DATE, evidence: supplied(snb(CAPTURE, -0.75)) } });
  assert.equal(data.policySetting.data.decision.rate, -0.75);
});
test("SNB null release timestamp preserved", () => assert.equal(snbData().timing.releaseTimestamp, null));
test("SNB explicit effective date retained", () => assert.equal(snbData().timing.effectiveDate, "2025-06-20"));
test("SNB wrong identity rejected", () => {
  const snapshot = clone(snb());
  Reflect.set(snapshot.evidence.fact, "instrument", "SARON");
  reject({ ...input("eurchf"), counterparty: { decisionDate: SNB_DATE, evidence: supplied(snapshot) } });
});
test("SNB decision/publication dates and explicit change retained", () => {
  const data = snbData();
  assert.equal(data.timing.decisionDate, SNB_DATE);
  assert.equal(data.timing.publicationDate, SNB_DATE);
  assert.equal(data.policySetting.data.decision.changePercentagePoints, 0.25);
});
test("knowledge at exact evaluated boundary accepted on all sides", () => {
  for (const product of products) {
    const result = buildBilateralPolicyStateV1({ ...input(product, AS_OF), euro: supplied(ecb(AS_OF)) });
    assert.equal(result.availability, "available");
    assert.equal(result.evidenceKnownAt, unix(AS_OF));
  }
});
test("knowledge one second after boundary excluded for every bank", () => {
  for (const product of products) {
    const result = buildBilateralPolicyStateV1(input(product, "2026-10-05T10:00:01Z"));
    assert.deepEqual(result.right, { availability: "unavailable", reason: "KNOWLEDGE_INCONSISTENT", upstreamReason: null });
    const futureEuro = buildBilateralPolicyStateV1({ ...input(product), euro: supplied(ecb("2026-10-05T10:00:01Z")) });
    assert.deepEqual(futureEuro.left, { availability: "unavailable", reason: "KNOWLEDGE_INCONSISTENT", upstreamReason: null });
  }
});
test("temporal exclusion exposes no snapshot and selects no fallback", () => {
  const result = buildBilateralPolicyStateV1({ ...input("eurusd", "2026-10-05T10:00:01Z"),
    euro: supplied(ecb("2026-10-05T10:00:01Z")) });
  assert.equal(result.availability, "unavailable");
  assert.equal(result.evidenceKnownAt, null);
  assert.equal(Object.hasOwn(result.left, "data"), false);
  assert.equal(Object.hasOwn(result.right, "snapshot"), false);
  assert.equal(JSON.stringify(result).includes(fomcDocumentUrlV1(FED_DATE)), false);
});
test("evidenceKnownAt is maximum admitted knowledge", () => {
  const result = buildBilateralPolicyStateV1(input("eurusd", "2026-10-05T09:30:00Z"));
  assert.equal(result.evidenceKnownAt, unix("2026-10-05T09:30:00Z"));
});
test("evidenceKnownAt is null without admitted evidence", () => {
  const candidate = input();
  Reflect.set(candidate.counterparty, "evidence", absent());
  assert.equal(buildBilateralPolicyStateV1({ ...candidate, euro: absent() }).evidenceKnownAt, null);
});
test("historical decision captured later cannot leak backward", () => {
  const result = buildBilateralPolicyStateV1({ ...input(), evaluatedAt: "2025-02-01T10:00:00Z", euro: absent() });
  assert.equal(result.right.availability, "unavailable");
  assert.equal(result.evidenceKnownAt, null);
});
test("both settings available yields available", () => assert.equal(buildBilateralPolicyStateV1(input()).availability, "available"));
test("one available side yields partial", () => {
  assert.equal(buildBilateralPolicyStateV1({ ...input(), euro: absent() }).availability, "partial");
  const candidate = input();
  Reflect.set(candidate.counterparty, "evidence", absent());
  assert.equal(buildBilateralPolicyStateV1(candidate).availability, "partial");
});
test("ECB context plus complete counterparty yields partial", () => assert.equal(buildBilateralPolicyStateV1({
  ...input(), euro: supplied(ecb(CAPTURE, "schedule")),
}).availability, "partial"));
test("neither side yields unavailable", () => {
  const candidate = input();
  Reflect.set(candidate.counterparty, "evidence", absent());
  assert.equal(buildBilateralPolicyStateV1({ ...candidate, euro: absent() }).availability, "unavailable");
});
test("upstream unavailable diagnostic retained without snapshot", () => {
  const reason = absent("PERSISTENCE_UNAVAILABLE", "duplicate-score");
  const result = buildBilateralPolicyStateV1({ ...input(), euro: reason });
  assert.deepEqual(result.left, { availability: "unavailable", reason: reason.reason, upstreamReason: "duplicate-score" });
});
test("missing paths are deterministic and unique", () => {
  const candidate = input();
  Reflect.set(candidate.counterparty, "evidence", absent());
  const result = buildBilateralPolicyStateV1({ ...candidate, euro: supplied(ecb(CAPTURE, "schedule")) });
  assert.deepEqual(result.missing, ["left.policySetting", "right.policySetting"]);
  assert.equal(new Set(result.missing).size, result.missing.length);
  assert.equal(result.availability, "partial");
});
test("stale upstream selection is never substituted", () => {
  const result = buildBilateralPolicyStateV1({ ...input(), euro: absent("STALE_EVIDENCE", "upstream-selection") });
  assert.deepEqual(result.left, { availability: "unavailable", reason: "STALE_EVIDENCE", upstreamReason: "upstream-selection" });
});
test("upstream identity conflict is never substituted", () => {
  const candidate = input("eurchf");
  Reflect.set(candidate.counterparty, "evidence", absent("IDENTITY_CONFLICT", "conflicting-source"));
  assert.deepEqual(buildBilateralPolicyStateV1(candidate).right,
    { availability: "unavailable", reason: "IDENTITY_CONFLICT", upstreamReason: "conflicting-source" });
});
test("freshness always not-assessed on admitted sides", () => {
  for (const product of products) {
    const result = buildBilateralPolicyStateV1(input(product));
    for (const side of [result.left, result.right]) {
      const freshness = available(side).data.freshness;
      assert.equal(freshness.status, "not-assessed");
      assert.equal(freshness.reason, "POLICY_CURRENTNESS_NOT_ESTABLISHED");
      assert.equal(freshness.semantic, "derived-feature");
    }
  }
});
test("arithmetic age uses explicit epoch seconds including fractional assessment", () => {
  const result = buildBilateralPolicyStateV1({ ...input(), evaluatedAt: "2026-10-05T10:00:00.999Z" });
  assert.equal(available(result.left).data.freshness.evidenceAgeSeconds, 3600);
});
test("old capture does not become stale automatically", () => {
  const result = buildBilateralPolicyStateV1({ ...input(), euro: supplied(ecb("2026-09-10T12:16:00Z")) });
  assert.equal(result.left.availability, "available");
  assert.equal(available(result.left).data.freshness.status, "not-assessed");
});
test("recent capture of old decision establishes neither latest nor current", () => {
  const result = buildBilateralPolicyStateV1(input());
  assert.equal(fedData().policySetting.data.decisionDate, FED_DATE);
  assert.equal(available(result.right).data.knownAt, unix(CAPTURE));
  assert.equal(result.latestPolicyCoverage.availability, "unavailable");
  assert.equal(result.basis, "captured-announced-settings");
  assert.equal(result.coverage, "provided-evidence-only");
});
test("latest coverage always unavailable for all pairings", () => {
  for (const product of products) assert.deepEqual(buildBilateralPolicyStateV1(input(product)).latestPolicyCoverage,
    { availability: "unavailable", reason: "LATEST_POLICY_COVERAGE_UNAVAILABLE" });
});
test("policy differential always unavailable", () => {
  for (const product of products) assert.deepEqual(buildBilateralPolicyStateV1(input(product)).policyRateDifference,
    { semantic: "derived-feature", availability: "unavailable", reason: "COMPARISON_RULE_UNESTABLISHED" });
});
test("scalar BoE and SNB evidence still produces no numeric differential", () => {
  for (const product of ["eurgbp", "eurchf"] as const) {
    const comparison = buildBilateralPolicyStateV1(input(product)).policyRateDifference;
    assert.equal(Object.values(comparison).some((value) => typeof value === "number"), false);
  }
});
test("FOMC range produces no numerical differential", () => assert.equal(
  buildBilateralPolicyStateV1(input()).policyRateDifference.availability, "unavailable"));
test("BoJ range produces no numerical differential", () => {
  const result = buildBilateralPolicyStateV1({ ...input("eurjpy"), productId: "eurjpy", counterparty: {
    decisionDate: "2024-03-19", evidence: supplied(boj(CAPTURE, true)) } });
  assert.equal(result.policyRateDifference.availability, "unavailable");
});
test("no confidence/recommendation/lifecycle/scenario fields", () => {
  for (const product of products) eachObject(buildBilateralPolicyStateV1(input(product)), (object) => {
    for (const key of ["confidence", "recommendation", "lifecycle", "scenario", "risk", "assessment", "consensus", "surprise"])
      assert.equal(Object.hasOwn(object, key), false);
  });
});
test("no BUY SELL WAIT hawkish or dovish labels", () => {
  for (const product of products) assert.doesNotMatch(JSON.stringify(buildBilateralPolicyStateV1(input(product))),
    /\b(?:BUY|SELL|WAIT|hawkish|dovish)\b/);
});
test("no network dependency invoked", () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = () => { throw new Error("Unexpected network access"); };
    for (const product of products) assert.equal(buildBilateralPolicyStateV1(input(product)).availability, "available");
  } finally { globalThis.fetch = previous; }
});
test("persistence imports are type-only and no storage call dependency exists", () => {
  const file = ts.createSourceFile("bilateralPolicyState.ts", moduleSource(), ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.includes("/persistence/")) assert.ok(statement.importClause?.isTypeOnly);
  }
  assert.doesNotMatch(moduleSource(), /(?:create\w*Adapter|readAsKnownAt|appendVintage)\s*\(/);
});
test("no implicit wall-clock or timer dependency", () => {
  const previous = Date.now;
  try {
    Date.now = () => { throw new Error("Unexpected clock access"); };
    for (const product of products) buildBilateralPolicyStateV1(input(product));
  } finally { Date.now = previous; }
  assert.doesNotMatch(moduleSource(), /Date\.now\s*\(|new Date\s*\(\s*\)|set(?:Timeout|Interval)\s*\(/);
});
test("module has no runtime/product projection wiring", () => {
  const file = ts.createSourceFile("bilateralPolicyState.ts", moduleSource(), ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      assert.doesNotMatch(statement.moduleSpecifier.text, /canonicalProductResults|vip.*Delivery|Acquisition|Runtime/);
      if (statement.moduleSpecifier.text.includes("/projections/")) assert.ok(statement.importClause?.isTypeOnly);
    }
  }
});
test("existing five-product universe is unchanged and estr stays outside builder", () => {
  const source = readFileSync(resolve("src/lib/markets/projections/types.ts"), "utf8");
  assert.match(source, /MarketProjectionProductIdV1\s*=\s*FxProjectionProductIdV1\s*\|\s*"estr"/);
  reject({ ...input(), productId: "estr" });
});

// Adversarial validation coverage beyond the requested minimum.
test("reject extra root fields and detached caller-derived facts", () => {
  for (const key of ["knownAt", "rate", "confidence", "fresh", "sourceUrl", "policyInterpretation"])
    reject({ ...input(), [key]: 1 });
});
test("reject extra counterparty fields and wrong date discriminator", () => {
  const candidate = input("eurgbp");
  reject({ ...candidate, counterparty: { ...candidate.counterparty, decisionDate: BOE_DATE } });
  reject({ ...input(), counterparty: { publicationDate: FED_DATE, evidence: supplied(fomc()) } });
});
test("reject malformed supplied/unavailable wrappers", () => {
  for (const euro of [null, [], { status: "supplied", snapshot: null }, { status: "supplied", snapshot: ecb(), knownAt: 0 },
    { status: "unknown" }, { status: "unavailable", reason: "UNKNOWN", upstreamReason: null },
    { status: "unavailable", reason: "RUNTIME_INACTIVE" },
    { status: "unavailable", reason: "RUNTIME_INACTIVE", upstreamReason: 5 },
    { status: "unavailable", reason: "KNOWLEDGE_INCONSISTENT", upstreamReason: null }]) reject({ ...input(), euro });
});
test("all ten closed upstream reasons round-trip", () => {
  const reasons: InputUnavailableReason[] = ["PRIMARY_SOURCE_UNAVAILABLE", "RUNTIME_INACTIVE", "NO_CAPTURED_EVIDENCE",
    "NOT_KNOWN_AS_OF", "CAPTURE_COVERAGE_UNKNOWN", "STORED_STATE_INVALID", "PERSISTENCE_UNAVAILABLE",
    "UNSUPPORTED_SOURCE_CONTRACT", "STALE_EVIDENCE", "IDENTITY_CONFLICT"];
  for (const reason of reasons) assert.deepEqual(buildBilateralPolicyStateV1({ ...input(), euro: absent(reason, "diagnostic") }).left,
    { availability: "unavailable", reason, upstreamReason: "diagnostic" });
});
test("strict ISO assessment rejects local times, rollover and malformed values", () => {
  for (const evaluatedAt of ["2026-10-05", "2026-10-05T10:00:00", "2026-02-30T10:00:00Z", "invalid", 0, null])
    reject({ ...input(), evaluatedAt });
});
test("offset-bearing assessment normalizes to same instant", () => assert.deepEqual(
  buildBilateralPolicyStateV1({ ...input(), evaluatedAt: "2026-10-05T13:00:00+03:00" }),
  buildBilateralPolicyStateV1(input()),
));
test("invalid dates and expected ECB identity rejected even with absent evidence", () => {
  reject({ ...input(), expectedEcbCanonicalEventId: "wrong", euro: absent() });
  reject({ ...input(), expectedEcbCanonicalEventId: "ECB:ecb-monetary-policy-decision:2026-02-30", euro: absent() });
  reject({ ...input(), counterparty: { decisionDate: "2025-02-30", evidence: absent() } });
});
test("cross-product evidence mismatch rejected for each counterparty", () => {
  const wrong = [boe(), snb(), boj(), fomc()];
  products.forEach((product, index) => {
    const candidate = input(product);
    Reflect.set(candidate.counterparty, "evidence", supplied(wrong[index]));
    reject(candidate);
  });
});
test("all structured snapshots reject forged envelope metadata and extra carriers", () => {
  for (const product of ["eurjpy", "eurgbp", "eurchf"] as const) {
    for (const field of ["knownAt", "sourceVersionId", "canonicalSeriesId", "schemaVersion", "value", "observations"]) {
      const candidate = clone(input(product));
      if (candidate.counterparty.evidence.status !== "supplied") throw new Error("Expected supplied");
      Reflect.set(candidate.counterparty.evidence.snapshot, field, field === "knownAt" ? 0 : "forged");
      reject(candidate);
    }
  }
});
test("all structured providers reject forged content and provenance", () => {
  for (const product of ["eurjpy", "eurgbp", "eurchf"] as const) {
    for (const field of ["sourceUrl", "originalPublisher", "provider", "sourceVersionId", "unit"] as const) {
      const candidate = clone(input(product));
      if (candidate.counterparty.evidence.status !== "supplied" || !("evidence" in candidate.counterparty.evidence.snapshot))
        throw new Error("Expected structured fixture");
      Reflect.set(candidate.counterparty.evidence.snapshot.evidence.metadata, field, "forged");
      reject(candidate);
    }
  }
});
test("source institution and instrument mismatch rejected", () => {
  for (const product of ["eurjpy", "eurgbp", "eurchf"] as const) {
    for (const field of ["institution", "instrument", "productId"] as const) {
      const candidate = clone(input(product));
      if (candidate.counterparty.evidence.status !== "supplied" || !("evidence" in candidate.counterparty.evidence.snapshot))
        throw new Error("Expected structured fixture");
      Reflect.set(candidate.counterparty.evidence.snapshot.evidence.fact, field, "wrong");
      reject(candidate);
    }
  }
});
test("Fed wrong canonical identity or envelope knownAt rejected", () => {
  for (const field of ["canonicalSeriesId", "knownAt", "schemaVersion", "extra"] as const) {
    const snapshot = clone(fomc());
    Reflect.set(snapshot, field, field === "knownAt" ? 0 : "wrong");
    reject({ ...input(), counterparty: { decisionDate: FED_DATE, evidence: supplied(snapshot) } });
  }
});
test("extra keys in canonical source snapshots are rejected", () => {
  const snapshot = clone(ecb());
  Reflect.set(snapshot.event, "confidence", 99);
  reject({ ...input(), euro: supplied(snapshot) });
  const fed = clone(fomc());
  Reflect.set(fed.series.observations[0], "midpoint", 4.375);
  reject({ ...input(), counterparty: { decisionDate: FED_DATE, evidence: supplied(fed) } });
});
test("future ECB partial context also excluded", () => {
  const result = buildBilateralPolicyStateV1({ ...input(), euro: supplied(ecb("2026-10-05T10:00:01Z", "schedule")) });
  assert.deepEqual(result.left, { availability: "unavailable", reason: "KNOWLEDGE_INCONSISTENT", upstreamReason: null });
});
test("rejected future evidence remains unchanged and unfrozen", () => {
  const candidate = clone(input("eurjpy", "2026-10-05T10:00:01Z"));
  const before = clone(candidate);
  buildBilateralPolicyStateV1(candidate);
  assert.deepEqual(candidate, before);
  eachObject(candidate, (value) => assert.equal(Object.isFrozen(value), false));
});
test("programming TypeError and ReferenceError propagate unchanged", () => {
  for (const defect of [new TypeError("internal defect"), new ReferenceError("internal defect")]) {
    const candidate = input();
    Object.defineProperty(candidate, "evaluatedAt", { get() { throw defect; } });
    assert.throws(() => buildBilateralPolicyStateV1(candidate), (error) => error === defect);
    for (const product of products) {
      const faulty = clone(input(product));
      if (faulty.counterparty.evidence.status !== "supplied") throw new Error("Expected supplied");
      const snapshot = faulty.counterparty.evidence.snapshot;
      const target = "series" in snapshot ? snapshot.series.metadata : snapshot.evidence.metadata;
      Object.defineProperty(target, "fetchedAt", { get() { throw defect; } });
      assert.throws(() => buildBilateralPolicyStateV1(faulty), (error) => error === defect);
    }
  }
});
test("source-fact and derived-feature semantics are machine-readable", () => {
  const result = buildBilateralPolicyStateV1(input());
  assert.equal(result.schemaVersion, "bilateral-policy-state-v1");
  assert.equal(result.semantic, "derived-feature");
  assert.equal(result.feature, "bilateral-policy-state");
  assert.equal(available(result.left).data.policySetting.semantic, "source-fact");
  assert.equal(available(result.right).data.policySetting.semantic, "source-fact");
});
test("non-enumerable and symbol extra fields cannot bypass closed canonical inputs", () => {
  for (const key of ["hiddenConfidence", Symbol("extra")]) {
    const euro = clone(ecb());
    Object.defineProperty(euro.event.decision!.rates!, key, { value: 1 });
    reject({ ...input(), euro: supplied(euro) });
    const fed = clone(fomc());
    Object.defineProperty(fed.series.metadata, key, { value: 1 });
    reject({ ...input(), counterparty: { decisionDate: FED_DATE, evidence: supplied(fed) } });
    const candidate = input();
    Object.defineProperty(candidate, key, { value: 1 });
    reject(candidate);
  }
});
