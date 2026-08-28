import type {
  MarketAssetProfile,
  RiskCalibrationProfile,
} from "./assetProfile";

export type MarketRiskLevel =
  | "low"
  | "moderate"
  | "high";

export type MarketRiskInput = {
  rsi: number | null;
  roc: number | null;
  annualizedVolatility: number | null;
  macdHistogram: number | null;
  priceVsEmaMedium: number | null;
  priceVsEmaSlow: number | null;
};

export type MarketRiskResult = {
  score: number;
  level: MarketRiskLevel;
  reasons: string[];
};

export type MarketRiskEngineInput = {
  profile: MarketAssetProfile;
  indicators: MarketRiskInput;
};

/**
 * Chronoverse Capital
 * Universal Market Risk Engine
 *
 * Shared analytical risk layer.
 *
 * Asset-specific:
 *
 * - weights
 * - thresholds
 * - severity calibration
 *
 * are supplied through MarketAssetProfile.
 *
 * Score range:
 *
 * 0 = minimal analytical risk
 * 1 = maximum analytical risk
 */
export function calculateMarketRisk(
  input: MarketRiskEngineInput,
): MarketRiskResult {
  const {
    profile,
    indicators,
  } = input;

  /*
   * During the migration phase calibration
   * remains optional in MarketAssetProfile.
   *
   * Existing behaviour is preserved through
   * the fallback calibration below.
   *
   * Once all supported assets have explicit
   * calibration profiles, the fallback can
   * be removed and calibration made required.
   */
  const calibration =
    profile.risk.calibration ??
    DEFAULT_RISK_CALIBRATION;

  let score = 0;
  let weight = 0;

  const reasons: string[] = [];

  /*
   * ======================================================
   * VOLATILITY
   * ======================================================
   */

  if (
    indicators.annualizedVolatility !==
    null
  ) {
    const factorWeight =
      calibration.weights.volatility;

    weight +=
      factorWeight;

    if (
      indicators.annualizedVolatility >=
      calibration.volatility.highThreshold
    ) {
      score +=
        factorWeight *
        calibration.volatility
          .severity.high;

      reasons.push(
        "Elevated realized volatility.",
      );
    } else if (
      indicators.annualizedVolatility >=
      calibration.volatility
        .moderateThreshold
    ) {
      score +=
        factorWeight *
        calibration.volatility
          .severity.moderate;

      reasons.push(
        "Moderate realized volatility.",
      );
    } else {
      score +=
        factorWeight *
        calibration.volatility
          .severity.low;

      reasons.push(
        "Contained realized volatility.",
      );
    }
  }

  /*
   * ======================================================
   * RSI
   * ======================================================
   */

  if (
    indicators.rsi !==
    null
  ) {
    const factorWeight =
      calibration.weights.rsi;

    weight +=
      factorWeight;

    /*
     * Extreme RSI boundaries remain part of
     * the technical asset profile because
     * they also define the oscillator itself.
     */
    if (
      indicators.rsi >=
        profile.technical.rsi
          .overbought ||
      indicators.rsi <=
        profile.technical.rsi
          .oversold
    ) {
      score +=
        factorWeight *
        calibration.rsi
          .severity.high;

      reasons.push(
        "RSI is in an extreme zone.",
      );
    } else if (
      indicators.rsi >
        calibration.rsi
          .stretchedHigh ||
      indicators.rsi <
        calibration.rsi
          .stretchedLow
    ) {
      score +=
        factorWeight *
        calibration.rsi
          .severity.moderate;

      reasons.push(
        "RSI momentum is stretched.",
      );
    } else {
      score +=
        factorWeight *
        calibration.rsi
          .severity.low;

      reasons.push(
        "RSI remains balanced.",
      );
    }
  }

  /*
   * ======================================================
   * MOMENTUM / ROC
   * ======================================================
   */

  if (
    indicators.roc !==
    null
  ) {
    const factorWeight =
      calibration.weights.roc;

    weight +=
      factorWeight;

    const absoluteRoc =
      Math.abs(
        indicators.roc,
      );

    if (
      absoluteRoc >=
      calibration.roc.highThreshold
    ) {
      score +=
        factorWeight *
        calibration.roc
          .severity.high;

      reasons.push(
        "Price momentum is unusually strong.",
      );
    } else if (
      absoluteRoc >=
      calibration.roc
        .moderateThreshold
    ) {
      score +=
        factorWeight *
        calibration.roc
          .severity.moderate;

      reasons.push(
        "Price momentum is elevated.",
      );
    } else {
      score +=
        factorWeight *
        calibration.roc
          .severity.low;

      reasons.push(
        "Price momentum is controlled.",
      );
    }
  }

  /*
   * ======================================================
   * MACD INSTABILITY
   * ======================================================
   */

  if (
    indicators.macdHistogram !==
    null
  ) {
    const factorWeight =
      calibration.weights.macd;

    weight +=
      factorWeight;

    if (
      Math.abs(
        indicators.macdHistogram,
      ) >=
      calibration.macd.highThreshold
    ) {
      score +=
        factorWeight *
        calibration.macd
          .highSeverity;

      reasons.push(
        "MACD spread is elevated.",
      );
    } else {
      score +=
        factorWeight *
        calibration.macd
          .lowSeverity;

      reasons.push(
        "MACD spread remains contained.",
      );
    }
  }

  /*
   * ======================================================
   * MEDIUM TREND EXTENSION
   * ======================================================
   */

  if (
    indicators.priceVsEmaMedium !==
    null
  ) {
    const factorWeight =
      calibration.weights.emaMedium;

    weight +=
      factorWeight;

    const distance =
      Math.abs(
        indicators.priceVsEmaMedium,
      );

    if (
      distance >=
      calibration.emaMedium
        .highThreshold
    ) {
      score +=
        factorWeight *
        calibration.emaMedium
          .severity.high;

      reasons.push(
        "Price is materially extended from the medium trend average.",
      );
    } else if (
      distance >=
      calibration.emaMedium
        .moderateThreshold
    ) {
      score +=
        factorWeight *
        calibration.emaMedium
          .severity.moderate;

      reasons.push(
        "Price is extended from the medium trend average.",
      );
    } else {
      score +=
        factorWeight *
        calibration.emaMedium
          .severity.low;

      reasons.push(
        "Price remains close to the medium trend average.",
      );
    }
  }

  /*
   * ======================================================
   * LONG-TERM TREND EXTENSION
   * ======================================================
   */

  if (
    indicators.priceVsEmaSlow !==
    null
  ) {
    const factorWeight =
      calibration.weights.emaSlow;

    weight +=
      factorWeight;

    const distance =
      Math.abs(
        indicators.priceVsEmaSlow,
      );

    if (
      distance >=
      calibration.emaSlow
        .highThreshold
    ) {
      score +=
        factorWeight *
        calibration.emaSlow
          .severity.high;

      reasons.push(
        "Price is materially extended from the long-term trend average.",
      );
    } else if (
      distance >=
      calibration.emaSlow
        .moderateThreshold
    ) {
      score +=
        factorWeight *
        calibration.emaSlow
          .severity.moderate;

      reasons.push(
        "Price is extended from the long-term trend average.",
      );
    } else {
      score +=
        factorWeight *
        calibration.emaSlow
          .severity.low;

      reasons.push(
        "Price remains structurally close to the long-term trend average.",
      );
    }
  }

  /*
   * ======================================================
   * NO AVAILABLE DATA
   * ======================================================
   */

  if (
    weight ===
      0
  ) {
    return {
      score: 0,

      level:
        "low",

      reasons: [
        "Insufficient data for full risk assessment.",
      ],
    };
  }

  /*
   * ======================================================
   * NORMALIZATION
   * ======================================================
   */

  const normalizedScore =
    Math.min(
      1,
      Math.max(
        0,
        score /
          weight,
      ),
    );

  /*
   * ======================================================
   * RISK LEVEL
   * ======================================================
   */

  let level:
    MarketRiskLevel =
      "low";

  if (
    normalizedScore >=
    profile.risk.high
  ) {
    level =
      "high";
  } else if (
    normalizedScore >=
    profile.risk.moderate
  ) {
    level =
      "moderate";
  }

  return {
    score:
      Number(
        normalizedScore.toFixed(
          4,
        ),
      ),

    level,

    reasons,
  };
}

/**
 * ========================================================
 * LEGACY-COMPATIBLE DEFAULT CALIBRATION
 * ========================================================
 *
 * Temporary migration fallback.
 *
 * These values reproduce the historical
 * Chronoverse Gold risk behaviour exactly.
 *
 * Once every supported asset supplies an
 * explicit RiskCalibrationProfile, this
 * fallback should be removed.
 */
const DEFAULT_RISK_CALIBRATION:
  RiskCalibrationProfile = {
    weights: {
      volatility:
        0.3,

      rsi:
        0.2,

      roc:
        0.15,

      macd:
        0.1,

      emaMedium:
        0.1,

      emaSlow:
        0.15,
    },

    volatility: {
      moderateThreshold:
        22,

      highThreshold:
        35,

      severity: {
        low:
          0.2,

        moderate:
          0.6,

        high:
          1,
      },
    },

    rsi: {
      stretchedLow:
        40,

      stretchedHigh:
        60,

      severity: {
        low:
          0.2,

        moderate:
          0.5,

        high:
          1,
      },
    },

    roc: {
      moderateThreshold:
        4,

      highThreshold:
        8,

      severity: {
        low:
          0.2,

        moderate:
          0.6,

        high:
          1,
      },
    },

    macd: {
      highThreshold:
        20,

      lowSeverity:
        0.3,

      highSeverity:
        1,
    },

    emaMedium: {
      moderateThreshold:
        4,

      highThreshold:
        8,

      severity: {
        low:
          0.2,

        moderate:
          0.6,

        high:
          1,
      },
    },

    emaSlow: {
      moderateThreshold:
        8,

      highThreshold:
        15,

      severity: {
        low:
          0.2,

        moderate:
          0.6,

        high:
          1,
      },
    },
  };