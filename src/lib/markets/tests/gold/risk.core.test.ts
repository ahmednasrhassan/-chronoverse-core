import {
  calculateGoldRisk,
} from "../../assets/gold/risk";

import {
  goldProfile,
} from "../../assets/gold/profile";

import {
  calculateMarketRisk,
} from "../../core/riskEngine";

const scenarios = [
  {
    name: "balanced",
    input: {
      rsi: 50,
      roc: 1.5,
      annualizedVolatility: 18,
      macdHistogram: 2,
      priceVsEma50: 2,
      priceVsEma200: 5,
    },
  },
  {
    name: "moderate-risk",
    input: {
      rsi: 64,
      roc: 5,
      annualizedVolatility: 26,
      macdHistogram: 8,
      priceVsEma50: 5,
      priceVsEma200: 9,
    },
  },
  {
    name: "high-risk",
    input: {
      rsi: 76,
      roc: 9,
      annualizedVolatility: 40,
      macdHistogram: 25,
      priceVsEma50: 10,
      priceVsEma200: 18,
    },
  },
] as const;

for (const scenario of scenarios) {
  const oldResult =
    calculateGoldRisk(
      scenario.input,
    );

  const coreResult =
    calculateMarketRisk({
      profile: goldProfile,

      indicators: {
        rsi: scenario.input.rsi,
        roc: scenario.input.roc,

        annualizedVolatility:
          scenario.input
            .annualizedVolatility,

        macdHistogram:
          scenario.input
            .macdHistogram,

        priceVsEmaMedium:
          scenario.input
            .priceVsEma50,

        priceVsEmaSlow:
          scenario.input
            .priceVsEma200,
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

