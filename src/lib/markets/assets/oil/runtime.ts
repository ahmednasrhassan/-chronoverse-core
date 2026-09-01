import {
  getHistoricalMarketData,
} from "../../services/historicalMarketData";

import {
  calculateOilIntelligence,
  type OilIntelligenceResult,
} from "./intelligence";

import {
  getOilMacroInput,
} from "./macroData";

import {
  oilProfile,
} from "./profile";

const OIL_HISTORY_RANGE = "5y";

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
 *
 * Historical market data and macro data are
 * independent, so they are resolved concurrently.
 *
 * Server-side only.
 */
export async function getLiveOilIntelligence():
  Promise<OilIntelligenceResult> {
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

  return calculateOilIntelligence({
    closes,
    macro,
  });
}