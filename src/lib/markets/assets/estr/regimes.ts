import { estrRateCalibrationProfileV1 } from "./profile";

export type EstrRateLevelRegimeV1 = "low" | "middle" | "high";

export type EstrRateVolatilityRegimeV1 = "calm" | "elevated" | "stressed";

export type EstrRateLevelRegimeResultV1 =
  | {
      readonly availability: "available";
      readonly regime: EstrRateLevelRegimeV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
    };

export type EstrRateVolatilityRegimeResultV1 =
  | {
      readonly availability: "available";
      readonly regime: EstrRateVolatilityRegimeV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
    };

/** Classifies the absolute rate level in percentage points. */
export function classifyEstrRateLevelRegimeV1(
  currentRatePercent: number | null | undefined,
): EstrRateLevelRegimeResultV1 {
  if (!isFiniteNumber(currentRatePercent)) {
    return Object.freeze({
      availability: "unavailable",
      reason: "A finite current rate is required for the rate-level regime.",
    });
  }

  const thresholds = estrRateCalibrationProfileV1.levelRegime;
  const regime: EstrRateLevelRegimeV1 =
    currentRatePercent < thresholds.lowUpperPercent
      ? "low"
      : currentRatePercent >= thresholds.highLowerPercent
        ? "high"
        : "middle";

  return Object.freeze({ availability: "available", regime });
}

/** Classifies daily rate movement variability expressed in basis points. */
export function classifyEstrRateVolatilityRegimeV1(
  dailyBpVolatility: number | null | undefined,
): EstrRateVolatilityRegimeResultV1 {
  if (!isFiniteNumber(dailyBpVolatility) || dailyBpVolatility < 0) {
    return Object.freeze({
      availability: "unavailable",
      reason: "Finite non-negative daily bp volatility is required.",
    });
  }

  const thresholds = estrRateCalibrationProfileV1.volatilityRegime;
  const regime: EstrRateVolatilityRegimeV1 =
    dailyBpVolatility <= thresholds.calmUpperBp
      ? "calm"
      : dailyBpVolatility >= thresholds.stressedLowerBp
        ? "stressed"
        : "elevated";

  return Object.freeze({ availability: "available", regime });
}

function isFiniteNumber(
  value: number | null | undefined,
): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}
