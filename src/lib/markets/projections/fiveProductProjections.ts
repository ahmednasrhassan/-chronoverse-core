import type { EcbFxProductionIntelligenceV1 } from
  "../assets/ecbFxProductionRuntime";
import type { EstrProductionRuntimeResultV1 } from
  "../assets/estr/runtime";
import { classifyEngineMarketDataFreshnessV3 } from
  "../engine/marketDataFreshness";
import { CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 } from
  "../services/canonicalObservationSeries";

import {
  MARKET_PRODUCT_PROJECTION_VERSION_V1,
  type EstrFreeLiteDetailsV1,
  type EstrFreeLiteProjectionV1,
  type EstrVipDeepDetailsV1,
  type EstrVipDeepProjectionV1,
  type FiveProductCanonicalProjectionInputV1,
  type FxCanonicalProjectionResultV1,
  type FxFreeLiteDetailsV1,
  type FxFreeLiteProjectionV1,
  type FxProjectionProductIdV1,
  type FxVipDeepDetailsV1,
  type FxVipDeepProjectionV1,
  type MarketProductFreeLiteProjectionV1,
  type MarketProductVipEcbPolicyEventContextV1,
  type MarketProductVipEcbPolicyEventStateV1,
  type MarketProductProjectionTierV1,
  type MarketProductUnavailableProjectionV1,
  type MarketProductVipDeepProjectionV1,
  type MarketProjectionProvenanceV1,
} from "./types";

const PRODUCT_IDENTITIES = Object.freeze({
  eurusd: Object.freeze({ displayName: "EUR/USD", productKind: "fx" as const }),
  eurjpy: Object.freeze({ displayName: "EUR/JPY", productKind: "fx" as const }),
  eurgbp: Object.freeze({ displayName: "EUR/GBP", productKind: "fx" as const }),
  eurchf: Object.freeze({ displayName: "EUR/CHF", productKind: "fx" as const }),
  estr: Object.freeze({ displayName: "\u20acSTR", productKind: "rate" as const }),
});

export function projectFiveProductFreeLiteV1(
  input: FiveProductCanonicalProjectionInputV1,
  assessedAt: string = new Date().toISOString(),
): MarketProductFreeLiteProjectionV1 {
  return input.productId === "estr"
    ? projectEstrFreeLite(input.canonical, assessedAt)
    : projectFxFreeLite(input.productId, input.canonical, assessedAt);
}

export function projectFiveProductVipDeepV1(
  input: FiveProductCanonicalProjectionInputV1,
  ecbPolicyEvent: MarketProductVipEcbPolicyEventStateV1,
  assessedAt: string,
): MarketProductVipDeepProjectionV1 {
  return input.productId === "estr"
    ? projectEstrVipDeep(input.canonical, ecbPolicyEvent, assessedAt)
    : projectFxVipDeep(
        input.productId,
        input.canonical,
        ecbPolicyEvent,
        assessedAt,
      );
}

function projectFxFreeLite(
  productId: FxProjectionProductIdV1,
  canonical: FxCanonicalProjectionResultV1,
  assessedAt: string,
): FxFreeLiteProjectionV1 | MarketProductUnavailableProjectionV1 {
  if (canonical.availability === "unavailable") {
    return unavailableProjection(
      productId,
      "free-lite",
      canonical.reason,
      canonical.missing,
    );
  }

  const unavailable = validateAvailableFxCanonical(
    productId,
    canonical,
    "free-lite",
  );

  if (unavailable !== null) {
    return unavailable;
  }

  const intelligence = canonical.intelligence;

  return Object.freeze({
    ...availableBase(productId, "free-lite", canonical, assessedAt),
    details: freeFxDetails(intelligence),
  });
}

function projectFxVipDeep(
  productId: FxProjectionProductIdV1,
  canonical: FxCanonicalProjectionResultV1,
  ecbPolicyEvent: MarketProductVipEcbPolicyEventStateV1,
  assessedAt: string,
): FxVipDeepProjectionV1 | MarketProductUnavailableProjectionV1 {
  if (canonical.availability === "unavailable") {
    return unavailableProjection(
      productId,
      "vip-deep",
      canonical.reason,
      canonical.missing,
    );
  }

  const unavailable = validateAvailableFxCanonical(
    productId,
    canonical,
    "vip-deep",
  );

  if (unavailable !== null) {
    return unavailable;
  }

  const intelligence = canonical.intelligence;
  const engine = canonical.engineResult;
  const details: FxVipDeepDetailsV1 = Object.freeze({
    ...freeFxDetails(intelligence),
    ecbPolicyEvent: withEventRelevance(
      ecbPolicyEvent,
      "euro-policy-context",
    ),
    confidence: intelligence.confidence,
    technical: intelligence.technical,
    signal: intelligence.signal,
    risk: intelligence.risk,
    calibration: canonical.calibration,
    engine: Object.freeze({
      version: engine.version,
      evaluatedAt: engine.evaluatedAt,
      macro: engine.macro,
      regime: engine.regime,
      crossAsset: engine.crossAsset,
      positioning: engine.positioning,
      scenario: engine.scenario,
      invalidation: engine.invalidation,
      contradiction: engine.contradiction,
      confidence: engine.confidence,
      decision: engine.decision,
      decisionLifecycle: engine.decisionLifecycle,
      recommendation: engine.recommendation,
    }),
  });

  return Object.freeze({
    ...availableBase(productId, "vip-deep", canonical, assessedAt),
    details,
  });
}

function projectEstrFreeLite(
  canonical: EstrProductionRuntimeResultV1,
  assessedAt: string,
): EstrFreeLiteProjectionV1 | MarketProductUnavailableProjectionV1 {
  if (canonical.availability === "unavailable") {
    return unavailableProjection(
      "estr",
      "free-lite",
      canonical.reason,
      canonical.missing,
    );
  }

  const unavailable = validateAvailableEstrCanonical(canonical, "free-lite");

  if (unavailable !== null) {
    return unavailable;
  }

  return Object.freeze({
    ...availableEstrBase("free-lite", canonical, assessedAt),
    details: freeEstrDetails(canonical.data),
  });
}

function projectEstrVipDeep(
  canonical: EstrProductionRuntimeResultV1,
  ecbPolicyEvent: MarketProductVipEcbPolicyEventStateV1,
  assessedAt: string,
): EstrVipDeepProjectionV1 | MarketProductUnavailableProjectionV1 {
  if (canonical.availability === "unavailable") {
    return unavailableProjection(
      "estr",
      "vip-deep",
      canonical.reason,
      canonical.missing,
    );
  }

  const unavailable = validateAvailableEstrCanonical(canonical, "vip-deep");

  if (unavailable !== null) {
    return unavailable;
  }

  const data = canonical.data;
  const details: EstrVipDeepDetailsV1 = Object.freeze({
    ...freeEstrDetails(data),
    ecbPolicyEvent: withEventRelevance(
      ecbPolicyEvent,
      "direct-euro-rate-policy-context",
    ),
    rateFeatures: data.features,
    signal: data.signal.data,
    risk: data.risk.data,
    marketState: data.marketState.data,
    engineEvidence: data.engineAdapter.data.engineEvidence,
  });

  return Object.freeze({
    ...availableEstrBase("vip-deep", canonical, assessedAt),
    details,
  });
}

function withEventRelevance<
  TRelevance extends MarketProductVipEcbPolicyEventContextV1["relevance"],
>(
  event: MarketProductVipEcbPolicyEventStateV1,
  relevance: TRelevance,
): MarketProductVipEcbPolicyEventContextV1<TRelevance> {
  return Object.freeze({ ...event, relevance });
}

function availableBase<TTier extends MarketProductProjectionTierV1>(
  productId: FxProjectionProductIdV1,
  tier: TTier,
  canonical: EcbFxProductionIntelligenceV1,
  assessedAt: string,
) {
  const provenance = projectionProvenance(
    productId,
    toReferenceDate(canonical.provenance.sourceTimestamp!),
    canonical.provenance,
    assessedAt,
  );

  return {
    version: MARKET_PRODUCT_PROJECTION_VERSION_V1,
    tier,
    availability: "available" as const,
    productId,
    displayName: PRODUCT_IDENTITIES[productId].displayName,
    productKind: "fx" as const,
    currentValue: Object.freeze({
      kind: "fx-reference-rate" as const,
      value: canonical.intelligence.price!,
      unit: canonical.provenance.unit,
    }),
    referenceDate: provenance.referenceDate,
    fetchedAt: provenance.fetchedAt,
    sourceTimestamp: provenance.sourceTimestamp,
    interval: provenance.interval,
    status: provenance.status,
    provenance,
  };
}

function availableEstrBase<TTier extends MarketProductProjectionTierV1>(
  tier: TTier,
  canonical: Extract<
    EstrProductionRuntimeResultV1,
    { readonly availability: "available" }
  >,
  assessedAt: string,
) {
  const data = canonical.data;
  const provenance = projectionProvenance(
    "estr",
    data.latestReferenceDate,
    data.source.provenance,
    assessedAt,
    data.source.latestObservationMetadata.publicationType,
  );

  return {
    version: MARKET_PRODUCT_PROJECTION_VERSION_V1,
    tier,
    availability: "available" as const,
    productId: "estr" as const,
    displayName: PRODUCT_IDENTITIES.estr.displayName,
    productKind: "rate" as const,
    currentValue: Object.freeze({
      kind: "rate-percent" as const,
      value: data.currentRatePercent,
      unit: "percent" as const,
    }),
    referenceDate: provenance.referenceDate,
    fetchedAt: provenance.fetchedAt,
    sourceTimestamp: provenance.sourceTimestamp,
    interval: provenance.interval,
    status: provenance.status,
    provenance,
  };
}

function projectionProvenance(
  productId: keyof typeof PRODUCT_IDENTITIES,
  referenceDate: string,
  canonical: EcbFxProductionIntelligenceV1["provenance"],
  assessedAt: string,
  publicationType?: "standard" | "republication",
): MarketProjectionProvenanceV1 {
  const observationTimestamp =
    canonical.observationTimestamp ?? canonical.sourceTimestamp!;
  return Object.freeze({
    version: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
    provider: canonical.provider,
    source: canonical.source,
    originalPublisher: canonical.originalPublisher ?? (
      canonical.provider === "ecb" && canonical.source === "European Central Bank"
        ? "European Central Bank"
        : null
    ),
    substitution: canonical.substitution ?? { status: "unknown" as const },
    seriesId: canonical.seriesId,
    canonicalProductId: productId,
    interval: canonical.interval,
    status: canonical.status,
    unit: canonical.unit,
    seriesKind: canonical.seriesKind,
    referenceDate,
    fetchedAt: canonical.fetchedAt,
    observationTimestamp,
    sourceTimestamp: canonical.sourceTimestamp!,
    releaseTimestamp: canonical.releaseTimestamp ?? null,
    ...(publicationType === undefined ? {} : { publicationType }),
    freshness: classifyEngineMarketDataFreshnessV3({
      asset: productId,
      interval: canonical.interval,
      provider: canonical.provider,
      status: canonical.status,
      latestTimestampSeconds: observationTimestamp,
      evaluatedAt: assessedAt,
      hasUsableData: true,
    }),
    freshnessAssessedAt: Number.isFinite(Date.parse(assessedAt))
      ? assessedAt
      : null,
  });
}

function freeFxDetails(
  intelligence: EcbFxProductionIntelligenceV1["intelligence"],
): FxFreeLiteDetailsV1 {
  return Object.freeze({
    kind: "fx",
    direction: intelligence.signal.direction,
    signalStrength: intelligence.signal.strength,
    marketState: intelligence.state,
    riskLevel: intelligence.risk.level,
    annualizedVolatility: intelligence.technical.annualizedVolatility,
  });
}

function freeEstrDetails(
  data: Extract<
    EstrProductionRuntimeResultV1,
    { readonly availability: "available" }
  >["data"],
): EstrFreeLiteDetailsV1 {
  const state = data.marketState.data;

  return Object.freeze({
    kind: "rate",
    currentRatePercent: data.currentRatePercent,
    direction: state.direction,
    signalStrength: state.signalStrength,
    riskLevel: state.riskLevel,
    levelRegime: state.levelRegime,
    volatilityRegime: state.volatilityRegime,
  });
}

function validateAvailableFxCanonical(
  productId: FxProjectionProductIdV1,
  canonical: EcbFxProductionIntelligenceV1,
  tier: MarketProductProjectionTierV1,
): MarketProductUnavailableProjectionV1 | null {
  if (
    canonical.engineResult.asset !== productId ||
    canonical.provenance.requestedProductId !== productId ||
    canonical.provenance.canonicalProductId !== productId ||
    !Number.isFinite(canonical.intelligence.price) ||
    !Number.isFinite(canonical.provenance.fetchedAt) ||
    !isValidSourceTimestamp(canonical.provenance.sourceTimestamp)
  ) {
    return unavailableProjection(
      productId,
      tier,
      "Canonical FX production intelligence is incomplete or mismatched.",
      Object.freeze(["canonicalIdentityOrValue"]),
    );
  }

  return null;
}

function validateAvailableEstrCanonical(
  canonical: Extract<
    EstrProductionRuntimeResultV1,
    { readonly availability: "available" }
  >,
  tier: MarketProductProjectionTierV1,
): MarketProductUnavailableProjectionV1 | null {
  const data = canonical.data;

  if (
    data.productId !== "estr" ||
    data.source.provenance.requestedProductId !== "estr" ||
    data.source.provenance.canonicalProductId !== "estr" ||
    !Number.isFinite(data.currentRatePercent) ||
    !Number.isFinite(data.fetchedAt) ||
    !isValidSourceTimestamp(data.sourceTimestamp) ||
    data.latestReferenceDate !== toReferenceDate(data.sourceTimestamp)
  ) {
    return unavailableProjection(
      "estr",
      tier,
      "Canonical \u20acSTR production intelligence is incomplete or mismatched.",
      Object.freeze(["canonicalIdentityOrValue"]),
    );
  }

  return null;
}

function unavailableProjection(
  productId: keyof typeof PRODUCT_IDENTITIES,
  tier: MarketProductProjectionTierV1,
  reason: string,
  missing: readonly string[] | undefined,
): MarketProductUnavailableProjectionV1 {
  const identity = PRODUCT_IDENTITIES[productId];

  return Object.freeze({
    version: MARKET_PRODUCT_PROJECTION_VERSION_V1,
    tier,
    availability: "unavailable",
    productId,
    displayName: identity.displayName,
    productKind: identity.productKind,
    reason,
    ...(missing === undefined ? {} : { missing }),
  });
}

function toReferenceDate(sourceTimestamp: number): string {
  return new Date(sourceTimestamp * 1_000).toISOString().slice(0, 10);
}

function isValidSourceTimestamp(
  sourceTimestamp: number | undefined,
): sourceTimestamp is number {
  return sourceTimestamp !== undefined &&
    Number.isFinite(sourceTimestamp) &&
    !Number.isNaN(new Date(sourceTimestamp * 1_000).getTime());
}
