import "server-only";

import { timingSafeEqual } from "node:crypto";
import {
  getEcbMonetaryPolicyEventRuntimeV1,
  type EcbMonetaryPolicyEventRuntimeResultV1,
} from "@/lib/markets/services/ecbMonetaryPolicyEventRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_PERSISTENCE_REASONS = new Set([
  "redis-failure", "concurrency-conflict", "event-memory-conflict",
  "invalid-current", "invalid-response", "unexpected-error",
]);

/** Dedicated live execution boundary. Request data never supplies event ownership or time. */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json(503, { status: "execution-unavailable", reason: "cron-secret-unavailable" });

  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return json(401, { status: "unauthorized" });
  }
  if (request.method !== "GET") return HEAD();
  // Next's Node adapter drops GET bodies; preserved framing must also be checked.
  // Accept only one decimal zero value, without numeric coercion or list parsing.
  const contentLength = request.headers.get("content-length");
  if (new URL(request.url).search !== "" || request.body !== null ||
      request.headers.has("transfer-encoding") ||
      (contentLength !== null && !/^0+$/.test(contentLength))) {
    return json(400, { status: "invalid-request" });
  }

  try {
    // The runtime owns its live clock, acquisition and existing Redis CAS semantics.
    // No retries, background dispatch, canonical delivery or caller-supplied inputs.
    return summarize(await getEcbMonetaryPolicyEventRuntimeV1());
  } catch {
    return json(500, { status: "runtime-unavailable", reason: "unexpected-runtime-error" });
  }
}

/** Next otherwise implements HEAD by invoking GET, which would progress live state. */
export function HEAD(): Response {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}

function summarize(result: EcbMonetaryPolicyEventRuntimeResultV1): Response {
  switch (result.status) {
    case "available":
    case "no-relevant-event":
    case "insufficient-as-known-state":
      return json(200, { status: result.status });
    case "reconciliation-required":
      return json(409, { status: result.status, reason: result.reason });
    case "stored-state-invalid":
      return json(409, { status: result.status, owner: result.owner });
    case "persistence-unavailable": {
      const reason = SAFE_PERSISTENCE_REASONS.has(result.reason) ? result.reason : "unexpected-error";
      const conflict = reason === "concurrency-conflict" || reason === "event-memory-conflict";
      return json(conflict ? 409 : 503, { status: result.status, owner: result.owner, reason });
    }
    case "source-unavailable":
      return json(503, { status: result.status });
    case "source-malformed":
      return json(502, { status: result.status });
    default: {
      const unreachable: never = result;
      throw new TypeError(`Unsupported ECB runtime status: ${typeof unreachable}`);
    }
  }
}

function json(status: number, summary: Readonly<Record<string, string>>): Response {
  return Response.json(summary, { status, headers: { "Cache-Control": "no-store" } });
}
