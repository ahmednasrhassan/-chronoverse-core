import {
  calculateEngineConfidenceV3,
  type EngineConfidenceMacroInputV3,
} from "../core/confidenceEngine";
import { calculateEngineContradictionV3 } from "../core/contradictionEngine";
import { calculateEngineDecisionV3 } from "../core/decisionEngine";
import type { MarketTechnicalSnapshot } from "../core/intelligenceEngine";
import type { MarketStateResult } from "../core/marketState";
import type { MarketRiskResult } from "../core/riskEngine";
import type { MarketSignalResult } from "../core/signalEngine";
import type {
  CandleInterval,
  HistoricalDataWindow,
  MarketDataProvenance,
  MarketDataStatus,
} from "../core/types";
import {
  ENGINE_RESULT_VERSION,
  type EngineAssetId,
  type EngineConfidenceInputV3,
  type EngineConfidenceV3,
  type EngineCrossAssetSectionV3,
  type EngineMacroSectionV3,
  type EngineMarketDataV3,
  type EngineRegimeV3,
  type EngineResultV3,
  type EngineSerializable,
} from "./contracts";
import { calculateInvalidationV1 } from "./invalidation";
import { calculateRecommendationV1 } from "./recommendation";
import { calculateScenarioV1 } from "./scenario";
import { classifyEngineMarketDataFreshnessV3 } from "./marketDataFreshness";

export interface EngineCalculationMarketDataV3 {
  readonly provider: string | null;
  readonly status: MarketDataStatus;
  readonly interval: CandleInterval;
  readonly provenance?: MarketDataProvenance;
  readonly window?: HistoricalDataWindow;
  readonly candles: readonly {
    readonly time: number;
    readonly close: number;
  }[];
}

export interface EngineCalculationIntelligenceV3<
  TState extends MarketStateResult["state"],
  TRiskLevel extends string,
> {
  readonly technical: MarketTechnicalSnapshot;
  readonly signal: MarketSignalResult;
  readonly risk: MarketRiskResult & { readonly level: TRiskLevel };
  readonly state: TState;
  readonly confidence: number;
}

export interface CalculateEngineResultV3Input<
  TIntelligence extends EngineCalculationIntelligenceV3<TState, TRiskLevel>,
  TMacroDetails,
  TMigrationDetails,
  TState extends MarketStateResult["state"],
  TRiskLevel extends string,
> {
  readonly asset: EngineAssetId;
  readonly symbol: string;
  readonly evaluatedAt: string;
  readonly minimumRequiredHistory: number;
  readonly marketData: EngineCalculationMarketDataV3;
  readonly intelligence: TIntelligence;
  readonly macro: EngineMacroSectionV3<TMacroDetails>;
  readonly regime?: EngineRegimeV3<TState, TRiskLevel>;
  readonly migrationDetails?: EngineSerializable<TMigrationDetails>;
  /** Optional already-computed evidence. This function never calculates it. */
  readonly crossAsset?: EngineCrossAssetSectionV3;
}

const NOT_COMPUTED = Object.freeze({ availability: "not-computed" } as const);
const PURE_REGIME_UNAVAILABLE = Object.freeze({
  availability: "unavailable",
  reason: "Regime Memory is not computed by the pure Engine calculation.",
} as const);

/**
 * Pure Engine V3 result calculation over already-prepared canonical inputs.
 * It performs no acquisition, history lookup, persistence, or lifecycle I/O.
 */
export function calculateEngineResultV3<
  TIntelligence extends EngineCalculationIntelligenceV3<TState, TRiskLevel>,
  TMacroDetails = never,
  TMigrationDetails = never,
  TState extends MarketStateResult["state"] = MarketStateResult["state"],
  TRiskLevel extends string = MarketRiskResult["level"],
>(
  input: CalculateEngineResultV3Input<
    TIntelligence,
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >,
): EngineResultV3<TMacroDetails, TMigrationDetails, TState, TRiskLevel> {
  const marketData = buildEngineMarketData(
    input.asset,
    input.evaluatedAt,
    input.marketData,
  );
  const technical = {
    availability: "available",
    data: input.intelligence.technical,
  } as const;
  const signal = {
    availability: "available",
    data: input.intelligence.signal,
  } as const;
  const macroEvidence = resolveMacroEvidence(input.macro);
  const suppliedCrossAsset = input.crossAsset === undefined
    ? undefined
    : validateCanonicalCrossAssetSection(input.crossAsset);
  const crossAsset = suppliedCrossAsset ?? NOT_COMPUTED;
  const contradiction = calculateEngineContradictionV3({
    signal,
    macro: macroEvidence,
    ...(suppliedCrossAsset === undefined ? {} : { crossAsset: suppliedCrossAsset }),
  });
  const confidence = {
    availability: "available",
    data: calculateEngineConfidenceV3({
      marketData,
      minimumRequiredHistory: input.minimumRequiredHistory,
      technical,
      signal,
      macro: macroEvidence,
      contradiction,
      ...(suppliedCrossAsset === undefined ? {} : { crossAsset: suppliedCrossAsset }),
    }),
  } as const;
  const decision = calculateEngineDecisionV3({
    signal,
    macro: macroEvidence,
    confidence,
  });
  const dataConfidence = projectDataConfidenceInput(confidence.data.data);
  const synthesisEvidence = {
    decision,
    signal,
    macro: input.macro,
    crossAsset,
    marketData,
    dataConfidence,
    risk: input.intelligence.risk,
  } as const;
  const scenario = calculateScenarioV1(synthesisEvidence);
  const invalidation = calculateInvalidationV1(synthesisEvidence);
  const recommendation = calculateRecommendationV1({
    decision,
    confidence,
    contradiction,
    risk: input.intelligence.risk,
    marketData,
    scenario,
    invalidation,
  });

  return {
    version: ENGINE_RESULT_VERSION,
    asset: input.asset,
    symbol: input.symbol,
    evaluatedAt: input.evaluatedAt,
    marketData,
    technical,
    macro: input.macro,
    signal: input.intelligence.signal,
    risk: input.intelligence.risk,
    state: {
      state: input.intelligence.state,
      confidence: input.intelligence.confidence,
    },
    regime: input.regime ?? PURE_REGIME_UNAVAILABLE,
    migrationDetails: input.migrationDetails,
    crossAsset,
    positioning: NOT_COMPUTED,
    scenario,
    invalidation,
    contradiction,
    confidence,
    decision,
    decisionLifecycle: NOT_COMPUTED,
    recommendation,
  };
}

function projectDataConfidenceInput(
  section: EngineConfidenceV3["data"],
): EngineConfidenceInputV3 {
  if (section.availability === "unavailable") {
    return section;
  }

  const data = section.data.score;

  return section.availability === "available"
    ? { availability: "available", data }
    : { availability: "partial", data, missing: section.missing };
}

function resolveMacroEvidence<TDetails>(
  macro: EngineMacroSectionV3<TDetails>,
): EngineConfidenceMacroInputV3<TDetails> {
  if (macro.availability === "not-applicable") {
    return {
      applicability: "not-applicable",
      reason: macro.reason,
    };
  }

  if (macro.availability === "not-computed") {
    return {
      applicability: "applicable",
      section: {
        availability: "unavailable",
        reason: "Canonical Macro evidence has not been computed.",
      },
    };
  }

  return { applicability: "applicable", section: macro };
}

function buildEngineMarketData(
  asset: EngineAssetId,
  evaluatedAt: string,
  input: EngineCalculationMarketDataV3,
): EngineMarketDataV3 {
  const latestTimestampSeconds =
    input.window?.lastTimestamp ?? input.candles.at(-1)?.time;
  const freshness = classifyEngineMarketDataFreshnessV3({
    asset,
    interval: input.interval,
    provider: input.provider,
    status: input.status,
    latestTimestampSeconds,
    evaluatedAt,
    hasUsableData: input.candles.some(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.close) &&
        candle.close > 0,
    ),
  });

  if (
    freshness === "unavailable" ||
    input.provider === null ||
    input.status === "unavailable"
  ) {
    return {
      availability: "unavailable",
      provider: input.provider,
      status: "unavailable",
      interval: input.interval,
      freshness: "unavailable",
      provenance: input.provenance,
      historicalWindow: input.window,
      latestTimestampSeconds,
    };
  }

  if (freshness === "within-cadence") {
    return {
      availability: "available",
      provider: input.provider,
      status: input.status,
      interval: input.interval,
      freshness,
      provenance: input.provenance,
      historicalWindow: input.window,
      latestTimestampSeconds,
    };
  }

  return {
    availability: "partial",
    provider: input.provider,
    status: input.status,
    interval: input.interval,
    freshness,
    provenance: input.provenance,
    historicalWindow: input.window,
    latestTimestampSeconds,
  };
}

function validateCanonicalCrossAssetSection(
  section: EngineCrossAssetSectionV3,
): EngineCrossAssetSectionV3 {
  if (section.availability !== "available" && section.availability !== "partial") {
    return section;
  }

  const { score, coverage } = section.data;

  if (
    !Number.isFinite(score) ||
    score < -1 ||
    score > 1 ||
    !Number.isFinite(coverage) ||
    coverage <= 0 ||
    coverage > 1 ||
    (section.availability === "available" && coverage !== 1) ||
    (section.availability === "partial" && coverage >= 1)
  ) {
    return {
      availability: "unavailable",
      reason: "Canonical Cross-Asset score and coverage must be finite and normalized.",
    };
  }

  return section;
}
