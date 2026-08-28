import {
  calculateMarketIntelligence,
} from "../../core/marketIntelligence";

import {
  goldProfile,
} from "./profile";

import type {
  GoldRiskResult,
} from "./risk";

import type {
  GoldSignalResult,
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

    annualizedVolatility:
      | number
      | null;

    priceVsEma50:
      | number
      | null;

    priceVsEma200:
      | number
      | null;
  };

  risk: GoldRiskResult;

  signal: GoldSignalResult;

  /**
   * Optional macro layer.
   *
   * Null means macro data was not supplied.
   */
  macro:
    | GoldMacroScoreResult
    | null;

  state:
    GoldIntelligenceState;

  confidence: number;

  summary: string;

  warnings: string[];
};

/**
 * Chronoverse Capital
 * Gold Intelligence Adapter
 *
 * Universal Market Intelligence Core
 * +
 * Gold Asset Profile
 * +
 * Optional Gold Macro Layer
 * +
 * Gold-specific presentation intelligence
 * =
 * Full Gold Intelligence
 *
 * The universal market core now owns:
 *
 * - Technical calculations
 * - Risk calculation
 * - Signal calculation
 *
 * Gold keeps only:
 *
 * - Gold public compatibility contract
 * - Macro interpretation
 * - State classification
 * - Combined confidence
 * - Gold-specific warnings
 * - Gold-specific summary
 *
 * No provider dependency.
 * No UI dependency.
 */
export function calculateGoldIntelligence(
  input: GoldIntelligenceInput,
): GoldIntelligenceResult {
  const closes =
    input.closes;

  const macro =
    input.macro ?? null;

  /*
   * ======================================================
   * GOLD COMPATIBILITY VALIDATION
   * ======================================================
   *
   * Preserve the existing Gold-specific
   * error contract during migration.
   */

  validateCloses(
    closes,
  );

  /*
   * ======================================================
   * EMPTY GOLD STATE
   * ======================================================
   *
   * Gold keeps its existing public empty-state
   * behaviour even though the universal engine
   * also supports empty technical history.
   */

  if (
    closes.length === 0
  ) {
    return createEmptyResult(
      macro,
    );
  }

  /*
   * ======================================================
   * UNIVERSAL MARKET INTELLIGENCE
   * ======================================================
   *
   * One shared orchestration layer now performs:
   *
   * normalized price history
   * →
   * technical intelligence
   * →
   * risk intelligence
   * →
   * directional signal intelligence
   */

  const market =
    calculateMarketIntelligence({
      profile:
        goldProfile,

      closes,
    });

  /*
   * ======================================================
   * PRICE
   * ======================================================
   */

  const price =
    market.price;

  /*
   * Because closes.length > 0 and Gold input
   * validation has already succeeded,
   * the universal engine should always produce
   * a valid latest price.
   *
   * This guard preserves a safe compatibility
   * fallback should that contract ever change.
   */

  if (
    price === null
  ) {
    return createEmptyResult(
      macro,
    );
  }

  /*
   * ======================================================
   * UNIVERSAL TECHNICAL SNAPSHOT
   * ======================================================
   */

  const technical =
    market.technical;

  /*
   * ======================================================
   * GOLD PUBLIC CONTRACT MAPPING
   * ======================================================
   *
   * Universal names:
   *
   * emaFast
   * emaMedium
   * emaSlow
   *
   * Gold compatibility names:
   *
   * ema20
   * ema50
   * ema200
   *
   * The Gold API remains unchanged.
   */

  const ema20 =
    technical.emaFast;

  const ema50 =
    technical.emaMedium;

  const ema200 =
    technical.emaSlow;

  const rsi =
    technical.rsi;

  const macd =
    technical.macd;

  const macdSignal =
    technical.macdSignal;

  const macdHistogram =
    technical.macdHistogram;

  const momentum =
    technical.momentum;

  const roc =
    technical.roc;

  const annualizedVolatility =
    technical.annualizedVolatility;

  const priceVsEma50 =
    technical.priceVsEmaMedium;

  const priceVsEma200 =
    technical.priceVsEmaSlow;

  /*
   * ======================================================
   * UNIVERSAL RISK RESULT
   * ======================================================
   *
   * GoldRiskResult intentionally preserves
   * the Gold public type contract while the
   * calculation itself is owned by the
   * universal market core.
   */

  const risk:
    GoldRiskResult =
      market.risk;

  /*
   * ======================================================
   * UNIVERSAL SIGNAL RESULT
   * ======================================================
   *
   * GoldSignalResult intentionally preserves
   * the Gold public type contract while the
   * directional calculation itself is owned
   * by the universal market core.
   */

  const signal:
    GoldSignalResult =
      market.signal;

  /*
   * ======================================================
   * GOLD-SPECIFIC INTELLIGENCE LAYER
   * ======================================================
   *
   * The sections below remain asset-aware.
   *
   * They interpret:
   *
   * technical structure
   * risk
   * signal
   * optional macro intelligence
   *
   * into the Gold-specific public intelligence
   * experience.
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

  /*
   * ======================================================
   * FINAL GOLD COMPATIBILITY RESULT
   * ======================================================
   */

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
 * ========================================================
 * GOLD STATE RESOLUTION
 * ========================================================
 *
 * Technical direction remains the primary
 * tactical signal.
 *
 * Macro acts as:
 *
 * - confirmation
 * - contradiction
 * - regime filter
 *
 * Macro does NOT blindly override
 * price structure.
 */
function resolveState(
  signal: GoldSignalResult,
  risk: GoldRiskResult,
  macro:
    | GoldMacroScoreResult
    | null,
): GoldIntelligenceState {
  /*
   * ------------------------------------------------------
   * HARD RISK OVERRIDE
   * ------------------------------------------------------
   *
   * Elevated market risk remains dominant.
   */

  if (
    risk.level ===
      "high"
  ) {
    return "risk";
  }

  /*
   * ------------------------------------------------------
   * BEARISH TECHNICAL STRUCTURE
   * ------------------------------------------------------
   */

  if (
    signal.direction ===
      "bearish" &&
    signal.confidence >=
      0.55
  ) {
    /*
     * Strong supportive macro conditions
     * create disagreement with bearish price
     * structure.
     */

    if (
      macro !== null &&
      macro.bias ===
        "bullish" &&
      macro.confidence >=
        0.65
    ) {
      return "caution";
    }

    return "risk";
  }

  /*
   * ------------------------------------------------------
   * BULLISH TECHNICAL STRUCTURE
   * ------------------------------------------------------
   */

  if (
    signal.direction ===
      "bullish" &&
    signal.confidence >=
      0.55 &&
    risk.level ===
      "low"
  ) {
    /*
     * Strong bearish macro conditions block
     * a clean opportunity classification.
     */

    if (
      macro !== null &&
      macro.bias ===
        "bearish" &&
      macro.confidence >=
        0.65
    ) {
      return "caution";
    }

    return "opportunity";
  }

  /*
   * ------------------------------------------------------
   * DEFAULT MIXED STATE
   * ------------------------------------------------------
   */

  return "caution";
}

/**
 * ========================================================
 * COMBINED CONFIDENCE
 * ========================================================
 *
 * Combines:
 *
 * - Technical signal confidence
 * - Risk quality
 * - Optional macro confidence
 *
 * Macro receives weight only when available.
 */
function calculateCombinedConfidence(
  signal: GoldSignalResult,
  risk: GoldRiskResult,
  macro:
    | GoldMacroScoreResult
    | null,
): number {
  const riskQuality =
    1 -
    risk.score;

  /*
   * ------------------------------------------------------
   * NO MACRO LAYER
   * ------------------------------------------------------
   *
   * Preserve the original Gold engine
   * behaviour when macro intelligence
   * is not supplied.
   */

  if (
    macro === null
  ) {
    const combined =
      signal.confidence *
        0.75 +
      riskQuality *
        0.25;

    return Number(
      clamp(
        combined,
        0,
        1,
      ).toFixed(
        4,
      ),
    );
  }

  /*
   * ------------------------------------------------------
   * MACRO QUALITY
   * ------------------------------------------------------
   *
   * Macro confidence has value only when
   * meaningful data coverage exists.
   */

  const macroQuality =
    macro.confidence *
    macro.coverage;

  /*
   * ------------------------------------------------------
   * THREE-LAYER CONFIDENCE
   * ------------------------------------------------------
   */

  const combined =
    signal.confidence *
      0.6 +
    riskQuality *
      0.2 +
    macroQuality *
      0.2;

  return Number(
    clamp(
      combined,
      0,
      1,
    ).toFixed(
      4,
    ),
  );
}

/**
 * ========================================================
 * GOLD WARNINGS
 * ========================================================
 *
 * Creates plain-language Gold-specific
 * analytical warnings.
 */
function buildWarnings(
  input: {
    rsi:
      | number
      | null;

    annualizedVolatility:
      | number
      | null;

    priceVsEma50:
      | number
      | null;

    priceVsEma200:
      | number
      | null;

    risk:
      GoldRiskResult;

    signal:
      GoldSignalResult;

    macro:
      | GoldMacroScoreResult
      | null;
  },
): string[] {
  const warnings:
    string[] = [];

  /*
   * ------------------------------------------------------
   * RSI OVERBOUGHT
   * ------------------------------------------------------
   */

  if (
    input.rsi !==
      null &&
    input.rsi >=
      goldProfile
        .technical
        .rsi
        .overbought
  ) {
    warnings.push(
      "Gold is technically overbought on RSI.",
    );
  }

  /*
   * ------------------------------------------------------
   * RSI OVERSOLD
   * ------------------------------------------------------
   */

  if (
    input.rsi !==
      null &&
    input.rsi <=
      goldProfile
        .technical
        .rsi
        .oversold
  ) {
    warnings.push(
      "Gold is technically oversold on RSI.",
    );
  }

  /*
   * ------------------------------------------------------
   * VOLATILITY
   * ------------------------------------------------------
   */

  if (
    input
      .annualizedVolatility !==
      null &&
    input
      .annualizedVolatility >=
      35
  ) {
    warnings.push(
      "Realized volatility is elevated.",
    );
  }

  /*
   * ------------------------------------------------------
   * MEDIUM TREND EXTENSION
   * ------------------------------------------------------
   */

  if (
    input.priceVsEma50 !==
      null &&
    Math.abs(
      input.priceVsEma50,
    ) >=
      8
  ) {
    warnings.push(
      "Price is materially extended from EMA 50.",
    );
  }

  /*
   * ------------------------------------------------------
   * LONG-TERM TREND EXTENSION
   * ------------------------------------------------------
   */

  if (
    input.priceVsEma200 !==
      null &&
    Math.abs(
      input.priceVsEma200,
    ) >=
      15
  ) {
    warnings.push(
      "Price is materially extended from EMA 200.",
    );
  }

  /*
   * ------------------------------------------------------
   * HIGH RISK
   * ------------------------------------------------------
   */

  if (
    input.risk.level ===
      "high"
  ) {
    warnings.push(
      "Current conditions carry elevated analytical risk.",
    );
  }

  /*
   * ======================================================
   * MACRO CONTRADICTION WARNINGS
   * ======================================================
   */

  if (
    input.macro !==
      null &&
    input.macro
      .confidence >=
      0.65
  ) {
    /*
     * Bullish technical structure
     * against bearish macro regime.
     */

    if (
      input.signal
        .direction ===
        "bullish" &&
      input.macro.bias ===
        "bearish"
    ) {
      warnings.push(
        "Bullish technical momentum is facing a bearish macroeconomic backdrop.",
      );
    }

    /*
     * Bearish technical structure
     * against supportive macro regime.
     */

    if (
      input.signal
        .direction ===
        "bearish" &&
      input.macro.bias ===
        "bullish"
    ) {
      warnings.push(
        "Bearish technical momentum conflicts with a supportive macroeconomic backdrop.",
      );
    }
  }

  return warnings;
}

/**
 * ========================================================
 * GOLD SUMMARY
 * ========================================================
 *
 * Creates the high-level Gold intelligence
 * summary consumed by downstream layers.
 */
function buildSummary(
  state:
    GoldIntelligenceState,
  signal:
    GoldSignalResult,
  risk:
    GoldRiskResult,
  macro:
    | GoldMacroScoreResult
    | null,
): string {
  const macroPhrase =
    buildMacroPhrase(
      macro,
    );

  /*
   * ------------------------------------------------------
   * OPPORTUNITY
   * ------------------------------------------------------
   */

  if (
    state ===
      "opportunity"
  ) {
    return (
      "Gold shows constructive technical alignment with " +
      `${signal.strength} bullish momentum and contained risk.` +
      macroPhrase
    );
  }

  /*
   * ------------------------------------------------------
   * RISK
   * ------------------------------------------------------
   */

  if (
    state ===
      "risk"
  ) {
    if (
      signal.direction ===
        "bearish"
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

  /*
   * ------------------------------------------------------
   * BULLISH TECHNICAL / BEARISH MACRO
   * ------------------------------------------------------
   */

  if (
    macro !==
      null &&
    signal.direction ===
      "bullish" &&
    macro.bias ===
      "bearish"
  ) {
    return (
      "Gold retains bullish technical momentum, but the " +
      "macroeconomic backdrop is currently restrictive, " +
      "reducing conviction."
    );
  }

  /*
   * ------------------------------------------------------
   * BEARISH TECHNICAL / BULLISH MACRO
   * ------------------------------------------------------
   */

  if (
    macro !==
      null &&
    signal.direction ===
      "bearish" &&
    macro.bias ===
      "bullish"
  ) {
    return (
      "Gold shows bearish technical pressure while the " +
      "macroeconomic backdrop remains supportive, creating " +
      "a conflicting analytical regime."
    );
  }

  /*
   * ------------------------------------------------------
   * MIXED REGIME
   * ------------------------------------------------------
   */

  return (
    "Gold is currently in a mixed analytical regime with " +
    "insufficient alignment for a high-conviction signal." +
    macroPhrase
  );
}

/**
 * ========================================================
 * MACRO SUMMARY PHRASE
 * ========================================================
 */
function buildMacroPhrase(
  macro:
    | GoldMacroScoreResult
    | null,
): string {
  /*
   * No macro data.
   */

  if (
    macro === null
  ) {
    return "";
  }

  /*
   * Supportive macro regime.
   */

  if (
    macro.bias ===
      "bullish"
  ) {
    return (
      " The macroeconomic backdrop is currently supportive for gold."
    );
  }

  /*
   * Restrictive macro regime.
   */

  if (
    macro.bias ===
      "bearish"
  ) {
    return (
      " The macroeconomic backdrop currently presents a headwind for gold."
    );
  }

  /*
   * Neutral macro regime.
   */

  return (
    " The macroeconomic backdrop is broadly neutral."
  );
}

/**
 * ========================================================
 * GOLD INPUT VALIDATION
 * ========================================================
 *
 * Gold-specific compatibility validation.
 *
 * The universal core also validates normalized
 * closes independently.
 *
 * Keeping this guard preserves the existing
 * Gold error contract while the application
 * transitions to the universal architecture.
 */
function validateCloses(
  closes:
    readonly number[],
): void {
  for (
    let i = 0;
    i <
    closes.length;
    i += 1
  ) {
    const value =
      closes[
        i
      ];

    if (
      !Number.isFinite(
        value,
      ) ||
      value <=
        0
    ) {
      throw new Error(
        `Invalid gold close value at index ${i}.`,
      );
    }
  }
}

/**
 * ========================================================
 * GOLD EMPTY STATE
 * ========================================================
 *
 * Preserves the existing Gold public
 * intelligence response when valid
 * price history has not yet arrived.
 */
function createEmptyResult(
  macro:
    | GoldMacroScoreResult
    | null,
): GoldIntelligenceResult {
  return {
    price:
      null,

    indicators: {
      ema20:
        null,

      ema50:
        null,

      ema200:
        null,

      rsi:
        null,

      macd:
        null,

      macdSignal:
        null,

      macdHistogram:
        null,

      momentum:
        null,

      roc:
        null,

      annualizedVolatility:
        null,

      priceVsEma50:
        null,

      priceVsEma200:
        null,
    },

    risk: {
      score:
        0,

      level:
        "low",

      reasons: [
        "No market data available.",
      ],
    },

    signal: {
      score:
        0,

      direction:
        "neutral",

      strength:
        "weak",

      confidence:
        0,

      reasons: [
        "No market data available.",
      ],
    },

    macro,

    state:
      "caution",

    confidence:
      0,

    summary:
      "Insufficient market data for gold intelligence.",

    warnings: [
      "Market intelligence is waiting for valid price history.",
    ],
  };
}

/**
 * ========================================================
 * NUMERIC CLAMP
 * ========================================================
 */
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