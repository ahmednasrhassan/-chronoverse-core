import type {
  OilRegimeMemoryResult,
  OilRegimeSnapshot,
} from "./regimeMemory";

import {
  appendMarketRegimeSnapshot,
  clearMarketRegimeHistory,
  getLatestMarketRegimeSnapshot,
  getMarketRegimeHistory,
  getMarketRegimeHistoryCount,
  getPreviousMarketRegimeSnapshot,
  type MarketRegimeHistoryConfig,
} from "../../core/regimeHistory";

/**
 * Chronoverse Capital
 * Oil Regime History Adapter
 *
 * Oil receives its own persistent
 * Redis history while storage mechanics
 * remain inside the Universal Core.
 */

const oilRegimeHistoryConfig:
  MarketRegimeHistoryConfig = {
    key:
      "chronoverse:oil:regime:history",

    maxHistory:
      120,

    errorPrefix:
      "[Chronoverse Oil Regime]",
  };

/**
 * Append a new Oil regime snapshot.
 *
 * Optional latestSnapshot allows callers
 * that already fetched the latest regime
 * to avoid a duplicate Redis LINDEX.
 */
export async function appendOilRegimeSnapshot(
  snapshot: OilRegimeSnapshot,
  latestSnapshot?:
    | OilRegimeSnapshot
    | null,
): Promise<void> {
  return appendMarketRegimeSnapshot(
    oilRegimeHistoryConfig,
    snapshot,
    latestSnapshot,
  );
}

/**
 * Most recent snapshot.
 */
export async function getLatestOilRegimeSnapshot():
  Promise<OilRegimeSnapshot | null> {
  return getLatestMarketRegimeSnapshot<
    OilRegimeSnapshot
  >(
    oilRegimeHistoryConfig,
  );
}

/**
 * Snapshot immediately preceding
 * the latest snapshot.
 */
export async function getPreviousOilRegimeSnapshot():
  Promise<OilRegimeSnapshot | null> {
  return getPreviousMarketRegimeSnapshot<
    OilRegimeSnapshot
  >(
    oilRegimeHistoryConfig,
  );
}

/**
 * Full bounded history,
 * ordered oldest -> newest.
 */
export async function getOilRegimeHistory():
  Promise<readonly OilRegimeSnapshot[]> {
  return getMarketRegimeHistory<
    OilRegimeSnapshot
  >(
    oilRegimeHistoryConfig,
  );
}

/**
 * Number of retained snapshots.
 */
export async function getOilRegimeHistoryCount():
  Promise<number> {
  return getMarketRegimeHistoryCount(
    oilRegimeHistoryConfig,
  );
}

/**
 * Clears persistent Oil regime history.
 *
 * Intended for maintenance/testing only.
 */
export async function clearOilRegimeHistory():
  Promise<void> {
  return clearMarketRegimeHistory(
    oilRegimeHistoryConfig,
  );
}

/**
 * Convenience structure for future
 * regime-history API integration.
 */
export type OilRegimeHistoryEnvelope = {
  latest:
    | OilRegimeSnapshot
    | null;

  previous:
    | OilRegimeSnapshot
    | null;

  count: number;

  memory:
    | OilRegimeMemoryResult
    | null;
};