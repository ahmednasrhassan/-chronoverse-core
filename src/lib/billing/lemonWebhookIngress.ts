import "server-only";

import { createHash } from "node:crypto";

import { createSupabaseAdminClientV1 } from "../auth/supabase/admin";
import {
  processVerifiedLemonWebhookV1,
  type LemonWebhookProcessingResultV1,
  type VerifiedLemonWebhookProcessingInputV1,
} from "./lemonSubscriptionWebhook";
import { verifyLemonWebhookSignatureV1 } from "./lemonWebhookSignature";

const LEMON_WEBHOOK_RECEIPT_RPC_V1 = "ingest_lemon_webhook_receipt_v1";
const LEMON_UPSTREAM_TIMESTAMP_V1 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface LemonWebhookEnvelopeV1 {
  readonly eventName: string;
  readonly customData?: unknown;
  readonly objectType: string;
  readonly objectId: string;
  readonly storeId: string;
  readonly testMode: boolean;
  readonly upstreamEventAt: string;
}

export interface LemonWebhookReceiptInputV1 {
  readonly storeId: string;
  readonly testMode: boolean;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly payloadSha256: string;
  readonly upstreamObjectType: string;
  readonly upstreamObjectId: string;
  readonly upstreamEventAt: string;
}

export type LemonWebhookReceiptInsertResultV1 = "inserted" | "duplicate";

export interface LemonWebhookIngressDependenciesV1 {
  readonly getWebhookSecret: () => string | null | undefined;
  readonly persistReceipt: (
    receipt: LemonWebhookReceiptInputV1,
  ) => Promise<LemonWebhookReceiptInsertResultV1>;
  readonly processVerifiedEvent: (
    input: VerifiedLemonWebhookProcessingInputV1,
  ) => Promise<LemonWebhookProcessingResultV1>;
}

const PRODUCTION_DEPENDENCIES_V1: LemonWebhookIngressDependenciesV1 =
  Object.freeze({
    getWebhookSecret: () => process.env.LEMON_SQUEEZY_WEBHOOK_SECRET,
    persistReceipt: persistLemonWebhookReceiptV1,
    processVerifiedEvent: processVerifiedLemonWebhookV1,
  });

/**
 * Authenticates raw bytes, records the receipt, then processes only the
 * already-verified in-memory event.
 */
export async function handleLemonWebhookIngressV1(
  request: Request,
  dependencies: LemonWebhookIngressDependenciesV1 = PRODUCTION_DEPENDENCIES_V1,
): Promise<Response> {
  let rawBody: Uint8Array;

  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
  } catch {
    return failureResponse("invalid-request", 400);
  }

  const signature = request.headers.get("X-Signature");
  let secret: string | null | undefined;

  try {
    secret = dependencies.getWebhookSecret();
  } catch {
    return failureResponse("configuration-unavailable", 500);
  }

  const verification = verifyLemonWebhookSignatureV1({
    rawBody,
    signature,
    secret,
  });

  if (!verification.ok) {
    if (
      verification.error === "missing-secret"
      || verification.error === "invalid-configuration"
    ) {
      return failureResponse("configuration-unavailable", 500);
    }

    return failureResponse("invalid-signature", 401);
  }

  const parsedBody = parseJsonBodyV1(rawBody);

  if (!parsedBody.ok) {
    return failureResponse("invalid-json", 400);
  }

  const parsedEnvelope = parseLemonWebhookEnvelopeV1(parsedBody.value);

  if (!parsedEnvelope.ok) {
    return failureResponse("invalid-event-envelope", 400);
  }

  const envelope = parsedEnvelope.value;
  const idempotencyKey = deriveLemonWebhookIdempotencyKeyV1(envelope);
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");

  try {
    await dependencies.persistReceipt(Object.freeze({
      storeId: envelope.storeId,
      testMode: envelope.testMode,
      eventType: envelope.eventName,
      idempotencyKey,
      payloadSha256,
      upstreamObjectType: envelope.objectType,
      upstreamObjectId: envelope.objectId,
      upstreamEventAt: envelope.upstreamEventAt,
    }));

    const processingResult = await dependencies.processVerifiedEvent(
      Object.freeze({
        payload: parsedBody.value,
        eventName: envelope.eventName,
        objectType: envelope.objectType,
        objectId: envelope.objectId,
        storeId: envelope.storeId,
        testMode: envelope.testMode,
        upstreamEventAt: envelope.upstreamEventAt,
        idempotencyKey,
      }),
    );

    return Response.json({
      ok: true,
      status: processingResult,
    });
  } catch {
    return failureResponse("persistence-unavailable", 500);
  }
}

export function deriveLemonWebhookIdempotencyKeyV1(
  envelope: LemonWebhookEnvelopeV1,
): string {
  return `lemon-object-version-v1:${JSON.stringify([
    envelope.eventName,
    envelope.objectType,
    envelope.objectId,
    envelope.upstreamEventAt,
  ])}`;
}

export async function persistLemonWebhookReceiptV1(
  receipt: LemonWebhookReceiptInputV1,
): Promise<LemonWebhookReceiptInsertResultV1> {
  const client = createSupabaseAdminClientV1();
  const { data, error } = await client.rpc(LEMON_WEBHOOK_RECEIPT_RPC_V1, {
    store_id: receipt.storeId,
    test_mode: receipt.testMode,
    event_type: receipt.eventType,
    idempotency_key: receipt.idempotencyKey,
    payload_sha256: receipt.payloadSha256,
    upstream_object_type: receipt.upstreamObjectType,
    upstream_object_id: receipt.upstreamObjectId,
    upstream_event_at: receipt.upstreamEventAt,
  });

  if (error || typeof data !== "boolean") {
    throw new LemonWebhookReceiptPersistenceErrorV1();
  }

  return data ? "inserted" : "duplicate";
}

class LemonWebhookReceiptPersistenceErrorV1 extends Error {
  constructor() {
    super("Webhook receipt persistence is unavailable.");
    this.name = "LemonWebhookReceiptPersistenceErrorV1";
  }
}

type JsonParseResultV1 =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false }>;

function parseJsonBodyV1(rawBody: Uint8Array): JsonParseResultV1 {
  try {
    return Object.freeze({
      ok: true,
      value: JSON.parse(Buffer.from(rawBody).toString("utf8")) as unknown,
    });
  } catch {
    return Object.freeze({ ok: false });
  }
}

type EnvelopeParseResultV1 =
  | Readonly<{ ok: true; value: LemonWebhookEnvelopeV1 }>
  | Readonly<{ ok: false }>;

function parseLemonWebhookEnvelopeV1(
  payload: unknown,
): EnvelopeParseResultV1 {
  if (!isRecord(payload) || !isRecord(payload.meta) || !isRecord(payload.data)) {
    return Object.freeze({ ok: false });
  }

  const { meta, data } = payload;

  if (!isRecord(data.attributes)) {
    return Object.freeze({ ok: false });
  }

  const eventName = nonBlankString(meta.event_name);
  const objectType = nonBlankString(data.type);
  const objectId = nonBlankString(data.id);
  const storeId = lemonStoreId(data.attributes.store_id);
  const testMode = data.attributes.test_mode;
  const upstreamEventAt = isoTimestamp(data.attributes.updated_at);

  if (
    eventName === null
    || objectType === null
    || objectId === null
    || storeId === null
    || typeof testMode !== "boolean"
    || upstreamEventAt === null
  ) {
    return Object.freeze({ ok: false });
  }

  const envelope: LemonWebhookEnvelopeV1 = hasOwn(meta, "custom_data") ? {
    eventName,
    customData: meta.custom_data,
    objectType,
    objectId,
    storeId,
    testMode,
    upstreamEventAt,
  } : {
    eventName,
    objectType,
    objectId,
    storeId,
    testMode,
    upstreamEventAt,
  };

  return Object.freeze({
    ok: true,
    value: Object.freeze(envelope),
  });
}

function nonBlankString(value: unknown): string | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
  ) {
    return null;
  }

  return value;
}

function lemonStoreId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    return value;
  }

  return null;
}

function isoTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string"
    || !LEMON_UPSTREAM_TIMESTAMP_V1.test(value)
  ) {
    return null;
  }

  return value.length > 0 && !Number.isNaN(Date.parse(value)) ? value : null;
}

function failureResponse(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
