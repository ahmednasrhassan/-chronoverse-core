import { Redis } from "@upstash/redis";

import type {
  GoldRegimeMemoryResult,
  GoldRegimeSnapshot,
} from "./regimeMemory";

const MAX_GOLD_REGIME_HISTORY = 120;

const GOLD_REGIME_HISTORY_KEY =
  "chronoverse:gold:regime:history";

/**
 * Chronoverse Capital
 * Gold Regime History
 *
 * Persistent Upstash Redis store.
 *
 * Responsibilities:
 * - retain recent regime snapshots
 * - expose latest snapshot
 * - expose previous snapshot
 * - expose bounded history
 * - survive deployments / cold starts
 */

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url =
    process.env.KV_REST_API_URL;

  const token =
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "[Chronoverse Gold Regime] Missing KV_REST_API_URL or KV_REST_API_TOKEN.",
    );
  }

  redisClient = new Redis({
    url,
    token,
  });

  return redisClient;
}

/**
 * Append a new regime snapshot.
 *
 * History is stored oldest -> newest.
 * Maximum retained history = 120 snapshots.
 */
export async function appendGoldRegimeSnapshot(
  snapshot: GoldRegimeSnapshot,
): Promise<void> {
  const redis =
    getRedisClient();

  const latest =
    await getLatestGoldRegimeSnapshot();

  /*
   * Avoid inserting the exact same
   * generated snapshot twice.
   */
  if (
    latest &&
    latest.timestamp === snapshot.timestamp
  ) {
    return;
  }

  await redis.rpush(
    GOLD_REGIME_HISTORY_KEY,
    snapshot,
  );

  /*
   * Keep only the most recent
   * MAX_GOLD_REGIME_HISTORY records.
   */
  await redis.ltrim(
    GOLD_REGIME_HISTORY_KEY,
    -MAX_GOLD_REGIME_HISTORY,
    -1,
  );
}

/**
 * Most recent snapshot.
 */
export async function getLatestGoldRegimeSnapshot():
  Promise<GoldRegimeSnapshot | null> {
  const redis =
    getRedisClient();

  const snapshot =
    await redis.lindex(
      GOLD_REGIME_HISTORY_KEY,
      -1,
    );

  return snapshot as
    | GoldRegimeSnapshot
    | null;
}

/**
 * Snapshot immediately preceding
 * the latest snapshot.
 */
export async function getPreviousGoldRegimeSnapshot():
  Promise<GoldRegimeSnapshot | null> {
  const redis =
    getRedisClient();

  const snapshot =
    await redis.lindex(
      GOLD_REGIME_HISTORY_KEY,
      -2,
    );

  return snapshot as
    | GoldRegimeSnapshot
    | null;
}

/**
 * Full bounded history,
 * ordered oldest -> newest.
 */
export async function getGoldRegimeHistory():
  Promise<readonly GoldRegimeSnapshot[]> {
  const redis =
    getRedisClient();

  const history =
    await redis.lrange(
      GOLD_REGIME_HISTORY_KEY,
      0,
      -1,
    );

  return history as unknown as
    GoldRegimeSnapshot[];
}

/**
 * Number of retained snapshots.
 */
export async function getGoldRegimeHistoryCount():
  Promise<number> {
  const redis =
    getRedisClient();

  return redis.llen(
    GOLD_REGIME_HISTORY_KEY,
  );
}

/**
 * Clears persistent regime history.
 *
 * Intended for maintenance/testing only.
 */
export async function clearGoldRegimeHistory():
  Promise<void> {
  const redis =
    getRedisClient();

  await redis.del(
    GOLD_REGIME_HISTORY_KEY,
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