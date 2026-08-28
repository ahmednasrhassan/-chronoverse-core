import type {
  MarketAssetProfile,
} from "./assetProfile";

import {
  calculateMarketTechnicalIntelligence,
  type MarketTechnicalSnapshot,
} from "./intelligenceEngine";

import {
  calculateMarketRisk,
  type MarketRiskResult,
} from "./riskEngine";

import {
  calculateMarketSignal,
  type MarketSignalResult,
} from "./signalEngine";

export type MarketIntelligenceInput = {
  profile: MarketAssetProfile;
  closes: readonly number[];
};

export type MarketIntelligenceResult = {
  profileId: MarketAssetProfile["id"];

  price: number | null;

  technical: MarketTechnicalSnapshot;

  risk: MarketRiskResult;

  signal: MarketSignalResult;
};

/**
 * Chronoverse Capital
 * Universal Market Intelligence Orchestrator
 *
 * Flow:
 *
 * normalized price history
 * → shared technical engine
 * → shared risk engine
 * → shared signal engine
 * → unified market intelligence
 *
 * Provider agnostic.
 * UI agnostic.
 * Asset behavior is controlled by MarketAssetProfile.
 */
export function calculateMarketIntelligence(
  input: MarketIntelligenceInput,
): MarketIntelligenceResult {
  const {
    profile,
    closes,
  } = input;

  /*
   * ------------------------------------------------------
   * TECHNICAL CORE
   * ------------------------------------------------------
   */

  const technical =
    calculateMarketTechnicalIntelligence({
      profile,
      closes,
    });

  /*
   * ------------------------------------------------------
   * EMPTY MARKET STATE
   * ------------------------------------------------------
   */

  if (
    technical.price === null
  ) {
    const risk =
      calculateMarketRisk({
        profile,

        indicators: {
          rsi: null,
          roc: null,
          annualizedVolatility: null,
          macdHistogram: null,
          priceVsEmaMedium: null,
          priceVsEmaSlow: null,
        },
      });

    const signal: MarketSignalResult = {
      score: 0,
      direction: "neutral",
      strength: "weak",
      confidence: 0,
      reasons: [
        "Insufficient indicator data for signal generation.",
      ],
    };

    return {
      profileId:
        profile.id,

      price:
        null,

      technical,

      risk,

      signal,
    };
  }

  /*
   * ------------------------------------------------------
   * RISK CORE
   * ------------------------------------------------------
   */

  const risk =
    calculateMarketRisk({
      profile,

      indicators: {
        rsi:
          technical.rsi,

        roc:
          technical.roc,

        annualizedVolatility:
          technical.annualizedVolatility,

        macdHistogram:
          technical.macdHistogram,

        priceVsEmaMedium:
          technical.priceVsEmaMedium,

        priceVsEmaSlow:
          technical.priceVsEmaSlow,
      },
    });

  /*
   * ------------------------------------------------------
   * SIGNAL CORE
   * ------------------------------------------------------
   */

  const signal =
    calculateMarketSignal({
      profile,

      indicators: {
        price:
          technical.price,

        emaFast:
          technical.emaFast,

        emaMedium:
          technical.emaMedium,

        emaSlow:
          technical.emaSlow,

        rsi:
          technical.rsi,

        macd:
          technical.macd,

        macdSignal:
          technical.macdSignal,

        macdHistogram:
          technical.macdHistogram,

        roc:
          technical.roc,

        riskScore:
          risk.score,
      },
    });

  /*
   * ------------------------------------------------------
   * UNIFIED RESULT
   * ------------------------------------------------------
   */

  return {
    profileId:
      profile.id,

    price:
      technical.price,

    technical,

    risk,

    signal,
  };
}