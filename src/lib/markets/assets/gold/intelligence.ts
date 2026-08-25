import {
  calculateEMA,
  calculateMACD,
  calculateMomentum,
  calculateRSI,
  calculateVolatility,
} from "../../indicators";

import { GOLD_CONFIG } from "./config";

import {
  calculateGoldRisk,
  type GoldRiskResult,
} from "./risk";

import {
  calculateGoldSignal,
  type GoldSignalResult,
} from "./signal";

import type {
  GoldMacroScoreResult,
} from "./macroScore";

export type GoldIntelligenceInput = {
  closes: readonly number[];

  /**
   * Optional normalized macro intelligence.
   *
   * The Gold Intelligence Engine does not know
   * which provider produced this macro score.
   */
  macro?: GoldMacroScoreResult | null;
};

export type GoldIntelligenceState =
  | "opportunity"
  | "caution"
  | "risk";

export type GoldIntelligenceResult = {
  price: number | null;

  indicators: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;

    rsi: number | null;

    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;

    momentum: number | null;
    roc: number | null;

    annualizedVolatility: number | null;

    priceVsEma50: number | null;
    priceVsEma200: number | null;
  };

  risk: GoldRiskResult;
  signal: GoldSignalResult;

  /**
   * Optional macro layer.
   *
   * Null means macro data was not supplied.
   */
  macro: GoldMacroScoreResult | null;

  state: GoldIntelligenceState;

  confidence: number;

  summary: string;

  warnings: string[];
};

/**
 * Chronoverse Capital
 * Gold Intelligence Engine
 *
 * Market prices
 * → technical indicators
 * → risk engine
 * → signal engine
 *
 * Optional macro score
 * → regime confirmation / contradiction
 *
 * → final intelligence state
 *
 * No provider dependency.
 * No UI dependency.
 */
export function calculateGoldIntelligence(
  input: GoldIntelligenceInput,
): GoldIntelligenceResult {
  const closes = input.closes;
  const macro = input.macro ?? null;

  validateCloses(closes);

  if (closes.length === 0) {
    return createEmptyResult(macro);
  }

  const price =
    closes[closes.length - 1];

  /*
   * ------------------------------------------------------
   * TECHNICAL INDICATORS
   * ------------------------------------------------------
   */

  const ema20Series =
    calculateEMA(
      closes,
      GOLD_CONFIG.indicators.ema.fast,
    );

  const ema50Series =
    calculateEMA(
      closes,
      GOLD_CONFIG.indicators.ema.medium,
    );

  const ema200Series =
    calculateEMA(
      closes,
      GOLD_CONFIG.indicators.ema.slow,
    );

  const rsiSeries =
    calculateRSI(
      closes,
      GOLD_CONFIG.indicators.rsi.period,
    );

  const macdResult =
    calculateMACD(
      closes,
      GOLD_CONFIG.indicators.macd.fastPeriod,
      GOLD_CONFIG.indicators.macd.slowPeriod,
      GOLD_CONFIG.indicators.macd.signalPeriod,
    );

  const momentumResult =
    calculateMomentum(
      closes,
      GOLD_CONFIG.indicators.momentum.period,
    );

  const volatilityResult =
    calculateVolatility(
      closes,
      GOLD_CONFIG.indicators.volatility.period,
      GOLD_CONFIG.indicators.volatility.annualizationFactor,
    );

  /*
   * ------------------------------------------------------
   * LATEST VALUES
   * ------------------------------------------------------
   */

  const ema20 =
    latest(ema20Series);

  const ema50 =
    latest(ema50Series);

  const ema200 =
    latest(ema200Series);

  const rsi =
    latest(rsiSeries);

  const macd =
    latest(macdResult.macd);

  const macdSignal =
    latest(macdResult.signal);

  const macdHistogram =
    latest(macdResult.histogram);

  const momentum =
    latest(momentumResult.momentum);

  const roc =
    latest(momentumResult.roc);

  const annualizedVolatility =
    latest(
      volatilityResult.annualizedVolatility,
    );

  const priceVsEma50 =
    percentageDistance(
      price,
      ema50,
    );

  const priceVsEma200 =
    percentageDistance(
      price,
      ema200,
    );

  /*
   * ------------------------------------------------------
   * RISK ENGINE
   * ------------------------------------------------------
   */

  const risk =
    calculateGoldRisk({
      rsi,
      roc,
      annualizedVolatility,
      macdHistogram,
      priceVsEma50,
      priceVsEma200,
    });

  /*
   * ------------------------------------------------------
   * TECHNICAL SIGNAL ENGINE
   * ------------------------------------------------------
   */

  const signal =
    calculateGoldSignal({
      price,

      ema20,
      ema50,
      ema200,

      rsi,

      macd,
      macdSignal,
      macdHistogram,

      roc,

      riskScore: risk.score,
    });

  /*
   * ------------------------------------------------------
   * FINAL INTELLIGENCE
   * ------------------------------------------------------
   */

  const state =
    resolveState(
      signal,
      risk,
      macro,
    );

  const confidence =
    calculateCombinedConfidence(
      signal,
      risk,
      macro,
    );

  const warnings =
    buildWarnings({
      rsi,
      annualizedVolatility,
      priceVsEma50,
      priceVsEma200,
      risk,
      signal,
      macro,
    });

  const summary =
    buildSummary(
      state,
      signal,
      risk,
      macro,
    );

  return {
    price,

    indicators: {
      ema20,
      ema50,
      ema200,

      rsi,

      macd,
      macdSignal,
      macdHistogram,

      momentum,
      roc,

      annualizedVolatility,

      priceVsEma50,
      priceVsEma200,
    },

    risk,
    signal,
    macro,

    state,
    confidence,

    summary,
    warnings,
  };
}

/**
 * Technical direction remains the primary tactical signal.
 *
 * Macro acts as:
 * - confirmation
 * - contradiction
 * - regime filter
 *
 * Macro does NOT blindly override price structure.
 */
function resolveState(
  signal: GoldSignalResult,
  risk: GoldRiskResult,
  macro: GoldMacroScoreResult | null,
): GoldIntelligenceState {
  /*
   * Hard technical risk remains dominant.
   */
  if (risk.level === "high") {
    return "risk";
  }

  /*
   * Strong bearish technical structure.
   */
  if (
    signal.direction === "bearish" &&
    signal.confidence >= 0.55
  ) {
    if (
      macro !== null &&
      macro.bias === "bullish" &&
      macro.confidence >= 0.65
    ) {
      /*
       * Technical and macro layers disagree.
       */
      return "caution";
    }

    return "risk";
  }

  /*
   * Constructive bullish technical setup.
   */
  if (
    signal.direction === "bullish" &&
    signal.confidence >= 0.55 &&
    risk.level === "low"
  ) {
    /*
     * Strong bearish macro backdrop blocks a clean
     * opportunity classification.
     */
    if (
      macro !== null &&
      macro.bias === "bearish" &&
      macro.confidence >= 0.65
    ) {
      return "caution";
    }

    return "opportunity";
  }

  return "caution";
}

/**
 * Combines:
 *
 * Technical signal confidence
 * Risk quality
 * Optional macro confidence
 *
 * Macro receives weight only when available.
 */
function calculateCombinedConfidence(
  signal: GoldSignalResult,
  risk: GoldRiskResult,
  macro: GoldMacroScoreResult | null,
): number {
  const riskQuality =
    1 - risk.score;

  /*
   * Preserve original engine behaviour
   * when no macro layer is supplied.
   */
  if (macro === null) {
    const combined =
      signal.confidence * 0.75 +
      riskQuality * 0.25;

    return Number(
      clamp(
        combined,
        0,
        1,
      ).toFixed(4),
    );
  }

  /*
   * Macro confidence is useful only when
   * meaningful coverage exists.
   */
  const macroQuality =
    macro.confidence *
    macro.coverage;

  const combined =
    signal.confidence * 0.6 +
    riskQuality * 0.2 +
    macroQuality * 0.2;

  return Number(
    clamp(
      combined,
      0,
      1,
    ).toFixed(4),
  );
}

/**
 * Creates plain-language analytical warnings.
 */
function buildWarnings(input: {
  rsi: number | null;
  annualizedVolatility: number | null;
  priceVsEma50: number | null;
  priceVsEma200: number | null;

  risk: GoldRiskResult;
  signal: GoldSignalResult;

  macro: GoldMacroScoreResult | null;
}): string[] {
  const warnings: string[] = [];

  if (
    input.rsi !== null &&
    input.rsi >=
      GOLD_CONFIG.indicators.rsi.overbought
  ) {
    warnings.push(
      "Gold is technically overbought on RSI.",
    );
  }

  if (
    input.rsi !== null &&
    input.rsi <=
      GOLD_CONFIG.indicators.rsi.oversold
  ) {
    warnings.push(
      "Gold is technically oversold on RSI.",
    );
  }

  if (
    input.annualizedVolatility !== null &&
    input.annualizedVolatility >= 35
  ) {
    warnings.push(
      "Realized volatility is elevated.",
    );
  }

  if (
    input.priceVsEma50 !== null &&
    Math.abs(input.priceVsEma50) >= 8
  ) {
    warnings.push(
      "Price is materially extended from EMA 50.",
    );
  }

  if (
    input.priceVsEma200 !== null &&
    Math.abs(input.priceVsEma200) >= 15
  ) {
    warnings.push(
      "Price is materially extended from EMA 200.",
    );
  }

  if (
    input.risk.level === "high"
  ) {
    warnings.push(
      "Current conditions carry elevated analytical risk.",
    );
  }

  /*
   * ------------------------------------------------------
   * MACRO CONTRADICTION WARNINGS
   * ------------------------------------------------------
   */

  if (
    input.macro !== null &&
    input.macro.confidence >= 0.65
  ) {
    if (
      input.signal.direction === "bullish" &&
      input.macro.bias === "bearish"
    ) {
      warnings.push(
        "Bullish technical momentum is facing a bearish macroeconomic backdrop.",
      );
    }

    if (
      input.signal.direction === "bearish" &&
      input.macro.bias === "bullish"
    ) {
      warnings.push(
        "Bearish technical momentum conflicts with a supportive macroeconomic backdrop.",
      );
    }
  }

  return warnings;
}

/**
 * Creates the high-level intelligence summary.
 */
function buildSummary(
  state: GoldIntelligenceState,
  signal: GoldSignalResult,
  risk: GoldRiskResult,
  macro: GoldMacroScoreResult | null,
): string {
  const macroPhrase =
    buildMacroPhrase(macro);

  if (state === "opportunity") {
    return (
      "Gold shows constructive technical alignment with " +
      `${signal.strength} bullish momentum and contained risk.` +
      macroPhrase
    );
  }

  if (state === "risk") {
    if (
      signal.direction === "bearish"
    ) {
      return (
        "Gold currently shows negative technical pressure " +
        "with an elevated downside risk profile." +
        macroPhrase
      );
    }

    return (
      "Gold may retain directional strength, but current " +
      "risk conditions require caution." +
      macroPhrase
    );
  }

  if (
    macro !== null &&
    signal.direction === "bullish" &&
    macro.bias === "bearish"
  ) {
    return (
      "Gold retains bullish technical momentum, but the " +
      "macroeconomic backdrop is currently restrictive, " +
      "reducing conviction."
    );
  }

  if (
    macro !== null &&
    signal.direction === "bearish" &&
    macro.bias === "bullish"
  ) {
    return (
      "Gold shows bearish technical pressure while the " +
      "macroeconomic backdrop remains supportive, creating " +
      "a conflicting analytical regime."
    );
  }

  return (
    "Gold is currently in a mixed analytical regime with " +
    "insufficient alignment for a high-conviction signal." +
    macroPhrase
  );
}

function buildMacroPhrase(
  macro: GoldMacroScoreResult | null,
): string {
  if (macro === null) {
    return "";
  }

  if (macro.bias === "bullish") {
    return (
      " The macroeconomic backdrop is currently supportive for gold."
    );
  }

  if (macro.bias === "bearish") {
    return (
      " The macroeconomic backdrop currently presents a headwind for gold."
    );
  }

  return (
    " The macroeconomic backdrop is broadly neutral."
  );
}

function latest(
  values: readonly (number | null)[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  return (
    values[
      values.length - 1
    ] ?? null
  );
}

function percentageDistance(
  price: number,
  reference: number | null,
): number | null {
  if (
    reference === null ||
    reference === 0
  ) {
    return null;
  }

  return (
    (
      (price - reference) /
      reference
    ) * 100
  );
}

function validateCloses(
  closes: readonly number[],
): void {
  for (
    let i = 0;
    i < closes.length;
    i += 1
  ) {
    const value =
      closes[i];

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(
        `Invalid gold close value at index ${i}.`,
      );
    }
  }
}

function createEmptyResult(
  macro: GoldMacroScoreResult | null,
): GoldIntelligenceResult {
  return {
    price: null,

    indicators: {
      ema20: null,
      ema50: null,
      ema200: null,

      rsi: null,

      macd: null,
      macdSignal: null,
      macdHistogram: null,

      momentum: null,
      roc: null,

      annualizedVolatility: null,

      priceVsEma50: null,
      priceVsEma200: null,
    },

    risk: {
      score: 0,
      level: "low",
      reasons: [
        "No market data available.",
      ],
    },

    signal: {
      score: 0,
      direction: "neutral",
      strength: "weak",
      confidence: 0,
      reasons: [
        "No market data available.",
      ],
    },

    macro,

    state: "caution",

    confidence: 0,

    summary:
      "Insufficient market data for gold intelligence.",

    warnings: [
      "Market intelligence is waiting for valid price history.",
    ],
  };
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