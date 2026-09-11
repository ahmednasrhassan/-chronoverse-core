import type { RateFeatureSnapshotV1 } from "../../indicators/rateFeatures";

import { estrRateCalibrationProfileV1 } from "./profile";

export type EstrRateRiskLevelV1 = "low" | "moderate" | "high";

export type EstrRateRiskRequiredFeatureV1 =
  | "dailyBpVolatility"
  | "rsi14"
  | "momentum10Bp"
  | "macdHistogramBp"
  | "ema50DistanceBp"
  | "ema200DistanceBp";

export interface EstrRateRiskComponentsV1 {
  /** Normalized rate-market instability severity in the inclusive range 0..1. */
  readonly dailyBpVolatility: number;
  readonly rsiStretch: number;
  readonly momentum10Bp: number;
  readonly macdHistogramBp: number;
  readonly ema50DistanceBp: number;
  readonly ema200DistanceBp: number;
}

export interface EstrRateRiskDataV1 {
  /** Aggregate rate-market instability score in the inclusive range 0..1. */
  readonly score: number;
  readonly level: EstrRateRiskLevelV1;
  readonly coverage: number;
  readonly components: EstrRateRiskComponentsV1;
}

export type EstrRateRiskResultV1 =
  | {
      readonly availability: "available";
      readonly data: EstrRateRiskDataV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
      readonly coverage: number;
      readonly requiredCoverage: 1;
      readonly missing: readonly EstrRateRiskRequiredFeatureV1[];
    };

type RequiredRiskValues = Readonly<Record<
  EstrRateRiskRequiredFeatureV1,
  number | null
>>;

/** Calculates production V1 rate-market instability from basis-point features. */
export function calculateEstrRateRiskV1(
  features: RateFeatureSnapshotV1,
): EstrRateRiskResultV1 {
  const profile = estrRateCalibrationProfileV1.risk;
  const momentum10Bp = features.momentum.find(
    ({ horizonObservations }) =>
      horizonObservations ===
      estrRateCalibrationProfileV1.technical.momentumHorizonObservations,
  )?.momentumBp ?? null;
  const ema50DistanceBp = features.ema.find(
    ({ period }) => period === 50,
  )?.emaDistanceBp ?? null;
  const ema200DistanceBp = features.ema.find(
    ({ period }) => period === 200,
  )?.emaDistanceBp ?? null;
  const values: RequiredRiskValues = Object.freeze({
    dailyBpVolatility: features.dailyBpVolatility,
    rsi14: features.rsi,
    momentum10Bp,
    macdHistogramBp: features.macd.histogramBp,
    ema50DistanceBp,
    ema200DistanceBp,
  });
  const missing = requiredEntries(values)
    .filter(([feature, value]) =>
      !isFiniteNumber(value) || (feature === "dailyBpVolatility" && value < 0))
    .map(([feature]) => feature);

  if (missing.length > 0) {
    return Object.freeze({
      availability: "unavailable",
      reason: "Full production rate-risk feature coverage is required.",
      coverage: calculateRiskCoverage(values),
      requiredCoverage: 1,
      missing: Object.freeze(missing),
    });
  }

  const complete = values as Readonly<Record<EstrRateRiskRequiredFeatureV1, number>>;
  const { thresholds } = profile;
  const components = Object.freeze({
    dailyBpVolatility: severity(
      complete.dailyBpVolatility,
      thresholds.dailyBpVolatility.moderate,
      thresholds.dailyBpVolatility.high,
    ),
    rsiStretch: severity(
      Math.abs(complete.rsi14 - estrRateCalibrationProfileV1.signal.rsi14.center),
      thresholds.rsiStretch.moderate,
      thresholds.rsiStretch.high,
    ),
    momentum10Bp: severity(
      Math.abs(complete.momentum10Bp),
      thresholds.momentumBp.moderate,
      thresholds.momentumBp.high,
    ),
    macdHistogramBp: severity(
      Math.abs(complete.macdHistogramBp),
      thresholds.macdHistogramBp.moderate,
      thresholds.macdHistogramBp.high,
    ),
    ema50DistanceBp: severity(
      Math.abs(complete.ema50DistanceBp),
      thresholds.ema50DistanceBp.moderate,
      thresholds.ema50DistanceBp.high,
    ),
    ema200DistanceBp: severity(
      Math.abs(complete.ema200DistanceBp),
      thresholds.ema200DistanceBp.moderate,
      thresholds.ema200DistanceBp.high,
    ),
  });
  const score = clamp(
    components.dailyBpVolatility * profile.weights.dailyBpVolatility +
      components.rsiStretch * profile.weights.rsiStretch +
      components.momentum10Bp * profile.weights.momentum +
      components.macdHistogramBp * profile.weights.macdHistogram +
      components.ema50DistanceBp * profile.weights.ema50Distance +
      components.ema200DistanceBp * profile.weights.ema200Distance,
    0,
    1,
  );
  const level: EstrRateRiskLevelV1 = score >= profile.aggregate.highMinimum
    ? "high"
    : score >= profile.aggregate.moderateMinimum
      ? "moderate"
      : "low";

  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      score,
      level,
      coverage: 1,
      components,
    }),
  });
}

function calculateRiskCoverage(values: RequiredRiskValues): number {
  const weights = estrRateCalibrationProfileV1.risk.weights;
  const featureWeights: Readonly<Record<EstrRateRiskRequiredFeatureV1, number>> = {
    dailyBpVolatility: weights.dailyBpVolatility,
    rsi14: weights.rsiStretch,
    momentum10Bp: weights.momentum,
    macdHistogramBp: weights.macdHistogram,
    ema50DistanceBp: weights.ema50Distance,
    ema200DistanceBp: weights.ema200Distance,
  };

  return clamp(requiredEntries(values).reduce(
    (coverage, [feature, value]) =>
      coverage + (
        isFiniteNumber(value) &&
        (feature !== "dailyBpVolatility" || value >= 0)
          ? featureWeights[feature]
          : 0
      ),
    0,
  ), 0, 1);
}

function requiredEntries(
  values: RequiredRiskValues,
): readonly (readonly [EstrRateRiskRequiredFeatureV1, number | null])[] {
  return Object.entries(values) as (
    readonly [EstrRateRiskRequiredFeatureV1, number | null]
  )[];
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function severity(value: number, moderate: number, high: number): number {
  if (value <= moderate) {
    return 0.5 * value / moderate;
  }

  if (value >= high) {
    return 1;
  }

  return 0.5 + 0.5 * (value - moderate) / (high - moderate);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
