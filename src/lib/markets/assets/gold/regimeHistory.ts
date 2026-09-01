import type {
  GoldRegimeMemoryResult,
  GoldRegimeSnapshot,
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
 * Gold Regime History Adapter
 *
 * Preserves Gold's existing public API
 * and Redis history key while delegating
 * persistent storage to the universal
 * regime-history core.
 */

const goldRegimeHistoryConfig:
  MarketRegimeHistoryConfig = {
    key:
      "chronoverse:gold:regime:history",

    maxHistory:
      120,

    errorPrefix:
      "[Chronoverse Gold Regime]",
  };

/**
 * Append a new Gold regime snapshot.
 *
 * Optional latestSnapshot allows callers
 * that already fetched the latest regime
 * to avoid a duplicate Redis LINDEX.
 */
export async function appendGoldRegimeSnapshot(
  snapshot: GoldRegimeSnapshot,
  latestSnapshot?:
    | GoldRegimeSnapshot
    | null,
): Promise<void> {
  return appendMarketRegimeSnapshot(
    goldRegimeHistoryConfig,
    snapshot,
    latestSnapshot,
  );
}

/**
 * Most recent snapshot.
 */
export async function getLatestGoldRegimeSnapshot():
  Promise<GoldRegimeSnapshot | null> {
  return getLatestMarketRegimeSnapshot<
    GoldRegimeSnapshot
  >(
    goldRegimeHistoryConfig,
  );
}

/**
 * Snapshot immediately preceding
 * the latest snapshot.
 */
export async function getPreviousGoldRegimeSnapshot():
  Promise<GoldRegimeSnapshot | null> {
  return getPreviousMarketRegimeSnapshot<
    GoldRegimeSnapshot
  >(
    goldRegimeHistoryConfig,
  );
}

/**
 * Full bounded history,
 * ordered oldest -> newest.
 */
export async function getGoldRegimeHistory():
  Promise<readonly GoldRegimeSnapshot[]> {
  return getMarketRegimeHistory<
    GoldRegimeSnapshot
  >(
    goldRegimeHistoryConfig,
  );
}

/**
 * Number of retained snapshots.
 */
export async function getGoldRegimeHistoryCount():
  Promise<number> {
  return getMarketRegimeHistoryCount(
    goldRegimeHistoryConfig,
  );
}

/**
 * Clears persistent Gold regime history.
 *
 * Intended for maintenance/testing only.
 */
export async function clearGoldRegimeHistory():
  Promise<void> {
  return clearMarketRegimeHistory(
    goldRegimeHistoryConfig,
  );
}

/**
 * Convenience structure for future
 * regime-history API integration.
 */
export type GoldRegimeHistoryEnvelope = {
  latest:
    | GoldRegimeSnapshot
    | null;

  previous:
    | GoldRegimeSnapshot
    | null;

  count: number;

  memory:
    | GoldRegimeMemoryResult
    | null;
};