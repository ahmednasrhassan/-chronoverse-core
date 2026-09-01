/**
 * Chronoverse Capital
 * Universal Market State
 *
 * Converts normalized market intelligence
 * into a high-level market state and
 * combined confidence score.
 *
 * No asset dependency.
 * No provider dependency.
 * No database dependency.
 * No UI dependency.
 */

export type MarketIntelligenceState =
  | "opportunity"
  | "caution"
  | "risk";

export type MarketStateSignal = {
  direction:
    | "bullish"
    | "neutral"
    | "bearish";

  confidence: number;
};

export type MarketStateRisk = {
  level:
    | "low"
    | "moderate"
    | "high";

  score: number;
};

export type MarketStateMacro = {
  bias:
    | "bullish"
    | "neutral"
    | "bearish";

  confidence: number;

  coverage: number;
};

export type MarketStateInput = {
  signal: MarketStateSignal;

  risk: MarketStateRisk;

  macro:
    | MarketStateMacro
    | null;
};

export type MarketStateResult = {
  state: MarketIntelligenceState;

  confidence: number;
};

/**
 * Resolve the high-level market state
 * and combined confidence.
 */
export function calculateMarketState(
  input: MarketStateInput,
): MarketStateResult {
  return {
    state:
      resolveMarketState(
        input.signal,
        input.risk,
        input.macro,
      ),

    confidence:
      calculateMarketStateConfidence(
        input.signal,
        input.risk,
        input.macro,
      ),
  };
}

/**
 * High-level state classification.
 *
 * Technical direction remains the primary
 * tactical signal.
 *
 * Macro acts as confirmation,
 * contradiction and regime filter.
 *
 * Elevated risk remains dominant.
 */
export function resolveMarketState(
  signal: MarketStateSignal,
  risk: MarketStateRisk,
  macro:
    | MarketStateMacro
    | null,
): MarketIntelligenceState {
  /*
   * HARD RISK OVERRIDE
   */

  if (
    risk.level ===
      "high"
  ) {
    return "risk";
  }

  /*
   * BEARISH TECHNICAL STRUCTURE
   */

  if (
    signal.direction ===
      "bearish" &&
    signal.confidence >=
      0.55
  ) {
    /*
     * Strong supportive macro conditions
     * create disagreement with bearish
     * price structure.
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
   * BULLISH TECHNICAL STRUCTURE
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
     * Strong bearish macro conditions
     * block a clean opportunity state.
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
   * DEFAULT MIXED STATE
   */

  return "caution";
}

/**
 * Combined market-state confidence.
 *
 * Without macro:
 *
 * signal = 75%
 * risk   = 25%
 *
 * With macro:
 *
 * signal = 60%
 * risk   = 20%
 * macro  = 20%
 */
export function calculateMarketStateConfidence(
  signal: MarketStateSignal,
  risk: MarketStateRisk,
  macro:
    | MarketStateMacro
    | null,
): number {
  const riskQuality =
    1 -
    risk.score;

  /*
   * NO MACRO LAYER
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
   * MACRO QUALITY
   *
   * Confidence only contributes in
   * proportion to actual data coverage.
   */

  const macroQuality =
    macro.confidence *
    macro.coverage;

  /*
   * THREE-LAYER CONFIDENCE
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

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    Math.max(
      value,
      min,
    ),
    max,
  );
}