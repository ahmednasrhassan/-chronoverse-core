import type { RateFeatureSnapshotV1 } from "../../indicators/rateFeatures";

import {
  calculateEstrRateRiskV1,
  type EstrRateRiskLevelV1,
  type EstrRateRiskRequiredFeatureV1,
  type EstrRateRiskResultV1,
} from "./risk";
import {
  classifyEstrRateLevelRegimeV1,
  classifyEstrRateVolatilityRegimeV1,
  type EstrRateLevelRegimeV1,
  type EstrRateVolatilityRegimeV1,
} from "./regimes";
import {
  calculateEstrRateSignalV1,
  type EstrRateSignalDirectionV1,
  type EstrRateSignalRequiredFeatureV1,
  type EstrRateSignalResultV1,
  type EstrRateSignalStrengthV1,
} from "./signal";

export type EstrRateMarketStateMissingFieldV1 =
  | "currentRate"
  | "dailyBpVolatility"
  | `signal.${EstrRateSignalRequiredFeatureV1}`
  | `risk.${EstrRateRiskRequiredFeatureV1}`;

export interface EstrRateMarketStateDataV1 {
  /** Absolute rate level in percentage points. */
  readonly currentRatePercent: number;
  readonly direction: EstrRateSignalDirectionV1;
  readonly signalStrength: EstrRateSignalStrengthV1;
  /** Signed rate-direction evidence for a future thin engine adapter. */
  readonly signalScore: number;
  readonly riskLevel: EstrRateRiskLevelV1;
  /** Rate-market instability severity for a future thin engine adapter. */
  readonly riskScore: number;
  readonly levelRegime: EstrRateLevelRegimeV1;
  readonly volatilityRegime: EstrRateVolatilityRegimeV1;
}

export type EstrRateMarketStateResultV1 =
  | {
      readonly availability: "available";
      readonly data: EstrRateMarketStateDataV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
      readonly missing: readonly EstrRateMarketStateMissingFieldV1[];
    };

export interface EstrRateMarketStateComputationsV1 {
  /** Results must come from the same feature snapshot passed to the builder. */
  readonly signal: EstrRateSignalResultV1;
  readonly risk: EstrRateRiskResultV1;
}

/**
 * Builds the production V1 rate-market state from one prepared feature snapshot.
 * The dimensions remain independent; no composite state score is introduced.
 */
export function calculateEstrRateMarketStateV1(
  features: RateFeatureSnapshotV1,
  computations?: EstrRateMarketStateComputationsV1,
): EstrRateMarketStateResultV1 {
  const signal = computations?.signal ?? calculateEstrRateSignalV1(features);
  const risk = computations?.risk ?? calculateEstrRateRiskV1(features);
  const levelRegime = classifyEstrRateLevelRegimeV1(features.currentRate);
  const volatilityRegime = classifyEstrRateVolatilityRegimeV1(
    features.dailyBpVolatility,
  );
  const missing: EstrRateMarketStateMissingFieldV1[] = [];
  const reasons: string[] = [];

  if (levelRegime.availability === "unavailable") {
    missing.push("currentRate");
    reasons.push(levelRegime.reason);
  }

  if (volatilityRegime.availability === "unavailable") {
    missing.push("dailyBpVolatility");
    reasons.push(volatilityRegime.reason);
  }

  if (signal.availability === "unavailable") {
    missing.push(...signal.missing.map(
      (feature): `signal.${EstrRateSignalRequiredFeatureV1}` => `signal.${feature}`,
    ));
    reasons.push(signal.reason);
  }

  if (risk.availability === "unavailable") {
    missing.push(...risk.missing.map(
      (feature): `risk.${EstrRateRiskRequiredFeatureV1}` => `risk.${feature}`,
    ));
    reasons.push(risk.reason);
  }

  if (
    levelRegime.availability === "unavailable" ||
    volatilityRegime.availability === "unavailable" ||
    signal.availability === "unavailable" ||
    risk.availability === "unavailable"
  ) {
    return Object.freeze({
      availability: "unavailable",
      reason: Object.freeze([...new Set(reasons)]).join(" "),
      missing: Object.freeze([...new Set(missing)]),
    });
  }

  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      currentRatePercent: features.currentRate,
      direction: signal.data.direction,
      signalStrength: signal.data.strength,
      signalScore: signal.data.score,
      riskLevel: risk.data.level,
      riskScore: risk.data.score,
      levelRegime: levelRegime.regime,
      volatilityRegime: volatilityRegime.regime,
    }),
  });
}
