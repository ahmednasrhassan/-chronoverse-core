import {
  calculateGoldMacroScore,
  GOLD_MACRO_WEIGHTS,
} from "../../assets/gold/macroScore";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > Number.EPSILON * 8) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const full = calculateGoldMacroScore({
  realYield10Y: { date: "2026-01-04", value: 1.5 },
  nominalYield10Y: { date: "2026-01-03", value: 4 },
  dollarIndexProxy: { date: "2026-01-02", value: 103 },
  inflationExpectation10Y: { date: "2026-01-01", value: 2.6 },
});

if (full.canonical.availability !== "available") {
  throw new Error(`full Gold canonical macro: received ${full.canonical.availability}`);
}

assertClose(full.canonical.data.score, 0.36, "Gold representative score");
assertClose(full.score, 0.36, "Gold legacy score compatibility");
assertClose(full.canonical.data.coverage, 1, "Gold full coverage");
assertEqual(
  full.canonical.data.drivers.map((driver) => driver.id).join(","),
  "inflation-expectations,nominal-yields,real-yields,usd",
  "Gold deterministic driver order",
);
assertEqual(
  full.canonical.data.drivers
    .map((driver) => driver.availability === "available" ? driver.observedAt : null)
    .join(","),
  "2026-01-01,2026-01-03,2026-01-04,2026-01-02",
  "Gold observedAt preservation",
);
assertEqual(GOLD_MACRO_WEIGHTS.realYields, 0.4, "Gold real-yield weight");
assertEqual(GOLD_MACRO_WEIGHTS.nominalYields, 0.1, "Gold nominal-yield weight");
assertEqual(GOLD_MACRO_WEIGHTS.usd, 0.3, "Gold USD weight");
assertEqual(GOLD_MACRO_WEIGHTS.inflationExpectations, 0.2, "Gold inflation weight");

const fullContribution = full.canonical.data.drivers.reduce(
  (sum, driver) =>
    sum + (driver.availability === "available" ? driver.weightedContribution : 0),
  0,
);
assertClose(
  fullContribution,
  full.canonical.data.coverage * full.canonical.data.score,
  "Gold contribution sum invariant",
);

const realYieldDriver = full.canonical.data.drivers.find(
  (driver) => driver.id === "real-yields",
);
assertClose(
  realYieldDriver?.availability === "available"
    ? realYieldDriver.weightedContribution
    : Number.NaN,
  0.1,
  "Gold real-yield weighted contribution",
);

const partial = calculateGoldMacroScore({
  realYield10Y: { date: "2026-01-04", value: 1.5 },
  nominalYield10Y: null,
  dollarIndexProxy: null,
  inflationExpectation10Y: null,
});

if (partial.canonical.availability !== "partial") {
  throw new Error(`partial Gold canonical macro: received ${partial.canonical.availability}`);
}

assertClose(partial.canonical.data.score, 0.25, "Gold partial score");
assertClose(partial.canonical.data.coverage, 0.4, "Gold partial coverage");
assertEqual(
  partial.canonical.missing.join(","),
  "inflation-expectations,nominal-yields,usd",
  "Gold deterministic missing order",
);

const unavailable = calculateGoldMacroScore({
  realYield10Y: null,
  nominalYield10Y: null,
  dollarIndexProxy: null,
  inflationExpectation10Y: null,
});
assertEqual(unavailable.canonical.availability, "unavailable", "Gold all missing");

console.log("PASS: Gold canonical macro integration");
