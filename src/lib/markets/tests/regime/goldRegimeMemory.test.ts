import {
  calculateGoldRegimeMemory,
  createGoldRegimeSnapshot,
} from "../../assets/gold/regimeMemory";

import {
  calculateMarketRegimeMemory,
  createMarketRegimeSnapshot,
} from "../../core/regimeMemory";

/**
 * Chronoverse Capital
 * Gold -> Universal Regime Memory
 * Regression Lock
 *
 * Verifies that the universal regime engine
 * preserves Gold behaviour before migration.
 */

const previousGold =
  createGoldRegimeSnapshot(
    {
      price: 2000,

      indicators: {
        ema20: 1980,
        ema50: 1950,
        ema200: 1850,
        rsi: 55,
        macd: 2,
        macdSignal: 1,
        macdHistogram: 1,
        momentum: 10,
        roc: 1.5,
        annualizedVolatility: 18,
        priceVsEma50: 2.5,
        priceVsEma200: 8,
      },

      risk: {
        score: 0.4,
        level: "moderate",
        reasons: [],
      },

      signal: {
        score: 0.4,
        direction: "neutral",
        strength: "moderate",
        confidence: 0.55,
        reasons: [],
      },

      macro: {
        score: 0,
        bias: "neutral",
        confidence: 0.5,
        coverage: 1,
       strength: "weak",
       factors: {
       realYield10Y: null,
      nominalYield10Y: null,
      dollarIndexProxy: null,
      inflationExpectation10Y: null,
},

reasons: [],
      },

      state: "caution",

      confidence: 0.55,

      summary: "",

      warnings: [],
    },
    "2026-09-01T10:00:00.000Z",
  );

const currentGold =
  createGoldRegimeSnapshot(
    {
      price: 2050,

      indicators: {
        ema20: 2020,
        ema50: 1980,
        ema200: 1880,
        rsi: 62,
        macd: 3,
        macdSignal: 1.5,
        macdHistogram: 1.5,
        momentum: 20,
        roc: 2.5,
        annualizedVolatility: 16,
        priceVsEma50: 3.5,
        priceVsEma200: 9,
      },

      risk: {
        score: 0.3,
        level: "low",
        reasons: [],
      },

      signal: {
        score: 0.8,
        direction: "bullish",
        strength: "strong",
        confidence: 0.7,
        reasons: [],
      },

          macro: {
          score: 0.5,
        bias: "bullish",
        strength: "moderate",
        confidence: 0.65,
        coverage: 1,

  factors: {
    realYield10Y: null,
    nominalYield10Y: null,
    dollarIndexProxy: null,
    inflationExpectation10Y: null,
  },

  reasons: [],
},

      state: "opportunity",

      confidence: 0.7,

      summary: "",

      warnings: [],
    },
    "2026-09-01T11:00:00.000Z",
  );

const oldResult =
  calculateGoldRegimeMemory(
    currentGold,
    previousGold,
  );

const previousCore =
  createMarketRegimeSnapshot({
    timestamp:
      previousGold.timestamp,

    state:
      previousGold.state,

    confidence:
      previousGold.confidence,

    signalDirection:
      previousGold.signalDirection,

    signalConfidence:
      previousGold.signalConfidence,

    macroBias:
      previousGold.macroBias,

    macroConfidence:
      previousGold.macroConfidence,

    riskLevel:
      previousGold.riskLevel,

    riskScore:
      previousGold.riskScore,
  });

const currentCore =
  createMarketRegimeSnapshot({
    timestamp:
      currentGold.timestamp,

    state:
      currentGold.state,

    confidence:
      currentGold.confidence,

    signalDirection:
      currentGold.signalDirection,

    signalConfidence:
      currentGold.signalConfidence,

    macroBias:
      currentGold.macroBias,

    macroConfidence:
      currentGold.macroConfidence,

    riskLevel:
      currentGold.riskLevel,

    riskScore:
      currentGold.riskScore,
  });

const coreResult =
  calculateMarketRegimeMemory(
    currentCore,
    previousCore,
    goldStateRank,
  );

console.log(
  "\n========================================",
);

console.log(
  "GOLD -> UNIVERSAL REGIME REGRESSION",
);

console.log(
  "========================================\n",
);

assertJsonEqual(
  "regime memory",
  oldResult,
  coreResult,
);

console.dir(
  coreResult,
  {
    depth: null,
  },
);

console.log(
  "\n========================================",
);

console.log(
  "PASS: Gold matches Universal Regime Memory",
);

console.log(
  "========================================\n",
);

function goldStateRank(
  state:
    | "opportunity"
    | "caution"
    | "risk",
): number {
  if (
    state === "opportunity"
  ) {
    return 2;
  }

  if (
    state === "caution"
  ) {
    return 1;
  }

  return 0;
}

function assertJsonEqual(
  label: string,
  oldValue: unknown,
  coreValue: unknown,
): void {
  const oldJson =
    JSON.stringify(
      oldValue,
    );

  const coreJson =
    JSON.stringify(
      coreValue,
    );

  if (
    oldJson !==
    coreJson
  ) {
    throw new Error(
      [
        `Regression failure: ${label}`,
        `old=${oldJson}`,
        `core=${coreJson}`,
      ].join(
        " | ",
      ),
    );
  }
}