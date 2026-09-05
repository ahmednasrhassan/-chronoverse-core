import type {
  AssetClass,
  CandleInterval,
} from "./types";

import type {
  MarketAssetId,
} from "./assets";

export type {
  MarketAssetId,
} from "./assets";

export type MacroDriverId =
  | "real-yields"
  | "nominal-yields"
  | "usd"
  | "inflation-expectations"
  | "inventories"
  | "production"
  | "global-demand"
  | "liquidity";

/*
 * ======================================================
 * TECHNICAL PROFILE
 * ======================================================
 */

export interface EmaProfile {
  fast: number;
  medium: number;
  slow: number;
}

export interface RsiProfile {
  period: number;

  oversold: number;
  neutralLow: number;
  neutralHigh: number;
  overbought: number;
}

export interface MacdProfile {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface MomentumProfile {
  period: number;
}

export interface VolatilityProfile {
  period: number;
  annualizationFactor: number;
}

export interface TechnicalProfile {
  ema: EmaProfile;

  rsi: RsiProfile;

  macd: MacdProfile;

  momentum: MomentumProfile;

  volatility: VolatilityProfile;
}

/*
 * ======================================================
 * SIGNAL PROFILE
 * ======================================================
 */

export interface SignalWeightProfile {
  ema: number;
  rsi: number;
  macd: number;
  roc: number;
}

export interface SignalEmaCalibrationProfile {
  /**
   * Relative tolerance used to decide whether
   * one value is meaningfully above/below another.
   */
  toleranceRatio: number;

  /**
   * Absolute minimum tolerance.
   */
  minimumTolerance: number;

  /**
   * Score multiplier when price is above/below
   * all primary averages but averages themselves
   * are not fully aligned.
   */
  allAveragesMultiplier: number;

  /**
   * Score multiplier when at least two
   * directional EMA votes agree.
   */
  moderateBiasMultiplier: number;
}

export interface SignalRsiCalibrationProfile {
  /**
   * Multiplier applied when RSI is already
   * inside an extreme overbought/oversold zone.
   */
  extremeMultiplier: number;
}

export interface SignalMacdCalibrationProfile {
  /**
   * Numerical equilibrium tolerance.
   */
  epsilon: number;

  /**
   * Score multiplier when MACD is merely
   * above/below zero without full confirmation.
   */
  zeroBiasMultiplier: number;
}

export interface SignalRocCalibrationProfile {
  strongThreshold: number;
  directionalThreshold: number;

  strongMultiplier: number;
  directionalMultiplier: number;
  mildMultiplier: number;
}

export interface SignalStrengthProfile {
  moderateThreshold: number;
  strongThreshold: number;
}

export interface SignalConfidenceProfile {
  /**
   * Minimum confidence contribution once
   * indicator coverage exists.
   */
  base: number;

  /**
   * Additional contribution from
   * directional agreement.
   */
  directional: number;

  /**
   * Maximum proportional confidence penalty
   * applied by riskScore.
   */
  riskPenalty: number;
}

export interface SignalCalibrationProfile {
  weights: SignalWeightProfile;

  ema: SignalEmaCalibrationProfile;

  rsi: SignalRsiCalibrationProfile;

  macd: SignalMacdCalibrationProfile;

  roc: SignalRocCalibrationProfile;

  strength: SignalStrengthProfile;

  confidence: SignalConfidenceProfile;
}

export interface SignalProfile {
  bullishThreshold: number;
  bearishThreshold: number;
  neutralThreshold: number;

  /**
   * Temporary optional field during migration.
   *
   * Once all existing assets are migrated,
   * this will become required.
   */
  calibration?: SignalCalibrationProfile;
}

/*
 * ======================================================
 * RISK PROFILE
 * ======================================================
 */

export interface RiskWeightProfile {
  volatility: number;
  rsi: number;
  roc: number;
  macd: number;
  emaMedium: number;
  emaSlow: number;
}

export interface RiskSeverityProfile {
  low: number;
  moderate: number;
  high: number;
}

export interface RiskVolatilityCalibrationProfile {
  moderateThreshold: number;
  highThreshold: number;

  severity: RiskSeverityProfile;
}

export interface RiskRsiCalibrationProfile {
  stretchedLow: number;
  stretchedHigh: number;

  severity: RiskSeverityProfile;
}

export interface RiskRocCalibrationProfile {
  moderateThreshold: number;
  highThreshold: number;

  severity: RiskSeverityProfile;
}

export interface RiskMacdCalibrationProfile {
  highThreshold: number;

  lowSeverity: number;
  highSeverity: number;
}

export interface RiskDistanceCalibrationProfile {
  moderateThreshold: number;
  highThreshold: number;

  severity: RiskSeverityProfile;
}

export interface RiskCalibrationProfile {
  weights: RiskWeightProfile;

  volatility:
    RiskVolatilityCalibrationProfile;

  rsi:
    RiskRsiCalibrationProfile;

  roc:
    RiskRocCalibrationProfile;

  macd:
    RiskMacdCalibrationProfile;

  emaMedium:
    RiskDistanceCalibrationProfile;

  emaSlow:
    RiskDistanceCalibrationProfile;
}

export interface RiskProfile {
  low: number;
  moderate: number;
  high: number;

  /**
   * Temporary optional field during migration.
   *
   * Once Gold and the remaining assets are
   * fully profile-driven, this becomes required.
   */
  calibration?: RiskCalibrationProfile;
}

/*
 * ======================================================
 * MACRO PROFILE
 * ======================================================
 */

export interface MacroProfile {
  enabled: boolean;

  drivers:
    readonly MacroDriverId[];
}

/*
 * ======================================================
 * REGIME MEMORY PROFILE
 * ======================================================
 */

export interface RegimeMemoryProfile {
  enabled: boolean;

  maxHistory: number;
}

/*
 * ======================================================
 * MARKET ASSET PROFILE
 * ======================================================
 */

export interface MarketAssetProfile {
  id:
    MarketAssetId;

  symbol:
    string;

  displayName:
    string;

  assetClass:
    AssetClass;

  defaultInterval:
    CandleInterval;

  historyLimit:
    number;

  technical:
    TechnicalProfile;

  signal:
    SignalProfile;

  risk:
    RiskProfile;

  macro:
    MacroProfile;

  regimeMemory:
    RegimeMemoryProfile;
}

/*
 * ======================================================
 * PROFILE FACTORY
 * ======================================================
 */

export function defineMarketAssetProfile(
  profile: MarketAssetProfile,
): MarketAssetProfile {
  return profile;
}
