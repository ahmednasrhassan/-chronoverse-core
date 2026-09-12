import "server-only";

import { createSupabaseAdminClientV1 } from "../auth/supabase/admin";
import type {
  LemonWebhookProcessingResultV1,
  VerifiedLemonWebhookProcessingInputV1,
} from "./lemonSubscriptionWebhook";

const PROCESS_LEMON_SUBSCRIPTION_REFUND_RPC_V1 =
  "process_lemon_subscription_refund_v1";
const EXPLICIT_ISO_TIMESTAMP_V1 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type LemonSubscriptionRefundStatusV1 =
  | "refunded"
  | "partial_refund";

export interface LemonSubscriptionRefundFactsV1 {
  readonly invoiceId: string;
  readonly lemonSubscriptionId: string;
  readonly lemonCustomerId: string;
  readonly refundStatus: LemonSubscriptionRefundStatusV1;
  readonly refunded: true;
  readonly refundedAt: string;
  readonly refundedAmount: number;
  readonly invoiceCreatedAt: string;
  readonly invoiceUpdatedAt: string;
}

export type ParsedVerifiedLemonSubscriptionRefundV1 =
  | Readonly<{
    kind: "subscription-refund";
    facts: LemonSubscriptionRefundFactsV1;
  }>
  | Readonly<{ kind: "invalid-subscription-refund" }>;

/** Parses only an already-signature-verified Subscription Invoice refund. */
export function parseVerifiedLemonSubscriptionRefundV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): ParsedVerifiedLemonSubscriptionRefundV1 {
  const payload = input.payload;

  if (
    input.eventName !== "subscription_payment_refunded"
    || input.objectType !== "subscription-invoices"
    || !isRecord(payload)
  ) {
    return invalidRefundV1();
  }

  const { meta, data } = payload;

  if (!isRecord(meta) || !isRecord(data) || !isRecord(data.attributes)) {
    return invalidRefundV1();
  }

  const attributes = data.attributes;
  const invoiceId = vendorIdV1(data.id);
  const storeId = vendorIdV1(attributes.store_id);
  const subscriptionId = vendorIdV1(attributes.subscription_id);
  const customerId = vendorIdV1(attributes.customer_id);
  const status = refundStatusV1(attributes.status);
  const refundedAt = requiredTimestampV1(attributes.refunded_at);
  const createdAt = requiredTimestampV1(attributes.created_at);
  const updatedAt = requiredTimestampV1(attributes.updated_at);
  const refundedAmount = nonNegativeIntegerV1(attributes.refunded_amount);

  if (
    meta.event_name !== input.eventName
    || data.type !== "subscription-invoices"
    || invoiceId === null
    || storeId === null
    || subscriptionId === null
    || customerId === null
    || status === null
    || attributes.refunded !== true
    || refundedAt === null
    || refundedAmount === null
    || createdAt === null
    || updatedAt === null
    || typeof attributes.test_mode !== "boolean"
    || invoiceId !== input.objectId
    || storeId !== input.storeId
    || attributes.test_mode !== input.testMode
    || updatedAt !== input.upstreamEventAt
    || Date.parse(createdAt) > Date.parse(updatedAt)
    || Date.parse(refundedAt) > Date.parse(updatedAt)
  ) {
    return invalidRefundV1();
  }

  return Object.freeze({
    kind: "subscription-refund",
    facts: Object.freeze({
      invoiceId,
      lemonSubscriptionId: subscriptionId,
      lemonCustomerId: customerId,
      refundStatus: status,
      refunded: true,
      refundedAt,
      refundedAmount,
      invoiceCreatedAt: createdAt,
      invoiceUpdatedAt: updatedAt,
    }),
  });
}

/** Applies sticky refund evidence through its dedicated trusted RPC. */
export async function processVerifiedLemonSubscriptionRefundV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): Promise<LemonWebhookProcessingResultV1> {
  const parsed = parseVerifiedLemonSubscriptionRefundV1(input);
  const facts = parsed.kind === "subscription-refund" ? parsed.facts : null;
  const client = createSupabaseAdminClientV1();
  const { data, error } = await client.rpc(
    PROCESS_LEMON_SUBSCRIPTION_REFUND_RPC_V1,
    {
      p_store_id: input.storeId,
      p_test_mode: input.testMode,
      p_idempotency_key: input.idempotencyKey,
      p_payload_valid: facts !== null,
      p_invoice_id: facts?.invoiceId ?? null,
      p_subscription_id: facts?.lemonSubscriptionId ?? null,
      p_customer_id: facts?.lemonCustomerId ?? null,
      p_refund_status: facts?.refundStatus ?? null,
      p_refunded: facts?.refunded ?? null,
      p_refunded_at: facts?.refundedAt ?? null,
      p_refunded_amount: facts?.refundedAmount ?? null,
      p_invoice_created_at: facts?.invoiceCreatedAt ?? null,
      p_invoice_updated_at: facts?.invoiceUpdatedAt ?? null,
    },
  );

  if (error || typeof data !== "string") {
    throw new LemonSubscriptionRefundPersistenceErrorV1();
  }

  if (data === "processed" || data === "ignored" || data === "duplicate") {
    return data;
  }

  if (data === "failed") {
    return "ignored";
  }

  throw new LemonSubscriptionRefundPersistenceErrorV1();
}

class LemonSubscriptionRefundPersistenceErrorV1 extends Error {
  constructor() {
    super("Subscription refund persistence is unavailable.");
    this.name = "LemonSubscriptionRefundPersistenceErrorV1";
  }
}

function invalidRefundV1(): ParsedVerifiedLemonSubscriptionRefundV1 {
  return Object.freeze({ kind: "invalid-subscription-refund" });
}

function vendorIdV1(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  return typeof value === "string" && /^[1-9][0-9]*$/.test(value)
    ? value
    : null;
}

function refundStatusV1(value: unknown): LemonSubscriptionRefundStatusV1 | null {
  return value === "refunded" || value === "partial_refund" ? value : null;
}

function nonNegativeIntegerV1(value: unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    ? value
    : null;
}

function requiredTimestampV1(value: unknown): string | null {
  return typeof value === "string"
    && EXPLICIT_ISO_TIMESTAMP_V1.test(value)
    && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
