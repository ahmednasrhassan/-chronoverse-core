import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  calculateRateDifferenceBp,
  calculateRateFeaturesV1,
  type RateFeatureConfigV1,
  type RateObservationV1,
} from "../../indicators/rateFeatures";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertClose(
  actual: number | null,
  expected: number,
  label: string,
  tolerance = 1e-10,
): void {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${label}: expected ${expected}, received ${String(actual)}`,
    );
  }
}

function assertThrows(operation: () => unknown, label: string): void {
  let threw = false;

  try {
    operation();
  } catch {
    threw = true;
  }

  assertEqual(threw, true, label);
}

function observations(values: readonly number[]): readonly RateObservationV1[] {
  return values.map((value, index) => Object.freeze({
    timestamp: 1_700_000_000 + index * 86_400,
    value,
  }));
}

function features(
  values: readonly number[],
  config: RateFeatureConfigV1 = {},
) {
  return calculateRateFeaturesV1(observations(values), {
    momentumHorizons: [1, 5, 10, 20],
    emaPeriods: [3],
    rsiPeriod: 2,
    macd: { fastPeriod: 2, slowPeriod: 3, signalPeriod: 2 },
    dailyBpVolatilityWindow: 3,
    ...config,
  });
}

function momentumAt(
  snapshot: ReturnType<typeof features>,
  horizon: number,
): number | null | undefined {
  return snapshot.momentum.find(
    (item) => item.horizonObservations === horizon,
  )?.momentumBp;
}

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => [key, ...collectKeys(item)]);
}

function main(): void {
  const bpCases = [
    [3.75, 3.74, 1, "positive-to-positive increase"],
    [3.74, 3.75, -1, "positive-to-positive decrease"],
    [-0.54, -0.55, 1, "negative-to-negative increase"],
    [-0.55, -0.54, -1, "negative-to-negative decrease"],
    [0.01, -0.01, 2, "negative-to-positive crossing zero"],
    [-0.01, 0.01, -2, "positive-to-negative crossing zero"],
    [0, 0, 0, "unchanged rate"],
  ] as const;

  for (const [current, prior, expected, label] of bpCases) {
    assertClose(calculateRateDifferenceBp(current, prior), expected, label);
  }

  const daily = features([3.75, 3.74]);
  assertEqual(daily.currentRate, 3.74, "current rate remains percentage points");
  assertClose(daily.dailyChangeBp, -1, "daily change uses basis points");
  assertEqual(features([3.75]).dailyChangeBp, null,
    "single observation has unavailable daily change");

  const linear = features(Array.from({ length: 21 }, (_, index) => index / 100));
  assertClose(momentumAt(linear, 5) ?? null, 5, "five-observation momentum");
  assertClose(momentumAt(linear, 10) ?? null, 10, "ten-observation momentum");
  assertEqual(momentumAt(features([1, 1.01]), 5), null,
    "insufficient momentum is unavailable");
  const defaults = calculateRateFeaturesV1(observations([1]));
  assertEqual(defaults.momentum.map((item) => item.horizonObservations).join(","),
    "1,5,10,20", "default momentum horizons are explicit");
  assertEqual(defaults.ema.map((item) => item.period).join(","), "20,50,200",
    "default EMA periods are explicit");

  const positiveEma = features([1, 2, 3, 4]).ema[0]!;
  const negativeEma = features([-4, -3, -2, -1]).ema[0]!;
  const crossZeroEma = features([-1, 0, 1, 2]).ema[0]!;
  assertClose(positiveEma.emaRate, 3, "EMA accepts positive levels");
  assertClose(negativeEma.emaRate, -2, "EMA accepts negative levels");
  assertClose(crossZeroEma.emaRate, 1, "EMA accepts zero crossing");
  assertClose(crossZeroEma.emaDistanceBp, 100,
    "EMA distance is absolute signed basis-point difference");

  assertClose(features([-3, -2, -1, 0]).rsi, 100,
    "Wilder RSI accepts negative levels");
  const crossZeroRsi = features([-1, 0, -0.5, 0.5]).rsi;
  if (crossZeroRsi === null || !Number.isFinite(crossZeroRsi)) {
    throw new Error("Wilder RSI must accept a zero-crossing series.");
  }
  assertEqual(features([-2, -1, 0, 1]).currentRate, 1,
    "no positive-price validation leaks into rates");

  const negativeMacd = features([-5, -4, -3, -2, -1]).macd;
  assertClose(negativeMacd.macdBp, 50, "MACD accepts negative rate levels");
  assertClose(negativeMacd.signalBp, 50, "MACD signal accepts negative levels");
  assertClose(negativeMacd.histogramBp, 0, "MACD histogram accepts negatives");
  const crossZeroMacd = features([-2, -1, 0, 1, 2]).macd;
  assertClose(crossZeroMacd.macdBp, 50, "MACD accepts zero crossing");
  const convertedMacd = features([1, 2, 4, 7, 11]).macd;
  assertClose(convertedMacd.macdBp, 140.74074074074065,
    "MACD level difference converted to bp");
  assertClose(convertedMacd.signalBp, 125.30864197530859,
    "MACD signal converted to bp");
  assertClose(convertedMacd.histogramBp, 15.432098765432057,
    "MACD histogram converted to bp");

  assertClose(features([2, 2, 2, 2]).dailyBpVolatility, 0,
    "constant rate has zero daily bp volatility");
  assertClose(features([1, 1.01, 1.03, 1.02]).dailyBpVolatility,
    Math.sqrt(7 / 3), "known daily bp changes use sample deviation");
  const negativeVolatility = features([-0.02, -0.01, 0, 0.01]);
  assertClose(negativeVolatility.dailyBpVolatility, 0,
    "negative and zero levels do not break volatility");
  assertEqual(features([1, 1.01, 1.02]).dailyBpVolatility, null,
    "insufficient volatility history is unavailable");

  assertThrows(() => features([1, Number.NaN]), "NaN input rejected");
  assertThrows(() => features([1, Number.POSITIVE_INFINITY]),
    "infinite input rejected");
  assertThrows(() => calculateRateFeaturesV1([]), "empty input rejected");
  assertThrows(() => calculateRateFeaturesV1([
    { timestamp: 2, value: 1 },
    { timestamp: 1, value: 2 },
  ]), "out-of-order observations rejected deterministically");
  assertThrows(() => calculateRateFeaturesV1([
    { timestamp: 1, value: 1 },
    { timestamp: 1, value: 1 },
  ]), "duplicate timestamps rejected deterministically");

  const outputSnapshot = features([-1, 0, 1, 2]);
  const output = JSON.stringify(outputSnapshot).toLowerCase();
  const outputKeys = collectKeys(outputSnapshot).map((key) => key.toLowerCase());
  assertEqual(outputKeys.some((key) => key.includes("roc")), false,
    "no percentage ROC field");
  assertEqual(outputKeys.some((key) =>
    key.includes("emadistance") && key.includes("percent")), false,
    "no percentage EMA-distance field");
  assertEqual(output.includes("bullish") || output.includes("bearish"), false,
    "no directional product vocabulary");

  const sourcePath = fileURLToPath(
    new URL("../../indicators/rateFeatures.ts", import.meta.url),
  );
  const source = readFileSync(sourcePath, "utf8").toLowerCase();
  assertEqual(source.includes("math.log"), false, "no logarithmic math used");
  assertEqual(source.includes("log return"), false, "no log-return math used");

  console.log("PASS: Rate-Specific Feature Foundation V1");
}

main();
