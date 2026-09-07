import type { MarketRiskResult } from "../../core/riskEngine";
import type { EngineMacroV3, EngineResultV3 } from "../../engine/contracts";
import {
  runGenericAssetRuntimeV1,
  type GenericAssetRuntimeIntelligenceV1,
  type GenericAssetRuntimeOutputV1,
} from "../../engine/genericAssetRuntime";
import type { CanonicalMarketEvaluationV1 } from
  "../../engine/marketEvaluationCoordinator";
import {
  prepareAssetEvaluationV1,
  type PreparedMacroEvidenceV1,
} from "../../engine/preparedAssetEvaluation";
import {
  buildGoldIntelligenceSummary,
  buildGoldIntelligenceWarnings,
  type GoldIntelligenceResult,
} from "./intelligence";
import type { GoldMacroScoreResult } from "./macroScore";
import type { GoldRegimeMemoryResult } from "./regimeMemory";

export type GoldMacroCompatibilityV1 = Pick<
  GoldMacroScoreResult,
  "factors"
>;

export type PreparedGoldEvaluationOutputV1 =
  GenericAssetRuntimeOutputV1<GoldMacroCompatibilityV1>;

export type GoldCompatibilityEngineResultV1 = EngineResultV3<
  GoldMacroCompatibilityV1,
  never,
  GoldIntelligenceResult["state"],
  MarketRiskResult["level"]
>;

export type GoldCompatibilityResultV1 = Omit<GoldIntelligenceResult, "macro"> & {
  readonly macro: GoldMacroScoreResult;
  readonly regimeMemory: GoldRegimeMemoryResult;
  readonly engineResult: GoldCompatibilityEngineResultV1;
};

export interface MapGoldCompatibilityInputV1 {
  readonly intelligence: GenericAssetRuntimeIntelligenceV1;
  readonly engineResult: GoldCompatibilityEngineResultV1;
  readonly macro: GoldMacroScoreResult;
  readonly regimeMemory: GoldRegimeMemoryResult;
}

/** Pure Gold Macro result to prepared canonical Macro evidence adapter. */
export function prepareGoldMacroEvidenceV1(
  macro: GoldMacroScoreResult,
): Extract<
  PreparedMacroEvidenceV1<GoldMacroCompatibilityV1>,
  { readonly applicability: "applicable" }
> {
  return Object.freeze({
    applicability: "applicable" as const,
    section: buildGoldEngineMacroV1(macro),
  });
}

/** Bounded future cutover handoff; performs no acquisition or persistence. */
export function evaluatePreparedGoldV1(
  evaluation: CanonicalMarketEvaluationV1,
  macro: GoldMacroScoreResult,
): PreparedGoldEvaluationOutputV1 {
  return runGenericAssetRuntimeV1(
    prepareAssetEvaluationV1(
      evaluation,
      "gold",
      prepareGoldMacroEvidenceV1(macro),
    ),
  );
}

/** Pure mapping from canonical Generic output to the existing Gold contract. */
export function mapGoldCompatibilityV1(
  input: MapGoldCompatibilityInputV1,
): GoldCompatibilityResultV1 {
  if (
    input.engineResult.asset !== "gold" ||
    input.intelligence.profileId !== "gold"
  ) {
    throw new TypeError("Gold compatibility mapping requires the Gold asset.");
  }

  const technical = input.intelligence.technical;
  const indicators = {
    ema20: technical.emaFast,
    ema50: technical.emaMedium,
    ema200: technical.emaSlow,
    rsi: technical.rsi,
    macd: technical.macd,
    macdSignal: technical.macdSignal,
    macdHistogram: technical.macdHistogram,
    momentum: technical.momentum,
    roc: technical.roc,
    annualizedVolatility: technical.annualizedVolatility,
    priceVsEma50: technical.priceVsEmaMedium,
    priceVsEma200: technical.priceVsEmaSlow,
  };
  const warnings = buildGoldIntelligenceWarnings({
    rsi: indicators.rsi,
    annualizedVolatility: indicators.annualizedVolatility,
    priceVsEma50: indicators.priceVsEma50,
    priceVsEma200: indicators.priceVsEma200,
    risk: input.intelligence.risk,
    signal: input.intelligence.signal,
    macro: input.macro,
  });
  const summary = buildGoldIntelligenceSummary(
    input.intelligence.state,
    input.intelligence.signal,
    input.intelligence.risk,
    input.macro,
  );

  return {
    price: input.intelligence.price,
    indicators,
    risk: input.intelligence.risk,
    signal: input.intelligence.signal,
    macro: input.macro,
    state: input.intelligence.state,
    confidence: input.intelligence.confidence,
    summary,
    warnings,
    regimeMemory: input.regimeMemory,
    engineResult: input.engineResult,
  };
}

function buildGoldEngineMacroV1(
  macro: GoldMacroScoreResult,
): EngineMacroV3<GoldMacroCompatibilityV1> {
  const canonical = macro.canonical;

  if (
    canonical.availability !== "available" &&
    canonical.availability !== "partial"
  ) {
    return {
      availability: "unavailable",
      reason: canonical.availability === "unavailable"
        ? canonical.reason
        : "Canonical Gold macro evidence is unavailable.",
    };
  }

  const data = {
    direction: macro.bias,
    score: canonical.data.score,
    strengthMagnitude: canonical.data.strengthMagnitude,
    strength: macro.strength,
    confidence: macro.confidence,
    coverage: canonical.data.coverage,
    dataQuality: { availability: "not-computed" as const },
    drivers: canonical.data.drivers.map((driver) =>
      driver.availability === "available"
        ? {
            id: driver.id,
            weight: driver.weight,
            available: true,
            score: driver.score,
            direction: driver.direction,
            observedAt: driver.observedAt,
            weightedContribution: driver.weightedContribution,
          }
        : {
            id: driver.id,
            weight: driver.weight,
            available: false,
            score: null,
            weightedContribution: null,
            reason: driver.reason,
          },
    ),
    reasons: macro.reasons,
    migrationDetails: { factors: macro.factors },
  };

  return canonical.availability === "available"
    ? { availability: "available", data }
    : { availability: "partial", data, missing: canonical.missing };
}
