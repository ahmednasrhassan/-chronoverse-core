import {
  calculateOilMacro,
} from "../../assets/oil/macro";

function assertEqual(
  label: string,
  actual: unknown,
  expected: unknown,
): void {
  const actualJson =
    JSON.stringify(actual);

  const expectedJson =
    JSON.stringify(expected);

  if (
    actualJson !==
    expectedJson
  ) {
    console.error(
      `FAIL: ${label}`,
    );

    console.error(
      "Actual:",
      actual,
    );

    console.error(
      "Expected:",
      expected,
    );

    process.exitCode = 1;

    throw new Error(
      `${label} failed.`,
    );
  }
}

console.log(
  "\nOIL MACRO TESTS\n",
);

/*
 * ======================================================
 * 1) NO DATA
 * ======================================================
 */

const noData =
  calculateOilMacro({
    inventoriesChangePct: null,
    productionChangePct: null,
    globalDemandChangePct: null,
    usdChangePct: null,
  });

console.log(
  "NO DATA",
  noData,
);

assertEqual(
  "no data score",
  noData.score,
  0,
);

assertEqual(
  "no data direction",
  noData.direction,
  "neutral",
);

assertEqual(
  "no data confidence",
  noData.confidence,
  0,
);

assertEqual(
  "no data coverage",
  noData.coverage,
  0,
);

/*
 * ======================================================
 * 2) STRONGLY BULLISH OIL MACRO
 *
 * Inventories falling
 * Production falling
 * Demand rising
 * USD weakening
 * ======================================================
 */

const bullish =
  calculateOilMacro({
    inventoriesChangePct: -4,
    productionChangePct: -2,
    globalDemandChangePct: 2,
    usdChangePct: -2,
  });

console.log(
  "\nBULLISH",
  bullish,
);

assertEqual(
  "bullish score",
  bullish.score,
  1,
);

assertEqual(
  "bullish direction",
  bullish.direction,
  "bullish",
);

assertEqual(
  "bullish confidence",
  bullish.confidence,
  1,
);

assertEqual(
  "bullish coverage",
  bullish.coverage,
  1,
);

/*
 * ======================================================
 * 3) STRONGLY BEARISH OIL MACRO
 *
 * Inventories rising
 * Production rising
 * Demand falling
 * USD strengthening
 * ======================================================
 */

const bearish =
  calculateOilMacro({
    inventoriesChangePct: 4,
    productionChangePct: 2,
    globalDemandChangePct: -2,
    usdChangePct: 2,
  });

console.log(
  "\nBEARISH",
  bearish,
);

assertEqual(
  "bearish score",
  bearish.score,
  -1,
);

assertEqual(
  "bearish direction",
  bearish.direction,
  "bearish",
);

assertEqual(
  "bearish confidence",
  bearish.confidence,
  1,
);

assertEqual(
  "bearish coverage",
  bearish.coverage,
  1,
);

/*
 * ======================================================
 * 4) NEUTRAL / STABLE
 * ======================================================
 */

const neutral =
  calculateOilMacro({
    inventoriesChangePct: 0,
    productionChangePct: 0,
    globalDemandChangePct: 0,
    usdChangePct: 0,
  });

console.log(
  "\nNEUTRAL",
  neutral,
);

assertEqual(
  "neutral score",
  neutral.score,
  0,
);

assertEqual(
  "neutral direction",
  neutral.direction,
  "neutral",
);

assertEqual(
  "neutral confidence",
  neutral.confidence,
  0.4,
);

assertEqual(
  "neutral coverage",
  neutral.coverage,
  1,
);

/*
 * ======================================================
 * 5) PARTIAL COVERAGE
 *
 * Only inventories are available.
 * Weight = 0.35
 * Strong inventory decline = +1
 *
 * score      = +1
 * coverage   = 0.35
 * confidence = 0.35 * (0.4 + 1 * 0.6)
 *            = 0.35
 * ======================================================
 */

const partial =
  calculateOilMacro({
    inventoriesChangePct: -4,
    productionChangePct: null,
    globalDemandChangePct: null,
    usdChangePct: null,
  });

console.log(
  "\nPARTIAL",
  partial,
);

assertEqual(
  "partial score",
  partial.score,
  1,
);

assertEqual(
  "partial direction",
  partial.direction,
  "bullish",
);

assertEqual(
  "partial confidence",
  partial.confidence,
  0.35,
);

assertEqual(
  "partial coverage",
  partial.coverage,
  0.35,
);

console.log(
  "\nPASS: Oil macro intelligence behaves as expected\n",
);