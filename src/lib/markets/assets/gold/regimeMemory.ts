import type {
  GoldIntelligenceResult,
  GoldIntelligenceState,
} from "./intelligence";

import {
  calculateMarketRegimeMemory,
  createMarketRegimeSnapshot,
  type MarketRegimeMacroChange,
  type MarketRegimeMemoryResult,
  type MarketRegimeMomentumChange,
  type MarketRegimeSnapshot,
  type MarketRegimeTransition,
} from "../../core/regimeMemory";

/**
 * Chronoverse Capital
 * Gold Regime Memory Adapter
 *
 * Gold-specific intelligence contract
 * ->
 * Universal Regime Memory Core
 *
 * This adapter preserves the existing
 * Gold public API while delegating all
 * shared regime calculations to the
 * universal engine.
 *
 * No provider dependency.
 * No database dependency.
 * No UI dependency.
 */

export type GoldRegimeSnapshot =
  MarketRegimeSnapshot<
    GoldIntelligenceState,
    GoldIntelligenceResult["risk"]["level"]
  >;

export type GoldRegimeTransition =
  MarketRegimeTransition;

export type GoldMomentumChange =
  MarketRegimeMomentumChange;

export type GoldMacroChange =
  MarketRegimeMacroChange;

export type GoldRegimeMemoryResult =
  MarketRegimeMemoryResult<
    GoldIntelligenceState,
    GoldIntelligenceResult["risk"]["level"]
  >;

export function createGoldRegimeSnapshot(
  intelligence: GoldIntelligenceResult,
  timestamp = new Date().toISOString(),
): GoldRegimeSnapshot {
  return createMarketRegimeSnapshot({
    timestamp,

    state:
      intelligence.state,

    confidence:
      intelligence.confidence,

    signalDirection:
      intelligence.signal.direction,

    signalConfidence:
      intelligence.signal.confidence,

    macroBias:
      intelligence.macro?.bias ??
      null,

    macroConfidence:
      intelligence.macro?.confidence ??
      null,

    riskLevel:
      intelligence.risk.level,

    riskScore:
      intelligence.risk.score,
  });
}

export function calculateGoldRegimeMemory(
  current: GoldRegimeSnapshot,
  previous:
    | GoldRegimeSnapshot
    | null,
): GoldRegimeMemoryResult {
  return calculateMarketRegimeMemory(
    current,
    previous,
    goldRegimeStateRank,
  );
}

/**
 * Preserve Gold's historical regime ordering:
 *
 * risk        = 0
 * caution     = 1
 * opportunity = 2
 *
 * The Universal Core does not know
 * what Gold states mean.
 */
function goldRegimeStateRank(
  state: GoldIntelligenceState,
): number {
  if (
    state === "opportunity"
  ) {
    return 2;
  }

  if (
    state === "caution"
  ) {
    return 1;
  }

  return 0;
}