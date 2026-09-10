export const ESTR_RATE_CALIBRATION_PROFILE_VERSION_V1 =
  "estr-rate-calibration-profile-v1" as const;

export const estrRateCalibrationProfileV1 = {
  version: ESTR_RATE_CALIBRATION_PROFILE_VERSION_V1,
  productId: "estr",
  displayName: "€STR",
  axis: {
    type: "rate-direction",
    positive: "rising-rate",
    negative: "falling-rate",
    neutral: "range-bound",
  },
  calibration: {
    productionCalibrated: true,
    evidenceStatus: "PASS_WITH_LIMITED_EVIDENCE",
    methodologyVersion: "estr-rate-calibration-study-v1",
  },
  technical: {
    momentumHorizonObservations: 10,
    dailyBpVolatilityWindowObservations: 20,
  },
  signal: {
    weights: {
      ema: 0.35,
      rsi: 0.15,
      macd: 0.2,
      momentum: 0.3,
    },
    ema: [
      { period: 20, neutralDistanceBp: 0.15, strongDistanceBp: 4 },
      { period: 50, neutralDistanceBp: 0.3, strongDistanceBp: 19 },
      { period: 200, neutralDistanceBp: 0.9, strongDistanceBp: 86 },
    ],
    rsi14: {
      center: 50,
      neutralStretch: 3,
      strongStretch: 35,
    },
    macdHistogram: {
      neutralBp: 0.02,
      strongBp: 1.3,
    },
    momentum: {
      neutralBp: 0.2,
      strongBp: 1,
    },
    aggregate: {
      neutralAbsoluteScore: 0.2,
      strongAbsoluteScore: 0.6,
    },
    confidence: {
      requiredCoverage: 1,
      behavior: "exclude-before-full-causal-warmup",
    },
  },
  risk: {
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
    severityMapping: {
      zero: 0,
      moderateThreshold: 0.5,
      highThreshold: 1,
    },
    aggregate: {
      moderateMinimum: 0.35,
      highMinimum: 0.65,
    },
  },
  levelRegime: {
    lowUpperPercent: -0.55,
    highLowerPercent: 3.15,
  },
  volatilityRegime: {
    calmUpperBp: 0.4,
    stressedLowerBp: 5.6,
  },
} as const;

export type EstrRateCalibrationProfileV1 =
  typeof estrRateCalibrationProfileV1;
