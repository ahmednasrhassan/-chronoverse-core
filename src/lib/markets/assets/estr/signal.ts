import type { RateFeatureSnapshotV1 } from "../../indicators/rateFeatures";

import { estrRateCalibrationProfileV1 } from "./profile";

export type EstrRateSignalDirectionV1 =
  | "rising-rate"
  | "falling-rate"
  | "range-bound";

export type EstrRateSignalStrengthV1 =
  | "range-bound"
  | "directional"
  | "strong";

export type EstrRateSignalRequiredFeatureV1 =
  | "ema20DistanceBp"
  | "ema50DistanceBp"
  | "ema200DistanceBp"
  | "rsi14"
  | "macdHistogramBp"
  | "momentum10Bp";

export interface EstrRateSignalComponentsV1 {
  /** Mean normalized signed distance across EMA20, EMA50, and EMA200. */
  readonly ema: number;
  readonly rsi14: number;
  readonly macdHistogramBp: number;
  readonly momentum10Bp: number;
}

export interface EstrRateSignalDataV1 {
  /** Signed rate-direction score in the inclusive range -1..1. */
  readonly score: number;
  readonly direction: EstrRateSignalDirectionV1;
  readonly strength: EstrRateSignalStrengthV1;
  readonly coverage: number;
  readonly components: EstrRateSignalComponentsV1;
}

export type EstrRateSignalResultV1 =
  | {
      readonly availability: "available";
      readonly data: EstrRateSignalDataV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
      readonly coverage: number;
      readonly requiredCoverage: number;
      readonly missing: readonly EstrRateSignalRequiredFeatureV1[];
    };

type RequiredSignalValues = Readonly<Record<
  EstrRateSignalRequiredFeatureV1,
  number | null
>>;

/**
 * Calculates the production V1 direction signal for an absolute rate product.
 * All distances and momentum inputs remain in basis points.
 */
export function calculateEstrRateSignalV1(
  features: RateFeatureSnapshotV1,
): EstrRateSignalResultV1 {
  const profile = estrRateCalibrationProfileV1.signal;
  const emaDistances = Object.fromEntries(
    profile.ema.map(({ period }) => [
      period,
      features.ema.find((feature) => feature.period === period)?.emaDistanceBp ?? null,
    ]),
  ) as Readonly<Record<20 | 50 | 200, number | null>>;
  const momentum10Bp = features.momentum.find(
    ({ horizonObservations }) =>
      horizonObservations ===
      estrRateCalibrationProfileV1.technical.momentumHorizonObservations,
  )?.momentumBp ?? null;
  const values: RequiredSignalValues = Object.freeze({
    ema20DistanceBp: emaDistances[20],
    ema50DistanceBp: emaDistances[50],
    ema200DistanceBp: emaDistances[200],
    rsi14: features.rsi,
    macdHistogramBp: features.macd.histogramBp,
    momentum10Bp,
  });
  const missing = requiredEntries(values)
    .filter(([, value]) => !isFiniteNumber(value))
    .map(([feature]) => feature);

  if (missing.length > 0) {
    return Object.freeze({
      availability: "unavailable",
      reason: "Full production rate-signal feature coverage is required.",
      coverage: calculateSignalCoverage(values),
      requiredCoverage: profile.confidence.requiredCoverage,
      missing: Object.freeze(missing),
    });
  }

  const complete = values as Readonly<Record<
    EstrRateSignalRequiredFeatureV1,
    number
  >>;
  const emaComponents = profile.ema.map((threshold) =>
    signedComponent(
      complete[`ema${threshold.period}DistanceBp`],
      threshold.neutralDistanceBp,
      threshold.strongDistanceBp,
    ));
  const components = Object.freeze({
    ema: emaComponents.reduce((sum, component) => sum + component, 0) /
      profile.ema.length,
    rsi14: signedComponent(
      complete.rsi14 - profile.rsi14.center,
      profile.rsi14.neutralStretch,
      profile.rsi14.strongStretch,
    ),
    macdHistogramBp: signedComponent(
      complete.macdHistogramBp,
      profile.macdHistogram.neutralBp,
      profile.macdHistogram.strongBp,
    ),
    momentum10Bp: signedComponent(
      complete.momentum10Bp,
      profile.momentum.neutralBp,
      profile.momentum.strongBp,
    ),
  });
  const score = clamp(
    components.ema * profile.weights.ema +
      components.rsi14 * profile.weights.rsi +
      components.macdHistogramBp * profile.weights.macd +
      components.momentum10Bp * profile.weights.momentum,
    -1,
    1,
  );
  const absoluteScore = Math.abs(score);
  const rangeBound = absoluteScore < profile.aggregate.neutralAbsoluteScore;
  const direction: EstrRateSignalDirectionV1 = rangeBound
    ? "range-bound"
    : score > 0
      ? "rising-rate"
      : "falling-rate";
  const strength: EstrRateSignalStrengthV1 = rangeBound
    ? "range-bound"
    : absoluteScore >= profile.aggregate.strongAbsoluteScore
      ? "strong"
      : "directional";

  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      score,
      direction,
      strength,
      coverage: profile.confidence.requiredCoverage,
      components,
    }),
  });
}

function calculateSignalCoverage(values: RequiredSignalValues): number {
  const { weights } = estrRateCalibrationProfileV1.signal;
  const emaFeatureWeight = weights.ema /
    estrRateCalibrationProfileV1.signal.ema.length;
  const featureWeights: Readonly<Record<EstrRateSignalRequiredFeatureV1, number>> = {
    ema20DistanceBp: emaFeatureWeight,
    ema50DistanceBp: emaFeatureWeight,
    ema200DistanceBp: emaFeatureWeight,
    rsi14: weights.rsi,
    macdHistogramBp: weights.macd,
    momentum10Bp: weights.momentum,
  };

  return clamp(requiredEntries(values).reduce(
    (coverage, [feature, value]) =>
      coverage + (isFiniteNumber(value) ? featureWeights[feature] : 0),
    0,
  ), 0, 1);
}

function requiredEntries(
  values: RequiredSignalValues,
): readonly (readonly [EstrRateSignalRequiredFeatureV1, number | null])[] {
  return Object.entries(values) as (
    readonly [EstrRateSignalRequiredFeatureV1, number | null]
  )[];
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function signedComponent(value: number, neutral: number, strong: number): number {
  const magnitude = Math.abs(value);

  if (magnitude <= neutral) {
    return 0;
  }

  return Math.sign(value) * Math.min(
    1,
    (magnitude - neutral) / (strong - neutral),
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
