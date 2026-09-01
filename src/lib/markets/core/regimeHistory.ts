import { Redis } from "@upstash/redis";

/**
 * Chronoverse Capital
 * Universal Regime History
 *
 * Persistent bounded regime-history storage.
 *
 * Responsibilities:
 * - preserve asset-specific Redis keys
 * - retain recent snapshots
 * - expose latest / previous / history / count
 * - avoid duplicate timestamps
 * - remain independent from Gold, Oil and UI code
 *
 * Storage order:
 * oldest -> newest
 */

export type MarketRegimeHistorySnapshot = {
  timestamp: string;
};

export type MarketRegimeHistoryConfig = {
  key: string;
  maxHistory: number;
  errorPrefix: string;
};

let redisClient: Redis | null = null;

function getRedisClient(
  errorPrefix: string,
): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url =
    process.env.KV_REST_API_URL;

  const token =
    process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      `${errorPrefix} Missing KV_REST_API_URL or KV_REST_API_TOKEN.`,
    );
  }

  redisClient = new Redis({
    url,
    token,
  });

  return redisClient;
}

function validateConfig(
  config: MarketRegimeHistoryConfig,
): void {
  if (!config.key) {
    throw new Error(
      `${config.errorPrefix} Missing regime history key.`,
    );
  }

  if (
    !Number.isInteger(config.maxHistory) ||
    config.maxHistory <= 0
  ) {
    throw new Error(
      `${config.errorPrefix} maxHistory must be a positive integer.`,
    );
  }
}

/**
 * Append one snapshot while keeping
 * history bounded.
 *
 * If latestSnapshot is supplied by the
 * caller, no additional Redis read is
 * required for duplicate detection.
 *
 * Without it, one LINDEX is performed.
 */
export async function appendMarketRegimeSnapshot<
  TSnapshot extends MarketRegimeHistorySnapshot,
>(
  config: MarketRegimeHistoryConfig,
  snapshot: TSnapshot,
  latestSnapshot?: TSnapshot | null,
): Promise<void> {
  validateConfig(config);

  const redis =
    getRedisClient(
      config.errorPrefix,
    );

  const latest =
    latestSnapshot === undefined
      ? await getLatestMarketRegimeSnapshot<
          TSnapshot
        >(config)
      : latestSnapshot;

  if (
    latest &&
    latest.timestamp === snapshot.timestamp
  ) {
    return;
  }

  await redis.rpush(
    config.key,
    snapshot,
  );

  await redis.ltrim(
    config.key,
    -config.maxHistory,
    -1,
  );
}

/**
 * Most recent snapshot.
 */
export async function getLatestMarketRegimeSnapshot<
  TSnapshot extends MarketRegimeHistorySnapshot,
>(
  config: MarketRegimeHistoryConfig,
): Promise<TSnapshot | null> {
  validateConfig(config);

  const redis =
    getRedisClient(
      config.errorPrefix,
    );

  const snapshot =
    await redis.lindex(
      config.key,
      -1,
    );

  return snapshot as
    | TSnapshot
    | null;
}

/**
 * Snapshot immediately preceding
 * the latest snapshot.
 */
export async function getPreviousMarketRegimeSnapshot<
  TSnapshot extends MarketRegimeHistorySnapshot,
>(
  config: MarketRegimeHistoryConfig,
): Promise<TSnapshot | null> {
  validateConfig(config);

  const redis =
    getRedisClient(
      config.errorPrefix,
    );

  const snapshot =
    await redis.lindex(
      config.key,
      -2,
    );

  return snapshot as
    | TSnapshot
    | null;
}

/**
 * Full bounded history,
 * ordered oldest -> newest.
 */
export async function getMarketRegimeHistory<
  TSnapshot extends MarketRegimeHistorySnapshot,
>(
  config: MarketRegimeHistoryConfig,
): Promise<readonly TSnapshot[]> {
  validateConfig(config);

  const redis =
    getRedisClient(
      config.errorPrefix,
    );

  const history =
    await redis.lrange(
      config.key,
      0,
      -1,
    );

  return history as unknown as
    TSnapshot[];
}

/**
 * Number of retained snapshots.
 */
export async function getMarketRegimeHistoryCount(
  config: MarketRegimeHistoryConfig,
): Promise<number> {
  validateConfig(config);

  const redis =
    getRedisClient(
      config.errorPrefix,
    );

  return redis.llen(
    config.key,
  );
}

/**
 * Clear persistent history.
 *
 * Intended for maintenance/testing only.
 */
export async function clearMarketRegimeHistory(
  config: MarketRegimeHistoryConfig,
): Promise<void> {
  validateConfig(config);

  const redis =
    getRedisClient(
      config.errorPrefix,
    );

  await redis.del(
    config.key,
  );
}