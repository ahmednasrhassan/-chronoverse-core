import "server-only";

import { Redis } from "@upstash/redis";

const COMPLETED_TTL_SECONDS = 7 * 24 * 60 * 60;

export class SanityWebhookReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SanityWebhookReplayError";
  }
}

export interface SanityWebhookLease {
  complete(): Promise<void>;
  release(): Promise<void>;
}

export async function beginSanityWebhookOperation(
  scope: "blogger-images" | "publish",
  idempotencyKey: string,
): Promise<SanityWebhookLease | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new SanityWebhookReplayError("Webhook replay protection is not configured");
  }

  const redis = new Redis({ url, token });
  const key = `sanity-webhook:${scope}:${idempotencyKey}`;
  const claimed = await redis.set(key, "processing", {
    nx: true,
    ex: COMPLETED_TTL_SECONDS,
  });

  if (claimed !== "OK") return null;

  return {
    async complete() {
      await redis.set(key, "complete", { ex: COMPLETED_TTL_SECONDS });
    },
    async release() {
      await redis.del(key);
    },
  };
}
