import {
  calculateMarketRisk,
  type MarketRiskLevel,
} from "../../core/riskEngine";

import {
  goldProfile,
} from "./profile";

export type GoldRiskLevel =
  MarketRiskLevel;

export type GoldRiskInput = {
  rsi: number | null;
  roc: number | null;
  annualizedVolatility: number | null;
  macdHistogram: number | null;
  priceVsEma50: number | null;
  priceVsEma200: number | null;
};

export type GoldRiskResult = {
  score: number;
  level: GoldRiskLevel;
  reasons: string[];
};

/**
 * Chronoverse Capital
 * Gold Risk Adapter
 *
 * Gold keeps its existing public contract,
 * while calculation is delegated to the
 * Universal Market Risk Engine.
 */
export function calculateGoldRisk(
  input: GoldRiskInput,
): GoldRiskResult {
  const result =
    calculateMarketRisk({
      profile:
        goldProfile,

      indicators: {
        rsi:
          input.rsi,

        roc:
          input.roc,

        annualizedVolatility:
          input.annualizedVolatility,

        macdHistogram:
          input.macdHistogram,

        priceVsEmaMedium:
          input.priceVsEma50,

        priceVsEmaSlow:
          input.priceVsEma200,
      },
    });

  return {
    score:
      result.score,

    level:
      result.level,

    reasons:
      result.reasons,
  };
}