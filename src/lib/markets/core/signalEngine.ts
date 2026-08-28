import type {
  MarketAssetProfile,
  SignalCalibrationProfile,
} from "./assetProfile";

export type MarketSignalDirection =
  | "bullish"
  | "bearish"
  | "neutral";

export type MarketSignalStrength =
  | "weak"
  | "moderate"
  | "strong";

export type MarketSignalInput = {
  price: number;

  emaFast: number | null;
  emaMedium: number | null;
  emaSlow: number | null;

  rsi: number | null;

  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;

  roc: number | null;

  riskScore?: number | null;
};

export type MarketSignalResult = {
  score: number;
  direction: MarketSignalDirection;
  strength: MarketSignalStrength;
  confidence: number;
  reasons: string[];
};

export type MarketSignalEngineInput = {
  profile: MarketAssetProfile;
  indicators: MarketSignalInput;
};

/**
 * Chronoverse Capital
 * Universal Market Signal Engine
 *
 * Shared directional analytical layer.
 *
 * Asset-specific thresholds, weights,
 * tolerances and confidence parameters
 * are supplied through MarketAssetProfile.
 *
 * Score range:
 * -1 = strongly bearish
 *  0 = neutral
 * +1 = strongly bullish
 *
 * Risk affects confidence only.
 * Risk never reverses directional structure.
 */
export function calculateMarketSignal(
  input: MarketSignalEngineInput,
): MarketSignalResult {
  const {
    profile,
    indicators,
  } = input;

  if (
    !Number.isFinite(
      indicators.price,
    ) ||
    indicators.price <= 0
  ) {
    throw new Error(
      `${profile.displayName} signal requires a valid positive price.`,
    );
  }

  /*
   * Temporary fallback during migration.
   *
   * Existing assets without explicit signal
   * calibration continue to reproduce the
   * original Chronoverse signal behaviour.
   */
  const calibration =
    profile.signal.calibration ??
    DEFAULT_SIGNAL_CALIBRATION;

  let weightedScore = 0;
  let availableWeight = 0;

  const reasons: string[] = [];

  /*
   * ======================================================
   * EMA TREND STRUCTURE
   * ======================================================
   */

  if (
    indicators.emaFast !== null &&
    indicators.emaMedium !== null &&
    indicators.emaSlow !== null
  ) {
    const weight =
      calibration.weights.ema;

    availableWeight += weight;

    const fullyBullish =
      meaningfullyAbove(
        indicators.price,
        indicators.emaFast,
        calibration,
      ) &&
      meaningfullyAbove(
        indicators.emaFast,
        indicators.emaMedium,
        calibration,
      ) &&
      meaningfullyAbove(
        indicators.emaMedium,
        indicators.emaSlow,
        calibration,
      );

    const fullyBearish =
      meaningfullyBelow(
        indicators.price,
        indicators.emaFast,
        calibration,
      ) &&
      meaningfullyBelow(
        indicators.emaFast,
        indicators.emaMedium,
        calibration,
      ) &&
      meaningfullyBelow(
        indicators.emaMedium,
        indicators.emaSlow,
        calibration,
      );

    if (fullyBullish) {
      weightedScore += weight;

      reasons.push(
        "EMA structure confirms a fully aligned bullish trend.",
      );
    } else if (fullyBearish) {
      weightedScore -= weight;

      reasons.push(
        "EMA structure confirms a fully aligned bearish trend.",
      );
    } else {
      const bullishVotes = [
        meaningfullyAbove(
          indicators.price,
          indicators.emaFast,
          calibration,
        ),
        meaningfullyAbove(
          indicators.price,
          indicators.emaMedium,
          calibration,
        ),
        meaningfullyAbove(
          indicators.price,
          indicators.emaSlow,
          calibration,
        ),
      ].filter(Boolean).length;

      const bearishVotes = [
        meaningfullyBelow(
          indicators.price,
          indicators.emaFast,
          calibration,
        ),
        meaningfullyBelow(
          indicators.price,
          indicators.emaMedium,
          calibration,
        ),
        meaningfullyBelow(
          indicators.price,
          indicators.emaSlow,
          calibration,
        ),
      ].filter(Boolean).length;

      if (
        bullishVotes === 0 &&
        bearishVotes === 0
      ) {
        reasons.push(
          "Price is balanced around the primary trend averages.",
        );
      } else if (
        bullishVotes === 3
      ) {
        weightedScore +=
          weight *
          calibration.ema
            .allAveragesMultiplier;

        reasons.push(
          "Price trades above all primary trend averages.",
        );
      } else if (
        bearishVotes === 3
      ) {
        weightedScore -=
          weight *
          calibration.ema
            .allAveragesMultiplier;

        reasons.push(
          "Price trades below all primary trend averages.",
        );
      } else if (
        bullishVotes >= 2
      ) {
        weightedScore +=
          weight *
          calibration.ema
            .moderateBiasMultiplier;

        reasons.push(
          "EMA structure has a moderate bullish bias.",
        );
      } else if (
        bearishVotes >= 2
      ) {
        weightedScore -=
          weight *
          calibration.ema
            .moderateBiasMultiplier;

        reasons.push(
          "EMA structure has a moderate bearish bias.",
        );
      } else {
        reasons.push(
          "EMA structure is mixed and directionally neutral.",
        );
      }
    }
  }

  /*
   * ======================================================
   * RSI MOMENTUM
   * ======================================================
   */

  if (
    indicators.rsi !== null
  ) {
    const weight =
      calibration.weights.rsi;

    availableWeight += weight;

    if (
      indicators.rsi >=
      profile.technical.rsi.overbought
    ) {
      weightedScore +=
        weight *
        calibration.rsi
          .extremeMultiplier;

      reasons.push(
        "RSI confirms strong positive momentum, although conditions are extended.",
      );
    } else if (
      indicators.rsi >=
      profile.technical.rsi.neutralHigh
    ) {
      weightedScore += weight;

      reasons.push(
        "RSI confirms positive directional momentum.",
      );
    } else if (
      indicators.rsi >
      profile.technical.rsi.neutralLow
    ) {
      reasons.push(
        "RSI remains inside a neutral momentum zone.",
      );
    } else if (
      indicators.rsi >
      profile.technical.rsi.oversold
    ) {
      weightedScore -= weight;

      reasons.push(
        "RSI confirms negative directional momentum.",
      );
    } else {
      weightedScore -=
        weight *
        calibration.rsi
          .extremeMultiplier;

      reasons.push(
        "RSI confirms strong negative momentum, although conditions are extended.",
      );
    }
  }

  /*
   * ======================================================
   * MACD STRUCTURE
   * ======================================================
   */

  if (
    indicators.macd !== null &&
    indicators.macdSignal !== null &&
    indicators.macdHistogram !== null
  ) {
    const weight =
      calibration.weights.macd;

    const epsilon =
      calibration.macd.epsilon;

    availableWeight += weight;

    const macdPositive =
      indicators.macd >
      epsilon;

    const macdNegative =
      indicators.macd <
      -epsilon;

    const bullishCross =
      indicators.macd >
      indicators.macdSignal +
        epsilon;

    const bearishCross =
      indicators.macd <
      indicators.macdSignal -
        epsilon;

    const histogramPositive =
      indicators.macdHistogram >
      epsilon;

    const histogramNegative =
      indicators.macdHistogram <
      -epsilon;

    if (
      macdPositive &&
      bullishCross &&
      histogramPositive
    ) {
      weightedScore += weight;

      reasons.push(
        "MACD structure strongly confirms bullish momentum.",
      );
    } else if (
      macdNegative &&
      bearishCross &&
      histogramNegative
    ) {
      weightedScore -= weight;

      reasons.push(
        "MACD structure strongly confirms bearish momentum.",
      );
    } else if (
      macdPositive
    ) {
      weightedScore +=
        weight *
        calibration.macd
          .zeroBiasMultiplier;

      reasons.push(
        "MACD remains above zero and supports positive trend structure.",
      );
    } else if (
      macdNegative
    ) {
      weightedScore -=
        weight *
        calibration.macd
          .zeroBiasMultiplier;

      reasons.push(
        "MACD remains below zero and supports negative trend structure.",
      );
    } else {
      reasons.push(
        "MACD remains close to equilibrium.",
      );
    }
  }

  /*
   * ======================================================
   * RATE OF CHANGE
   * ======================================================
   */

  if (
    indicators.roc !== null
  ) {
    const weight =
      calibration.weights.roc;

    const {
      strongThreshold,
      directionalThreshold,
      strongMultiplier,
      directionalMultiplier,
      mildMultiplier,
    } = calibration.roc;

    availableWeight += weight;

    if (
      indicators.roc >=
      strongThreshold
    ) {
      weightedScore +=
        weight *
        strongMultiplier;

      reasons.push(
        "Rate of change confirms strong positive price momentum.",
      );
    } else if (
      indicators.roc >
      directionalThreshold
    ) {
      weightedScore +=
        weight *
        directionalMultiplier;

      reasons.push(
        "Rate of change confirms positive price momentum.",
      );
    } else if (
      indicators.roc > 0
    ) {
      weightedScore +=
        weight *
        mildMultiplier;

      reasons.push(
        "Rate of change is mildly positive.",
      );
    } else if (
      indicators.roc <=
      -strongThreshold
    ) {
      weightedScore -=
        weight *
        strongMultiplier;

      reasons.push(
        "Rate of change confirms strong negative price momentum.",
      );
    } else if (
      indicators.roc <
      -directionalThreshold
    ) {
      weightedScore -=
        weight *
        directionalMultiplier;

      reasons.push(
        "Rate of change confirms negative price momentum.",
      );
    } else if (
      indicators.roc < 0
    ) {
      weightedScore -=
        weight *
        mildMultiplier;

      reasons.push(
        "Rate of change is mildly negative.",
      );
    } else {
      reasons.push(
        "Rate of change is neutral.",
      );
    }
  }

  /*
   * ======================================================
   * NO DATA
   * ======================================================
   */

  if (
    availableWeight === 0
  ) {
    return {
      score: 0,
      direction: "neutral",
      strength: "weak",
      confidence: 0,
      reasons: [
        "Insufficient indicator data for signal generation.",
      ],
    };
  }

  /*
   * ======================================================
   * SCORE NORMALIZATION
   * ======================================================
   */

  let normalizedScore =
    clamp(
      weightedScore /
        availableWeight,
      -1,
      1,
    );

  if (
    Math.abs(
      normalizedScore,
    ) <=
    profile.signal.neutralThreshold
  ) {
    normalizedScore = 0;
  }

  /*
   * ======================================================
   * DIRECTION
   * ======================================================
   */

  let direction:
    MarketSignalDirection =
      "neutral";

  if (
    normalizedScore >=
    profile.signal.bullishThreshold
  ) {
    direction =
      "bullish";
  } else if (
    normalizedScore <=
    profile.signal.bearishThreshold
  ) {
    direction =
      "bearish";
  }

  /*
   * ======================================================
   * STRENGTH
   * ======================================================
   */

  const absoluteScore =
    Math.abs(
      normalizedScore,
    );

  let strength:
    MarketSignalStrength =
      "weak";

  if (
    absoluteScore >=
    calibration.strength
      .strongThreshold
  ) {
    strength =
      "strong";
  } else if (
    absoluteScore >=
    calibration.strength
      .moderateThreshold
  ) {
    strength =
      "moderate";
  }

  /*
   * ======================================================
   * CONFIDENCE
   * ======================================================
   */

  const dataCoverage =
    clamp(
      availableWeight,
      0,
      1,
    );

  const riskScore =
    indicators.riskScore === null ||
    indicators.riskScore ===
      undefined
      ? 0
      : clamp(
          indicators.riskScore,
          0,
          1,
        );

  const directionalAgreement =
    absoluteScore;

  const rawConfidence =
    dataCoverage *
    (
      calibration.confidence.base +
      directionalAgreement *
        calibration.confidence
          .directional
    );

  const riskPenalty =
    1 -
    riskScore *
      calibration.confidence
        .riskPenalty;

  const confidence =
    clamp(
      rawConfidence *
        riskPenalty,
      0,
      1,
    );

  return {
    score:
      Number(
        normalizedScore.toFixed(
          4,
        ),
      ),

    direction,

    strength,

    confidence:
      Number(
        confidence.toFixed(
          4,
        ),
      ),

    reasons,
  };
}

/*
 * ======================================================
 * DIRECTIONAL COMPARISON HELPERS
 * ======================================================
 */

function meaningfullyAbove(
  value: number,
  reference: number,
  calibration:
    SignalCalibrationProfile,
): boolean {
  const tolerance =
    Math.max(
      Math.abs(
        reference,
      ) *
        calibration.ema
          .toleranceRatio,

      calibration.ema
        .minimumTolerance,
    );

  return (
    value >
    reference +
      tolerance
  );
}

function meaningfullyBelow(
  value: number,
  reference: number,
  calibration:
    SignalCalibrationProfile,
): boolean {
  const tolerance =
    Math.max(
      Math.abs(
        reference,
      ) *
        calibration.ema
          .toleranceRatio,

      calibration.ema
        .minimumTolerance,
    );

  return (
    value <
    reference -
      tolerance
  );
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}

/*
 * ======================================================
 * LEGACY-COMPATIBLE DEFAULT CALIBRATION
 * ======================================================
 *
 * Temporary migration fallback.
 *
 * These values reproduce the original
 * Chronoverse signal engine exactly.
 *
 * Once every asset has an explicit calibration,
 * this fallback can be removed and calibration
 * can become required in MarketAssetProfile.
 */

const DEFAULT_SIGNAL_CALIBRATION:
  SignalCalibrationProfile = {
    weights: {
      ema: 0.4,
      rsi: 0.2,
      macd: 0.25,
      roc: 0.15,
    },

    ema: {
      toleranceRatio: 0.0001,
      minimumTolerance: 0.000001,

      allAveragesMultiplier: 0.55,
      moderateBiasMultiplier: 0.25,
    },

    rsi: {
      extremeMultiplier: 0.75,
    },

    macd: {
      epsilon: 0.000001,
      zeroBiasMultiplier: 0.6,
    },

    roc: {
      strongThreshold: 4,
      directionalThreshold: 0.25,

      strongMultiplier: 1,
      directionalMultiplier: 0.75,
      mildMultiplier: 0.35,
    },

    strength: {
      moderateThreshold: 0.4,
      strongThreshold: 0.75,
    },

    confidence: {
      base: 0.4,
      directional: 0.6,
      riskPenalty: 0.35,
    },
  };