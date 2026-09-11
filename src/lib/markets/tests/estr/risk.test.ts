import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  calculateEstrRateRiskV1,
  type EstrRateRiskComponentsV1,
  type EstrRateRiskDataV1,
} from "../../assets/estr/risk";
import { estrRateCalibrationProfileV1 } from "../../assets/estr/profile";
import type { RateFeatureSnapshotV1 } from "../../indicators/rateFeatures";

interface SnapshotValues {
  readonly currentRate?: number;
  readonly dailyBpVolatility?: number | null;
  readonly rsi14?: number | null;
  readonly momentum10Bp?: number | null;
  readonly macdHistogramBp?: number | null;
  readonly ema50DistanceBp?: number | null;
  readonly ema200DistanceBp?: number | null;
}

function snapshot(values: SnapshotValues = {}): RateFeatureSnapshotV1 {
  return Object.freeze({
    currentRate: values.currentRate ?? 3.75,
    dailyChangeBp: 0,
    momentum: Object.freeze([Object.freeze({
      horizonObservations: 10,
      momentumBp: values.momentum10Bp === undefined ? 0 : values.momentum10Bp,
    })]),
    ema: Object.freeze([
      Object.freeze({ period: 20, emaRate: 0, emaDistanceBp: 0 }),
      Object.freeze({
        period: 50,
        emaRate: 0,
        emaDistanceBp: values.ema50DistanceBp === undefined
          ? 0
          : values.ema50DistanceBp,
      }),
      Object.freeze({
        period: 200,
        emaRate: 0,
        emaDistanceBp: values.ema200DistanceBp === undefined
          ? 0
          : values.ema200DistanceBp,
      }),
    ]),
    rsi: values.rsi14 === undefined ? 50 : values.rsi14,
    macd: Object.freeze({
      macdBp: 0,
      signalBp: 0,
      histogramBp: values.macdHistogramBp === undefined
        ? 0
        : values.macdHistogramBp,
    }),
    dailyBpVolatility: values.dailyBpVolatility === undefined
      ? 0
      : values.dailyBpVolatility,
  });
}

function available(input: RateFeatureSnapshotV1): EstrRateRiskDataV1 {
  const result = calculateEstrRateRiskV1(input);

  if (result.availability !== "available") {
    throw new Error(`Expected available Risk, missing ${result.missing.join(",")}.`);
  }

  return result.data;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertClose(
  actual: number,
  expected: number,
  label: string,
  tolerance = 1e-12,
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function studySeverity(value: number, moderate: number, high: number): number {
  if (value <= moderate) return 0.5 * value / moderate;
  if (value >= high) return 1;
  return 0.5 + 0.5 * (value - moderate) / (high - moderate);
}

const profile = estrRateCalibrationProfileV1.risk;
const zero = available(snapshot());
assertEqual(zero.score, 0, "zero instability score");
assertEqual(zero.level, "low", "zero instability level");

type ComponentCase = readonly [
  keyof EstrRateRiskComponentsV1,
  keyof SnapshotValues,
  number,
  number,
];
const componentCases: readonly ComponentCase[] = [
  ["dailyBpVolatility", "dailyBpVolatility",
    profile.thresholds.dailyBpVolatility.moderate,
    profile.thresholds.dailyBpVolatility.high],
  ["rsiStretch", "rsi14",
    profile.thresholds.rsiStretch.moderate,
    profile.thresholds.rsiStretch.high],
  ["momentum10Bp", "momentum10Bp",
    profile.thresholds.momentumBp.moderate,
    profile.thresholds.momentumBp.high],
  ["macdHistogramBp", "macdHistogramBp",
    profile.thresholds.macdHistogramBp.moderate,
    profile.thresholds.macdHistogramBp.high],
  ["ema50DistanceBp", "ema50DistanceBp",
    profile.thresholds.ema50DistanceBp.moderate,
    profile.thresholds.ema50DistanceBp.high],
  ["ema200DistanceBp", "ema200DistanceBp",
    profile.thresholds.ema200DistanceBp.moderate,
    profile.thresholds.ema200DistanceBp.high],
];

function componentInput(
  inputKey: keyof SnapshotValues,
  magnitude: number,
): SnapshotValues {
  return inputKey === "rsi14"
    ? { rsi14: estrRateCalibrationProfileV1.signal.rsi14.center + magnitude }
    : { [inputKey]: magnitude };
}

for (const [component, inputKey, moderate, high] of componentCases) {
  assertEqual(
    available(snapshot(componentInput(inputKey, moderate))).components[component],
    profile.severityMapping.moderateThreshold,
    `${component} exact moderate severity`,
  );
  assertEqual(
    available(snapshot(componentInput(inputKey, high))).components[component],
    profile.severityMapping.highThreshold,
    `${component} exact high severity`,
  );
  assertEqual(
    available(snapshot(componentInput(inputKey, high * 10))).components[component],
    1,
    `${component} above-high saturation`,
  );
}

const exactModerateBoundary = available(snapshot({
  dailyBpVolatility: profile.thresholds.dailyBpVolatility.high,
  macdHistogramBp: profile.thresholds.macdHistogramBp.moderate,
}));
assertEqual(exactModerateBoundary.score, profile.aggregate.moderateMinimum,
  "exact aggregate 0.35 score");
assertEqual(exactModerateBoundary.level, "moderate",
  "exact 0.35 is moderate");

const belowModerateBoundary = available(snapshot({
  dailyBpVolatility: profile.thresholds.dailyBpVolatility.high,
  macdHistogramBp: profile.thresholds.macdHistogramBp.moderate - 1e-9,
}));
assertEqual(belowModerateBoundary.score < profile.aggregate.moderateMinimum,
  true, "just below aggregate 0.35");
assertEqual(belowModerateBoundary.level, "low", "just below 0.35 is low");

const exactHighBoundary = available(snapshot({
  dailyBpVolatility: profile.thresholds.dailyBpVolatility.high,
  momentum10Bp: profile.thresholds.momentumBp.high,
  ema50DistanceBp: profile.thresholds.ema50DistanceBp.high,
}));
assertEqual(exactHighBoundary.score, profile.aggregate.highMinimum,
  "exact aggregate 0.65 score");
assertEqual(exactHighBoundary.level, "high", "exact 0.65 is high");

const belowHighBoundary = available(snapshot({
  dailyBpVolatility: profile.thresholds.dailyBpVolatility.high,
  momentum10Bp: profile.thresholds.momentumBp.high,
  ema50DistanceBp: profile.thresholds.ema50DistanceBp.high - 1e-9,
}));
assertEqual(belowHighBoundary.score < profile.aggregate.highMinimum,
  true, "just below aggregate 0.65");
assertEqual(belowHighBoundary.level, "moderate",
  "just below 0.65 is moderate");

const fullySaturated = available(snapshot({
  dailyBpVolatility: 1_000,
  rsi14: 1_000,
  momentum10Bp: -1_000,
  macdHistogramBp: -1_000,
  ema50DistanceBp: 1_000,
  ema200DistanceBp: -1_000,
}));
assertClose(fullySaturated.score, 1, "aggregate Risk saturation");
for (const result of [zero, exactModerateBoundary, exactHighBoundary,
  fullySaturated]) {
  assertEqual(result.score >= 0 && result.score <= 1, true,
    "Risk score remains bounded");
}

assertEqual(available(snapshot({ currentRate: -0.593 })).score, 0,
  "negative rate level accepted");
assertEqual(available(snapshot({ currentRate: 0 })).score, 0,
  "zero rate level accepted");

const signedPositive = available(snapshot({
  momentum10Bp: 7,
  macdHistogramBp: 1,
  ema50DistanceBp: 20,
  ema200DistanceBp: 70,
}));
const signedNegative = available(snapshot({
  momentum10Bp: -7,
  macdHistogramBp: -1,
  ema50DistanceBp: -20,
  ema200DistanceBp: -70,
}));
assertEqual(JSON.stringify(signedNegative), JSON.stringify(signedPositive),
  "signed movement components use absolute magnitude");

const missingCases: readonly SnapshotValues[] = [
  { dailyBpVolatility: null },
  { rsi14: null },
  { momentum10Bp: null },
  { macdHistogramBp: null },
  { ema50DistanceBp: null },
  { ema200DistanceBp: null },
];
for (const missingInput of missingCases) {
  const result = calculateEstrRateRiskV1(snapshot(missingInput));
  assertEqual(result.availability, "unavailable", "missing feature blocks Risk");
  if (result.availability === "unavailable") {
    assertEqual(result.coverage < result.requiredCoverage, true,
      "missing Risk feature cannot claim full coverage");
  }
}

const replayInput = {
  dailyBpVolatility: 2.4,
  rsi14: 68,
  momentum10Bp: -11,
  macdHistogramBp: 1.7,
  ema50DistanceBp: -29,
  ema200DistanceBp: 93,
} as const;
const replay = available(snapshot(replayInput));
const expectedReplay =
  studySeverity(2.4, 0.6, 5.6) * profile.weights.dailyBpVolatility +
  studySeverity(18, 6, 40) * profile.weights.rsiStretch +
  studySeverity(11, 0.5, 25) * profile.weights.momentum +
  studySeverity(1.7, 0.5, 2.1) * profile.weights.macdHistogram +
  studySeverity(29, 10, 36) * profile.weights.ema50Distance +
  studySeverity(93, 45, 127) * profile.weights.ema200Distance;
assertClose(replay.score, expectedReplay,
  "production math replays accepted study math");
assertEqual(replay.coverage, 1, "complete Risk coverage is one");
assertEqual(
  JSON.stringify(calculateEstrRateRiskV1(snapshot(replayInput))),
  JSON.stringify(calculateEstrRateRiskV1(snapshot(replayInput))),
  "repeated Risk calls are deterministic",
);

const source = readFileSync(fileURLToPath(
  new URL("../../assets/estr/risk.ts", import.meta.url),
), "utf8").toLowerCase();
assertEqual(source.includes("math.log"), false, "no logarithmic math dependency");
assertEqual(source.includes("log-return"), false, "no log-return dependency");
assertEqual(source.includes("roc"), false, "no percentage ROC dependency");
assertEqual(source.includes("emadistancepercent"), false,
  "no percentage EMA-distance dependency");
assertEqual(source.includes("downside"), false, "no downside semantics");
assertEqual(source.includes("loss"), false, "no loss semantics");

console.log("PASS: €STR Production Rate Risk V1");
