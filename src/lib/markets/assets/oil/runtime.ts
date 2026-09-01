import {
  getHistoricalMarketData,
} from "../../services/historicalMarketData";

import {
  calculateOilIntelligence,
  type OilIntelligenceResult,
} from "./intelligence";

import {
  calculateOilRegimeMemory,
  createOilRegimeSnapshot,
  type OilRegimeMemoryResult,
} from "./regimeMemory";

import {
  appendOilRegimeSnapshot,
  getLatestOilRegimeSnapshot,
} from "./regimeHistory";

import {
  getOilMacroInput,
} from "./macroData";

import {
  oilProfile,
} from "./profile";

const OIL_HISTORY_RANGE = "5y";

export type LiveOilIntelligenceResult =
  OilIntelligenceResult & {
    regimeMemory:
      OilRegimeMemoryResult;
  };

/**
 * Chronoverse Capital
 * Live Oil Intelligence Runtime
 *
 * Combines:
 *
 * - normalized historical market data
 * - official EIA fundamentals
 * - Oil macro interpretation
 * - Universal Market Intelligence Core
 * - Universal Regime Memory
 * - persistent Oil regime history
 *
 * Historical market data and macro data are
 * independent, so they are resolved concurrently.
 *
 * Server-side only.
 */
export async function getLiveOilIntelligence():
  Promise<LiveOilIntelligenceResult> {
  const [
    marketData,
    macro,
  ] = await Promise.all([
    getHistoricalMarketData(
      oilProfile.symbol,
      OIL_HISTORY_RANGE,
      oilProfile.defaultInterval,
    ),

    getOilMacroInput(),
  ]);

  const closes =
    marketData.candles
      .map(
        (candle) =>
          candle.close,
      )
      .filter(
        (close) =>
          Number.isFinite(close) &&
          close > 0,
      )
      .slice(
        -oilProfile.historyLimit,
      );

  if (closes.length === 0) {
    throw new Error(
      "[Chronoverse Oil] No live oil price history available.",
    );
  }

  const intelligence =
    calculateOilIntelligence({
      closes,
      macro,
    });

  const previousSnapshot =
    await getLatestOilRegimeSnapshot();

  const currentSnapshot =
    createOilRegimeSnapshot(
      intelligence,
    );

  const regimeMemory =
    calculateOilRegimeMemory(
      currentSnapshot,
      previousSnapshot,
    );

  await appendOilRegimeSnapshot(
    currentSnapshot,
    previousSnapshot,
  );

  return {
    ...intelligence,
    regimeMemory,
  };
}