import "server-only";

import { createSupabaseAdminClientV1 } from "../auth/supabase/admin";
import type {
  LemonWebhookProcessingResultV1,
  VerifiedLemonWebhookProcessingInputV1,
} from "./lemonSubscriptionWebhook";

const PAYMENT_EVENTS = [
  "subscription_payment_failed",
  "subscription_payment_success",
  "subscription_payment_recovered",
] as const;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface LemonPaymentFactsV1 {
  readonly invoiceId: string;
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly eventName: (typeof PAYMENT_EVENTS)[number];
  readonly invoiceUpdatedAt: string;
  readonly invoiceCreatedAt: string;
  readonly paymentIssue: boolean;
}

export function parseVerifiedLemonPaymentV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): LemonPaymentFactsV1 | null {
  if (!PAYMENT_EVENTS.includes(input.eventName as LemonPaymentFactsV1["eventName"])
    || input.objectType !== "subscription-invoices"
    || !isRecord(input.payload)
    || !isRecord(input.payload.meta)
    || !isRecord(input.payload.data)
    || !isRecord(input.payload.data.attributes)) return null;

  const { meta, data } = input.payload;
  const attributes = data.attributes as Record<string, unknown>;
  const invoiceId = vendorId(data.id);
  const storeId = vendorId(attributes.store_id);
  const subscriptionId = vendorId(attributes.subscription_id);
  const customerId = vendorId(attributes.customer_id);
  const createdAt = timestamp(attributes.created_at);
  const updatedAt = timestamp(attributes.updated_at);
  const paymentIssue = input.eventName === "subscription_payment_failed";

  if (meta.event_name !== input.eventName
    || data.type !== "subscription-invoices"
    || invoiceId === null || storeId === null
    || subscriptionId === null || customerId === null
    || createdAt === null || updatedAt === null
    || invoiceId !== input.objectId
    || storeId !== input.storeId
    || attributes.test_mode !== input.testMode
    || updatedAt !== input.upstreamEventAt
    || Date.parse(createdAt) > Date.parse(updatedAt)
    || (paymentIssue && attributes.status !== "pending"
      && attributes.status !== "void")
    || (!paymentIssue && attributes.status !== "paid")
    || attributes.refunded === true) return null;

  return Object.freeze({
    invoiceId,
    subscriptionId,
    customerId,
    eventName: input.eventName as LemonPaymentFactsV1["eventName"],
    invoiceCreatedAt: createdAt,
    invoiceUpdatedAt: updatedAt,
    paymentIssue,
  });
}

export async function processVerifiedLemonPaymentV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): Promise<LemonWebhookProcessingResultV1> {
  const facts = parseVerifiedLemonPaymentV1(input);
  const client = createSupabaseAdminClientV1();
  const { data, error } = await client.rpc("process_lemon_payment_lifecycle_v1", {
    p_store_id: input.storeId,
    p_test_mode: input.testMode,
    p_idempotency_key: input.idempotencyKey,
    p_payload_valid: facts !== null,
    p_invoice_id: facts?.invoiceId ?? null,
    p_subscription_id: facts?.subscriptionId ?? null,
    p_customer_id: facts?.customerId ?? null,
    p_event_name: facts?.eventName ?? null,
    p_payment_issue: facts?.paymentIssue ?? null,
    p_invoice_created_at: facts?.invoiceCreatedAt ?? null,
    p_invoice_updated_at: facts?.invoiceUpdatedAt ?? null,
  });

  if (error || typeof data !== "string") {
    throw new Error("Payment evidence persistence is unavailable.");
  }
  if (data === "processed" || data === "ignored" || data === "duplicate") {
    return data;
  }
  if (data === "failed") return "ignored";
  throw new Error("Payment evidence persistence is unavailable.");
}

function vendorId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value)
    ? value : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && TIMESTAMP.test(value)
    && Number.isFinite(Date.parse(value)) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
