import {
  calculateGoldSignal,
} from "../../assets/gold/signal";

import {
  goldProfile,
} from "../../assets/gold/profile";

import {
  calculateMarketSignal,
} from "../../core/signalEngine";

const scenarios = [
  {
    name: "bullish",
    input: {
      price: 2200,

      ema20: 2150,
      ema50: 2100,
      ema200: 2000,

      rsi: 68,

      macd: 12,
      macdSignal: 8,
      macdHistogram: 4,

      roc: 5,

      riskScore: 0.2,
    },
  },

  {
    name: "neutral",
    input: {
      price: 2100,

      ema20: 2100,
      ema50: 2098,
      ema200: 2095,

      rsi: 50,

      macd: 0,
      macdSignal: 0,
      macdHistogram: 0,

      roc: 0,

      riskScore: 0.3,
    },
  },

  {
    name: "bearish",
    input: {
      price: 1900,

      ema20: 1950,
      ema50: 2000,
      ema200: 2100,

      rsi: 32,

      macd: -10,
      macdSignal: -6,
      macdHistogram: -4,

      roc: -5,

      riskScore: 0.4,
    },
  },
] as const;

for (const scenario of scenarios) {
  const oldResult =
    calculateGoldSignal(
      scenario.input,
    );

  const coreResult =
    calculateMarketSignal({
      profile:
        goldProfile,

      indicators: {
        price:
          scenario.input.price,

        emaFast:
          scenario.input.ema20,

        emaMedium:
          scenario.input.ema50,

        emaSlow:
          scenario.input.ema200,

        rsi:
          scenario.input.rsi,

        macd:
          scenario.input.macd,

        macdSignal:
          scenario.input.macdSignal,

        macdHistogram:
          scenario.input.macdHistogram,

        roc:
          scenario.input.roc,

        riskScore:
          scenario.input.riskScore,
      },
    });

  console.log(
    scenario.name,
    {
      old: oldResult,
      core: coreResult,
    },
  );
}
