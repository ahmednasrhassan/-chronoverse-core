import "server-only";

import { Redis, errors } from "@upstash/redis";

import {
  EurostatMacroVintagesRedisReaderErrorV1,
  createEurostatMacroVintagesRedisReaderV1,
  type EurostatMacroVintagesRedisReadResultV1,
  type ReadRedisSortedSetWithScoresV1,
} from "./eurostatMacroVintagesRedisReader";

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (redisClient !== null) return redisClient;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new EurostatMacroVintagesRedisReaderErrorV1("configuration-failure");
  }
  try {
    redisClient = new Redis({ url, token, automaticDeserialization: false });
  } catch (error) {
    if (error instanceof errors.UrlError) {
      throw new EurostatMacroVintagesRedisReaderErrorV1("configuration-failure");
    }
    throw error;
  }
  return redisClient;
}

const readSortedSet: ReadRedisSortedSetWithScoresV1 = async (key) => {
  const redis = getRedisClient();
  try {
    return await redis.zrange<unknown[]>(key, 0, -1, { withScores: true });
  } catch (error) {
    if (error instanceof errors.UpstashError || isNetworkFailure(error)) {
      throw new EurostatMacroVintagesRedisReaderErrorV1("redis-failure");
    }
    throw error;
  }
};

/** Explicit future read entry; importing this module performs no Redis I/O. */
export function readEurostatMacroVintagesRedisV1(): Promise<
  EurostatMacroVintagesRedisReadResultV1
> {
  return createEurostatMacroVintagesRedisReaderV1(readSortedSet).read();
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = "code" in error ? error : error.cause;
  if (typeof candidate !== "object" || candidate === null ||
      !("code" in candidate) || typeof candidate.code !== "string") {
    return false;
  }
  return [
    "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN",
    "ENOTFOUND", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT",
  ].includes(candidate.code);
}
