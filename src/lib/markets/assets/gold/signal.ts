import {
  calculateMarketSignal,
  type MarketSignalDirection,
  type MarketSignalStrength,
} from "../../core/signalEngine";

import {
  goldProfile,
} from "./profile";

export type GoldSignalDirection =
  MarketSignalDirection;

export type GoldSignalStrength =
  MarketSignalStrength;

export type GoldSignalInput = {
  price: number;

  ema20: number | null;
  ema50: number | null;
  ema200: number | null;

  rsi: number | null;

  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;

  roc: number | null;

  riskScore?: number | null;
};

export type GoldSignalResult = {
  score: number;
  direction: GoldSignalDirection;
  strength: GoldSignalStrength;
  confidence: number;
  reasons: string[];
};

/**
 * Chronoverse Capital
 * Gold Signal Adapter
 *
 * Gold keeps its existing public contract,
 * while directional signal calculation is
 * delegated to the Universal Market Signal Engine.
 */
export function calculateGoldSignal(
  input: GoldSignalInput,
): GoldSignalResult {
  const result =
    calculateMarketSignal({
      profile:
        goldProfile,

      indicators: {
        price:
          input.price,

        emaFast:
          input.ema20,

        emaMedium:
          input.ema50,

        emaSlow:
          input.ema200,

        rsi:
          input.rsi,

        macd:
          input.macd,

        macdSignal:
          input.macdSignal,

        macdHistogram:
          input.macdHistogram,

        roc:
          input.roc,

        riskScore:
          input.riskScore,
      },
    });

  return {
    score:
      result.score,

    direction:
      result.direction,

    strength:
      result.strength,

    confidence:
      result.confidence,

    reasons:
      result.reasons,
  };
}