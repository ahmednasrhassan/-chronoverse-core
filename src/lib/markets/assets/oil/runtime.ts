import {
  getHistoricalMarketData,
} from "../../services/historicalMarketData";

import {
  runEngineRuntimeV3,
} from "../../engine/runtime";

import {
  integrateCanonicalDecisionLifecycleV3,
} from "../../engine/decisionLifecycleRuntime";

import {
  advanceCanonicalDecisionSnapshot,
} from "../../persistence/decisionSnapshotRedis";

import type {
  EngineMacroV3,
  EngineResultV3,
} from "../../engine/contracts";

import type {
  HistoricalDataWindow,
  MarketDataProvenance,
  MarketDataStatus,
} from "../../core/types";

import {
  calculateOilIntelligence,
  type OilIntelligenceResult,
} from "./intelligence";

import type {
  OilMacroResult,
} from "./macro";

import {
  calculateOilRegimeMemory,
  createOilRegimeSnapshot,
  type OilRegimeMemoryResult,
} from "./regimeMemory";

import {
  appendOilRegimeSnapshot,
  getLatestOilRegimeSnapshot,
} from "./regimeHistory";

import {
  getOilMacroInput,
} from "./macroData";

import {
  oilProfile,
} from "./profile";

const OIL_HISTORY_RANGE = "5y";

export type LiveOilIntelligenceResult =
  OilIntelligenceResult & {
    regimeMemory:
      OilRegimeMemoryResult;

    engineResult:
      EngineResultV3<
        OilMacroCompatibility,
        never,
        OilIntelligenceResult["state"],
        OilIntelligenceResult["risk"]["level"]
      >;

    marketData: {
      provider: string | null;
      status: MarketDataStatus;
      provenance?: MarketDataProvenance;
      window?: HistoricalDataWindow;
    };
  };

type OilMacroCompatibility = Pick<
  OilMacroResult,
  "drivers"
>;

/**
 * Chronoverse Capital
 * Live Oil Intelligence Runtime
 *
 * Combines:
 *
 * - normalized historical market data
 * - official EIA fundamentals
 * - Oil macro interpretation
 * - Universal Market Intelligence Core
 * - Universal Regime Memory
 * - persistent Oil regime history
 *
 * Historical market data and macro data are
 * independent, so they are resolved concurrently.
 *
 * Server-side only.
 */
export async function getLiveOilIntelligence():
  Promise<LiveOilIntelligenceResult> {
  const [
    marketData,
    macro,
  ] = await Promise.all([
    getHistoricalMarketData(
      oilProfile.symbol,
      OIL_HISTORY_RANGE,
      oilProfile.defaultInterval,
    ),

    getOilMacroInput(),
  ]);

  const minimumRequiredHistory =
    oilProfile.technical.ema.slow;

  const runtime =
    await runEngineRuntimeV3({
      asset: "oil",
      symbol: oilProfile.symbol,
      historyLimit: oilProfile.historyLimit,
      minimumRequiredHistory,
      macroApplicability:
        oilProfile.macro.enabled
          ? "applicable"
          : "not-applicable",
      insufficientHistoryMessage:
        (received, minimum) =>
          `[Chronoverse Oil] Insufficient price history: received ${received}, minimum required ${minimum}.`,
      marketData,
      macroInput: macro,
      calculateIntelligence:
        calculateOilIntelligence,
      buildMacro:
        buildOilEngineMacro,
      createRegimeSnapshot:
        createOilRegimeSnapshot,
      calculateRegimeMemory:
        calculateOilRegimeMemory,
      getLatestRegimeSnapshot:
        getLatestOilRegimeSnapshot,
      appendRegimeSnapshot:
        appendOilRegimeSnapshot,
    });

  const decisionIntegration =
    await integrateCanonicalDecisionLifecycleV3({
      assetId: runtime.engineResult.asset,
      computedAt: runtime.engineResult.evaluatedAt,
      currentDecision: runtime.engineResult.decision,
      advanceSnapshot:
        advanceCanonicalDecisionSnapshot,
    });
  const engineResult = {
    ...runtime.engineResult,
    ...decisionIntegration,
  };

  const intelligence =
    runtime.intelligence;

  const regimeMemory =
    engineResult.regime.availability ===
    "available"
      ? engineResult.regime.memory
      : null;

  if (regimeMemory === null) {
    throw new Error(
      "[Chronoverse Oil] Regime memory was not computed.",
    );
  }

  return {
    ...intelligence,

    regimeMemory,

    engineResult,

    marketData: {
      provider:
        engineResult.marketData.provider,

      status:
        engineResult.marketData.status,

      provenance:
        engineResult.marketData.provenance,

      window:
        engineResult.marketData.historicalWindow,
    },
  };
}

function buildOilEngineMacro(
  intelligence: OilIntelligenceResult,
): EngineMacroV3<OilMacroCompatibility> {
  const macro = intelligence.macro;

  if (macro === null) {
    return {
      availability: "unavailable",
      reason: "Oil macro input was not supplied.",
    };
  }

  const canonical = macro.canonical;

  if (
    canonical.availability !== "available" &&
    canonical.availability !== "partial"
  ) {
    return {
      availability: "unavailable",
      reason:
        canonical.availability === "unavailable"
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
    dataQuality: {
      availability: "not-computed" as const,
    },
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
    migrationDetails: {
      drivers: macro.drivers,
    },
  };

  return canonical.availability === "available"
    ? {
        availability: "available",
        data,
      }
    : {
        availability: "partial",
        data,
        missing: canonical.missing,
      };
}
