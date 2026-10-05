import { isDeepStrictEqual } from "node:util";
import type { FxProjectionProductIdV1 } from "../projections/types";
import type { BojPolicyEvidenceSnapshotV1 } from "../persistence/bojPolicyVintageRedis";
import type { BoeBankRateEvidenceSnapshotV1 } from "../persistence/boeBankRateVintageRedis";
import type { SnbPolicyEvidenceSnapshotV1 } from "../persistence/snbPolicyVintageRedis";
import {
  buildCanonicalStatisticalSeriesSnapshotV1,
  type CanonicalStatisticalSeriesSnapshotV1,
} from "../services/canonicalStatisticalSeriesMemory";
import {
  buildUsPolicySourceVersionIdV1,
  readUsPolicyFactsV1,
} from "../providers/federalReserve/canonical";
import type { FomcFactV1 } from "../providers/federalReserve/fomc";
import { buildBojPolicyEvidenceV1, readBojPolicyFactV1 } from "../providers/boj/canonical";
import type { BojPolicyFactV1 } from "../providers/boj/facts";
import { buildBoeBankRateEvidenceV1, readBoeBankRateFactV1 } from "../providers/boe/canonical";
import type { BoeBankRateFactV1 } from "../providers/boe/facts";
import { buildSnbPolicyEvidenceV1, readSnbPolicyFactV1 } from "../providers/snb/canonical";
import type { SnbPolicyFactV1 } from "../providers/snb/facts";
import {
  ECB_POLICY_RATE_SERIES,
  ecbMonetaryPolicyCanonicalEventIdV1,
  type EcbPolicyRateFactsV1,
} from "./ecbMonetaryPolicy";
import type { EcbMonetaryPolicyEventSnapshotV1 } from "./ecbMonetaryPolicyMemory";
import { reconstructEcbMonetaryPolicyEventSnapshotV1 } from "./ecbPolicyDecisionEventClock";
import { parseEventInstantV1 } from "./eventClock";

export const BILATERAL_POLICY_STATE_SCHEMA_VERSION_V1 = "bilateral-policy-state-v1" as const;

const INPUT_UNAVAILABLE_REASONS = [
  "PRIMARY_SOURCE_UNAVAILABLE", "RUNTIME_INACTIVE", "NO_CAPTURED_EVIDENCE",
  "NOT_KNOWN_AS_OF", "CAPTURE_COVERAGE_UNKNOWN", "STORED_STATE_INVALID",
  "PERSISTENCE_UNAVAILABLE", "UNSUPPORTED_SOURCE_CONTRACT", "STALE_EVIDENCE",
  "IDENTITY_CONFLICT",
] as const;

export type InputUnavailableReason = (typeof INPUT_UNAVAILABLE_REASONS)[number];
export type BilateralPolicyUnavailableReasonV1 = InputUnavailableReason | "KNOWLEDGE_INCONSISTENT";

export type SuppliedEvidence<S> =
  | { readonly status: "supplied"; readonly snapshot: S }
  | { readonly status: "unavailable"; readonly reason: InputUnavailableReason;
      readonly upstreamReason: string | null };

interface BilateralPolicyInputBaseV1 {
  readonly evaluatedAt: string;
  readonly expectedEcbCanonicalEventId: string;
  readonly euro: SuppliedEvidence<EcbMonetaryPolicyEventSnapshotV1>;
}

export type BuildBilateralPolicyStateInputV1 = BilateralPolicyInputBaseV1 & (
  | { readonly productId: "eurusd"; readonly counterparty: {
      readonly decisionDate: string;
      readonly evidence: SuppliedEvidence<CanonicalStatisticalSeriesSnapshotV1> } }
  | { readonly productId: "eurjpy"; readonly counterparty: {
      readonly decisionDate: string;
      readonly evidence: SuppliedEvidence<BojPolicyEvidenceSnapshotV1> } }
  | { readonly productId: "eurgbp"; readonly counterparty: {
      readonly publicationDate: string;
      readonly evidence: SuppliedEvidence<BoeBankRateEvidenceSnapshotV1> } }
  | { readonly productId: "eurchf"; readonly counterparty: {
      readonly decisionDate: string;
      readonly evidence: SuppliedEvidence<SnbPolicyEvidenceSnapshotV1> } }
);

export interface BilateralPolicyFreshnessV1 {
  readonly semantic: "derived-feature";
  readonly status: "not-assessed";
  readonly reason: "POLICY_CURRENTNESS_NOT_ESTABLISHED";
  /** Arithmetic capture age only; never freshness, publisher coverage or policy effectiveness. */
  readonly evidenceAgeSeconds: number;
}

interface SideContext<S, I, T> {
  readonly snapshot: S;
  readonly instrument: I;
  readonly timing: T;
  readonly knownAt: number;
  readonly freshness: BilateralPolicyFreshnessV1;
}

export interface BilateralPolicyUnavailableSideV1 {
  readonly availability: "unavailable";
  readonly reason: BilateralPolicyUnavailableReasonV1;
  readonly upstreamReason: string | null;
}

export type BilateralPolicySideV1<S, F, I, T> =
  | { readonly availability: "available"; readonly data: SideContext<S, I, T> & {
      readonly policySetting: { readonly semantic: "source-fact";
        readonly availability: "available"; readonly data: F } } }
  | { readonly availability: "partial"; readonly missing: readonly (
      "decisionDocument" | "policySetting")[]; readonly data: SideContext<S, I, T> & {
      readonly policySetting: { readonly semantic: "source-fact";
        readonly availability: "unavailable"; readonly reason: "POLICY_SETTING_UNAVAILABLE" } } }
  | BilateralPolicyUnavailableSideV1;

export interface BilateralEcbPolicyTimingV1 {
  readonly scheduledAt: string;
  readonly decisionDate: string | null;
  readonly actualReleasedAt: string | null;
  readonly effectiveDate: string | null;
}

export type BilateralEcbPolicySideV1 = BilateralPolicySideV1<
  EcbMonetaryPolicyEventSnapshotV1, EcbPolicyRateFactsV1,
  typeof ECB_POLICY_RATE_SERIES, BilateralEcbPolicyTimingV1
>;
export type BilateralFomcPolicySideV1 = BilateralPolicySideV1<
  CanonicalStatisticalSeriesSnapshotV1, FomcFactV1, "federal-funds-target-range",
  Pick<FomcFactV1, "decisionDate" | "releaseTimestamp" | "effectiveDate">
>;
export type BilateralBojPolicySideV1 = BilateralPolicySideV1<
  BojPolicyEvidenceSnapshotV1, BojPolicyFactV1, BojPolicyFactV1["instrument"],
  Pick<BojPolicyFactV1, "decisionDate" | "releaseTimestamp" | "effectiveDate">
>;
export type BilateralBoePolicySideV1 = BilateralPolicySideV1<
  BoeBankRateEvidenceSnapshotV1, BoeBankRateFactV1, BoeBankRateFactV1["instrument"],
  Pick<BoeBankRateFactV1, "meetingEndDate" | "publicationDate" | "releaseTimestamp" | "effectiveDate">
>;
export type BilateralSnbPolicySideV1 = BilateralPolicySideV1<
  SnbPolicyEvidenceSnapshotV1, SnbPolicyFactV1, SnbPolicyFactV1["instrument"],
  Pick<SnbPolicyFactV1, "decisionDate" | "publicationDate" | "releaseTimestamp" | "effectiveDate">
>;

interface BilateralPolicyStateBaseV1 {
  readonly schemaVersion: typeof BILATERAL_POLICY_STATE_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "bilateral-policy-state";
  readonly basis: "captured-announced-settings";
  readonly coverage: "provided-evidence-only";
  readonly evaluatedAt: string;
  /** Completeness of supplied settings only; no live/current/fresh/tradable claim. */
  readonly availability: "available" | "partial" | "unavailable";
  readonly missing: readonly ("left.policySetting" | "right.policySetting")[];
  readonly evidenceKnownAt: number | null;
  readonly left: BilateralEcbPolicySideV1;
  readonly latestPolicyCoverage: { readonly availability: "unavailable";
    readonly reason: "LATEST_POLICY_COVERAGE_UNAVAILABLE" };
  readonly policyRateDifference: { readonly semantic: "derived-feature";
    readonly availability: "unavailable"; readonly reason: "COMPARISON_RULE_UNESTABLISHED" };
}

export type BilateralPolicyStateV1 = BilateralPolicyStateBaseV1 & (
  | { readonly productId: "eurusd"; readonly right: BilateralFomcPolicySideV1 }
  | { readonly productId: "eurjpy"; readonly right: BilateralBojPolicySideV1 }
  | { readonly productId: "eurgbp"; readonly right: BilateralBoePolicySideV1 }
  | { readonly productId: "eurchf"; readonly right: BilateralSnbPolicySideV1 }
);

/**
 * INACTIVE: supplied captured announcements only. No discovery, history selection,
 * I/O or implicit clock. Source settings are not policy interpretation or operative
 * current settings. Malformed inputs/validator defects propagate; valid future
 * evidence is excluded without exposing it or selecting a substitute.
 */
export function buildBilateralPolicyStateV1(
  input: BuildBilateralPolicyStateInputV1,
): BilateralPolicyStateV1 {
  assertKeys(input, ["productId", "evaluatedAt", "expectedEcbCanonicalEventId", "euro", "counterparty"]);
  const products = { eurusd: true, eurjpy: true, eurgbp: true, eurchf: true } satisfies
    Record<FxProjectionProductIdV1, true>;
  if (typeof input.productId !== "string" || !Object.hasOwn(products, input.productId)) {
    throw new TypeError("Expected one of the four launch FX products.");
  }
  assertString(input.evaluatedAt);
  const evaluatedMs = parseEventInstantV1(input.evaluatedAt, "evaluatedAt");
  assertString(input.expectedEcbCanonicalEventId);
  const prefix = "ECB:ecb-monetary-policy-decision:";
  if (!input.expectedEcbCanonicalEventId.startsWith(prefix) ||
      ecbMonetaryPolicyCanonicalEventIdV1(input.expectedEcbCanonicalEventId.slice(prefix.length)) !==
        input.expectedEcbCanonicalEventId) {
    throw new TypeError("Invalid expected ECB event identity.");
  }
  assertSupplied(input.euro);
  const dateKey = input.productId === "eurgbp" ? "publicationDate" : "decisionDate";
  assertKeys(input.counterparty, [dateKey, "evidence"]);
  const date = input.productId === "eurgbp"
    ? input.counterparty.publicationDate : input.counterparty.decisionDate;
  assertString(date);
  // Validate even absent evidence identities; date never becomes a release instant.
  parseEventInstantV1(`${date}T00:00:00Z`, dateKey);
  assertSupplied(input.counterparty.evidence);
  const left = buildEuroSide(input.euro, input.expectedEcbCanonicalEventId, evaluatedMs);
  switch (input.productId) {
    case "eurusd":
      return assemble("eurusd", left, buildFomcSide(input.counterparty.evidence, date, evaluatedMs), evaluatedMs);
    case "eurjpy":
      return assemble("eurjpy", left, buildBojSide(input.counterparty.evidence, date, evaluatedMs), evaluatedMs);
    case "eurgbp":
      return assemble("eurgbp", left, buildBoeSide(input.counterparty.evidence, date, evaluatedMs), evaluatedMs);
    case "eurchf":
      return assemble("eurchf", left, buildSnbSide(input.counterparty.evidence, date, evaluatedMs), evaluatedMs);
  }
}

function buildEuroSide(
  supplied: SuppliedEvidence<EcbMonetaryPolicyEventSnapshotV1>, expectedId: string, evaluatedMs: number,
): BilateralEcbPolicySideV1 {
  if (supplied.status === "unavailable") return unavailableSide(supplied.reason, supplied.upstreamReason);
  const snapshot = reconstructEcbMonetaryPolicyEventSnapshotV1(supplied.snapshot);
  assertCanonical(supplied.snapshot, snapshot);
  if (snapshot.canonicalEventId !== expectedId) throw new TypeError("ECB event identity mismatch.");
  if (snapshot.knownAt > Math.floor(evaluatedMs / 1000)) return unavailableSide("KNOWLEDGE_INCONSISTENT");
  const decision = snapshot.event.decision;
  const timing: BilateralEcbPolicyTimingV1 = {
    scheduledAt: snapshot.event.schedule.scheduledAt,
    decisionDate: decision?.decisionDate ?? null,
    actualReleasedAt: decision?.actualReleasedAt ?? null,
    effectiveDate: decision?.rates?.effectiveDate ?? null,
  };
  const context = sideContext(snapshot, ECB_POLICY_RATE_SERIES, timing, evaluatedMs);
  if (decision?.rates == null) {
    return {
      availability: "partial",
      missing: decision === null ? ["decisionDocument", "policySetting"] : ["policySetting"],
      data: { ...context, policySetting: { semantic: "source-fact", availability: "unavailable",
        reason: "POLICY_SETTING_UNAVAILABLE" } },
    };
  }
  return { availability: "available", data: { ...context,
    policySetting: { semantic: "source-fact", availability: "available", data: decision.rates } } };
}

function buildFomcSide(
  supplied: SuppliedEvidence<CanonicalStatisticalSeriesSnapshotV1>, date: string, evaluatedMs: number,
): BilateralFomcPolicySideV1 {
  if (supplied.status === "unavailable") return unavailableSide(supplied.reason, supplied.upstreamReason);
  const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(supplied.snapshot.series);
  assertCanonical(supplied.snapshot, snapshot);
  const family = `fomc:${date}` as const;
  const facts = readUsPolicyFactsV1(family, snapshot.series);
  if (snapshot.sourceVersionId !== buildUsPolicySourceVersionIdV1(family, snapshot.series)) {
    throw new TypeError("FOMC content identity mismatch.");
  }
  const fact = facts[0];
  if (facts.length !== 1 || fact === undefined || !("decisionDate" in fact)) {
    throw new TypeError("Expected a complete FOMC target-range fact.");
  }
  return availableSide(snapshot, fact, "federal-funds-target-range", {
    decisionDate: fact.decisionDate, releaseTimestamp: fact.releaseTimestamp, effectiveDate: fact.effectiveDate,
  }, evaluatedMs);
}

function buildBojSide(
  supplied: SuppliedEvidence<BojPolicyEvidenceSnapshotV1>, date: string, evaluatedMs: number,
): BilateralBojPolicySideV1 {
  if (supplied.status === "unavailable") return unavailableSide(supplied.reason, supplied.upstreamReason);
  const fact = readBojPolicyFactV1(date, supplied.snapshot.evidence);
  const evidence = buildBojPolicyEvidenceV1(fact, supplied.snapshot.evidence.metadata.fetchedAt);
  const snapshot: BojPolicyEvidenceSnapshotV1 = { schemaVersion: "boj-policy-evidence-snapshot-v1",
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId,
    knownAt: evidence.metadata.fetchedAt, evidence };
  assertCanonical(supplied.snapshot, snapshot);
  return availableSide(snapshot, fact, fact.instrument, {
    decisionDate: fact.decisionDate, releaseTimestamp: fact.releaseTimestamp, effectiveDate: fact.effectiveDate,
  }, evaluatedMs);
}

function buildBoeSide(
  supplied: SuppliedEvidence<BoeBankRateEvidenceSnapshotV1>, date: string, evaluatedMs: number,
): BilateralBoePolicySideV1 {
  if (supplied.status === "unavailable") return unavailableSide(supplied.reason, supplied.upstreamReason);
  const fact = readBoeBankRateFactV1(date, supplied.snapshot.evidence);
  const evidence = buildBoeBankRateEvidenceV1(fact, supplied.snapshot.evidence.metadata.fetchedAt);
  const snapshot: BoeBankRateEvidenceSnapshotV1 = { schemaVersion: "boe-bank-rate-evidence-snapshot-v1",
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId,
    knownAt: evidence.metadata.fetchedAt, evidence };
  assertCanonical(supplied.snapshot, snapshot);
  return availableSide(snapshot, fact, fact.instrument, {
    meetingEndDate: fact.meetingEndDate, publicationDate: fact.publicationDate,
    releaseTimestamp: fact.releaseTimestamp, effectiveDate: fact.effectiveDate,
  }, evaluatedMs);
}

function buildSnbSide(
  supplied: SuppliedEvidence<SnbPolicyEvidenceSnapshotV1>, date: string, evaluatedMs: number,
): BilateralSnbPolicySideV1 {
  if (supplied.status === "unavailable") return unavailableSide(supplied.reason, supplied.upstreamReason);
  const fact = readSnbPolicyFactV1(date, supplied.snapshot.evidence);
  const evidence = buildSnbPolicyEvidenceV1(fact, supplied.snapshot.evidence.metadata.fetchedAt);
  const snapshot: SnbPolicyEvidenceSnapshotV1 = { schemaVersion: "snb-policy-evidence-snapshot-v1",
    canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId,
    knownAt: evidence.metadata.fetchedAt, evidence };
  assertCanonical(supplied.snapshot, snapshot);
  return availableSide(snapshot, fact, fact.instrument, {
    decisionDate: fact.decisionDate, publicationDate: fact.publicationDate,
    releaseTimestamp: fact.releaseTimestamp, effectiveDate: fact.effectiveDate,
  }, evaluatedMs);
}

function sideContext<S extends { readonly knownAt: number }, I, T>(
  snapshot: S, instrument: I, timing: T, evaluatedMs: number,
): SideContext<S, I, T> {
  return { snapshot, instrument, timing, knownAt: snapshot.knownAt,
    freshness: { semantic: "derived-feature", status: "not-assessed",
      reason: "POLICY_CURRENTNESS_NOT_ESTABLISHED",
      evidenceAgeSeconds: Math.floor(evaluatedMs / 1000) - snapshot.knownAt } };
}

function availableSide<S extends { readonly knownAt: number }, F, I, T>(
  snapshot: S, fact: F, instrument: I, timing: T, evaluatedMs: number,
): BilateralPolicySideV1<S, F, I, T> {
  if (snapshot.knownAt > Math.floor(evaluatedMs / 1000)) return unavailableSide("KNOWLEDGE_INCONSISTENT");
  return { availability: "available", data: { ...sideContext(snapshot, instrument, timing, evaluatedMs),
    policySetting: { semantic: "source-fact", availability: "available", data: fact } } };
}

function unavailableSide(
  reason: BilateralPolicyUnavailableReasonV1, upstreamReason: string | null = null,
): BilateralPolicyUnavailableSideV1 {
  return { availability: "unavailable", reason, upstreamReason };
}

type RightSide = BilateralPolicyStateV1["right"];

function assemble(
  productId: FxProjectionProductIdV1, left: BilateralEcbPolicySideV1,
  right: RightSide, evaluatedMs: number,
): BilateralPolicyStateV1 {
  const missing: BilateralPolicyStateV1["missing"][number][] = [];
  if (left.availability !== "available") missing.push("left.policySetting");
  if (right.availability !== "available") missing.push("right.policySetting");
  const admitted = [left, right].filter((side) => side.availability !== "unavailable");
  const base: BilateralPolicyStateBaseV1 = {
    schemaVersion: BILATERAL_POLICY_STATE_SCHEMA_VERSION_V1,
    semantic: "derived-feature", feature: "bilateral-policy-state",
    basis: "captured-announced-settings", coverage: "provided-evidence-only",
    evaluatedAt: new Date(evaluatedMs).toISOString(),
    availability: missing.length === 0 ? "available" : admitted.length > 0 ? "partial" : "unavailable",
    missing, evidenceKnownAt: admitted.length === 0 ? null : Math.max(...admitted.map((side) => side.data.knownAt)),
    left, latestPolicyCoverage: { availability: "unavailable", reason: "LATEST_POLICY_COVERAGE_UNAVAILABLE" },
    policyRateDifference: { semantic: "derived-feature", availability: "unavailable",
      reason: "COMPARISON_RULE_UNESTABLISHED" },
  };
  // The exhaustive builder switch binds product to its validated source-specific side.
  const result = { ...base, productId, right } as BilateralPolicyStateV1;
  // Copy before freezing, including shared constants, to never freeze caller-owned objects.
  return freezeCopy(result);
}

function assertKeys<K extends string>(value: unknown, keys: readonly K[]): asserts value is Record<K, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed bilateral policy input fields.");
  }
}

function assertString(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("Expected a nonempty policy identifier/instant.");
}

function assertSupplied(value: unknown): void {
  if (typeof value !== "object" || value === null || !("status" in value)) {
    throw new TypeError("Expected supplied or unavailable policy evidence.");
  }
  if (value.status === "supplied") {
    assertKeys(value, ["status", "snapshot"]);
    if (typeof value.snapshot !== "object" || value.snapshot === null || Array.isArray(value.snapshot)) {
      throw new TypeError("Expected a canonical policy snapshot.");
    }
  } else if (value.status === "unavailable") {
    assertKeys(value, ["status", "reason", "upstreamReason"]);
    if (!INPUT_UNAVAILABLE_REASONS.some((reason) => reason === value.reason) ||
        (value.upstreamReason !== null && typeof value.upstreamReason !== "string")) {
      throw new TypeError("Invalid policy unavailable reason.");
    }
  } else throw new TypeError("Invalid supplied policy evidence discriminator.");
}

function assertCanonical(supplied: unknown, rebuilt: unknown): void {
  // Deep equality ignores non-enumerable fields; a closed contract must reject
  // those extra fields too, including on nested canonical evidence objects.
  function sameOwnFields(left: unknown, right: unknown): boolean {
    if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return true;
    const keys = Reflect.ownKeys(left);
    return keys.length === Reflect.ownKeys(right).length && keys.every((key) =>
      Object.hasOwn(right, key) && sameOwnFields(Reflect.get(left, key), Reflect.get(right, key)));
  }
  if (!isDeepStrictEqual(supplied, rebuilt) || !sameOwnFields(supplied, rebuilt)) {
    throw new TypeError("Policy snapshot disagrees with canonical reconstruction.");
  }
}

/** Canonical evidence contains plain data only; copy it before recursively freezing. */
function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(nested: unknown): void {
    if (typeof nested !== "object" || nested === null) return;
    for (const child of Object.values(nested)) freeze(child);
    Object.freeze(nested);
  }
  freeze(copy);
  return copy;
}
