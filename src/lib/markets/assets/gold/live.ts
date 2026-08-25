import {
  calculateGoldIntelligence,
  type GoldIntelligenceResult,
} from "./intelligence";

import {
  fetchGoldCloses,
} from "./price";

import type {
  GoldMacroScoreResult,
} from "./macroScore";

/**
 * Chronoverse Capital
 * Gold Live Intelligence Orchestrator
 *
 * Responsibilities:
 *
 * Real gold market history
 * → Gold Intelligence Engine
 *
 * Optional macro intelligence
 * → Gold Intelligence Engine
 *
 * The core intelligence engine remains
 * provider-agnostic and synchronous.
 */

export type GoldLiveIntelligenceInput = {
  macro?: GoldMacroScoreResult | null;

  /**
   * Optional maximum number of most-recent
   * daily closes to feed into the engine.
   *
   * 600 is more than enough for EMA 200
   * while avoiding unnecessary processing.
   */
  historyLimit?: number;
};

export async function getGoldLiveIntelligence(
  input: GoldLiveIntelligenceInput = {},
): Promise<GoldIntelligenceResult> {
  const historyLimit =
    normalizeHistoryLimit(
      input.historyLimit,
    );

  const allCloses =
    await fetchGoldCloses();

  if (allCloses.length === 0) {
    return calculateGoldIntelligence({
      closes: [],
      macro: input.macro ?? null,
    });
  }

  const closes =
    allCloses.slice(
      -historyLimit,
    );

  return calculateGoldIntelligence({
    closes,
    macro: input.macro ?? null,
  });
}

function normalizeHistoryLimit(
  value: number | undefined,
): number {
  if (value === undefined) {
    return 600;
  }

  if (
    !Number.isInteger(value) ||
    value < 250
  ) {
    throw new Error(
      "Gold live intelligence historyLimit must be an integer of at least 250.",
    );
  }

  return value;
}