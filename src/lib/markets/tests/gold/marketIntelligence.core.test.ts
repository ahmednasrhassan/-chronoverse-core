import {
  calculateGoldIntelligence,
} from "../../assets/gold/intelligence";

import {
  calculateMarketIntelligence,
} from "../../core/marketIntelligence";

import {
  goldProfile,
} from "../../assets/gold/profile";

/**
 * Chronoverse Capital
 * Gold → Universal Market Intelligence
 * Regression Lock
 *
 * Verifies that the new universal orchestrator
 * preserves the existing Gold intelligence
 * calculations across:
 *
 * Technical
 * Risk
 * Signal
 */

const closes = Array.from(
  {
    length: 260,
  },
  (_, index) => {
    const trend =
      1900 +
      index * 0.8;

    const cycle =
      Math.sin(
        index / 7,
      ) * 12;

    const shortCycle =
      Math.cos(
        index / 3,
      ) * 4;

    return (
      trend +
      cycle +
      shortCycle
    );
  },
);

const oldGold =
  calculateGoldIntelligence({
    closes,
  });

const core =
  calculateMarketIntelligence({
    profile:
      goldProfile,

    closes,
  });

console.log(
  "\n========================================",
);

console.log(
  "GOLD → UNIVERSAL INTELLIGENCE REGRESSION",
);

console.log(
  "========================================\n",
);

/*
 * ------------------------------------------------------
 * PRICE
 * ------------------------------------------------------
 */

assertEqual(
  "price",
  oldGold.price,
  core.price,
);

/*
 * ------------------------------------------------------
 * TECHNICAL
 * ------------------------------------------------------
 */

assertEqual(
  "indicators.ema20",
  oldGold.indicators.ema20,
  core.technical.emaFast,
);

assertEqual(
  "indicators.ema50",
  oldGold.indicators.ema50,
  core.technical.emaMedium,
);

assertEqual(
  "indicators.ema200",
  oldGold.indicators.ema200,
  core.technical.emaSlow,
);

assertEqual(
  "indicators.rsi",
  oldGold.indicators.rsi,
  core.technical.rsi,
);

assertEqual(
  "indicators.macd",
  oldGold.indicators.macd,
  core.technical.macd,
);

assertEqual(
  "indicators.macdSignal",
  oldGold.indicators.macdSignal,
  core.technical.macdSignal,
);

assertEqual(
  "indicators.macdHistogram",
  oldGold.indicators.macdHistogram,
  core.technical.macdHistogram,
);

assertEqual(
  "indicators.momentum",
  oldGold.indicators.momentum,
  core.technical.momentum,
);

assertEqual(
  "indicators.roc",
  oldGold.indicators.roc,
  core.technical.roc,
);

assertEqual(
  "indicators.annualizedVolatility",
  oldGold.indicators.annualizedVolatility,
  core.technical.annualizedVolatility,
);

assertEqual(
  "indicators.priceVsEma50",
  oldGold.indicators.priceVsEma50,
  core.technical.priceVsEmaMedium,
);

assertEqual(
  "indicators.priceVsEma200",
  oldGold.indicators.priceVsEma200,
  core.technical.priceVsEmaSlow,
);

/*
 * ------------------------------------------------------
 * RISK
 * ------------------------------------------------------
 */

assertEqual(
  "risk.score",
  oldGold.risk.score,
  core.risk.score,
);

assertEqual(
  "risk.level",
  oldGold.risk.level,
  core.risk.level,
);

/*
 * ------------------------------------------------------
 * SIGNAL
 * ------------------------------------------------------
 */

assertEqual(
  "signal.score",
  oldGold.signal.score,
  core.signal.score,
);

assertEqual(
  "signal.direction",
  oldGold.signal.direction,
  core.signal.direction,
);

assertEqual(
  "signal.strength",
  oldGold.signal.strength,
  core.signal.strength,
);

assertEqual(
  "signal.confidence",
  oldGold.signal.confidence,
  core.signal.confidence,
);

/*
 * ------------------------------------------------------
 * RESULTS
 * ------------------------------------------------------
 */

console.log(
  "\nOLD GOLD",
);

console.dir(
  {
    price:
      oldGold.price,

    indicators:
      oldGold.indicators,

    risk:
      oldGold.risk,

    signal:
      oldGold.signal,
  },
  {
    depth: null,
  },
);

console.log(
  "\nUNIVERSAL CORE",
);

console.dir(
  core,
  {
    depth: null,
  },
);

console.log(
  "\n========================================",
);

console.log(
  "PASS: Gold matches Universal Intelligence Core",
);

console.log(
  "========================================\n",
);

/*
 * ------------------------------------------------------
 * ASSERTION HELPERS
 * ------------------------------------------------------
 */

function assertEqual(
  label: string,
  oldValue: unknown,
  coreValue: unknown,
): void {
  if (
    typeof oldValue ===
      "number" &&
    typeof coreValue ===
      "number"
  ) {
    const difference =
      Math.abs(
        oldValue -
          coreValue,
      );

    if (
      difference >
      0.0000000001
    ) {
      throw new Error(
        [
          `Regression failure: ${label}`,
          `old=${oldValue}`,
          `core=${coreValue}`,
          `difference=${difference}`,
        ].join(
          " | ",
        ),
      );
    }

    return;
  }

  if (
    oldValue !==
    coreValue
  ) {
    throw new Error(
      [
        `Regression failure: ${label}`,
        `old=${String(
          oldValue,
        )}`,
        `core=${String(
          coreValue,
        )}`,
      ].join(
        " | ",
      ),
    );
  }
}
