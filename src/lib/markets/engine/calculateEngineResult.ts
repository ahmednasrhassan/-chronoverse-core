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
  HistoricalDataWindow,
  MarketDataProvenance,
  MarketDataStatus,
} from "../core/types";
import {
  ENGINE_RESULT_VERSION,
  type EngineAssetId,
  type EngineCrossAssetSectionV3,
  type EngineMacroSectionV3,
  type EngineMarketDataV3,
  type EngineRegimeV3,
  type EngineResultV3,
  type EngineSerializable,
} from "./contracts";

export interface EngineCalculationMarketDataV3 {
  readonly provider: string | null;
  readonly status: MarketDataStatus;
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
  const marketData = buildEngineMarketData(input.marketData);
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
    scenario: NOT_COMPUTED,
    contradiction,
    confidence,
    decision,
    decisionLifecycle: NOT_COMPUTED,
    recommendation: NOT_COMPUTED,
  };
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
  input: EngineCalculationMarketDataV3,
): EngineMarketDataV3 {
  const latestTimestampSeconds =
    input.window?.lastTimestamp ?? input.candles.at(-1)?.time;

  return input.provider === null || input.status === "unavailable"
    ? {
        availability: "unavailable",
        provider: input.provider,
        status: "unavailable",
        provenance: input.provenance,
        historicalWindow: input.window,
        latestTimestampSeconds,
      }
    : {
        availability: input.status === "realtime" ? "available" : "partial",
        provider: input.provider,
        status: input.status,
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
