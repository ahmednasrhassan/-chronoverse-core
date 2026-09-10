import { calculateEMA } from "./ema";
import { calculateMACD } from "./macd";
import { calculateRSI } from "./rsi";

const DEFAULT_MOMENTUM_HORIZONS = Object.freeze([1, 5, 10, 20]);
const DEFAULT_EMA_PERIODS = Object.freeze([20, 50, 200]);

export interface RateObservationV1 {
  readonly timestamp: number;
  /** Rate level in percentage points; for example, 3.750 means 3.750%. */
  readonly value: number;
}

export interface RateMacdConfigV1 {
  readonly fastPeriod?: number;
  readonly slowPeriod?: number;
  readonly signalPeriod?: number;
}

export interface RateFeatureConfigV1 {
  readonly momentumHorizons?: readonly number[];
  readonly emaPeriods?: readonly number[];
  readonly rsiPeriod?: number;
  readonly macd?: RateMacdConfigV1;
  /** Number of daily basis-point changes in the rolling sample. */
  readonly dailyBpVolatilityWindow?: number;
}

export interface RateMomentumFeatureV1 {
  readonly horizonObservations: number;
  readonly momentumBp: number | null;
}

export interface RateEmaFeatureV1 {
  readonly period: number;
  /** EMA level in percentage points. */
  readonly emaRate: number | null;
  readonly emaDistanceBp: number | null;
}

export interface RateMacdFeatureV1 {
  readonly macdBp: number | null;
  readonly signalBp: number | null;
  readonly histogramBp: number | null;
}

export interface RateFeatureSnapshotV1 {
  /** Current rate level in percentage points. */
  readonly currentRate: number;
  readonly dailyChangeBp: number | null;
  readonly momentum: readonly RateMomentumFeatureV1[];
  readonly ema: readonly RateEmaFeatureV1[];
  /** Wilder RSI; unitless and uninterpreted. */
  readonly rsi: number | null;
  readonly macd: RateMacdFeatureV1;
  /** Sample standard deviation of daily basis-point changes. */
  readonly dailyBpVolatility: number | null;
}

/** Converts an absolute rate-level difference from percentage points to bp. */
export function calculateRateDifferenceBp(
  currentRate: number,
  priorRate: number,
): number {
  if (!Number.isFinite(currentRate) || !Number.isFinite(priorRate)) {
    throw new TypeError("Rate difference inputs must be finite.");
  }

  return (currentRate - priorRate) * 100;
}

/**
 * Calculates provider-neutral rate features without interpreting their meaning.
 * Observations must be strictly chronological; no gaps are filled or inferred.
 */
export function calculateRateFeaturesV1(
  observations: readonly RateObservationV1[],
  config: RateFeatureConfigV1 = {},
): RateFeatureSnapshotV1 {
  if (observations.length === 0) {
    throw new TypeError("Rate features require at least one observation.");
  }

  validateObservations(observations);

  const momentumHorizons = normalizePositiveIntegerList(
    config.momentumHorizons ?? DEFAULT_MOMENTUM_HORIZONS,
    "Rate momentum horizon",
  );
  const emaPeriods = normalizePositiveIntegerList(
    config.emaPeriods ?? DEFAULT_EMA_PERIODS,
    "Rate EMA period",
  );
  const rsiPeriod = requirePositiveInteger(config.rsiPeriod ?? 14, "Rate RSI period");
  const volatilityWindow = requireIntegerGreaterThanOne(
    config.dailyBpVolatilityWindow ?? 20,
    "Rate volatility window",
  );
  const values = observations.map((observation) => observation.value);
  const latestIndex = values.length - 1;
  const currentRate = values[latestIndex]!;
  const dailyChangeBp = latestIndex === 0
    ? null
    : calculateRateDifferenceBp(currentRate, values[latestIndex - 1]!);
  const momentum = momentumHorizons.map((horizonObservations) =>
    Object.freeze({
      horizonObservations,
      momentumBp: latestIndex < horizonObservations
        ? null
        : calculateRateDifferenceBp(
          currentRate,
          values[latestIndex - horizonObservations]!,
        ),
    }));
  const ema = emaPeriods.map((period) => {
    const emaRate = calculateEMA(values, period)[latestIndex] ?? null;

    return Object.freeze({
      period,
      emaRate,
      emaDistanceBp: emaRate === null
        ? null
        : calculateRateDifferenceBp(currentRate, emaRate),
    });
  });
  const rsi = calculateRSI(values, rsiPeriod)[latestIndex] ?? null;
  const macdConfig = config.macd ?? {};
  const macdSeries = calculateMACD(
    values,
    macdConfig.fastPeriod ?? 12,
    macdConfig.slowPeriod ?? 26,
    macdConfig.signalPeriod ?? 9,
  );
  const dailyBpChanges = values.slice(1).map((value, index) =>
    calculateRateDifferenceBp(value, values[index]!));

  return Object.freeze({
    currentRate,
    dailyChangeBp,
    momentum: Object.freeze(momentum),
    ema: Object.freeze(ema),
    rsi,
    macd: Object.freeze({
      macdBp: toBasisPoints(macdSeries.macd[latestIndex]),
      signalBp: toBasisPoints(macdSeries.signal[latestIndex]),
      histogramBp: toBasisPoints(macdSeries.histogram[latestIndex]),
    }),
    dailyBpVolatility: calculateLatestSampleStandardDeviation(
      dailyBpChanges,
      volatilityWindow,
    ),
  });
}

function validateObservations(observations: readonly RateObservationV1[]): void {
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;

    if (!Number.isFinite(observation.timestamp) || !Number.isFinite(observation.value)) {
      throw new TypeError(`Rate observation at index ${index} must be finite.`);
    }

    if (index > 0 && observation.timestamp <= observations[index - 1]!.timestamp) {
      throw new TypeError("Rate observations must be strictly chronological.");
    }
  }
}

function normalizePositiveIntegerList(
  values: readonly number[],
  label: string,
): readonly number[] {
  const normalized = values.map((value) => requirePositiveInteger(value, label));

  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label}s must be unique.`);
  }

  return Object.freeze(normalized);
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }

  return value;
}

function requireIntegerGreaterThanOne(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 1) {
    throw new TypeError(`${label} must be an integer greater than one.`);
  }

  return value;
}

function toBasisPoints(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value * 100;
}

/** Uses the sample convention (n - 1 denominator), matching repository practice. */
function calculateLatestSampleStandardDeviation(
  values: readonly number[],
  window: number,
): number | null {
  if (values.length < window) {
    return null;
  }

  const sample = values.slice(-window);
  const mean = sample.reduce((sum, value) => sum + value, 0) / window;
  const squaredDeviations = sample.reduce((sum, value) => {
    const difference = value - mean;
    return sum + difference * difference;
  }, 0);

  return Math.sqrt(squaredDeviations / (window - 1));
}
