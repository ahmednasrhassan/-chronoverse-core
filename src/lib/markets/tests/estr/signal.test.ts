import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  calculateEstrRateSignalV1,
  type EstrRateSignalDataV1,
} from "../../assets/estr/signal";
import { estrRateCalibrationProfileV1 } from "../../assets/estr/profile";
import type { RateFeatureSnapshotV1 } from "../../indicators/rateFeatures";

interface SnapshotValues {
  readonly currentRate?: number;
  readonly ema20DistanceBp?: number | null;
  readonly ema50DistanceBp?: number | null;
  readonly ema200DistanceBp?: number | null;
  readonly rsi14?: number | null;
  readonly macdHistogramBp?: number | null;
  readonly momentum10Bp?: number | null;
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
      Object.freeze({
        period: 20,
        emaRate: 0,
        emaDistanceBp: values.ema20DistanceBp === undefined
          ? 0
          : values.ema20DistanceBp,
      }),
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
    dailyBpVolatility: 0,
  });
}

function available(input: RateFeatureSnapshotV1): EstrRateSignalDataV1 {
  const result = calculateEstrRateSignalV1(input);

  if (result.availability !== "available") {
    throw new Error(`Expected available Signal, missing ${result.missing.join(",")}.`);
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

function signedStudyComponent(value: number, neutral: number, strong: number) {
  const magnitude = Math.abs(value);
  if (magnitude <= neutral) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - neutral) / (strong - neutral));
}

function replayStudySignal(input: SnapshotValues): number {
  const profile = estrRateCalibrationProfileV1.signal;
  const emaValues = [
    input.ema20DistanceBp ?? 0,
    input.ema50DistanceBp ?? 0,
    input.ema200DistanceBp ?? 0,
  ];
  const ema = profile.ema.reduce((sum, threshold, index) =>
    sum + signedStudyComponent(
      emaValues[index]!,
      threshold.neutralDistanceBp,
      threshold.strongDistanceBp,
    ), 0) / profile.ema.length;
  const rsi = signedStudyComponent(
    (input.rsi14 ?? 50) - profile.rsi14.center,
    profile.rsi14.neutralStretch,
    profile.rsi14.strongStretch,
  );
  const macd = signedStudyComponent(
    input.macdHistogramBp ?? 0,
    profile.macdHistogram.neutralBp,
    profile.macdHistogram.strongBp,
  );
  const momentum = signedStudyComponent(
    input.momentum10Bp ?? 0,
    profile.momentum.neutralBp,
    profile.momentum.strongBp,
  );

  return Math.max(-1, Math.min(1,
    ema * profile.weights.ema +
      rsi * profile.weights.rsi +
      macd * profile.weights.macd +
      momentum * profile.weights.momentum,
  ));
}

const profile = estrRateCalibrationProfileV1.signal;
const positiveMidpoint = {
  ema20DistanceBp: (0.15 + 4) / 2,
  ema50DistanceBp: (0.3 + 19) / 2,
  ema200DistanceBp: (0.9 + 86) / 2,
  rsi14: 50 + (3 + 35) / 2,
  macdHistogramBp: (0.02 + 1.3) / 2,
  momentum10Bp: (0.2 + 1) / 2,
} as const;
const positive = available(snapshot(positiveMidpoint));
assertClose(positive.score, 0.5, "exact positive score");
assertEqual(positive.direction, "rising-rate", "positive rate direction");
assertEqual(positive.strength, "directional", "positive strength");

const negative = available(snapshot({
  ema20DistanceBp: -positiveMidpoint.ema20DistanceBp,
  ema50DistanceBp: -positiveMidpoint.ema50DistanceBp,
  ema200DistanceBp: -positiveMidpoint.ema200DistanceBp,
  rsi14: 50 - (3 + 35) / 2,
  macdHistogramBp: -positiveMidpoint.macdHistogramBp,
  momentum10Bp: -positiveMidpoint.momentum10Bp,
}));
assertClose(negative.score, -0.5, "exact negative score");
assertEqual(negative.direction, "falling-rate", "negative rate direction");
assertEqual(negative.strength, "directional", "negative strength");

const neutral = available(snapshot({
  ema20DistanceBp: profile.ema[0].neutralDistanceBp,
  ema50DistanceBp: -profile.ema[1].neutralDistanceBp,
  ema200DistanceBp: profile.ema[2].neutralDistanceBp,
  rsi14: profile.rsi14.center + profile.rsi14.neutralStretch,
  macdHistogramBp: -profile.macdHistogram.neutralBp,
  momentum10Bp: profile.momentum.neutralBp,
}));
assertEqual(neutral.score, 0, "neutral thresholds score zero");
assertEqual(neutral.direction, "range-bound", "neutral direction");
assertEqual(neutral.strength, "range-bound", "neutral strength");

const saturatedPositive = available(snapshot({
  ema20DistanceBp: 400,
  ema50DistanceBp: 400,
  ema200DistanceBp: 400,
  rsi14: 500,
  macdHistogramBp: 100,
  momentum10Bp: 100,
}));
assertEqual(saturatedPositive.score, 1, "positive saturation");
assertEqual(saturatedPositive.strength, "strong", "positive saturation strength");

const saturatedNegative = available(snapshot({
  ema20DistanceBp: -400,
  ema50DistanceBp: -400,
  ema200DistanceBp: -400,
  rsi14: -500,
  macdHistogramBp: -100,
  momentum10Bp: -100,
}));
assertEqual(saturatedNegative.score, -1, "negative saturation");
assertEqual(saturatedNegative.strength, "strong", "negative saturation strength");

const exactNeutralBoundary = available(snapshot({
  macdHistogramBp: profile.macdHistogram.strongBp,
}));
assertEqual(exactNeutralBoundary.score, profile.aggregate.neutralAbsoluteScore,
  "exact aggregate 0.20 score");
assertEqual(exactNeutralBoundary.direction, "rising-rate",
  "exact 0.20 is directional");
assertEqual(exactNeutralBoundary.strength, "directional",
  "exact 0.20 directional strength");

const belowNeutralBoundary = available(snapshot({
  macdHistogramBp: profile.macdHistogram.strongBp - 1e-9,
}));
assertEqual(belowNeutralBoundary.score < profile.aggregate.neutralAbsoluteScore,
  true, "just below aggregate 0.20");
assertEqual(belowNeutralBoundary.direction, "range-bound",
  "just below 0.20 direction");

const exactStrongBoundary = available(snapshot({
  ema20DistanceBp: profile.ema[0].strongDistanceBp,
  ema50DistanceBp: profile.ema[1].strongDistanceBp,
  ema200DistanceBp: profile.ema[2].strongDistanceBp,
  rsi14: profile.rsi14.center + profile.rsi14.strongStretch,
  macdHistogramBp: (profile.macdHistogram.neutralBp +
    profile.macdHistogram.strongBp) / 2,
}));
assertClose(exactStrongBoundary.score, profile.aggregate.strongAbsoluteScore,
  "exact aggregate 0.60 score");
assertEqual(exactStrongBoundary.strength, "strong", "exact 0.60 is strong");

const belowStrongBoundary = available(snapshot({
  ema20DistanceBp: profile.ema[0].strongDistanceBp,
  ema50DistanceBp: profile.ema[1].strongDistanceBp,
  ema200DistanceBp: profile.ema[2].strongDistanceBp,
  rsi14: profile.rsi14.center + profile.rsi14.strongStretch,
  macdHistogramBp: (profile.macdHistogram.neutralBp +
    profile.macdHistogram.strongBp) / 2 - 1e-9,
}));
assertEqual(belowStrongBoundary.score < profile.aggregate.strongAbsoluteScore,
  true, "just below aggregate 0.60");
assertEqual(belowStrongBoundary.strength, "directional",
  "just below 0.60 is directional");

for (const score of [saturatedNegative.score, negative.score, neutral.score,
  positive.score, saturatedPositive.score]) {
  assertEqual(score >= -1 && score <= 1, true, "Signal score remains bounded");
}

assertEqual(available(snapshot({ currentRate: -0.593 })).score, 0,
  "negative rate level accepted");
assertEqual(available(snapshot({ currentRate: 0 })).score, 0,
  "zero rate level accepted");
assertEqual(positive.coverage, profile.confidence.requiredCoverage,
  "exact required coverage consumed");
assertEqual(positive.coverage, 1, "full coverage is one");

const missingCases: readonly SnapshotValues[] = [
  { ema20DistanceBp: null },
  { ema50DistanceBp: null },
  { ema200DistanceBp: null },
  { rsi14: null },
  { macdHistogramBp: null },
  { momentum10Bp: null },
];
for (const missingInput of missingCases) {
  const result = calculateEstrRateSignalV1(snapshot(missingInput));
  assertEqual(result.availability, "unavailable", "missing feature blocks Signal");
  if (result.availability === "unavailable") {
    assertEqual(result.coverage < result.requiredCoverage, true,
      "missing feature cannot claim full coverage");
  }
}

const replayInput = {
  ema20DistanceBp: 1.73,
  ema50DistanceBp: -7.4,
  ema200DistanceBp: 22,
  rsi14: 61.2,
  macdHistogramBp: -0.41,
  momentum10Bp: 0.84,
} as const;
assertClose(available(snapshot(replayInput)).score, replayStudySignal(replayInput),
  "production math replays accepted study math");

assertEqual(
  JSON.stringify(calculateEstrRateSignalV1(snapshot(replayInput))),
  JSON.stringify(calculateEstrRateSignalV1(snapshot(replayInput))),
  "repeated Signal calls are deterministic",
);

const source = readFileSync(fileURLToPath(
  new URL("../../assets/estr/signal.ts", import.meta.url),
), "utf8").toLowerCase();
assertEqual(source.includes("math.log"), false, "no logarithmic math dependency");
assertEqual(source.includes("log-return"), false, "no log-return dependency");
assertEqual(source.includes("roc"), false, "no percentage ROC dependency");
assertEqual(source.includes("emadistancepercent"), false,
  "no percentage EMA-distance dependency");
assertEqual(source.includes("bullish"), false, "no bullish public semantics");
assertEqual(source.includes("bearish"), false, "no bearish public semantics");

console.log("PASS: €STR Production Rate Signal V1");
