import {
  calculateMarketState,
  type MarketStateInput,
} from "../../core/marketState";

/**
 * Chronoverse Capital
 * Universal Market State Regression
 *
 * Locks the historical Gold state semantics
 * before Gold is migrated to the universal
 * Market State Core.
 */

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function runCase(
  label: string,
  input: MarketStateInput,
  expectedState:
    | "opportunity"
    | "caution"
    | "risk",
  expectedConfidence: number,
): void {
  const result =
    calculateMarketState(
      input,
    );

  assertEqual(
    result.state,
    expectedState,
    `${label} state`,
  );

  assertEqual(
    result.confidence,
    expectedConfidence,
    `${label} confidence`,
  );
}

/*
 * 1. High risk always dominates.
 *
 * confidence:
 * 0.80 * 0.75 +
 * (1 - 0.80) * 0.25
 * = 0.65
 */
runCase(
  "high-risk override",
  {
    signal: {
      direction: "bullish",
      confidence: 0.8,
    },

    risk: {
      level: "high",
      score: 0.8,
    },

    macro: null,
  },
  "risk",
  0.65,
);

/*
 * 2. Bearish signal exactly at 0.55
 * must trigger the historical threshold.
 */
runCase(
  "bearish threshold",
  {
    signal: {
      direction: "bearish",
      confidence: 0.55,
    },

    risk: {
      level: "moderate",
      score: 0.4,
    },

    macro: null,
  },
  "risk",
  0.5625,
);

/*
 * 3. Bullish signal exactly at 0.55
 * with low risk is an opportunity.
 */
runCase(
  "bullish threshold",
  {
    signal: {
      direction: "bullish",
      confidence: 0.55,
    },

    risk: {
      level: "low",
      score: 0.2,
    },

    macro: null,
  },
  "opportunity",
  0.6125,
);

/*
 * 4. Bearish technical structure
 * contradicted by bullish macro exactly
 * at the 0.65 macro threshold.
 *
 * confidence:
 * 0.70 * 0.60 +
 * 0.60 * 0.20 +
 * (0.65 * 1.00) * 0.20
 * = 0.67
 */
runCase(
  "bearish with bullish macro contradiction",
  {
    signal: {
      direction: "bearish",
      confidence: 0.7,
    },

    risk: {
      level: "moderate",
      score: 0.4,
    },

    macro: {
      bias: "bullish",
      confidence: 0.65,
      coverage: 1,
    },
  },
  "caution",
  0.67,
);

/*
 * 5. Bullish technical structure
 * contradicted by bearish macro exactly
 * at the 0.65 macro threshold.
 */
runCase(
  "bullish with bearish macro contradiction",
  {
    signal: {
      direction: "bullish",
      confidence: 0.7,
    },

    risk: {
      level: "low",
      score: 0.2,
    },

    macro: {
      bias: "bearish",
      confidence: 0.65,
      coverage: 1,
    },
  },
  "caution",
  0.71,
);

/*
 * 6. Macro below 0.65 must not block
 * a clean bullish opportunity.
 */
runCase(
  "macro below contradiction threshold",
  {
    signal: {
      direction: "bullish",
      confidence: 0.7,
    },

    risk: {
      level: "low",
      score: 0.2,
    },

    macro: {
      bias: "bearish",
      confidence: 0.6499,
      coverage: 1,
    },
  },
  "opportunity",
  0.71,
);

/*
 * 7. Neutral/mixed structure defaults
 * to caution.
 */
runCase(
  "mixed default",
  {
    signal: {
      direction: "neutral",
      confidence: 0.5,
    },

    risk: {
      level: "moderate",
      score: 0.5,
    },

    macro: null,
  },
  "caution",
  0.5,
);

/*
 * 8. Macro coverage must reduce its
 * contribution to combined confidence.
 *
 * macroQuality = 0.80 * 0.50 = 0.40
 *
 * confidence:
 * 0.60 * 0.60 +
 * 0.70 * 0.20 +
 * 0.40 * 0.20
 * = 0.58
 */
runCase(
  "macro coverage weighting",
  {
    signal: {
      direction: "neutral",
      confidence: 0.6,
    },

    risk: {
      level: "moderate",
      score: 0.3,
    },

    macro: {
      bias: "neutral",
      confidence: 0.8,
      coverage: 0.5,
    },
  },
  "caution",
  0.58,
);

console.log("");
console.log(
  "========================================",
);
console.log(
  "PASS: Universal Market State regression",
);
console.log(
  "========================================",
);
console.log("");