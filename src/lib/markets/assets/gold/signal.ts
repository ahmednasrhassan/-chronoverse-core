import { GOLD_CONFIG } from "./config";

export type GoldSignalDirection =
  | "bullish"
  | "bearish"
  | "neutral";

export type GoldSignalStrength =
  | "weak"
  | "moderate"
  | "strong";

export type GoldSignalInput = {
  price: number;

  ema20: number | null;
  ema50: number | null;
  ema200: number | null;

  rsi: number | null;

  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;

  roc: number | null;

  riskScore?: number | null;
};

export type GoldSignalResult = {
  score: number;
  direction: GoldSignalDirection;
  strength: GoldSignalStrength;
  confidence: number;
  reasons: string[];
};

/**
 * Chronoverse Capital
 * Gold Signal Engine
 *
 * Directional analytical engine.
 *
 * Score range:
 * -1 = strongly bearish
 *  0 = neutral
 * +1 = strongly bullish
 *
 * Risk affects confidence only.
 * Risk never reverses directional structure.
 */
export function calculateGoldSignal(
  input: GoldSignalInput,
): GoldSignalResult {
  if (
    !Number.isFinite(input.price) ||
    input.price <= 0
  ) {
    throw new Error(
      "Gold signal requires a valid positive price.",
    );
  }

  let weightedScore = 0;
  let availableWeight = 0;

  const reasons: string[] = [];

  /*
   * ======================================================
   * EMA TREND STRUCTURE
   * Weight: 40%
   * ======================================================
   */

  if (
    input.ema20 !== null &&
    input.ema50 !== null &&
    input.ema200 !== null
  ) {
    const weight = 0.4;

    availableWeight += weight;

    const fullyBullish =
      meaningfullyAbove(
        input.price,
        input.ema20,
      ) &&
      meaningfullyAbove(
        input.ema20,
        input.ema50,
      ) &&
      meaningfullyAbove(
        input.ema50,
        input.ema200,
      );

    const fullyBearish =
      meaningfullyBelow(
        input.price,
        input.ema20,
      ) &&
      meaningfullyBelow(
        input.ema20,
        input.ema50,
      ) &&
      meaningfullyBelow(
        input.ema50,
        input.ema200,
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
          input.price,
          input.ema20,
        ),
        meaningfullyAbove(
          input.price,
          input.ema50,
        ),
        meaningfullyAbove(
          input.price,
          input.ema200,
        ),
      ].filter(Boolean).length;

      const bearishVotes = [
        meaningfullyBelow(
          input.price,
          input.ema20,
        ),
        meaningfullyBelow(
          input.price,
          input.ema50,
        ),
        meaningfullyBelow(
          input.price,
          input.ema200,
        ),
      ].filter(Boolean).length;

      if (
        bullishVotes === 0 &&
        bearishVotes === 0
      ) {
        reasons.push(
          "Price is balanced around the primary trend averages.",
        );
      } else if (bullishVotes === 3) {
        weightedScore += weight * 0.55;

        reasons.push(
          "Price trades above all primary trend averages.",
        );
      } else if (bearishVotes === 3) {
        weightedScore -= weight * 0.55;

        reasons.push(
          "Price trades below all primary trend averages.",
        );
      } else if (bullishVotes >= 2) {
        weightedScore += weight * 0.25;

        reasons.push(
          "EMA structure has a moderate bullish bias.",
        );
      } else if (bearishVotes >= 2) {
        weightedScore -= weight * 0.25;

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
   * Weight: 20%
   *
   * Overbought / oversold risk belongs
   * to the separate Risk Engine.
   * ======================================================
   */

  if (input.rsi !== null) {
    const weight = 0.2;

    availableWeight += weight;

    if (input.rsi >= 70) {
      weightedScore += weight * 0.75;

      reasons.push(
        "RSI confirms strong positive momentum, although conditions are extended.",
      );
    } else if (input.rsi >= 55) {
      weightedScore += weight;

      reasons.push(
        "RSI confirms positive directional momentum.",
      );
    } else if (input.rsi > 45) {
      reasons.push(
        "RSI remains inside a neutral momentum zone.",
      );
    } else if (input.rsi > 30) {
      weightedScore -= weight;

      reasons.push(
        "RSI confirms negative directional momentum.",
      );
    } else {
      weightedScore -= weight * 0.75;

      reasons.push(
        "RSI confirms strong negative momentum, although conditions are extended.",
      );
    }
  }

  /*
   * ======================================================
   * MACD STRUCTURE
   * Weight: 25%
   * ======================================================
   */

  if (
    input.macd !== null &&
    input.macdSignal !== null &&
    input.macdHistogram !== null
  ) {
    const weight = 0.25;

    availableWeight += weight;

    const epsilon = 0.000001;

    const macdPositive =
      input.macd > epsilon;

    const macdNegative =
      input.macd < -epsilon;

    const bullishCross =
      input.macd >
      input.macdSignal + epsilon;

    const bearishCross =
      input.macd <
      input.macdSignal - epsilon;

    const histogramPositive =
      input.macdHistogram > epsilon;

    const histogramNegative =
      input.macdHistogram < -epsilon;

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
    } else if (macdPositive) {
      weightedScore += weight * 0.6;

      reasons.push(
        "MACD remains above zero and supports positive trend structure.",
      );
    } else if (macdNegative) {
      weightedScore -= weight * 0.6;

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
   * Weight: 15%
   * ======================================================
   */

  if (input.roc !== null) {
    const weight = 0.15;

    availableWeight += weight;

    if (input.roc >= 4) {
      weightedScore += weight;

      reasons.push(
        "Rate of change confirms strong positive price momentum.",
      );
    } else if (input.roc > 0.25) {
      weightedScore += weight * 0.75;

      reasons.push(
        "Rate of change confirms positive price momentum.",
      );
    } else if (input.roc > 0) {
      weightedScore += weight * 0.35;

      reasons.push(
        "Rate of change is mildly positive.",
      );
    } else if (input.roc <= -4) {
      weightedScore -= weight;

      reasons.push(
        "Rate of change confirms strong negative price momentum.",
      );
    } else if (input.roc < -0.25) {
      weightedScore -= weight * 0.75;

      reasons.push(
        "Rate of change confirms negative price momentum.",
      );
    } else if (input.roc < 0) {
      weightedScore -= weight * 0.35;

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

  if (availableWeight === 0) {
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

  let normalizedScore = clamp(
    weightedScore / availableWeight,
    -1,
    1,
  );

  /*
   * Small directional noise around zero is treated
   * as equilibrium.
   */
  if (
    Math.abs(normalizedScore) <=
    GOLD_CONFIG.signal.neutralThreshold
  ) {
    normalizedScore = 0;
  }

  /*
   * ======================================================
   * DIRECTION
   * ======================================================
   */

  let direction: GoldSignalDirection =
    "neutral";

  if (
    normalizedScore >=
    GOLD_CONFIG.signal.bullishThreshold
  ) {
    direction = "bullish";
  } else if (
    normalizedScore <=
    GOLD_CONFIG.signal.bearishThreshold
  ) {
    direction = "bearish";
  }

  /*
   * ======================================================
   * STRENGTH
   * ======================================================
   */

  const absoluteScore =
    Math.abs(normalizedScore);

  let strength: GoldSignalStrength =
    "weak";

  if (absoluteScore >= 0.75) {
    strength = "strong";
  } else if (absoluteScore >= 0.4) {
    strength = "moderate";
  }

  /*
   * ======================================================
   * CONFIDENCE
   * ======================================================
   */

  const dataCoverage = clamp(
    availableWeight,
    0,
    1,
  );

  const riskScore =
    input.riskScore === null ||
    input.riskScore === undefined
      ? 0
      : clamp(
          input.riskScore,
          0,
          1,
        );

  const directionalAgreement =
    absoluteScore;

  const rawConfidence =
    dataCoverage *
    (
      0.4 +
      directionalAgreement * 0.6
    );

  const riskPenalty =
    1 - riskScore * 0.35;

  const confidence = clamp(
    rawConfidence * riskPenalty,
    0,
    1,
  );

  return {
    score: Number(
      normalizedScore.toFixed(4),
    ),

    direction,

    strength,

    confidence: Number(
      confidence.toFixed(4),
    ),

    reasons,
  };
}

/**
 * Relative tolerance used to prevent tiny numerical
 * differences from becoming directional signals.
 */
function meaningfullyAbove(
  value: number,
  reference: number,
): boolean {
  const tolerance =
    Math.max(
      Math.abs(reference) * 0.0001,
      0.000001,
    );

  return value > reference + tolerance;
}

function meaningfullyBelow(
  value: number,
  reference: number,
): boolean {
  const tolerance =
    Math.max(
      Math.abs(reference) * 0.0001,
      0.000001,
    );

  return value < reference - tolerance;
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