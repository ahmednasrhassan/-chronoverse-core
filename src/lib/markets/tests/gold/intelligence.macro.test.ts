import {
  calculateGoldIntelligence,
  type GoldIntelligenceResult,
} from "../../assets/gold/intelligence";

import {
  runGoldMacroScoreSmokeTest,
} from "./macroScore.test";

/**
 * Chronoverse Capital
 * Gold Integrated Intelligence Smoke Test
 *
 * Real macro data
 * +
 * Synthetic technical price history
 * +
 * Risk Engine
 * +
 * Signal Engine
 * =
 * Final Gold Intelligence
 *
 * Development validation only.
 */

export type GoldIntegratedSmokeTestResult = {
  intelligence: GoldIntelligenceResult;

  comparison: {
    technicalOnlyState:
      GoldIntelligenceResult["state"];

    integratedState:
      GoldIntelligenceResult["state"];

    technicalOnlyConfidence: number;
    integratedConfidence: number;
  };
};

export async function runGoldIntegratedSmokeTest():
  Promise<GoldIntegratedSmokeTestResult> {
  /*
   * ------------------------------------------------------
   * REAL MACRO LAYER
   * ------------------------------------------------------
   */

  const macro =
    await runGoldMacroScoreSmokeTest();

  /*
   * ------------------------------------------------------
   * CONTROLLED TECHNICAL SERIES
   *
   * Synthetic bullish trend is intentional.
   * It allows us to observe how real macro conditions
   * confirm or contradict technical momentum.
   * ------------------------------------------------------
   */

  const closes =
    createBullishSeries(
      1900,
      260,
      1.25,
    );

  /*
   * ------------------------------------------------------
   * TECHNICAL-ONLY CONTROL RESULT
   * ------------------------------------------------------
   */

  const technicalOnly =
    calculateGoldIntelligence({
      closes,
    });

  /*
   * ------------------------------------------------------
   * FULL INTEGRATED RESULT
   * ------------------------------------------------------
   */

  const intelligence =
    calculateGoldIntelligence({
      closes,
      macro,
    });

  validateIntegratedResult(
    intelligence,
  );

  if (intelligence.macro === null) {
    throw new Error(
      "Integrated Gold Intelligence did not retain the macro layer.",
    );
  }

  if (
    intelligence.macro.score !==
    macro.score
  ) {
    throw new Error(
      "Integrated macro score does not match the supplied macro score.",
    );
  }

  return {
    intelligence,

    comparison: {
      technicalOnlyState:
        technicalOnly.state,

      integratedState:
        intelligence.state,

      technicalOnlyConfidence:
        technicalOnly.confidence,

      integratedConfidence:
        intelligence.confidence,
    },
  };
}

function createBullishSeries(
  start: number,
  count: number,
  step: number,
): number[] {
  return Array.from(
    { length: count },
    (_, index) =>
      start + index * step,
  );
}

function validateIntegratedResult(
  result: GoldIntelligenceResult,
): void {
  if (result.price === null) {
    throw new Error(
      "Integrated Gold Intelligence returned no price.",
    );
  }

  if (
    !Number.isFinite(
      result.confidence,
    ) ||
    result.confidence < 0 ||
    result.confidence > 1
  ) {
    throw new Error(
      "Integrated Gold Intelligence confidence is invalid.",
    );
  }

  if (
    !Number.isFinite(
      result.signal.score,
    ) ||
    result.signal.score < -1 ||
    result.signal.score > 1
  ) {
    throw new Error(
      "Integrated Gold Intelligence signal score is invalid.",
    );
  }

  if (
    !Number.isFinite(
      result.risk.score,
    ) ||
    result.risk.score < 0 ||
    result.risk.score > 1
  ) {
    throw new Error(
      "Integrated Gold Intelligence risk score is invalid.",
    );
  }

  if (
    result.summary.trim().length === 0
  ) {
    throw new Error(
      "Integrated Gold Intelligence returned no summary.",
    );
  }
}
