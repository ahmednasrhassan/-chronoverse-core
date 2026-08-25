import {
  runGoldMacroSmokeTest,
} from "./macro.test";

import {
  calculateGoldMacroScore,
  type GoldMacroScoreResult,
} from "./macroScore";

/**
 * Chronoverse Capital
 * Gold Macro Score Smoke Test
 *
 * Pipeline:
 * FRED
 * -> Gold Macro Snapshot
 * -> Gold Macro Score
 */
export async function runGoldMacroScoreSmokeTest():
  Promise<GoldMacroScoreResult> {
  const snapshot =
    await runGoldMacroSmokeTest();

  const result =
    calculateGoldMacroScore(snapshot);

  validateGoldMacroScore(result);

  return result;
}

function validateGoldMacroScore(
  result: GoldMacroScoreResult,
): void {
  if (
    !Number.isFinite(result.score) ||
    result.score < -1 ||
    result.score > 1
  ) {
    throw new Error(
      "Gold macro score is outside the valid -1 to +1 range.",
    );
  }

  if (
    !Number.isFinite(result.confidence) ||
    result.confidence < 0 ||
    result.confidence > 1
  ) {
    throw new Error(
      "Gold macro confidence is outside the valid 0 to 1 range.",
    );
  }

  if (
    !Number.isFinite(result.coverage) ||
    result.coverage < 0 ||
    result.coverage > 1
  ) {
    throw new Error(
      "Gold macro coverage is outside the valid 0 to 1 range.",
    );
  }

  if (result.reasons.length === 0) {
    throw new Error(
      "Gold macro score returned no analytical reasons.",
    );
  }
}