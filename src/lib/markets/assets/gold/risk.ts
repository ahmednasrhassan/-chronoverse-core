import { GOLD_CONFIG } from "./config";

export type GoldRiskLevel =
  | "low"
  | "moderate"
  | "high";

export type GoldRiskInput = {
  rsi: number | null;
  roc: number | null;
  annualizedVolatility: number | null;
  macdHistogram: number | null;
  priceVsEma50: number | null;
  priceVsEma200: number | null;
};

export type GoldRiskResult = {
  score: number;
  level: GoldRiskLevel;
  reasons: string[];
};

/**
 * Chronoverse Capital
 * Gold Risk Engine
 *
 * Converts normalized indicator values
 * into a 0 → 1 risk score.
 *
 * Pure analytical layer.
 * No provider dependency.
 * No UI dependency.
 */
export function calculateGoldRisk(
  input: GoldRiskInput,
): GoldRiskResult {
  let score = 0;
  let weight = 0;

  const reasons: string[] = [];

  /*
   * Volatility
   */
  if (input.annualizedVolatility !== null) {
    weight += 0.3;

    if (input.annualizedVolatility >= 35) {
      score += 0.3;
      reasons.push("Elevated realized volatility.");
    } else if (input.annualizedVolatility >= 22) {
      score += 0.18;
      reasons.push("Moderate realized volatility.");
    } else {
      score += 0.06;
      reasons.push("Contained realized volatility.");
    }
  }

  /*
   * RSI
   */
  if (input.rsi !== null) {
    weight += 0.2;

    if (
      input.rsi >= GOLD_CONFIG.indicators.rsi.overbought ||
      input.rsi <= GOLD_CONFIG.indicators.rsi.oversold
    ) {
      score += 0.2;
      reasons.push("RSI is in an extreme zone.");
    } else if (
      input.rsi > 60 ||
      input.rsi < 40
    ) {
      score += 0.1;
      reasons.push("RSI momentum is stretched.");
    } else {
      score += 0.04;
      reasons.push("RSI remains balanced.");
    }
  }

  /*
   * Momentum / ROC
   */
  if (input.roc !== null) {
    weight += 0.15;

    const absoluteRoc = Math.abs(input.roc);

    if (absoluteRoc >= 8) {
      score += 0.15;
      reasons.push("Price momentum is unusually strong.");
    } else if (absoluteRoc >= 4) {
      score += 0.09;
      reasons.push("Price momentum is elevated.");
    } else {
      score += 0.03;
      reasons.push("Price momentum is controlled.");
    }
  }

  /*
   * MACD instability
   */
  if (input.macdHistogram !== null) {
    weight += 0.1;

    if (Math.abs(input.macdHistogram) >= 20) {
      score += 0.1;
      reasons.push("MACD spread is elevated.");
    } else {
      score += 0.03;
      reasons.push("MACD spread remains contained.");
    }
  }

  /*
   * Trend structure
   */
  if (input.priceVsEma50 !== null) {
    weight += 0.1;

    if (Math.abs(input.priceVsEma50) >= 8) {
      score += 0.1;
      reasons.push("Price is materially extended from EMA 50.");
    } else if (Math.abs(input.priceVsEma50) >= 4) {
      score += 0.06;
      reasons.push("Price is extended from EMA 50.");
    } else {
      score += 0.02;
      reasons.push("Price remains close to EMA 50.");
    }
  }

  if (input.priceVsEma200 !== null) {
    weight += 0.15;

    if (Math.abs(input.priceVsEma200) >= 15) {
      score += 0.15;
      reasons.push("Price is materially extended from EMA 200.");
    } else if (Math.abs(input.priceVsEma200) >= 8) {
      score += 0.09;
      reasons.push("Price is extended from EMA 200.");
    } else {
      score += 0.03;
      reasons.push("Price remains structurally close to EMA 200.");
    }
  }

  /*
   * Normalize score.
   */
  if (weight === 0) {
    return {
      score: 0,
      level: "low",
      reasons: ["Insufficient data for full risk assessment."],
    };
  }

  const normalizedScore = Math.min(
    1,
    Math.max(0, score / weight),
  );

  let level: GoldRiskLevel = "low";

  if (normalizedScore >= GOLD_CONFIG.risk.high) {
    level = "high";
  } else if (
    normalizedScore >= GOLD_CONFIG.risk.moderate
  ) {
    level = "moderate";
  }

  return {
    score: Number(normalizedScore.toFixed(4)),
    level,
    reasons,
  };
}