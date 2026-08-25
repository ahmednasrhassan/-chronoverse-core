import {
  calculateGoldIntelligence,
  type GoldIntelligenceResult,
} from "./intelligence";

export type GoldEngineSmokeTestResult = {
  bullish: GoldIntelligenceResult;
  bearish: GoldIntelligenceResult;
  sideways: GoldIntelligenceResult;
};

/**
 * Chronoverse Capital
 * Gold Intelligence Engine Smoke Test
 *
 * Development validation only.
 * No provider dependency.
 * No UI dependency.
 */

function createTrendSeries(
  start: number,
  count: number,
  step: number,
): number[] {
  return Array.from(
    { length: count },
    (_, index) => start + index * step,
  );
}

function createSidewaysSeries(
  center: number,
  count: number,
): number[] {
  return Array.from(
    { length: count },
    () => center,
  );
}

function validateResult(
  name: string,
  result: GoldIntelligenceResult,
): void {
  if (result.price === null) {
    throw new Error(
      `${name}: expected a valid latest price.`,
    );
  }

  if (
    !Number.isFinite(result.risk.score) ||
    result.risk.score < 0 ||
    result.risk.score > 1
  ) {
    throw new Error(
      `${name}: invalid risk score.`,
    );
  }

  if (
    !Number.isFinite(result.signal.score) ||
    result.signal.score < -1 ||
    result.signal.score > 1
  ) {
    throw new Error(
      `${name}: invalid signal score.`,
    );
  }

  if (
    !Number.isFinite(result.signal.confidence) ||
    result.signal.confidence < 0 ||
    result.signal.confidence > 1
  ) {
    throw new Error(
      `${name}: invalid signal confidence.`,
    );
  }

  if (
    !Number.isFinite(result.confidence) ||
    result.confidence < 0 ||
    result.confidence > 1
  ) {
    throw new Error(
      `${name}: invalid intelligence confidence.`,
    );
  }

  if (result.indicators.ema200 === null) {
    throw new Error(
      `${name}: EMA 200 was not generated.`,
    );
  }

  if (result.indicators.rsi === null) {
    throw new Error(
      `${name}: RSI was not generated.`,
    );
  }

  if (result.indicators.macd === null) {
    throw new Error(
      `${name}: MACD was not generated.`,
    );
  }

  if (
    result.indicators.annualizedVolatility === null
  ) {
    throw new Error(
      `${name}: volatility was not generated.`,
    );
  }
}

export function runGoldEngineSmokeTest():
  GoldEngineSmokeTestResult {
  const bullishCloses = createTrendSeries(
    1900,
    260,
    1.25,
  );

  const bearishCloses = createTrendSeries(
    2300,
    260,
    -1.1,
  );

  const sidewaysCloses = createSidewaysSeries(
    2100,
    260,
  );

  const bullish =
    calculateGoldIntelligence({
      closes: bullishCloses,
    });

  const bearish =
    calculateGoldIntelligence({
      closes: bearishCloses,
    });

  const sideways =
    calculateGoldIntelligence({
      closes: sidewaysCloses,
    });

  validateResult(
    "Bullish scenario",
    bullish,
  );

  validateResult(
    "Bearish scenario",
    bearish,
  );

  validateResult(
    "Sideways scenario",
    sideways,
  );

  if (bullish.signal.score <= 0) {
    throw new Error(
      "Bullish scenario did not generate a positive signal score.",
    );
  }

  if (bearish.signal.score >= 0) {
    throw new Error(
      "Bearish scenario did not generate a negative signal score.",
    );
  }

  if (sideways.signal.direction !== "neutral") {
    throw new Error(
      `Sideways scenario should be neutral, received ${sideways.signal.direction}.`,
    );
  }

  if (Math.abs(sideways.signal.score) > 0.2) {
    throw new Error(
      `Sideways scenario score is too directional: ${sideways.signal.score}.`,
    );
  }

  return {
    bullish,
    bearish,
    sideways,
  };
}