import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  adaptEstrRateMarketStateToEngineV3,
  type EstrRateEngineV3AdapterDataV1,
} from "../../assets/estr/engineAdapter";
import { calculateEstrRateMarketStateV1 } from "../../assets/estr/marketState";
import { calculatePrimaryEvidenceAlgebraV3 } from "../../engine/evidenceAlgebra";
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

function adapt(values: SnapshotValues): EstrRateEngineV3AdapterDataV1 {
  const result = adaptEstrRateMarketStateToEngineV3({
    marketState: calculateEstrRateMarketStateV1(snapshot(values)),
  });
  if (result.availability !== "available") {
    throw new Error(`Expected available adapter result: ${result.reason}`);
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

const rising = adapt({ currentRate: 4, macdHistogramBp: 1.3 });
assertEqual(rising.rateMarketState.direction, "rising-rate",
  "public rising-rate label preserved");
assertEqual(rising.engineEvidence.signal.score,
  rising.rateMarketState.signalScore, "rising signed score passthrough");
const risingAlgebra = calculatePrimaryEvidenceAlgebraV3([
  rising.engineEvidence.signal,
]);
assertEqual(risingAlgebra.primarySignedBalance, rising.rateMarketState.signalScore,
  "Engine primary algebra receives rising score");
assertEqual(risingAlgebra.primaryConviction,
  Math.abs(rising.rateMarketState.signalScore), "signal-only rising conviction");

const falling = adapt({ currentRate: 4, macdHistogramBp: -1.3 });
assertEqual(falling.rateMarketState.direction, "falling-rate",
  "public falling-rate label preserved");
assertEqual(falling.engineEvidence.signal.score,
  falling.rateMarketState.signalScore, "falling signed score passthrough");
assertEqual(calculatePrimaryEvidenceAlgebraV3([
  falling.engineEvidence.signal,
]).primarySignedBalance, falling.rateMarketState.signalScore,
"Engine primary algebra receives falling score");

const neutral = adapt({});
assertEqual(neutral.rateMarketState.direction, "range-bound",
  "public neutral-rate label preserved");
assertEqual(neutral.rateMarketState.signalScore, 0, "zero Signal retained");
assertEqual(neutral.engineEvidence.signal.score, 0,
  "zero Signal remains neutral internally");

const subthreshold = adapt({ macdHistogramBp: 0.66 });
assertEqual(subthreshold.rateMarketState.direction, "range-bound",
  "subthreshold public Signal remains range-bound");
assertEqual(subthreshold.rateMarketState.signalScore > 0, true,
  "subthreshold diagnostic score is preserved publicly");
assertEqual(subthreshold.engineEvidence.signal.score, 0,
  "subthreshold range is neutralized for Engine direction");

assertEqual(rising.engineEvidence.risk.score, rising.rateMarketState.riskScore,
  "Risk numeric score passthrough");
assertEqual(rising.engineEvidence.risk.level, rising.rateMarketState.riskLevel,
  "Risk categorical passthrough");
assertEqual(
  rising.engineEvidence.risk.reasons[0],
  `Rate-market instability is classified as ${rising.rateMarketState.riskLevel}.`,
  "Risk meaning remains rate-market instability",
);

const lowLevel = adapt({ currentRate: -1, macdHistogramBp: 1.3 });
assertEqual(lowLevel.rateMarketState.levelRegime, "low", "low level retained");
assertEqual(lowLevel.engineEvidence.signal.score, rising.engineEvidence.signal.score,
  "rate level does not alter Engine Signal mapping");

const stressed = adapt({ dailyBpVolatility: 5.6 });
assertEqual(stressed.rateMarketState.volatilityRegime, "stressed",
  "stressed volatility retained publicly");
assertEqual(stressed.rateMarketState.riskLevel, "low",
  "volatility regime is not promoted into Risk level");
assertEqual(stressed.engineEvidence.risk.score,
  stressed.rateMarketState.riskScore, "volatility does not replace Risk score");

assertEqual(rising.engineEvidence.macro.availability, "not-applicable",
  "Macro launch lifecycle");
assertEqual("data" in rising.engineEvidence.macro, false,
  "Macro contains no fabricated evidence");
assertEqual(rising.engineEvidence.crossAsset.availability, "not-applicable",
  "Cross-Asset launch lifecycle");
assertEqual("data" in rising.engineEvidence.crossAsset, false,
  "Cross-Asset contains no fabricated evidence");
assertEqual(rising.engineEvidence.positioning.availability, "not-computed",
  "Positioning remains deferred");
assertEqual(rising.engineEvidence.dataQuality.availability, "not-computed",
  "data quality remains deferred");
assertEqual(rising.engineEvidence.signal.coverage, 1,
  "full causal Signal coverage is retained");

const negativeRate = adapt({ currentRate: -0.593 });
assertEqual(negativeRate.rateMarketState.currentRatePercent, -0.593,
  "negative current rate remains valid");
const zeroRate = adapt({ currentRate: 0 });
assertEqual(zeroRate.rateMarketState.currentRatePercent, 0,
  "zero current rate remains valid");

const unavailableMarketState = adaptEstrRateMarketStateToEngineV3({
  marketState: calculateEstrRateMarketStateV1(snapshot({ currentRate: null })),
});
assertEqual(unavailableMarketState.availability, "unavailable",
  "unavailable Market State fails closed");
if (unavailableMarketState.availability === "unavailable") {
  assertIncludes(unavailableMarketState.missing, "marketState",
    "Market State failure reported");
  assertIncludes(unavailableMarketState.missing, "currentRate",
    "Market State missing field propagated");
}

const unavailableSignal = adaptEstrRateMarketStateToEngineV3({
  marketState: calculateEstrRateMarketStateV1(snapshot({
    ema20DistanceBp: null,
  })),
});
assertEqual(unavailableSignal.availability, "unavailable",
  "unavailable Signal fails closed");
if (unavailableSignal.availability === "unavailable") {
  assertIncludes(unavailableSignal.missing, "signal.ema20DistanceBp",
    "Signal failure propagated");
}

const unavailableRisk = adaptEstrRateMarketStateToEngineV3({
  marketState: calculateEstrRateMarketStateV1(snapshot({
    dailyBpVolatility: null,
  })),
});
assertEqual(unavailableRisk.availability, "unavailable",
  "unavailable Risk fails closed");
if (unavailableRisk.availability === "unavailable") {
  assertIncludes(unavailableRisk.missing, "risk.dailyBpVolatility",
    "Risk failure propagated");
}

const inconsistentSignal = adaptEstrRateMarketStateToEngineV3({
  marketState: {
    availability: "available",
    data: { ...rising.rateMarketState, direction: "falling-rate" },
  },
});
assertEqual(inconsistentSignal.availability, "unavailable",
  "inconsistent Signal mapping fails closed");
if (inconsistentSignal.availability === "unavailable") {
  assertIncludes(inconsistentSignal.missing, "signalConsistency",
    "Signal consistency failure reported");
}

const inconsistentRisk = adaptEstrRateMarketStateToEngineV3({
  marketState: {
    availability: "available",
    data: { ...rising.rateMarketState, riskLevel: "high" },
  },
});
assertEqual(inconsistentRisk.availability, "unavailable",
  "inconsistent Risk mapping fails closed");
if (inconsistentRisk.availability === "unavailable") {
  assertIncludes(inconsistentRisk.missing, "riskConsistency",
    "Risk consistency failure reported");
}

const repeatedInput = {
  marketState: calculateEstrRateMarketStateV1(snapshot({
    currentRate: -0.25,
    dailyBpVolatility: 1,
    momentum10Bp: 25,
    macdHistogramBp: -2.1,
    rsi14: 10,
  })),
};
assertEqual(
  JSON.stringify(adaptEstrRateMarketStateToEngineV3(repeatedInput)),
  JSON.stringify(adaptEstrRateMarketStateToEngineV3(repeatedInput)),
  "adapter is deterministic",
);

const publicResult = JSON.stringify([
  rising,
  falling,
  neutral,
  lowLevel,
  stressed,
]).toLowerCase();
for (const forbidden of ["bullish", "bearish", "downside", "loss", "drawdown",
  "probability", "target", "execution", "price"]) {
  assertEqual(publicResult.includes(forbidden), false,
    `adapter result excludes ${forbidden}`);
}

const source = readFileSync(fileURLToPath(
  new URL("../../assets/estr/engineAdapter.ts", import.meta.url),
), "utf8").toLowerCase();
for (const forbidden of ["calculateratefeaturesv1", "fetch(", "provider",
  "cache", "runtime", "math.log", "roc", "emadistancepercent",
  "bullish", "bearish", "downside", "loss"]) {
  assertEqual(source.includes(forbidden), false,
    `adapter source excludes ${forbidden}`);
}

console.log("PASS: €STR Engine V3 Adapter V1");
