import type {
  OilIntelligenceResult,
} from "./intelligence";

import type {
  MarketIntelligenceState,
} from "../../core/marketState";

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
 * Oil Regime Memory Adapter
 *
 * Oil-specific intelligence contract
 * ->
 * Universal Regime Memory Core
 *
 * Shared regime calculations remain
 * inside the universal engine.
 *
 * No provider dependency.
 * No database dependency.
 * No UI dependency.
 */

export type OilRegimeSnapshot =
  MarketRegimeSnapshot<
    MarketIntelligenceState,
    OilIntelligenceResult["risk"]["level"]
  >;

export type OilRegimeTransition =
  MarketRegimeTransition;

export type OilMomentumChange =
  MarketRegimeMomentumChange;

export type OilMacroChange =
  MarketRegimeMacroChange;

export type OilRegimeMemoryResult =
  MarketRegimeMemoryResult<
    MarketIntelligenceState,
    OilIntelligenceResult["risk"]["level"]
  >;

export function createOilRegimeSnapshot(
  intelligence: OilIntelligenceResult,
  timestamp = new Date().toISOString(),
): OilRegimeSnapshot {
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
      intelligence.macro?.direction ??
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

export function calculateOilRegimeMemory(
  current: OilRegimeSnapshot,
  previous:
    | OilRegimeSnapshot
    | null,
): OilRegimeMemoryResult {
  return calculateMarketRegimeMemory(
    current,
    previous,
    oilRegimeStateRank,
  );
}

/**
 * Universal market-state ordering:
 *
 * risk        = 0
 * caution     = 1
 * opportunity = 2
 */
function oilRegimeStateRank(
  state: MarketIntelligenceState,
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