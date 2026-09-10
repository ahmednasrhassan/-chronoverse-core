import {
  ESTR_RATE_CALIBRATION_PROFILE_VERSION_V1,
  estrRateCalibrationProfileV1,
} from "../../assets/estr/profile";
import { ESTR_FROZEN_CALIBRATION_V1 } from
  "../analysis/estrRateCalibration.study";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

const profile = estrRateCalibrationProfileV1;
const study = ESTR_FROZEN_CALIBRATION_V1;

assertEqual(profile.version, "estr-rate-calibration-profile-v1", "V1 version");
assertEqual(profile.version, ESTR_RATE_CALIBRATION_PROFILE_VERSION_V1,
  "exported V1 version identity");
assertEqual(profile.productId, "estr", "€STR product identity");
assertEqual(profile.calibration.productionCalibrated, true,
  "production-calibrated marker");
assertEqual(profile.calibration.evidenceStatus, "PASS_WITH_LIMITED_EVIDENCE",
  "accepted evidence status");
assertEqual(profile.calibration.methodologyVersion,
  "estr-rate-calibration-study-v1", "accepted methodology version");

assertDeepEqual(profile.signal, {
  weights: { ema: 0.35, rsi: 0.15, macd: 0.2, momentum: 0.3 },
  ema: [
    { period: 20, neutralDistanceBp: 0.15, strongDistanceBp: 4 },
    { period: 50, neutralDistanceBp: 0.3, strongDistanceBp: 19 },
    { period: 200, neutralDistanceBp: 0.9, strongDistanceBp: 86 },
  ],
  rsi14: { center: 50, neutralStretch: 3, strongStretch: 35 },
  macdHistogram: { neutralBp: 0.02, strongBp: 1.3 },
  momentum: { neutralBp: 0.2, strongBp: 1 },
  aggregate: { neutralAbsoluteScore: 0.2, strongAbsoluteScore: 0.6 },
  confidence: {
    requiredCoverage: 1,
    behavior: "exclude-before-full-causal-warmup",
  },
}, "exact frozen Signal constants");

assertDeepEqual(profile.risk, {
  weights: {
    dailyBpVolatility: 0.3,
    rsiStretch: 0.15,
    momentum: 0.2,
    macdHistogram: 0.1,
    ema50Distance: 0.15,
    ema200Distance: 0.1,
  },
  thresholds: {
    dailyBpVolatility: { moderate: 0.6, high: 5.6 },
    rsiStretch: { moderate: 6, high: 40 },
    momentumBp: { moderate: 0.5, high: 25 },
    macdHistogramBp: { moderate: 0.5, high: 2.1 },
    ema50DistanceBp: { moderate: 10, high: 36 },
    ema200DistanceBp: { moderate: 45, high: 127 },
  },
  severityMapping: { zero: 0, moderateThreshold: 0.5, highThreshold: 1 },
  aggregate: { moderateMinimum: 0.35, highMinimum: 0.65 },
}, "exact frozen Risk constants");

assertDeepEqual(profile.levelRegime, {
  lowUpperPercent: -0.55,
  highLowerPercent: 3.15,
}, "exact frozen level-regime constants");
assertDeepEqual(profile.volatilityRegime, {
  calmUpperBp: 0.4,
  stressedLowerBp: 5.6,
}, "exact frozen volatility-regime constants");
assertDeepEqual(profile.axis, {
  type: "rate-direction",
  positive: "rising-rate",
  negative: "falling-rate",
  neutral: "range-bound",
}, "rate-specific direction axis");

assertDeepEqual({
  momentumHorizon: profile.technical.momentumHorizonObservations,
  volatilityWindow: profile.technical.dailyBpVolatilityWindowObservations,
  signal: {
    weights: profile.signal.weights,
    ema: profile.signal.ema,
    rsi: profile.signal.rsi14,
    macdHistogram: profile.signal.macdHistogram,
    momentum: profile.signal.momentum,
    aggregate: profile.signal.aggregate,
    confidence: profile.signal.confidence,
  },
  risk: {
    weights: profile.risk.weights,
    thresholds: profile.risk.thresholds,
    severityMapping: {
      baseline: profile.risk.severityMapping.zero,
      moderateThreshold: profile.risk.severityMapping.moderateThreshold,
      high: profile.risk.severityMapping.highThreshold,
    },
    aggregate: profile.risk.aggregate,
  },
  levelRegime: {
    lowUpperRate: profile.levelRegime.lowUpperPercent,
    highLowerRate: profile.levelRegime.highLowerPercent,
  },
  volatilityRegime: profile.volatilityRegime,
}, {
  momentumHorizon: study.momentumHorizon,
  volatilityWindow: study.volatilityWindow,
  signal: study.signal,
  risk: study.risk,
  levelRegime: study.levelRegime,
  volatilityRegime: study.volatilityRegime,
}, "no calibration drift from accepted study constants");

const publicSemantics = JSON.stringify(profile).toLowerCase();
assertEqual(publicSemantics.includes("bullish"), false,
  "no bullish public semantics");
assertEqual(publicSemantics.includes("bearish"), false,
  "no bearish public semantics");

console.log("PASS: €STR Production Calibration Profile V1");
