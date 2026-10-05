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

import {
  buildBilateralPolicyEventReadinessV1,
  type BilateralPolicyEventReadinessV1,
  type BuildBilateralPolicyEventReadinessInputV1,
} from "../../events/bilateralPolicyEventReadiness";
import { buildEcbPolicyDecisionEventClockV1 } from "../../events/ecbPolicyDecisionEventClock";
import { eventPhaseWithVerifiedReleaseV1, type EventPhaseV1 } from "../../events/eventClock";

function request(product: FxProjectionProductIdV1 = "eurusd", focusSide: "left" | "right" = "left"):
BuildBilateralPolicyEventReadinessInputV1 {
  return { policyInput: input(product), focusSide };
}
const ready = (candidate = request()) => buildBilateralPolicyEventReadinessV1(candidate);
function reject(candidate: unknown) {
  assert.throws(() => buildBilateralPolicyEventReadinessV1(candidate as BuildBilateralPolicyEventReadinessInputV1));
}
function eachObject(value: unknown, check: (value: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  check(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), check);
}
function source() {
  return readFileSync(resolve("src/lib/markets/events/bilateralPolicyEventReadiness.ts"), "utf8");
}
function ecbAt(capture: string, context: "rates" | "schedule" | "document" = "rates", released: string | null = null) {
  const original = ecb().event;
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: ECB_DATE,
    schedule: { meetingDate: ECB_DATE, fetchedAt: unix(capture) },
    decision: context === "schedule" ? null : {
      decisionDate: ECB_DATE, documentUrl: original.decision!.documentUrl,
      contentDigest: original.decision!.contentDigest, fetchedAt: unix(capture), firstObservedAt: unix(capture),
      actualReleasedAt: released, rates: context === "document" ? null : original.decision!.rates,
    },
  }));
}
function leftAt(evaluatedAt: string, snapshot = ecbAt("2026-09-08T10:00:00Z", "schedule")) {
  return ready({ policyInput: { ...input(), evaluatedAt, euro: supplied(snapshot) }, focusSide: "left" });
}
function rightAt(product: FxProjectionProductIdV1, evaluatedAt: string, release: boolean) {
  const candidate = request(product, "right");
  Reflect.set(candidate.policyInput, "evaluatedAt", evaluatedAt);
  Reflect.set(candidate.policyInput, "euro", absent());
  const capture = evaluatedAt;
  if (product === "eurusd") {
    const fact: FomcFactV1 = { decisionDate: FED_DATE, targetLower: 4.25, targetUpper: 4.5,
      unit: "percent", action: "maintain", statementUrl: fomcDocumentUrlV1(FED_DATE),
      implementationNoteUrl: fomcDocumentUrlV1(FED_DATE, true), effectiveDate: "2025-01-30",
      releaseTimestamp: release ? unix("2025-01-29T19:00:00Z") : null };
    Reflect.set(candidate.policyInput.counterparty, "evidence", supplied(buildCanonicalStatisticalSeriesSnapshotV1(
      buildUsPolicyCanonicalSeriesV1(`fomc:${FED_DATE}`, [fact], unix(capture)))));
  } else if (product === "eurjpy") {
    const fact = { ...boj().evidence.fact, releaseTimestamp: release ? unix("2025-01-24T03:00:00Z") : null };
    const evidence = buildBojPolicyEvidenceV1(fact, unix(capture));
    Reflect.set(candidate.policyInput.counterparty, "evidence", supplied({
      schemaVersion: "boj-policy-evidence-snapshot-v1", canonicalSeriesId: evidence.metadata.canonicalSeriesId,
      sourceVersionId: evidence.metadata.sourceVersionId, knownAt: evidence.metadata.fetchedAt, evidence,
    }));
  } else if (product === "eurgbp") {
    Reflect.set(candidate.policyInput.counterparty, "evidence", supplied(boe(capture, release)));
  } else Reflect.set(candidate.policyInput.counterparty, "evidence", supplied(snb(capture)));
  return ready(candidate);
}
function marketBlocked(value: BilateralPolicyEventReadinessV1) {
  assert.deepEqual(value.marketReadiness, {
    observation: { status: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" },
    confirmation: { status: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" },
  });
  assert.deepEqual(value.reviewReadiness.advancedTransitions, {
    status: "blocked", reason: "LIFECYCLE_ASSESSMENT_UNAVAILABLE",
    states: ["CONFIRMING", "CONFIRMED", "CONTRADICTED", "INVALIDATED", "REENTRY_WATCH"],
  });
}

for (const product of products) {
  for (const focus of ["left", "right"] as const) {
    test(`${product} ${focus} focus preserves canonical composition and independent gates`, () => {
      const candidate = request(product, focus);
      const result = ready(candidate);
      assert.deepEqual(result.policyState, buildBilateralPolicyStateV1(candidate.policyInput));
      assert.equal(result.productId, product);
      assert.equal(result.focus.side, focus);
      assert.equal(result.evaluatedAt, result.policyState.evaluatedAt);
      assert.equal(result.evidenceKnownAt, result.policyState.evidenceKnownAt);
      assert.deepEqual(result.reviewReadiness.structuralEvaluation, { status: "eligible" });
      assert.deepEqual(result.reviewReadiness.focusedPolicyFactReview, { status: "eligible" });
      assert.deepEqual(result.reviewReadiness.bilateralPolicyFactReview, { status: "eligible" });
      marketBlocked(result);
    });
  }
}
test("schema and root output have a closed machine-readable shape", () => {
  const result = ready();
  assert.equal(result.schemaVersion, "bilateral-policy-event-readiness-v1");
  assert.equal(result.semantic, "derived-feature");
  assert.equal(result.feature, "bilateral-policy-event-readiness");
  assert.deepEqual(Object.keys(result), ["schemaVersion", "semantic", "feature", "productId", "evaluatedAt",
    "evidenceKnownAt", "policyState", "focus", "temporalReadiness", "reviewReadiness", "marketReadiness", "nextEvidenceRequirements"]);
});
test("reject estr and sixth/unknown products", () => {
  for (const productId of ["estr", "gbpusd", "toString"]) reject({
    ...request(), policyInput: { ...input(), productId },
  });
});
test("reject invalid focus and malformed roots", () => {
  for (const focusSide of [undefined, null, "both", "ECB", 0]) reject({ ...request(), focusSide });
  for (const candidate of [null, undefined, [], {}, { policyInput: input() }, { focusSide: "left" }]) reject(candidate);
});
test("reject every detached input and derived result override", () => {
  for (const key of ["evaluatedAt", "productId", "eventId", "releaseTime", "schedule", "policySetting", "knownAt",
    "lifecycleAssessment", "marketObservation", "recommendation", "clock", "policyState"])
    reject({ ...request(), [key]: true });
  reject({ policyInput: buildBilateralPolicyStateV1(input()), focusSide: "left" });
});
test("symbol and hidden root fields cannot bypass closure", () => {
  for (const key of ["hidden", Symbol("extra")]) {
    const candidate = request();
    Object.defineProperty(candidate, key, { value: 1 });
    reject(candidate);
  }
});
test("left focus distinguishes requested identity from admitted ECB reference", () => {
  const result = ready();
  assert.deepEqual(result.focus, { side: "left", institution: "ECB",
    requestedIdentity: { semantic: "request-metadata", kind: "ecb-event",
      canonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(ECB_DATE) },
    admittedCanonicalReference: { kind: "ecb-event", canonicalEventId: ecb().canonicalEventId,
      eventSourceVersionId: ecb().eventSourceVersionId }, knownAt: unix(CAPTURE) });
});
test("ECB rescheduling retains the canonical anchor", () => {
  const snapshot = buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: ECB_DATE, schedule: { meetingDate: "2026-09-17", fetchedAt: unix(CAPTURE) },
  }));
  const result = ready({ ...request(), policyInput: { ...input(), euro: supplied(snapshot) } });
  assert.equal(result.focus.admittedCanonicalReference?.kind, "ecb-event");
  if (result.focus.side !== "left") throw new Error("Expected ECB");
  assert.equal(result.focus.admittedCanonicalReference?.canonicalEventId, ecb().canonicalEventId);
  assert.equal(result.temporalReadiness.schedule.status, "available");
});
for (const [product, institution, date] of [
  ["eurusd", "Board of Governors of the Federal Reserve System / FOMC", FED_DATE],
  ["eurjpy", "Bank of Japan", BOJ_DATE], ["eurgbp", "Bank of England", BOE_DATE],
  ["eurchf", "Swiss National Bank", SNB_DATE],
] as const) {
  test(`${product} right focus keeps the source's series reference and requested date kind`, () => {
    const result = ready(request(product, "right"));
    const side = result.policyState.right;
    if (result.focus.side !== "right" || side.availability !== "available") throw new Error("Expected right evidence");
    assert.equal(result.focus.institution, institution);
    assert.deepEqual(result.focus.admittedCanonicalReference, { kind: "policy-series",
      canonicalSeriesId: side.data.snapshot.canonicalSeriesId, sourceVersionId: side.data.snapshot.sourceVersionId });
    assert.deepEqual(result.focus.requestedIdentity, { semantic: "request-metadata",
      kind: product === "eurgbp" ? "publication-date" : "decision-date", date });
    assert.equal(Object.hasOwn(result.focus.admittedCanonicalReference!, "canonicalEventId"), false);
  });
}
test("focus is a request, not recency, an update or a combined bilateral event", () => {
  const left = ready(request("eurusd", "left"));
  const right = ready(request("eurusd", "right"));
  assert.deepEqual(left.policyState, right.policyState);
  for (const value of [left, right]) {
    assert.equal(Object.hasOwn(value, "canonicalEventId"), false);
    for (const key of ["updated", "newer", "eventOccurred", "simultaneous", "dominant", "combinedEventId"])
      assert.equal(Object.hasOwn(value.focus, key), false);
  }
  assert.notEqual(ECB_DATE, FED_DATE);
});
for (const focusSide of ["left", "right"] as const) {
  test(`unavailable ${focusSide} context blocks focused gates and retains only admitted diagnostic`, () => {
    const candidate = request("eurusd", focusSide);
    const missing = absent("PERSISTENCE_UNAVAILABLE", "capture-store-unavailable");
    if (focusSide === "left") Reflect.set(candidate.policyInput, "euro", missing);
    else Reflect.set(candidate.policyInput.counterparty, "evidence", missing);
    const result = ready(candidate);
    assert.equal(result.focus.admittedCanonicalReference, null);
    assert.equal(result.focus.knownAt, null);
    assert.deepEqual(result.reviewReadiness.structuralEvaluation, { status: "blocked",
      reason: "PERSISTENCE_UNAVAILABLE", upstreamReason: "capture-store-unavailable", missing: [`${focusSide}.eventContext`] });
    assert.deepEqual(result.reviewReadiness.focusedPolicyFactReview, { status: "blocked",
      reason: "PERSISTENCE_UNAVAILABLE", upstreamReason: "capture-store-unavailable", missing: [`${focusSide}.policySetting`] });
    assert.deepEqual(result.temporalReadiness, {
      schedule: { status: "unavailable", reason: "PERSISTENCE_UNAVAILABLE", upstreamReason: "capture-store-unavailable" },
      verifiedRelease: { status: "unavailable", reason: "PERSISTENCE_UNAVAILABLE", upstreamReason: "capture-store-unavailable" },
      phase: null, releaseRelativeWindowsReached: [],
    });
  });
}
for (const context of ["schedule", "document"] as const) {
  test(`ECB ${context}-only evidence preserves structural and timing eligibility without inventing policy facts`, () => {
    const result = ready({ ...request(), policyInput: { ...input(), euro: supplied(ecbAt(CAPTURE, context)) } });
    assert.deepEqual(result.reviewReadiness.structuralEvaluation, { status: "eligible" });
    assert.deepEqual(result.reviewReadiness.focusedPolicyFactReview, { status: "blocked",
      reason: "POLICY_SETTING_UNAVAILABLE", upstreamReason: null, missing: ["left.policySetting"] });
    assert.equal(result.temporalReadiness.schedule.status, "available");
    assert.equal(result.temporalReadiness.verifiedRelease.status, "unavailable");
    assert.deepEqual(result.nextEvidenceRequirements.officialPolicyReview, ["left.policySetting"]);
    marketBlocked(result);
  });
}
test("all setting/context combinations preserve bilateral missing paths without blocking complete focused facts", () => {
  for (const left of ["rates", "schedule", "absent"] as const) {
    for (const right of ["available", "absent"] as const) {
      const candidate = request("eurusd", "right");
      Reflect.set(candidate.policyInput, "euro", left === "absent" ? absent() : supplied(ecb(CAPTURE, left)));
      if (right === "absent") Reflect.set(candidate.policyInput.counterparty, "evidence", absent());
      const result = ready(candidate);
      const missing = [...(left === "rates" ? [] : ["left.policySetting"]), ...(right === "available" ? [] : ["right.policySetting"])];
      assert.deepEqual(result.policyState.missing, missing);
      assert.deepEqual(result.reviewReadiness.bilateralPolicyFactReview, missing.length === 0 ? { status: "eligible" }
        : { status: "blocked", reason: "EVENT_DATA_INCOMPLETE", upstreamReason: null, missing });
      assert.equal(result.reviewReadiness.focusedPolicyFactReview.status, right === "available" ? "eligible" : "blocked");
    }
  }
});
test("ECB clock exactly matches the existing canonical clock builder", () => {
  const snapshot = ecbAt("2026-09-10T12:15:00Z", "rates", "2026-09-10T12:15:00Z");
  const result = leftAt("2026-09-10T12:31:00Z", snapshot);
  const clock = buildEcbPolicyDecisionEventClockV1({ snapshot, evaluatedAt: result.evaluatedAt });
  if (clock.status !== "available" || result.temporalReadiness.schedule.status !== "available") throw new Error("Expected clock");
  assert.equal(result.temporalReadiness.phase, clock.phase);
  assert.deepEqual(result.temporalReadiness.schedule.data, clock.milestones.schedule);
  assert.deepEqual(result.temporalReadiness.verifiedRelease,
    { status: "available", data: { actualReleasedAt: clock.actualReleasedAt } });
});
test("ECB schedule phases use existing exact boundaries before, at and after", () => {
  const scheduled = Date.parse("2026-09-10T12:15:00Z");
  const boundaries: readonly [number, EventPhaseV1, EventPhaseV1][] = [
    [-86400000, "pre-event", "t-24h"], [-3600000, "t-24h", "t-1h"],
    [-900000, "t-1h", "t-15m"], [0, "t-15m", "release-time-unverified"],
  ];
  for (const [offset, before, reached] of boundaries) {
    for (const delta of [-1, 0, 1]) {
      const result = leftAt(new Date(scheduled + offset + delta).toISOString());
      assert.equal(result.temporalReadiness.phase, delta < 0 ? before : reached);
      assert.equal(result.temporalReadiness.schedule.status, "available");
      assert.equal(result.temporalReadiness.verifiedRelease.status, "unavailable");
      assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, []);
    }
  }
});
test("ECB verified release and all elapsed windows never unlock market or lifecycle confirmation", () => {
  const released = "2026-09-10T12:15:00Z";
  const snapshot = ecbAt(released, "rates", released);
  const windows = ["release", "post-5m", "post-15m", "post-30m", "post-1h"];
  for (const [index, offset] of [0, 300000, 900000, 1800000, 3600000].entries()) {
    for (const delta of [-1, 0, 1]) {
      const result = leftAt(new Date(Date.parse(released) + offset + delta).toISOString(), snapshot);
      if (index === 0 && delta === -1) {
        assert.equal(result.temporalReadiness.phase, null);
        assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, []);
      } else {
        const reached = delta < 0 ? index - 1 : index;
        assert.equal(result.temporalReadiness.phase, windows[reached]);
        assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, windows.slice(0, reached + 1));
      }
      marketBlocked(result);
    }
  }
});
for (const [product, released] of [
  ["eurusd", "2025-01-29T19:00:00Z"], ["eurjpy", "2025-01-24T03:00:00Z"],
  ["eurgbp", "2025-05-08T11:02:00Z"],
] as const) {
  test(`${product} release-only clock respects epoch seconds and existing elapsed boundaries`, () => {
    const windows = ["release", "post-5m", "post-15m", "post-30m", "post-1h"];
    for (const [index, offset] of [0, 300000, 900000, 1800000, 3600000].entries()) {
      for (const delta of (index === 0 ? [0, 1] : [-1, 0, 1])) {
        const evaluated = Date.parse(released) + offset + delta;
        const result = rightAt(product, new Date(evaluated).toISOString(), true);
        const reached = delta < 0 ? index - 1 : index;
        assert.equal(result.temporalReadiness.phase, eventPhaseWithVerifiedReleaseV1(evaluated, Date.parse(released)));
        assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, windows.slice(0, reached + 1));
        assert.deepEqual(result.temporalReadiness.verifiedRelease, { status: "available", data: { actualReleasedAt: new Date(Date.parse(released)).toISOString() } });
        assert.deepEqual(result.temporalReadiness.schedule, { status: "unavailable", reason: "EVENT_DATA_INCOMPLETE", upstreamReason: null });
        marketBlocked(result);
      }
    }
  });
}
for (const product of products) {
  test(`${product} dates and capture never replace missing release or schedule`, () => {
    const result = rightAt(product, AS_OF, false);
    assert.equal(result.temporalReadiness.phase, null);
    assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, []);
    assert.deepEqual(result.temporalReadiness.schedule, { status: "unavailable", reason: "EVENT_DATA_INCOMPLETE", upstreamReason: null });
    assert.deepEqual(result.temporalReadiness.verifiedRelease, { status: "unavailable", reason: "EVENT_DATA_INCOMPLETE", upstreamReason: null });
    assert.deepEqual(result.nextEvidenceRequirements.eventTiming, ["focused.schedule", "focused.verifiedReleaseTime"]);
  });
}
test("focused clock ignores a verified release on the other side", () => {
  assert.equal(ready(request("eurjpy", "right")).temporalReadiness.phase, null);
  const result = leftAt(AS_OF, ecbAt(CAPTURE, "schedule"));
  assert.equal(result.temporalReadiness.phase, "release-time-unverified");
  assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, []);
});
test("offset-bearing assessment normalizes without changing readiness", () => assert.deepEqual(
  ready({ ...request(), policyInput: { ...input(), evaluatedAt: "2026-10-05T13:00:00+03:00" } }), ready()));
for (const product of products) {
  for (const focusSide of ["left", "right"] as const) {
    test(`${product} ${focusSide} exact knowledge boundary admits while future focused evidence leaks nowhere`, () => {
      const exact = request(product, focusSide);
      Reflect.set(exact.policyInput, "euro", supplied(ecb(AS_OF)));
      Reflect.set(exact.policyInput, "counterparty", input(product, AS_OF).counterparty);
      assert.equal(ready(exact).focus.knownAt, unix(AS_OF));
      const candidate = request(product, focusSide);
      if (focusSide === "left") Reflect.set(candidate.policyInput, "euro", supplied(ecb("2026-10-05T10:00:01Z")));
      else Reflect.set(candidate.policyInput, "counterparty", input(product, "2026-10-05T10:00:01Z").counterparty);
      const raw = focusSide === "left" ? candidate.policyInput.euro : candidate.policyInput.counterparty.evidence;
      if (raw.status !== "supplied") throw new Error("Expected future evidence");
      const futureVersion = "eventSourceVersionId" in raw.snapshot ? raw.snapshot.eventSourceVersionId : raw.snapshot.sourceVersionId;
      const mutable = clone(candidate);
      const before = clone(mutable);
      const result = ready(mutable);
      assert.equal(result.focus.admittedCanonicalReference, null);
      assert.equal(result.focus.knownAt, null);
      assert.equal(result.temporalReadiness.phase, null);
      assert.deepEqual(result.temporalReadiness.releaseRelativeWindowsReached, []);
      assert.deepEqual(result.reviewReadiness.structuralEvaluation, { status: "blocked",
        reason: "KNOWLEDGE_INCONSISTENT", upstreamReason: null, missing: [`${focusSide}.eventContext`] });
      assert.equal(result.evidenceKnownAt, result.policyState.evidenceKnownAt);
      assert.equal(result.evidenceKnownAt, unix(CAPTURE));
      const readiness = { focus: result.focus, temporal: result.temporalReadiness,
        gates: result.reviewReadiness, requirements: result.nextEvidenceRequirements };
      assert.equal(JSON.stringify(readiness).includes(futureVersion), false);
      assert.equal(JSON.stringify(result).includes(futureVersion), false);
      assert.equal(JSON.stringify(readiness).includes("2026-10-05T10:00:01"), false);
      assert.deepEqual(mutable, before);
      eachObject(mutable, (value) => assert.equal(Object.isFrozen(value), false));
    });
  }
}
test("future release proof cannot leak a release clock into an earlier evaluation", () => {
  const result = ready({ policyInput: { ...input("eurgbp", "2026-10-05T10:00:01Z"), productId: "eurgbp",
    counterparty: { publicationDate: BOE_DATE, evidence: supplied(boe("2026-10-05T10:00:01Z", true)) } }, focusSide: "right" });
  assert.equal(result.temporalReadiness.phase, null);
  assert.equal(result.temporalReadiness.verifiedRelease.status, "unavailable");
  assert.equal(JSON.stringify({ focus: result.focus, timing: result.temporalReadiness,
    requirements: result.nextEvidenceRequirements }).includes(BOE_MAY_2025_RELEASE_NOTICE_URL_V1), false);
});
test("future non-focused evidence cannot affect the focused clock or knowledge maximum", () => {
  const result = ready({ ...request(), policyInput: input("eurusd", "2026-10-05T10:00:01Z") });
  assert.equal(result.temporalReadiness.phase, "post-1h");
  assert.equal(result.evidenceKnownAt, unix(CAPTURE));
  assert.equal(result.reviewReadiness.focusedPolicyFactReview.status, "eligible");
  assert.equal(result.reviewReadiness.bilateralPolicyFactReview.status, "blocked");
});
test("historical evaluation cannot backdate a later capture or choose a fallback", () => {
  const snapshot = ecbAt(CAPTURE, "rates", "2026-09-10T12:15:00Z");
  const result = leftAt("2026-09-10T12:31:00Z", snapshot);
  assert.equal(result.focus.knownAt, null);
  assert.equal(result.policyState.availability, "unavailable");
  assert.equal(result.evidenceKnownAt, null);
  assert.equal(result.temporalReadiness.schedule.status, "unavailable");
});
test("later correction affects only evaluations where that supplied state was known", () => {
  const original = ecbAt("2026-09-10T12:16:00Z", "rates");
  const correctedEvent = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: ECB_DATE, schedule: { meetingDate: ECB_DATE, fetchedAt: unix("2026-09-10T12:32:00Z") },
    decision: { decisionDate: ECB_DATE, documentUrl: original.event.decision!.documentUrl,
      contentDigest: "b".repeat(64), fetchedAt: unix("2026-09-10T12:32:00Z"), firstObservedAt: unix("2026-09-10T12:32:00Z"),
      actualReleasedAt: "2026-09-10T12:15:00Z", rates: original.event.decision!.rates },
  });
  const correction = buildEcbMonetaryPolicyEventSnapshotV1(correctedEvent);
  assert.equal(leftAt("2026-09-10T12:31:00Z", original).temporalReadiness.verifiedRelease.status, "unavailable");
  assert.equal(leftAt("2026-09-10T12:31:00Z", correction).focus.admittedCanonicalReference, null);
  assert.equal(leftAt("2026-09-10T12:32:00Z", correction).temporalReadiness.verifiedRelease.status, "available");
});
test("tampered canonical provenance and FOMC annotations fail through the actual builder", () => {
  const euro = clone(ecb());
  Reflect.set(euro, "eventSourceVersionId", "forged");
  reject({ ...request(), policyInput: { ...input(), euro: supplied(euro) } });
  const fed = clone(fomc());
  Reflect.set(fed.series.observations[0], "officialStatus", "malformed");
  reject({ ...request(), policyInput: { ...input(), counterparty: { decisionDate: FED_DATE, evidence: supplied(fed) } } });
  for (const product of ["eurjpy", "eurgbp", "eurchf"] as const) {
    const candidate = clone(request(product, "right"));
    if (candidate.policyInput.counterparty.evidence.status !== "supplied" ||
        !("evidence" in candidate.policyInput.counterparty.evidence.snapshot)) throw new Error("Expected public evidence");
    Reflect.set(candidate.policyInput.counterparty.evidence.snapshot.evidence.metadata, "sourceUrl", "https://example.com/forged");
    reject(candidate);
  }
});
test("requirements are purpose-grouped, deterministic and unique", () => {
  const candidate = request();
  Reflect.set(candidate.policyInput, "euro", absent());
  Reflect.set(candidate.policyInput.counterparty, "evidence", absent());
  const requirements = ready(candidate).nextEvidenceRequirements;
  assert.deepEqual(requirements, {
    officialPolicyReview: ["left.eventContext", "left.policySetting", "right.policySetting"],
    eventTiming: ["focused.schedule", "focused.verifiedReleaseTime"],
    lifecycleProgression: ["productEventHypothesisAssessment"],
    marketConfirmation: ["directIntradayFxObservation", "observationBackedAssessment"],
  });
  assert.deepEqual(ready(candidate).nextEvidenceRequirements, requirements);
  for (const values of Object.values(requirements)) assert.equal(new Set(values).size, values.length);
  assert.equal(Object.hasOwn(requirements, "tradeEntry"), false);
});
test("complete facts remove only official requirements; release-only timing removes only release dependency", () => {
  const result = rightAt("eurusd", AS_OF, true);
  assert.deepEqual(result.nextEvidenceRequirements.officialPolicyReview, ["left.policySetting"]);
  assert.deepEqual(result.nextEvidenceRequirements.eventTiming, ["focused.schedule"]);
  const both = ready();
  assert.deepEqual(both.nextEvidenceRequirements.officialPolicyReview, []);
  assert.deepEqual(both.nextEvidenceRequirements.eventTiming, []);
  assert.deepEqual(both.nextEvidenceRequirements.lifecycleProgression, ["productEventHypothesisAssessment"]);
  assert.deepEqual(both.nextEvidenceRequirements.marketConfirmation, ["directIntradayFxObservation", "observationBackedAssessment"]);
});
test("ECB three instruments and FOMC target range survive unchanged", () => {
  const state = ready().policyState;
  if (state.left.availability !== "available" || state.productId !== "eurusd" || state.right.availability !== "available")
    throw new Error("Expected complete settings");
  assert.deepEqual(state.left.data.instrument, ECB_POLICY_RATE_SERIES);
  assert.deepEqual(state.left.data.policySetting.data, ecb().event.decision!.rates);
  assert.equal(state.right.data.policySetting.data.targetLower, 4.25);
  assert.equal(state.right.data.policySetting.data.targetUpper, 4.5);
  assert.equal(Object.hasOwn(state.right.data.policySetting.data, "midpoint"), false);
});
test("BoJ range and around qualification survive", () => {
  const result = ready({ policyInput: { ...input("eurjpy"), productId: "eurjpy",
    counterparty: { decisionDate: "2024-03-19", evidence: supplied(boj(CAPTURE, true)) } }, focusSide: "right" });
  const state = result.policyState;
  if (state.productId !== "eurjpy" || state.right.availability !== "available") throw new Error("Expected BoJ");
  assert.deepEqual(state.right.data.policySetting.data.target, { shape: "range", lower: 0, upper: 0.1, qualification: "around" });
});
test("BoE timing distinctions and release proof survive", () => {
  const result = rightAt("eurgbp", AS_OF, true);
  const state = result.policyState;
  if (state.productId !== "eurgbp" || state.right.availability !== "available") throw new Error("Expected BoE");
  assert.deepEqual(state.right.data.timing, { meetingEndDate: "2025-05-07", publicationDate: BOE_DATE,
    releaseTimestamp: unix("2025-05-08T11:02:00Z"), effectiveDate: null });
  assert.equal(state.right.data.policySetting.data.releaseEvidence?.sourceUrl, BOE_MAY_2025_RELEASE_NOTICE_URL_V1);
});
test("SNB zero and negative signed settings retain null release timing", () => {
  for (const rate of [0, -0.75]) {
    const result = ready({ policyInput: { ...input("eurchf"), productId: "eurchf",
      counterparty: { decisionDate: SNB_DATE, evidence: supplied(snb(CAPTURE, rate)) } }, focusSide: "right" });
    const state = result.policyState;
    if (state.productId !== "eurchf" || state.right.availability !== "available") throw new Error("Expected SNB");
    assert.equal(state.right.data.policySetting.data.decision.rate, rate);
    assert.equal(state.right.data.timing.releaseTimestamp, null);
    assert.equal(result.temporalReadiness.phase, null);
  }
});
test("no current lifecycle state, recommendations, direction, confidence or derived rate arithmetic", () => {
  for (const product of products) {
    const result = ready(request(product));
    eachObject(result, (value) => {
      for (const key of ["state", "recommendation", "direction", "confidence", "priceInvalidation", "entry", "reentry",
        "midpoint", "policyDelta", "delta", "comparisonOperand", "differential", "tradeReadiness"])
        assert.equal(Object.hasOwn(value, key), false);
    });
    assert.deepEqual(result.policyState.policyRateDifference, { semantic: "derived-feature", availability: "unavailable",
      reason: "COMPARISON_RULE_UNESTABLISHED" });
    assert.doesNotMatch(JSON.stringify(result), /\b(?:WAIT|WATCH|INITIAL_REACTION|BUY|SELL|hawkish|dovish)\b/);
    assert.deepEqual(result.policyState.latestPolicyCoverage, { availability: "unavailable", reason: "LATEST_POLICY_COVERAGE_UNAVAILABLE" });
  }
});
test("determinism and nested caller/output mutation isolation", () => {
  const candidate = clone(request());
  const before = clone(candidate);
  const result = ready(candidate);
  assert.deepEqual(result, ready(candidate));
  assert.deepEqual(candidate, before);
  eachObject(candidate, (value) => assert.equal(Object.isFrozen(value), false));
  eachObject(result, (value) => assert.equal(Object.isFrozen(value), true));
  assert.notEqual(result.policyState, candidate.policyInput);
  assert.equal(Reflect.set(result.focus, "knownAt", 0), false);
  assert.equal(Reflect.set(result.nextEvidenceRequirements.eventTiming, "0", "forged"), false);
  assert.deepEqual(candidate, before);
  if (candidate.policyInput.euro.status !== "supplied") throw new Error("Expected ECB");
  Reflect.set(candidate.policyInput.euro.snapshot.event.decision!.rates!, "depositFacility", 99);
  Reflect.set(candidate.policyInput, "expectedEcbCanonicalEventId", "changed");
  assert.deepEqual(result, ready(before));
});
test("no network or implicit wall clock dependency for any product or focus", () => {
  const fetchBefore = globalThis.fetch;
  const nowBefore = Date.now;
  try {
    globalThis.fetch = () => { throw new Error("Unexpected network access"); };
    Date.now = () => { throw new Error("Unexpected wall clock"); };
    for (const product of products) for (const focus of ["left", "right"] as const) marketBlocked(ready(request(product, focus)));
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; }
});
test("imports/calls use existing pure builders and clock helpers without storage or lifecycle execution", () => {
  const text = source();
  const file = ts.createSourceFile("bilateralPolicyEventReadiness.ts", text, ts.ScriptTarget.Latest, true);
  const imports = file.statements.filter(ts.isImportDeclaration);
  assert.deepEqual(imports.map((item) => (item.moduleSpecifier as ts.StringLiteral).text), [
    "./bilateralPolicyState", "./ecbPolicyDecisionEventClock", "./eventClock", "./eventLifecycle",
  ]);
  const lifecycle = imports.find((item) => (item.moduleSpecifier as ts.StringLiteral).text === "./eventLifecycle");
  assert.ok(lifecycle?.importClause?.isTypeOnly);
  assert.match(text, /buildBilateralPolicyStateV1\(policyInput\)/);
  assert.match(text, /buildEcbPolicyDecisionEventClockV1\(/);
  assert.match(text, /eventPhaseWithVerifiedReleaseV1\(/);
  assert.doesNotMatch(text, /evaluateEventLifecycleV1|fetch\s*\(|Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|set(?:Timeout|Interval)\s*\(|Redis|appendVintage|readAsKnownAt|86400|60_000|3600|300_000/);
  assert.doesNotMatch(text, /\.evidence\b|\.euro\b|\.counterparty\.evidence\b|load\w*Runtime|Acquisition|R2|vipDeep|fiveProductProjections/);
});
test("unexpected root and canonical validator defects propagate unchanged", () => {
  for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect")]) {
    const candidate = request();
    Object.defineProperty(candidate, "policyInput", { get() { throw defect; } });
    assert.throws(() => ready(candidate), (error) => error === defect);
    for (const product of products) {
      const nested = clone(request(product, "right"));
      const evidence = nested.policyInput.counterparty.evidence;
      if (evidence.status !== "supplied") throw new Error("Expected evidence");
      const metadata = "series" in evidence.snapshot ? evidence.snapshot.series.metadata : evidence.snapshot.evidence.metadata;
      Object.defineProperty(metadata, "fetchedAt", { get() { throw defect; } });
      assert.throws(() => ready(nested), (error) => error === defect);
    }
    const proxy = new Proxy(request(), { ownKeys() { throw defect; } });
    assert.throws(() => ready(proxy), (error) => error === defect);
  }
});
