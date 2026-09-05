import {
  calculateGoldIntelligence,
  type GoldIntelligenceResult,
} from "./intelligence";

import { goldProfile } from "./profile";

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
  MarketTechnicalSnapshot,
} from "../../core/intelligenceEngine";

import {
  getGoldMacroSnapshot,
} from "./macro";

import {
  calculateGoldMacroScore,
  type GoldMacroScoreResult,
} from "./macroScore";

import {
  createFredProvider,
} from "../../providers/fred/register";

import {
  calculateGoldRegimeMemory,
  createGoldRegimeSnapshot,
  type GoldRegimeMemoryResult,
} from "./regimeMemory";

import {
  appendGoldRegimeSnapshot,
  getLatestGoldRegimeSnapshot,
} from "./regimeHistory";

export type FullLiveGoldIntelligenceResult =
  GoldIntelligenceResult & {
    regimeMemory:
      GoldRegimeMemoryResult;
  };

type GoldRuntimeIntelligence =
  GoldIntelligenceResult & {
    technical:
      MarketTechnicalSnapshot;
  };

type GoldMacroCompatibility = Pick<
  GoldMacroScoreResult,
  "factors"
>;

const GOLD_HISTORY_RANGE = "5y";

/**
 * Chronoverse Capital
 * Full Live Gold Intelligence
 *
 * Real Gold Prices
 * +
 * Real FRED Macro Data
 * +
 * Technical Indicators
 * +
 * Risk Engine
 * +
 * Signal Engine
 * +
 * Regime Memory
 * =
 * Full Gold Intelligence
 *
 * Server-side only.
 */
export async function getFullLiveGoldIntelligence():
  Promise<FullLiveGoldIntelligenceResult> {
  /*
   * ------------------------------------------------------
   * PROVIDERS
   * ------------------------------------------------------
   */

  const fredProvider =
    createFredProvider();

  /*
   * ------------------------------------------------------
   * LIVE DATA
   *
   * Gold market history and macro data are independent,
   * so fetch them concurrently.
   * ------------------------------------------------------
   */

  const [
    marketData,
    macroSnapshot,
  ] = await Promise.all([
    getHistoricalMarketData(
      goldProfile.symbol,
      GOLD_HISTORY_RANGE,
      goldProfile.defaultInterval,
      {
        assetClass:
          goldProfile.assetClass,

        cacheMode:
          "caller-owned",
      },
    ),

    getGoldMacroSnapshot(
      fredProvider,
    ),
  ]);

  /*
   * ------------------------------------------------------
   * MACRO ENGINE
   * ------------------------------------------------------
   */

  const macro =
    calculateGoldMacroScore(
      macroSnapshot,
    );

  const runtime =
    await runEngineRuntimeV3({
      asset: "gold",
      symbol: goldProfile.symbol,
      historyLimit:
        goldProfile.historyLimit,
      minimumRequiredHistory: 1,
      macroApplicability:
        goldProfile.macro.enabled
          ? "applicable"
          : "not-applicable",
      insufficientHistoryMessage:
        () =>
          "[Chronoverse Gold] No live gold price history available.",
      marketData,
      macroInput: macro,
      calculateIntelligence:
        calculateGoldRuntimeIntelligence,
      buildMacro:
        buildGoldEngineMacro,
      createRegimeSnapshot:
        createGoldRegimeSnapshot,
      calculateRegimeMemory:
        calculateGoldRegimeMemory,
      getLatestRegimeSnapshot:
        getLatestGoldRegimeSnapshot,
      appendRegimeSnapshot:
        appendGoldRegimeSnapshot,
    });

  const regimeMemory =
    runtime.engineResult.regime.availability ===
    "available"
      ? runtime.engineResult.regime.memory
      : null;

  if (regimeMemory === null) {
    throw new Error(
      "[Chronoverse Gold] Regime memory was not computed.",
    );
  }

  const {
    technical: internalTechnical,
    ...intelligence
  } = runtime.intelligence;

  void internalTechnical;

  /*
   * ------------------------------------------------------
   * FULL INTELLIGENCE RESULT
   * ------------------------------------------------------
   */

  return {
    ...intelligence,

    regimeMemory,
  };
}

function calculateGoldRuntimeIntelligence(
  input: {
    readonly closes: readonly number[];
    readonly macro: GoldMacroScoreResult;
  },
): GoldRuntimeIntelligence {
  const intelligence =
    calculateGoldIntelligence(input);

  return {
    ...intelligence,
    technical:
      mapGoldTechnicalSnapshot(
        intelligence,
      ),
  };
}

function mapGoldTechnicalSnapshot(
  intelligence: GoldIntelligenceResult,
): MarketTechnicalSnapshot {
  const indicators =
    intelligence.indicators;

  return {
    price: intelligence.price,
    emaFast: indicators.ema20,
    emaMedium: indicators.ema50,
    emaSlow: indicators.ema200,
    rsi: indicators.rsi,
    macd: indicators.macd,
    macdSignal: indicators.macdSignal,
    macdHistogram:
      indicators.macdHistogram,
    momentum: indicators.momentum,
    roc: indicators.roc,
    annualizedVolatility:
      indicators.annualizedVolatility,
    priceVsEmaMedium:
      indicators.priceVsEma50,
    priceVsEmaSlow:
      indicators.priceVsEma200,
  };
}

function buildGoldEngineMacro(
  intelligence: GoldRuntimeIntelligence,
): EngineMacroV3<GoldMacroCompatibility> {
  const macro = intelligence.macro;

  if (macro === null) {
    return {
      availability: "unavailable",
      reason: "Gold macro input was not supplied.",
    };
  }

  const drivers = [
    ["real-yield-10y", macro.factors.realYield10Y],
    ["nominal-yield-10y", macro.factors.nominalYield10Y],
    ["dollar-index-proxy", macro.factors.dollarIndexProxy],
    ["inflation-expectation-10y", macro.factors.inflationExpectation10Y],
  ] as const;
  const missing = drivers
    .filter(([, value]) => value === null)
    .map(([id]) => id);
  const data = {
    direction: macro.bias,
    score: macro.score,
    strength: macro.strength,
    confidence: macro.confidence,
    coverage: macro.coverage,
    drivers: drivers.map(([id, value]) => ({
      id,
      available: value !== null,
      contribution: null,
    })),
    reasons: macro.reasons,
    migrationDetails: {
      factors: macro.factors,
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
