import { createHash } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { ENGINE_RESULT_VERSION } from "../engine/contracts";
import type { EcbEstrSeriesV1 } from "../providers/ecb/estrTypes";
import type { EcbFxReferenceSeriesBundleV1 } from "../providers/ecb/fxReferenceSeries";
import type { CanonicalProductResultMapV1 } from "./canonicalProductResults";
import { CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 } from "./canonicalTemporalAdmission";
import {
  validateCanonicalTemporalQualificationV1,
  type CanonicalTemporalQualificationInputV1,
  type CanonicalTemporalQualificationRejectionReasonV1,
} from "./canonicalTemporalQualification";

export const CANONICAL_PRODUCT_RESULT_CACHE_VERSION_V2 = "canonical-product-result-cache-v2";
const TRANSPORT_VERSION = "canonical-product-result-transport-v2";
const FX_IDS = ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const;
type ProductId = typeof FX_IDS[number] | "estr";
export type CanonicalResultCacheFamilyV2 = "launch-fx" | "estr";
type FxResults = Pick<CanonicalProductResultMapV1, typeof FX_IDS[number]>;
type AvailableEstr = Extract<CanonicalProductResultMapV1["estr"], { availability: "available" }>;

interface CacheContext {
  readonly schemaVersion: typeof CANONICAL_PRODUCT_RESULT_CACHE_VERSION_V2;
  readonly policyVersion: typeof CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1;
  /** Captured by the producer, independently of the receipts being checked. */
  readonly evaluatedAt: string;
}
export interface CanonicalFxResultCachePayloadV2 extends CacheContext {
  readonly family: "launch-fx";
  readonly sourceContext: EcbFxReferenceSeriesBundleV1;
  readonly result: FxResults;
}
export interface CanonicalEstrResultCachePayloadV2 extends CacheContext {
  readonly family: "estr";
  readonly sourceContext: EcbEstrSeriesV1;
  readonly result: AvailableEstr;
}
export type CanonicalResultCachePayloadV2 = CanonicalFxResultCachePayloadV2 | CanonicalEstrResultCachePayloadV2;
export interface CanonicalResultCacheTransportV2 {
  readonly schemaVersion: typeof TRANSPORT_VERSION;
  readonly encoding: "deflate-raw-base64";
  readonly body: string;
  readonly digest: string;
}
type FailureReason = CanonicalTemporalQualificationRejectionReasonV1 |
  "invalid-cache-transport" | "invalid-cache-payload" | "result-source-mismatch";

/** A retrieval failure, not a successfully cacheable runtime result. */
export class CanonicalProductResultQualificationErrorV2 extends Error {
  readonly result;
  constructor(family: CanonicalResultCacheFamilyV2, reason: FailureReason, productId?: ProductId) {
    super(`Canonical ${family} calculated-result qualification rejected: ${reason}.`);
    this.name = "CanonicalProductResultQualificationErrorV2";
    this.result = Object.freeze({ availability: "unavailable" as const, family,
      productId: productId ?? (family === "estr" ? "estr" : "eurusd"), reason,
      policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
      missing: Object.freeze(["temporal"] as const) });
  }
}

// Hard resource bounds apply to both producer graphs and decoded transport.
const MAX_BYTES = 16 * 1024 * 1024;
// Installed Next fetch-cache entries are limited to 2 MiB. Leave headroom for
// its surrounding JSON entry; compression retains complete source histories.
const MAX_TRANSPORT_BYTES = 1_900_000;
const MAX_NODES = 400_000;
const MAX_DEPTH = 96;
const MAX_ELEMENTS = 100_000;
interface Budget { nodes: number; bytes: number }
type Tagged = [string, ...unknown[]];

/** Descriptor-only snapshot: no input iterators, getters, toJSON or callbacks.
 * Ordinary Object/null records, dense ordinary arrays and scalar leaves only.
 * Proxies/modified built-ins are outside the supported boundary; thrown traps reject.
 */
export function ownCanonicalResultPassiveDataV2<T>(value: T): T {
  const owned = snapshot(value, new WeakSet(), { nodes: 0, bytes: 0 }, 0) as T;
  freeze(owned);
  return owned;
}

/** Next unstable_cache JSON-stringifies its return value. Only this JSON-safe
 * transport crosses that boundary; tagged leaves preserve undefined, -0 and
 * nonfinite extension scalars, without changing the approved source digest.
 * The transport checksum detects corruption, not adversarial authentication.
 */
export function encodeCanonicalProductResultCacheV2(
  family: CanonicalResultCacheFamilyV2, payload: unknown,
): CanonicalResultCacheTransportV2 {
  try {
    const owned = ownCanonicalResultPassiveDataV2(payload);
    validatePayload(family, owned);
    const tagged = JSON.stringify(tag(owned));
    if (Buffer.byteLength(tagged, "utf8") > MAX_BYTES) throw new TypeError("Cache transport too large");
    const body = deflateRawSync(Buffer.from(tagged, "utf8"), { level: 9 }).toString("base64");
    if (body.length > MAX_TRANSPORT_BYTES) throw new TypeError("Cache transport too large");
    return Object.freeze({ schemaVersion: TRANSPORT_VERSION, encoding: "deflate-raw-base64", body, digest: checksum(body) });
  } catch (error) {
    if (error instanceof CanonicalProductResultQualificationErrorV2) throw error;
    throw new CanonicalProductResultQualificationErrorV2(family, "invalid-cache-payload");
  }
}

export function decodeCanonicalProductResultCacheV2(family: "launch-fx", transport: unknown): CanonicalFxResultCachePayloadV2;
export function decodeCanonicalProductResultCacheV2(family: "estr", transport: unknown): CanonicalEstrResultCachePayloadV2;
export function decodeCanonicalProductResultCacheV2(
  family: CanonicalResultCacheFamilyV2, transport: unknown,
): CanonicalResultCachePayloadV2 {
  let payload: unknown;
  try {
    const input = ownCanonicalResultPassiveDataV2(transport);
    if (!record(input) || !keys(input, ["schemaVersion", "encoding", "body", "digest"]) ||
      input.schemaVersion !== TRANSPORT_VERSION || input.encoding !== "deflate-raw-base64" || typeof input.body !== "string" ||
      typeof input.digest !== "string" || !/^[a-f0-9]{64}$/.test(input.digest) ||
      input.body.length > MAX_TRANSPORT_BYTES || checksum(input.body) !== input.digest) {
      throw new TypeError("Invalid cache transport");
    }
    const compressed = Buffer.from(input.body, "base64");
    if (compressed.toString("base64") !== input.body) throw new TypeError("Invalid cache base64");
    // Node's info option returns both buffer and engine; installed @types/node
    // still declares only the default buffer return for this overload.
    const inflated = inflateRawSync(compressed, { maxOutputLength: MAX_BYTES, info: true }) as unknown as {
      readonly buffer: Buffer; readonly engine: { readonly bytesWritten: number };
    };
    if (inflated.engine.bytesWritten !== compressed.length) throw new TypeError("Trailing cache compression data");
    const tagged = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(inflated.buffer);
    // First pass retains only bounded parser frames and one scalar token. It
    // enforces the same logical budgets as the producer before allocating the
    // result graph. The second pass uses the identical grammar and accounting.
    parseTagged(tagged, false);
    payload = parseTagged(tagged, true);
    // Reject alternative/noncanonical encodings as well as malformed tags.
    if (JSON.stringify(tag(payload)) !== tagged) throw new TypeError("Noncanonical cache transport");
  } catch {
    throw new CanonicalProductResultQualificationErrorV2(family, "invalid-cache-transport");
  }
  const validated = validatePayload(family, payload);
  freeze(validated);
  return validated;
}

/** Full producer-retained source context is independent of the receipt fields.
 * E is never inferred from the receipt or replaced with a delivery clock.
 * Together these establish consistency under the server-cache trust assumption;
 * control of both context and receipt is NOT authenticated historical possession.
 * No calculators, provider I/O, cache writes or lifecycle work occur here.
 */
function validatePayload(family: CanonicalResultCacheFamilyV2, value: unknown): CanonicalResultCachePayloadV2 {
  const reject = (reason: FailureReason, productId?: ProductId): never => {
    throw new CanonicalProductResultQualificationErrorV2(family, reason, productId);
  };
  if (!record(value) || !keys(value, ["schemaVersion", "policyVersion", "family", "evaluatedAt", "sourceContext", "result"]) ||
    value.schemaVersion !== CANONICAL_PRODUCT_RESULT_CACHE_VERSION_V2 || value.family !== family ||
    value.policyVersion !== CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 || typeof value.evaluatedAt !== "string") {
    return reject("invalid-cache-payload");
  }
  if (family === "launch-fx") {
    if (!record(value.sourceContext) || !keys(value.sourceContext, FX_IDS) ||
      !record(value.result) || !keys(value.result, FX_IDS)) return reject("invalid-cache-payload");
    // Validate the entire family before exposing even one calculated result.
    for (const productId of FX_IDS) {
      const source = value.sourceContext[productId];
      const result = value.result[productId];
      if (!record(result)) return reject("invalid-cache-payload", productId);
      const verified = validateCanonicalTemporalQualificationV1(result.temporalQualification,
        { productId, source, evaluatedAt: value.evaluatedAt } as CanonicalTemporalQualificationInputV1);
      if (verified.status === "rejected") return reject(verified.reason, productId);
      const series = source as EcbFxReferenceSeriesBundleV1[typeof productId];
      const latest = series.observations.at(-1)!;
      const engine = result.engineResult;
      const intelligence = result.intelligence;
      if (result.availability !== "available" || !record(engine) || !record(intelligence) ||
        !record(result.calibration) || engine.asset !== productId || engine.version !== ENGINE_RESULT_VERSION ||
        intelligence.profileId !== productId ||
        engine.symbol !== `${productId.toUpperCase()}=X` ||
        !fxResultShape(engine, intelligence, result.calibration, latest.value) ||
        engine.evaluatedAt !== value.evaluatedAt || !equal(result.provenance, series.metadata) ||
        !Object.is(intelligence.price, latest.value) || !record(engine.marketData) ||
        !record(engine.marketData.provenance) || engine.marketData.provider !== series.metadata.provider ||
        engine.marketData.interval !== series.metadata.interval || engine.marketData.status !== series.metadata.status ||
        engine.marketData.latestTimestampSeconds !== latest.timestamp ||
        engine.marketData.provenance.provider !== series.metadata.provider ||
        engine.marketData.provenance.fetchedAt !== series.metadata.fetchedAt ||
        engine.marketData.provenance.sourceTimestamp !== series.metadata.sourceTimestamp) {
        return reject("result-source-mismatch", productId);
      }
    }
  } else {
    if (!record(value.result) || !record(value.result.data)) return reject("invalid-cache-payload", "estr");
    const data = value.result.data;
    const verified = validateCanonicalTemporalQualificationV1(data.temporalQualification,
      { productId: "estr", source: value.sourceContext, evaluatedAt: value.evaluatedAt } as CanonicalTemporalQualificationInputV1);
    if (verified.status === "rejected") return reject(verified.reason, "estr");
    const source = value.sourceContext as EcbEstrSeriesV1;
    const latest = source.canonicalSeries.observations.at(-1)!;
    const sidecar = source.observationMetadata.at(-1)!;
    if (value.result.availability !== "available" || data.productId !== "estr" || data.product !== "€STR" ||
      !Object.is(data.currentRatePercent, latest.value) || data.sourceTimestamp !== latest.timestamp ||
      data.fetchedAt !== source.canonicalSeries.metadata.fetchedAt || data.latestReferenceDate !== sidecar.referenceDate ||
      !record(data.source) || data.source.dataflow !== source.dataflow || data.source.seriesKey !== source.seriesKey ||
      !equal(data.source.provenance, source.canonicalSeries.metadata) ||
      !equal(data.source.latestObservationMetadata, sidecar) || !record(data.features) ||
      !Object.is(data.features.currentRate, latest.value) ||
      !record(data.signal) || data.signal.availability !== "available" ||
      !record(data.risk) || data.risk.availability !== "available" ||
      !record(data.marketState) || data.marketState.availability !== "available" ||
      !record(data.engineAdapter) || data.engineAdapter.availability !== "available" ||
      !estrResultShape(data)) {
      return reject("result-source-mismatch", "estr");
    }
  }
  return value as unknown as CanonicalResultCachePayloadV2;
}

// Check retained result structure and duplicated factual fields without rerunning
// Technical/Signal/Risk/adapter mathematics or decision lifecycle at retrieval.
function fxResultShape(engine: Record<string, unknown>, intelligence: Record<string, unknown>, calibration: Record<string, unknown>, latest: number): boolean {
  const technical = intelligence.technical;
  const signal = intelligence.signal;
  const risk = intelligence.risk;
  return record(technical) && Object.is(technical.price, latest) &&
    nullableNumbers(technical, ["emaFast", "emaMedium", "emaSlow", "rsi", "macd", "macdSignal", "macdHistogram",
      "momentum", "roc", "annualizedVolatility", "priceVsEmaMedium", "priceVsEmaSlow"]) &&
    record(signal) && between(signal.score, -1, 1) && between(signal.confidence, 0, 1) &&
    member(signal.direction, ["bullish", "bearish", "neutral"]) &&
    member(signal.strength, ["weak", "moderate", "strong"]) && stringList(signal.reasons) &&
    record(risk) && between(risk.score, 0, 1) && member(risk.level, ["low", "moderate", "high"]) && stringList(risk.reasons) &&
    member(intelligence.state, ["opportunity", "caution", "risk"]) && between(intelligence.confidence, 0, 1) &&
    calibration.genericComputable === true && typeof calibration.productionCalibrated === "boolean" &&
    stringList(calibration.missingExplicitCalibration) &&
    list(choice("risk", "signal"))(calibration.missingExplicitCalibration) &&
    Array.isArray(calibration.missingExplicitCalibration) &&
    calibration.productionCalibrated === (calibration.missingExplicitCalibration.length === 0) &&
    engineContract(engine) &&
    record(engine.technical) && engine.technical.availability === "available" && equal(engine.technical.data, technical) &&
    equal(engine.signal, signal) && equal(engine.risk, risk) && record(engine.state) &&
    engine.state.state === intelligence.state && Object.is(engine.state.confidence, intelligence.confidence);
}
function estrResultShape(data: Record<string, unknown>): boolean {
  const features = data.features;
  const signal = record(data.signal) ? data.signal.data : undefined;
  const risk = record(data.risk) ? data.risk.data : undefined;
  const state = record(data.marketState) ? data.marketState.data : undefined;
  const adapter = record(data.engineAdapter) ? data.engineAdapter.data : undefined;
  if (!record(features) || !record(signal) || !record(risk) || !record(state) || !record(adapter) ||
    !record(adapter.engineEvidence) || !record(adapter.engineEvidence.signal) || !record(adapter.engineEvidence.risk)) return false;
  const evidence = adapter.engineEvidence;
  if (!notApplicable(evidence.macro) || !notApplicable(evidence.crossAsset) ||
    !notComputed(evidence.positioning) || !notComputed(evidence.dataQuality) ||
    !shape({ id: literal("signal"), evidenceRole: literal("primary"), architecturePrior: literal(1), coverage: literal(1), score: signed })(evidence.signal) ||
    !shape({ score: unit, level: riskLevel, reasons: stringList })(evidence.risk)) return false;
  return finite(features.dailyChangeBp) && between(features.rsi, 0, 100) &&
    finite(features.dailyBpVolatility) && features.dailyBpVolatility >= 0 &&
    Array.isArray(features.momentum) && features.momentum.length === 4 &&
    features.momentum.every((row, index) => record(row) && row.horizonObservations === [1, 5, 10, 20][index] && finite(row.momentumBp)) &&
    Array.isArray(features.ema) && features.ema.length === 3 &&
    features.ema.every((row, index) => record(row) && row.period === [20, 50, 200][index] && finite(row.emaRate) && finite(row.emaDistanceBp)) &&
    record(features.macd) && ["macdBp", "signalBp", "histogramBp"].every((key) => record(features.macd) && finite(features.macd[key])) &&
    between(signal.score, -1, 1) && signal.coverage === 1 && record(signal.components) &&
    componentsBetween(signal.components, ["ema", "rsi14", "macdHistogramBp", "momentum10Bp"], -1, 1) &&
    member(signal.direction, ["rising-rate", "falling-rate", "range-bound"]) &&
    member(signal.strength, ["range-bound", "directional", "strong"]) &&
    between(risk.score, 0, 1) && risk.coverage === 1 && record(risk.components) &&
    componentsBetween(risk.components, ["dailyBpVolatility", "rsiStretch", "momentum10Bp", "macdHistogramBp", "ema50DistanceBp", "ema200DistanceBp"], 0, 1) &&
    member(risk.level, ["low", "moderate", "high"]) &&
    Object.is(state.currentRatePercent, data.currentRatePercent) && state.direction === signal.direction &&
    state.signalStrength === signal.strength && Object.is(state.signalScore, signal.score) &&
    state.riskLevel === risk.level && Object.is(state.riskScore, risk.score) &&
    member(state.levelRegime, ["low", "middle", "high"]) && member(state.volatilityRegime, ["calm", "elevated", "stressed"]) &&
    equal(adapter.rateMarketState, state) &&
    Object.is(adapter.engineEvidence.signal.score, signal.direction === "range-bound" ? 0 : signal.score) &&
    Object.is(adapter.engineEvidence.risk.score, risk.score) && adapter.engineEvidence.risk.level === risk.level;
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
// Contract validators consume only already-owned, bounded passive records.
// They check retained types and discriminants, not analytical authenticity.
type Check = (value: unknown) => boolean;
const textValue: Check = (value) => typeof value === "string";
const booleanValue: Check = (value) => typeof value === "boolean";
const unit: Check = (value) => between(value, 0, 1);
const signed: Check = (value) => between(value, -1, 1);
const positive: Check = (value) => finite(value) && value > 0;
const integer: Check = (value) => Number.isSafeInteger(value) && finite(value) && value >= 0;
const choice = (...values: string[]): Check => (value) => member(value, values);
const literal = (expected: unknown): Check => (value) => Object.is(value, expected);
const nullable = (check: Check): Check => (value) => value === null || check(value);
const list = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);
function shape(required: Record<string, Check>, optional: Record<string, Check> = {}): Check {
  return (value) => record(value) &&
    Object.entries(required).every(([key, check]) => Object.hasOwn(value, key) && check(value[key])) &&
    Object.entries(optional).every(([key, check]) => value[key] === undefined || check(value[key]));
}
const direction = choice("bullish", "bearish", "neutral");
const riskLevel = choice("low", "moderate", "high");
const marketState = choice("opportunity", "caution", "risk");
const decisionData: Check = (value) => shape({ score: signed, stance: direction })(value) &&
  record(value) && value.stance === (Number(value.score) > 0 ? "bullish" : Number(value.score) < 0 ? "bearish" : "neutral");
const reasonOptions = { reason: textValue };
const foundationCodes = ["decision", "signal", "macro", "crossAsset", "marketData", "dataConfidence", "macroDataQuality", "crossAssetDataQuality"];
const foundationReasons = ["DECISION_NOT_COMPUTED", "DECISION_UNAVAILABLE", "SIGNAL_NOT_COMPUTED", "SIGNAL_UNAVAILABLE", "INVALID_CANONICAL_INPUT"];
// Per-section allowed variants; reserved branch fields may not contradict the
// selected discriminant. Other legitimate optional/extension data is retained.
function section(data: Check, variants: readonly string[], missing: Check = stringList,
  reasonCodes?: readonly string[]): Check {
  return (value) => {
    if (!record(value) || !member(value.availability, variants)) return false;
    if (value.availability === "available" || value.availability === "partial") {
      return Object.hasOwn(value, "data") && data(value.data) &&
        (value.availability === "partial" ? missing(value.missing) : !Object.hasOwn(value, "missing")) &&
        !Object.hasOwn(value, "reason") && !Object.hasOwn(value, "reasonCode");
    }
    if (Object.hasOwn(value, "data") || Object.hasOwn(value, "missing")) return false;
    if (value.availability === "not-computed") return !Object.hasOwn(value, "reason") && !Object.hasOwn(value, "reasonCode");
    return reasonCodes && value.availability === "unavailable"
      ? member(value.reasonCode, reasonCodes) && !Object.hasOwn(value, "reason")
      : shape({}, reasonOptions)(value) && !Object.hasOwn(value, "reasonCode");
  };
}
const dataVariants = ["available", "partial", "unavailable"];
const deferredVariants = ["not-computed", "unavailable"];
const computedVariants = [...dataVariants, "not-computed"];
const evidenceVariants = [...computedVariants, "not-applicable"];
const numericSection = section(unit, computedVariants);
const confidenceInput = section(unit, evidenceVariants);
const deferred = section(() => false, deferredVariants);
const notApplicable = section(() => false, ["not-applicable"]);
const notComputed = section(() => false, ["not-computed"]);
const confidenceSnapshot = (components: readonly string[]): Check => shape({
  score: unit, components: shape(Object.fromEntries(components.map((name) => [name, confidenceInput]))),
});
const confidenceData = shape({
  data: section(confidenceSnapshot(["marketData", "technical", "macro", "crossAsset", "positioning"]), dataVariants),
  conviction: section(confidenceSnapshot(["signal", "macro", "state", "regime", "crossAsset", "positioning", "scenario", "contradiction"]), dataVariants),
});
const reference: Check = (value) => {
  if (!record(value)) return false;
  if (value.kind === "channel") return shape({
    kind: literal("channel"), channel: choice("signal", "macro", "crossAsset"), role: choice("primary", "corroborative"),
  })(value) && value.role === (value.channel === "crossAsset" ? "corroborative" : "primary");
  return value.kind === "driver"
    ? shape({ kind: literal("driver"), channel: literal("macro"), id: textValue, role: literal("explanatory") })(value)
    : shape({ kind: literal("relationship"), channel: literal("crossAsset"), id: textValue, role: literal("explanatory") })(value);
};
const relation = choice("supports", "opposes", "neutral", "unknown", "not-applicable");
const observation = shape({ reference, relation });
const conditionCodes = ["TARGET_DIRECTION_SUPPORTED", "EVIDENCE_BECOMES_SUPPORTIVE", "PRIMARY_SIGNAL_CEASES_SUPPORT",
  "SUPPORTING_MACRO_DRIVER_CEASES_SUPPORT", "SUPPORTING_MACRO_DRIVER_REVERSES", "CORROBORATIVE_RELATIONSHIP_CEASES_SUPPORT",
  "CORROBORATIVE_RELATIONSHIP_REVERSES", "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE", "RELEVANT_DATA_CONFIDENCE_PARTIAL",
  "RELEVANT_DATA_CONFIDENCE_UNAVAILABLE", "MARKET_DATA_STALE", "RISK_LEVEL_HIGH"];
const conditionReference: Check = (value) => reference(value) ||
  shape({ kind: literal("risk"), section: literal("risk") })(value) ||
  shape({ kind: literal("dataQuality"), section: literal("confidence.data") })(value) ||
  shape({ kind: literal("marketData"), section: literal("marketData") })(value);
const condition = shape({
  code: choice(...conditionCodes), reference: conditionReference,
  status: choice("met", "unmet", "unknown", "not-applicable"),
}, { expectedRelation: choice("supports", "opposes", "neutral") });
const scenarioCase = (id: string): Check => shape({
  id: literal(id), targetStance: id === "base" ? direction : literal(id),
  relationToDecision: id === "base" ? literal("current") : choice("aligned", "counterfactual"),
  supportingEvidence: list(observation), opposingEvidence: list(observation), neutralEvidence: list(observation),
  notApplicableEvidence: list(observation), unknownEvidence: list(observation),
  dominantSupportingDrivers: list(reference), strengtheningConditions: list(condition), weakeningConditions: list(condition),
});
const scenarioData = shape({
  semantic: literal("conditional-evidence-configurations-v1"),
  base: scenarioCase("base"), bullish: scenarioCase("bullish"), bearish: scenarioCase("bearish"),
});
const predicate: Check = (value) => {
  if (!record(value)) return false;
  switch (value.kind) {
    case "decision-stance-not-equal": return shape({ stance: direction })(value);
    case "decision-availability-equal": return value.availability === "unavailable";
    case "evidence-relation-not-equal": return reference(value.reference) && value.relation === "supports";
    case "evidence-relation-equal": return reference(value.reference) && value.relation === "opposes";
    case "evidence-availability-equal": return reference(value.reference) && value.availability === "unavailable";
    case "risk-level-equal": return value.level === "high";
    case "data-confidence-availability-equal": return member(value.availability, ["partial", "unavailable"]);
    case "market-data-freshness-equal": return value.freshness === "stale";
    default: return false;
  }
};
const trigger = (effect: string, codes: readonly string[]): Check =>
  shape({ effect: literal(effect), code: choice(...codes), predicate });
const invalidating = trigger("invalidates", ["DECISION_STANCE_NO_LONGER_MATCHES_THESIS", "PRIMARY_SIGNAL_CEASES_SUPPORT"]);
const weakening = trigger("weakens", ["SUPPORTING_MACRO_DRIVER_CEASES_SUPPORT", "SUPPORTING_MACRO_DRIVER_REVERSES",
  "CORROBORATIVE_RELATIONSHIP_CEASES_SUPPORT", "CORROBORATIVE_RELATIONSHIP_REVERSES", "RELEVANT_DATA_CONFIDENCE_PARTIAL", "MARKET_DATA_STALE", "RISK_LEVEL_HIGH"]);
const assessment = trigger("assessment-unavailable", ["DECISION_BECOMES_UNAVAILABLE", "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE", "RELEVANT_DATA_CONFIDENCE_UNAVAILABLE"]);
const invalidationData = shape({
  semantic: literal("decision-anchored-transition-predicates-v1"),
  thesis: shape({ stance: direction, source: literal("decision") }),
  invalidatesWhen: (value) => list(invalidating)(value) && Array.isArray(value) && value.length > 0,
  weakensWhen: list(weakening), assessmentFailsWhen: list(assessment), currentFragilities: list(reference),
});
const transition: Check = (value) => record(value) && (
  (value.kind === "maintained" && direction(value.stance)) ||
  (value.kind === "neutralized" && member(value.from, ["bullish", "bearish"])) ||
  (value.kind === "emerged" && member(value.to, ["bullish", "bearish"])) ||
  (value.kind === "reversed" && member(value.from, ["bullish", "bearish"]) &&
    member(value.to, ["bullish", "bearish"]) && value.from !== value.to));
const lifecycleData: Check = (value) => record(value) && decisionData(value.current) && (
  value.comparison === "initialized" || (value.comparison === "compared" && shape({
    previous: decisionData, transition, decisionScoreDelta: (v) => between(v, -2, 2),
    convictionDelta: signed, convictionChange: choice("increased", "decreased", "unchanged"),
  })(value)));
const contradictionSource = choice("signal", "macro", "crossAsset", "positioning", "scenario");
const conflict = shape({
  sources: (value) => list(contradictionSource)(value) && Array.isArray(value) && value.length === 2, score: unit,
});
const contradictionData = shape({
  score: unit, evidence: list(shape({ source: contradictionSource, signedScore: signed }, { coverage: unit })),
  conflicts: list(conflict), strongestConflict: nullable(conflict),
}, { primaryContradiction: unit, corroborativeConfirmation: unit, corroborativeContradiction: unit });
const recommendationReason: Check = (value) => record(value) && typeof value.code === "string" &&
  typeof value.source === "string" && ({
    DECISION_DIRECTIONAL: "decision", DECISION_NEUTRAL: "decision", CONVICTION_STRONG: "confidence.conviction",
    CONVICTION_MODERATE: "confidence.conviction", CONVICTION_WEAK: "confidence.conviction",
    CONTRADICTION_LOW: "contradiction", CONTRADICTION_MATERIAL: "contradiction", CONTRADICTION_HIGH: "contradiction",
    CONTRADICTION_SEVERE: "contradiction", CONTRADICTION_NOT_APPLICABLE: "contradiction",
    DATA_QUALITY_LIMITED: "confidence.data", DATA_CONFIDENCE_PARTIAL: "confidence.data", DECISION_PARTIAL: "decision",
    CONVICTION_PARTIAL: "confidence.conviction", CONTRADICTION_PARTIAL: "contradiction", MARKET_DATA_PARTIAL: "marketData",
    MARKET_DATA_UNAVAILABLE: "marketData", MARKET_DATA_STALE: "marketData", RISK_MODERATE: "risk", RISK_HIGH: "risk",
    SCENARIO_PARTIAL: "scenario", SCENARIO_NOT_COMPUTED: "scenario", SCENARIO_UNAVAILABLE: "scenario",
    SCENARIO_HAS_OPPOSING_EVIDENCE: "scenario", INVALIDATION_PARTIAL: "invalidation",
    INVALIDATION_NOT_COMPUTED: "invalidation", INVALIDATION_UNAVAILABLE: "invalidation",
    INVALIDATION_HAS_CURRENT_FRAGILITIES: "invalidation",
  } as Record<string, string>)[value.code] === value.source;
const reasonIn = (...codes: string[]): Check => (value) =>
  recommendationReason(value) && record(value) && member(value.code, codes);
function projectedSection(data: Check, reasonCodes: readonly string[]): Check {
  return (value) => record(value) && (
    member(value.availability, ["available", "partial"])
      ? data(value) && (value.availability === "partial" ? list(choice(...foundationCodes))(value.missing) : !Object.hasOwn(value, "missing"))
      : section(() => false, deferredVariants, stringList, reasonCodes)(value));
}
const recommendationData = shape({
  semantic: literal("canonical-operational-synthesis-v1"),
  stance: direction, posture: choice("act", "selective", "watch", "stand-aside"),
  strength: shape({ source: literal("confidence.conviction"), canonicalScore: unit, band: choice("strong", "moderate", "weak") }),
  contradiction: shape({ source: literal("contradiction"), canonicalScore: nullable(unit), band: choice("low", "material", "high", "severe", "not-applicable") }),
  dataQuality: shape({ source: literal("confidence.data"), canonicalScore: unit, band: choice("adequate", "limited") }),
  dominantReason: reasonIn("DECISION_DIRECTIONAL", "DECISION_NEUTRAL"),
  supportingReasons: list(reasonIn("DECISION_DIRECTIONAL", "CONVICTION_STRONG", "CONVICTION_MODERATE", "CONTRADICTION_LOW")),
  opposingReasons: list(reasonIn("CONTRADICTION_MATERIAL", "CONTRADICTION_HIGH", "CONTRADICTION_SEVERE", "SCENARIO_HAS_OPPOSING_EVIDENCE")),
  restraintReasons: list(reasonIn("DECISION_NEUTRAL", "CONVICTION_WEAK", "CONTRADICTION_NOT_APPLICABLE",
    "CONTRADICTION_MATERIAL", "CONTRADICTION_HIGH", "CONTRADICTION_SEVERE", "DATA_QUALITY_LIMITED", "DATA_CONFIDENCE_PARTIAL",
    "DECISION_PARTIAL", "CONVICTION_PARTIAL", "CONTRADICTION_PARTIAL", "MARKET_DATA_PARTIAL", "MARKET_DATA_UNAVAILABLE",
    "MARKET_DATA_STALE", "RISK_MODERATE", "RISK_HIGH", "SCENARIO_PARTIAL", "SCENARIO_NOT_COMPUTED", "SCENARIO_UNAVAILABLE",
    "SCENARIO_HAS_OPPOSING_EVIDENCE", "INVALIDATION_PARTIAL", "INVALIDATION_NOT_COMPUTED", "INVALIDATION_UNAVAILABLE",
    "INVALIDATION_HAS_CURRENT_FRAGILITIES")),
  dominantSupportingEvidence: list(reference), opposingEvidence: list(reference),
  scenario: projectedSection(shape({ base: literal("base"), aligned: nullable(choice("bullish", "bearish")),
    counterfactual: list(choice("bullish", "bearish")) }), foundationReasons),
  invalidation: projectedSection(shape({
    invalidatesWhen: (value) => list(invalidating)(value) && Array.isArray(value) && value.length > 0,
    weakensWhen: list(weakening), assessmentFailsWhen: list(assessment) }), foundationReasons),
});
const regimeSnapshot = shape({
  timestamp: textValue, state: marketState, confidence: unit, signalDirection: direction, signalConfidence: unit,
  macroBias: nullable(direction), macroConfidence: nullable(unit), riskLevel, riskScore: unit,
});
const regimeMemory = shape({
  current: regimeSnapshot, previous: nullable(regimeSnapshot),
  transition: shape({ changed: booleanValue, from: nullable(marketState), to: marketState,
    direction: choice("new", "unchanged", "improving", "deteriorating", "mixed") }),
  conviction: shape({ current: unit, previous: nullable(unit), change: nullable(signed), direction: choice("rising", "falling", "stable") }),
  technical: shape({ current: direction, previous: nullable(direction), confidence: unit,
    previousConfidence: nullable(unit), change: choice("strengthening", "weakening", "stable") }),
  macro: shape({ current: nullable(direction), previous: nullable(direction), confidence: nullable(unit),
    previousConfidence: nullable(unit), change: choice("improving", "deteriorating", "stable", "unavailable") }),
  risk: shape({ currentLevel: riskLevel, previousLevel: nullable(riskLevel), currentScore: unit,
    previousScore: nullable(unit), change: choice("improving", "deteriorating", "stable") }),
});
const regimeSection: Check = (value) => record(value) && (
  value.availability === "available" ? regimeMemory(value.memory) && !Object.hasOwn(value, "current") :
  value.availability === "partial" ? regimeSnapshot(value.current) && stringList(value.missing) && !Object.hasOwn(value, "memory") :
  value.availability === "unavailable" && shape({}, reasonOptions)(value) && !Object.hasOwn(value, "memory") && !Object.hasOwn(value, "current"));
const macroData = shape({
  direction, score: signed, strengthMagnitude: unit, coverage: unit, dataQuality: numericSection, reasons: stringList,
  drivers: list(shape({ id: textValue, available: booleanValue }, { weight: positive, direction, score: nullable(signed),
    observedAt: textValue, weightedContribution: nullable(finite), contribution: nullable(finite), reason: textValue })),
}, { strength: choice("weak", "moderate", "strong"), confidence: unit });
const assetId = choice("gold", "oil", "sp500", "nasdaq100", "bitcoin", "dxy", "us10y", "silver", "copper",
  "naturalGas", "eurusd", "eurjpy", "eurgbp", "eurchf", "ethereum");
const relationship: Check = (value) => shape({
  id: textValue, targetAssetId: assetId, referenceAssetId: assetId, expectedSign: choice("direct", "inverse"),
  weight: positive, horizon: shape({ interval: literal("daily"), observations: positive }),
}, { observedAt: textValue, latestTimestamp: finite })(value) && record(value) &&
  (value.availability === "available" ? shape({ referenceMoveScore: signed, signedEvidence: signed, weightedContribution: finite })(value)
    : value.availability === "unavailable" && shape({}, reasonOptions)(value));
const crossAssetData = shape({
  score: signed, strengthMagnitude: unit, coverage: unit, relationships: list(relationship), dataQuality: numericSection,
});
function engineContract(engine: Record<string, unknown>): boolean {
  const market = engine.marketData;
  if (!record(market) || !member(market.availability, ["available", "partial"]) ||
    (market.availability === "available" && market.freshness !== "within-cadence") ||
    (market.availability === "partial" && !member(market.freshness, ["unknown", "stale"])) ||
    !shape({}, { historicalWindow: shape({ receivedPoints: integer }, {
      requestedFrom: finite, requestedTo: finite, firstTimestamp: finite, lastTimestamp: finite,
    }) })(market)) return false;
  return section(macroData, evidenceVariants)(engine.macro) &&
    section(crossAssetData, evidenceVariants)(engine.crossAsset) && deferred(engine.positioning) &&
    regimeSection(engine.regime) &&
    section(confidenceData, ["available", "unavailable", "not-computed"])(engine.confidence) &&
    section(decisionData, computedVariants)(engine.decision) &&
    section(lifecycleData, computedVariants)(engine.decisionLifecycle) &&
    section(contradictionData, evidenceVariants)(engine.contradiction) &&
    section(scenarioData, computedVariants, list(choice(...foundationCodes)), foundationReasons)(engine.scenario) &&
    section(invalidationData, computedVariants, list(choice(...foundationCodes)), foundationReasons)(engine.invalidation) &&
    section(recommendationData, computedVariants,
      list(choice("decision", "conviction", "dataConfidence", "contradiction", "marketData", "scenario", "invalidation")),
      ["DECISION_NOT_COMPUTED", "DECISION_UNAVAILABLE", "CONFIDENCE_NOT_COMPUTED", "CONFIDENCE_UNAVAILABLE",
        "CONVICTION_UNAVAILABLE", "DATA_CONFIDENCE_UNAVAILABLE", "CONTRADICTION_NOT_COMPUTED", "CONTRADICTION_UNAVAILABLE", "INVALID_CANONICAL_INPUT"])(engine.recommendation) &&
    (!record(engine.decisionLifecycle) || !record(engine.decisionLifecycle.data) ||
      !record(engine.decision) || equal(engine.decisionLifecycle.data.current, engine.decision.data));
}
function between(value: unknown, low: number, high: number): boolean { return finite(value) && value >= low && value <= high; }
function member(value: unknown, values: readonly string[]): boolean { return typeof value === "string" && values.includes(value); }
function componentsBetween(value: Record<string, unknown>, names: readonly string[], low: number, high: number): boolean {
  return names.every((name) => between(value[name], low, high));
}
function nullableNumbers(value: Record<string, unknown>, names: readonly string[]): boolean {
  return names.every((name) => value[name] === null || finite(value[name]));
}
function stringList(value: unknown): boolean { return Array.isArray(value) && value.every((item) => typeof item === "string"); }

function checksum(body: string): string {
  return createHash("sha256").update(`${TRANSPORT_VERSION}\n`, "utf8").update(body, "utf8").digest("hex");
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function equal(left: unknown, right: unknown): boolean {
  // structuredClone in the approved runtimes converts null-prototype records
  // to ordinary records. Their passive values and source binding are identical.
  return JSON.stringify(tag(left, false)) === JSON.stringify(tag(right, false));
}
function freeze(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}
function tick(budget: Budget, depth: number, value?: string): void {
  budget.nodes++;
  if (budget.nodes > MAX_NODES || depth > MAX_DEPTH) throw new TypeError("Cache bounds exceeded");
  if (value !== undefined) chargeString(budget, value);
}
function chargeString(budget: Budget, value: string): void {
  budget.bytes += Buffer.byteLength(value, "utf8");
  if (budget.bytes > MAX_BYTES) throw new TypeError("Cache bounds exceeded");
}
function property(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) throw new TypeError("Nonpassive cache property");
  return descriptor.value;
}
function snapshot(value: unknown, ancestors: WeakSet<object>, budget: Budget, depth: number): unknown {
  tick(budget, depth, typeof value === "string" ? value : undefined);
  if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("Nonpassive cache data");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError("Nonpassive cache prototype");
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length > MAX_ELEMENTS + (array ? 1 : 0)) throw new TypeError("Cache collection too large");
  ancestors.add(value);
  let copy: unknown;
  if (array) {
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ELEMENTS || ownKeys.length !== length + 1) throw new TypeError("Nondense cache array");
    const items = [];
    for (let index = 0; index < length; index++) items.push(snapshot(property(value, String(index)), ancestors, budget, depth + 1));
    copy = items;
  } else {
    const output = Object.create(prototype) as Record<string, unknown>;
    for (const key of ownKeys) {
      if (typeof key !== "string") throw new TypeError("Cache symbol key");
      tick(budget, depth, key);
      Object.defineProperty(output, key, { value: snapshot(property(value, key), ancestors, budget, depth + 1), enumerable: true, configurable: true, writable: true });
    }
    copy = output;
  }
  ancestors.delete(value);
  return copy;
}
function tag(value: unknown, preservePrototype = true): Tagged {
  if (value === undefined) return ["undefined"];
  if (value === null) return ["null"];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  if (typeof value === "string" || typeof value === "boolean") return [typeof value, value];
  if (Array.isArray(value)) return ["array", value.map((child) => tag(child, preservePrototype))];
  if (record(value)) return ["record", preservePrototype && Object.getPrototypeOf(value) === null ? 0 : 1,
    Object.keys(value).sort().map((key) => [key, tag(value[key], preservePrototype)])];
  throw new TypeError("Invalid cache leaf");
}
// Logical nodes: one per passive value and one per record key. Tag scaffolding
// does not count; UTF-8 key/string bytes are charged independently. Depth is the
// passive value depth (root zero), not the extra tagged JSON array depth.
// No recursion or full-tree JSON.parse is used, including in the preflight.
function parseTagged(text: string, build: boolean): unknown {
  const budget: Budget = { nodes: 0, bytes: 0 };
  interface Frame {
    kind: "array" | "record"; depth: number; count: number;
    key?: string; previous?: string; output?: unknown[] | Record<string, unknown>;
  }
  const frames: Frame[] = [];
  let offset = 0;
  const fail = (): never => { throw new TypeError("Invalid cache tag"); };
  const expect = (token: string) => {
    if (!text.startsWith(token, offset)) fail();
    offset += token.length;
  };
  const string = (): string => {
    const start = offset;
    expect('"');
    while (offset < text.length) {
      const code = text.charCodeAt(offset++);
      if (code === 34) {
        // Parsing a single bounded scalar never constructs a nested graph.
        const value = JSON.parse(text.slice(start, offset)) as unknown;
        if (typeof value !== "string") return fail();
        return value;
      }
      if (code < 32) fail();
      if (code === 92) {
        const escape = text[offset++];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(offset, offset + 4))) fail();
          offset += 4;
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) fail();
      }
    }
    return fail();
  };
  const nextChild = (frame: Frame) => {
    if (++frame.count > MAX_ELEMENTS) fail();
    if (frame.kind === "record") {
      expect("[");
      const key = string();
      if (frame.previous !== undefined && key <= frame.previous) fail();
      tick(budget, frame.depth, key);
      frame.key = key;
      frame.previous = key;
      expect(",");
    }
  };
  let depth = 0;
  let value: unknown;
  while (true) {
    tick(budget, depth);
    expect("[");
    const kind = string();
    if (kind === "null" || kind === "undefined") {
      expect("]");
      value = kind === "null" ? null : undefined;
    } else if (kind === "string" || kind === "number" || kind === "boolean") {
      expect(",");
      if (kind === "boolean") {
        if (text.startsWith("true", offset)) { expect("true"); value = true; }
        else { expect("false"); value = false; }
      } else {
        const content = string();
        if (kind === "string") { chargeString(budget, content); value = content; }
        else {
          value = content === "-0" ? -0 : Number(content);
          if (!["-0", "NaN", "Infinity", "-Infinity"].includes(content) &&
            (!finite(value) || String(value) !== content)) fail();
        }
      }
      expect("]");
    } else if (kind === "array" || kind === "record") {
      expect(",");
      let prototype = 1;
      if (kind === "record") {
        if (text[offset] !== "0" && text[offset] !== "1") fail();
        prototype = Number(text[offset++]);
        expect(",");
      }
      expect("[");
      const frame: Frame = { kind, depth, count: 0,
        output: build ? (kind === "array" ? [] : Object.create(prototype === 0 ? null : Object.prototype)) : undefined };
      if (text[offset] !== "]") {
        frames.push(frame);
        nextChild(frame);
        depth++;
        continue;
      }
      expect("]]");
      value = frame.output;
    } else fail();
    // Bubble a completed value through containers; bounded frames only.
    while (frames.length) {
      const frame = frames.at(-1)!;
      if (frame.kind === "record") {
        expect("]");
        if (build) Object.defineProperty(frame.output, frame.key!, {
          value, enumerable: true, writable: true, configurable: true,
        });
      } else if (build) (frame.output as unknown[]).push(value);
      if (text[offset] === ",") {
        expect(",");
        nextChild(frame);
        depth = frame.depth + 1;
        break;
      }
      expect("]]");
      frames.pop();
      value = frame.output;
    }
    if (!frames.length) {
      if (offset !== text.length) fail();
      return value;
    }
  }
}
