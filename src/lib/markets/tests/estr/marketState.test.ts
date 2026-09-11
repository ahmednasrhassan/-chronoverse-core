import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  calculateEstrRateMarketStateV1,
  type EstrRateMarketStateDataV1,
} from "../../assets/estr/marketState";
import { calculateEstrRateRiskV1 } from "../../assets/estr/risk";
import { calculateEstrRateSignalV1 } from "../../assets/estr/signal";
import type { RateFeatureSnapshotV1 } from "../../indicators/rateFeatures";

interface SnapshotValues {
  readonly currentRate?: number | null;
  readonly dailyBpVolatility?: number | null;
  readonly ema20DistanceBp?: number | null;
  readonly ema50DistanceBp?: number | null;
  readonly ema200DistanceBp?: number | null;
  readonly rsi14?: number | null;
  readonly macdHistogramBp?: number | null;
  readonly momentum10Bp?: number | null;
}

function snapshot(values: SnapshotValues = {}): RateFeatureSnapshotV1 {
  return {
    currentRate: (values.currentRate === undefined ? 0 : values.currentRate) as number,
    dailyChangeBp: 0,
    momentum: [{
      horizonObservations: 10,
      momentumBp: values.momentum10Bp === undefined ? 0 : values.momentum10Bp,
    }],
    ema: [
      {
        period: 20,
        emaRate: 0,
        emaDistanceBp: values.ema20DistanceBp === undefined
          ? 0
          : values.ema20DistanceBp,
      },
      {
        period: 50,
        emaRate: 0,
        emaDistanceBp: values.ema50DistanceBp === undefined
          ? 0
          : values.ema50DistanceBp,
      },
      {
        period: 200,
        emaRate: 0,
        emaDistanceBp: values.ema200DistanceBp === undefined
          ? 0
          : values.ema200DistanceBp,
      },
    ],
    rsi: values.rsi14 === undefined ? 50 : values.rsi14,
    macd: {
      macdBp: 0,
      signalBp: 0,
      histogramBp: values.macdHistogramBp === undefined
        ? 0
        : values.macdHistogramBp,
    },
    dailyBpVolatility: values.dailyBpVolatility === undefined
      ? 0
      : values.dailyBpVolatility,
  };
}

function available(features: RateFeatureSnapshotV1): EstrRateMarketStateDataV1 {
  const result = calculateEstrRateMarketStateV1(features);
  if (result.availability !== "available") {
    throw new Error(`Expected available Market State: ${result.reason}`);
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

function assertIncludes(
  values: readonly string[],
  expected: string,
  label: string,
): void {
  assertEqual(values.includes(expected), true, label);
}

const risingFeatures = snapshot({ currentRate: 4, macdHistogramBp: 1.3 });
const rising = available(risingFeatures);
assertEqual(rising.direction, "rising-rate", "available rising-rate state");
assertEqual(rising.signalStrength, "directional", "rising classification");
assertEqual(rising.levelRegime, "high", "high level propagation");
assertEqual(rising.volatilityRegime, "calm", "calm volatility propagation");
assertEqual(rising.riskLevel, "low", "low Risk propagation");

const falling = available(snapshot({
  currentRate: 4,
  macdHistogramBp: -1.3,
}));
assertEqual(falling.direction, "falling-rate", "available falling-rate state");
assertEqual(falling.signalScore, -rising.signalScore,
  "falling score retains sign");

const rangeBound = available(snapshot());
assertEqual(rangeBound.direction, "range-bound", "available range-bound state");
assertEqual(rangeBound.signalStrength, "range-bound",
  "range-bound classification");
assertEqual(rangeBound.levelRegime, "middle", "middle level propagation");
assertEqual(rangeBound.riskScore, 0, "zero Risk score propagation");

const lowLevel = available(snapshot({ currentRate: -1 }));
assertEqual(lowLevel.levelRegime, "low", "low level propagation");
assertEqual(lowLevel.currentRatePercent, -1, "negative rate accepted");
assertEqual(available(snapshot({ currentRate: 0 })).currentRatePercent, 0,
  "zero rate accepted");

const elevated = available(snapshot({ dailyBpVolatility: 1 }));
assertEqual(elevated.volatilityRegime, "elevated",
  "elevated volatility propagation");
const stressed = available(snapshot({ dailyBpVolatility: 5.6 }));
assertEqual(stressed.volatilityRegime, "stressed",
  "stressed volatility propagation");

const moderateRisk = available(snapshot({
  dailyBpVolatility: 5.6,
  macdHistogramBp: 0.5,
}));
assertEqual(moderateRisk.riskScore, 0.35, "exact moderate Risk score");
assertEqual(moderateRisk.riskLevel, "moderate", "moderate Risk propagation");

const highRiskFeatures = snapshot({
  currentRate: -1,
  dailyBpVolatility: 5.6,
  momentum10Bp: 25,
  ema50DistanceBp: 36,
});
const highRisk = available(highRiskFeatures);
assertEqual(highRisk.riskScore, 0.65, "exact high Risk score");
assertEqual(highRisk.riskLevel, "high", "high Risk propagation");
assertEqual(highRisk.levelRegime, "low", "low level remains independent");
assertEqual(highRisk.direction, "rising-rate", "direction remains independent");
assertEqual(highRisk.volatilityRegime, "stressed",
  "stressed volatility remains independent");

const middleIndependent = available(snapshot({
  currentRate: 0,
  dailyBpVolatility: 1,
  rsi14: 10,
  momentum10Bp: 25,
  macdHistogramBp: -2.1,
}));
assertEqual(middleIndependent.levelRegime, "middle", "independent middle level");
assertEqual(middleIndependent.direction, "range-bound",
  "independent range-bound direction");
assertEqual(middleIndependent.riskLevel, "moderate",
  "independent moderate Risk");
assertEqual(middleIndependent.volatilityRegime, "elevated",
  "independent elevated volatility");

const directSignal = calculateEstrRateSignalV1(risingFeatures);
const directRisk = calculateEstrRateRiskV1(risingFeatures);
if (directSignal.availability !== "available" || directRisk.availability !== "available") {
  throw new Error("Direct calculators must be available for propagation fixture.");
}
assertEqual(rising.signalScore, directSignal.data.score,
  "exact Signal score propagation");
assertEqual(rising.riskScore, directRisk.data.score,
  "exact Risk score propagation");

const missingSignal = calculateEstrRateMarketStateV1(snapshot({
  ema20DistanceBp: null,
}));
assertEqual(missingSignal.availability, "unavailable",
  "missing Signal dependency fails closed");
if (missingSignal.availability === "unavailable") {
  assertIncludes(missingSignal.missing, "signal.ema20DistanceBp",
    "missing Signal field reported");
}

const missingRisk = calculateEstrRateMarketStateV1(snapshot({
  dailyBpVolatility: null,
}));
assertEqual(missingRisk.availability, "unavailable",
  "missing Risk dependency fails closed");
if (missingRisk.availability === "unavailable") {
  assertIncludes(missingRisk.missing, "risk.dailyBpVolatility",
    "missing Risk field reported");
  assertIncludes(missingRisk.missing, "dailyBpVolatility",
    "missing volatility dimension reported");
}

const missingRate = calculateEstrRateMarketStateV1(snapshot({ currentRate: null }));
assertEqual(missingRate.availability, "unavailable",
  "missing current rate fails closed");
if (missingRate.availability === "unavailable") {
  assertIncludes(missingRate.missing, "currentRate", "missing rate reported");
}

const negativeVolatility = calculateEstrRateMarketStateV1(snapshot({
  dailyBpVolatility: -0.01,
}));
assertEqual(negativeVolatility.availability, "unavailable",
  "negative volatility fails closed");
if (negativeVolatility.availability === "unavailable") {
  assertIncludes(negativeVolatility.missing, "dailyBpVolatility",
    "invalid volatility dimension reported");
  assertIncludes(negativeVolatility.missing, "risk.dailyBpVolatility",
    "invalid Risk dependency reported");
}

assertEqual(
  JSON.stringify(calculateEstrRateMarketStateV1(risingFeatures)),
  JSON.stringify(calculateEstrRateMarketStateV1(risingFeatures)),
  "Market State is deterministic",
);

const publicOutput = JSON.stringify([
  calculateEstrRateMarketStateV1(risingFeatures),
  calculateEstrRateMarketStateV1(highRiskFeatures),
  missingSignal,
]).toLowerCase();
for (const forbidden of ["bullish", "bearish", "probability", "recommendation",
  "buy", "sell", "trade", "price"]) {
  assertEqual(publicOutput.includes(forbidden), false,
    `public output excludes ${forbidden}`);
}

const source = readFileSync(fileURLToPath(
  new URL("../../assets/estr/marketState.ts", import.meta.url),
), "utf8").toLowerCase();
for (const forbidden of ["calculateratefeaturesv1", "fetch(", "provider",
  "math.log", "roc", "bullish", "bearish"]) {
  assertEqual(source.includes(forbidden), false,
    `Market State source excludes ${forbidden}`);
}

console.log("PASS: €STR Rate Market State V1");
