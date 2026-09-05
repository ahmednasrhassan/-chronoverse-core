import {
  getHistoricalMarketData,
} from "../../services/historicalMarketData";

import {
  runEngineRuntimeV3,
} from "../../engine/runtime";

import type {
  EngineMacroV3,
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

  const intelligence =
    runtime.intelligence;

  const regimeMemory =
    runtime.engineResult.regime.availability ===
    "available"
      ? runtime.engineResult.regime.memory
      : null;

  if (regimeMemory === null) {
    throw new Error(
      "[Chronoverse Oil] Regime memory was not computed.",
    );
  }

  return {
    ...intelligence,

    regimeMemory,

    marketData: {
      provider:
        runtime.engineResult.marketData.provider,

      status:
        runtime.engineResult.marketData.status,

      provenance:
        runtime.engineResult.marketData.provenance,

      window:
        runtime.engineResult.marketData.historicalWindow,
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

  const drivers = [
    ["inventories", macro.drivers.inventories],
    ["production", macro.drivers.production],
    ["global-demand", macro.drivers.globalDemand],
    ["usd", macro.drivers.usd],
  ] as const;
  const missing = drivers
    .filter(([, driver]) => !driver.available)
    .map(([id]) => id);
  const data = {
    direction: macro.direction,
    score: macro.score,
    confidence: macro.confidence,
    coverage: macro.coverage,
    drivers: drivers.map(([id, driver]) => ({
      id,
      available: driver.available,
      direction:
        driver.available
          ? driver.score > 0
            ? "bullish" as const
            : driver.score < 0
              ? "bearish" as const
              : "neutral" as const
          : undefined,
      contribution: driver.available
        ? driver.score
        : null,
      reason: driver.reason,
    })),
    reasons: macro.reasons,
    migrationDetails: {
      drivers: macro.drivers,
    },
  };

  return missing.length === 0
    ? {
        availability: "available",
        data,
      }
    : {
        availability: "partial",
        data,
        missing,
      };
}
