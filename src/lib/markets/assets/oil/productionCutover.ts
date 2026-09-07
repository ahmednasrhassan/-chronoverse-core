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
import type { OilIntelligenceResult } from "./intelligence";
import type { OilMacroResult } from "./macro";
import type { OilRegimeMemoryResult } from "./regimeMemory";

export type OilMacroCompatibilityV1 = Pick<OilMacroResult, "drivers">;

export type PreparedOilEvaluationOutputV1 =
  GenericAssetRuntimeOutputV1<OilMacroCompatibilityV1>;

export type OilCompatibilityEngineResultV1 = EngineResultV3<
  OilMacroCompatibilityV1,
  never,
  OilIntelligenceResult["state"],
  MarketRiskResult["level"]
>;

export type OilCompatibilityResultV1 = Omit<OilIntelligenceResult, "macro"> & {
  readonly macro: OilMacroResult;
  readonly regimeMemory: OilRegimeMemoryResult;
  readonly engineResult: OilCompatibilityEngineResultV1;
  readonly marketData: {
    readonly provider: string | null;
    readonly status: OilCompatibilityEngineResultV1["marketData"]["status"];
    readonly provenance?: OilCompatibilityEngineResultV1["marketData"]["provenance"];
    readonly window?: OilCompatibilityEngineResultV1["marketData"]["historicalWindow"];
  };
};

export interface MapOilCompatibilityInputV1 {
  readonly intelligence: GenericAssetRuntimeIntelligenceV1;
  readonly engineResult: OilCompatibilityEngineResultV1;
  readonly macro: OilMacroResult;
  readonly regimeMemory: OilRegimeMemoryResult;
}

/** Pure Oil Macro result to prepared canonical Macro evidence adapter. */
export function prepareOilMacroEvidenceV1(
  macro: OilMacroResult,
): Extract<
  PreparedMacroEvidenceV1<OilMacroCompatibilityV1>,
  { readonly applicability: "applicable" }
> {
  return Object.freeze({
    applicability: "applicable" as const,
    section: buildOilEngineMacroV1(macro),
  });
}

/** Bounded future cutover handoff; performs no acquisition or persistence. */
export function evaluatePreparedOilV1(
  evaluation: CanonicalMarketEvaluationV1,
  macro: OilMacroResult,
): PreparedOilEvaluationOutputV1 {
  return runGenericAssetRuntimeV1(
    prepareAssetEvaluationV1(
      evaluation,
      "oil",
      prepareOilMacroEvidenceV1(macro),
    ),
  );
}

/** Pure mapping from canonical Generic output to the existing Oil contract. */
export function mapOilCompatibilityV1(
  input: MapOilCompatibilityInputV1,
): OilCompatibilityResultV1 {
  if (
    input.engineResult.asset !== "oil" ||
    input.intelligence.profileId !== "oil"
  ) {
    throw new TypeError("Oil compatibility mapping requires the Oil asset.");
  }

  const marketData = input.engineResult.marketData;

  return {
    ...input.intelligence,
    macro: input.macro,
    regimeMemory: input.regimeMemory,
    engineResult: input.engineResult,
    marketData: {
      provider: marketData.provider,
      status: marketData.status,
      provenance: marketData.provenance,
      window: marketData.historicalWindow,
    },
  };
}

function buildOilEngineMacroV1(
  macro: OilMacroResult,
): EngineMacroV3<OilMacroCompatibilityV1> {
  const canonical = macro.canonical;

  if (
    canonical.availability !== "available" &&
    canonical.availability !== "partial"
  ) {
    return {
      availability: "unavailable",
      reason: canonical.availability === "unavailable"
        ? canonical.reason
        : "Canonical Oil macro evidence is unavailable.",
    };
  }

  const data = {
    direction: macro.direction,
    score: canonical.data.score,
    strengthMagnitude: canonical.data.strengthMagnitude,
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
    migrationDetails: { drivers: macro.drivers },
  };

  return canonical.availability === "available"
    ? { availability: "available", data }
    : { availability: "partial", data, missing: canonical.missing };
}
