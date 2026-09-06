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
    engineResult:
      EngineResultV3<
        GoldMacroCompatibility,
        never,
        GoldIntelligenceResult["state"],
        GoldIntelligenceResult["risk"]["level"]
      >;
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

  const regimeMemory =
    engineResult.regime.availability ===
    "available"
      ? engineResult.regime.memory
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
    engineResult,
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
      factors: macro.factors,
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
