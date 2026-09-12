import "server-only";

import { createSupabaseAdminClientV1 } from "../auth/supabase/admin";
import { parseUntrustedLemonCommercialIdentityV1 } from "./commercialIdentity";
import {
  processVerifiedLemonSubscriptionRefundV1,
} from "./lemonSubscriptionRefund";

export const LEMON_SUBSCRIPTION_WEBHOOK_EVENTS_V1 = [
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_plan_changed",
] as const;

export const LEMON_SUBSCRIPTION_INVOICE_WEBHOOK_EVENTS_V1 = [
  "subscription_payment_failed",
  "subscription_payment_success",
  "subscription_payment_recovered",
  "subscription_payment_refunded",
] as const;

const PROCESS_LEMON_SUBSCRIPTION_WEBHOOK_RPC_V1 =
  "process_lemon_subscription_webhook_v1";
const EXPLICIT_ISO_TIMESTAMP_V1 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

type LemonSubscriptionWebhookEventV1 =
  (typeof LEMON_SUBSCRIPTION_WEBHOOK_EVENTS_V1)[number];
type LemonCustomDataStateV1 = "absent" | "valid" | "invalid";

export interface LemonSubscriptionWebhookFactsV1 {
  readonly lemonSubscriptionId: string;
  readonly lemonCustomerId: string;
  readonly lemonOrderId: string;
  readonly lemonOrderItemId: string;
  readonly lemonProductId: string;
  readonly lemonVariantId: string;
  readonly lemonSubscriptionItemId: string | null;
  readonly lemonPriceId: string | null;
  readonly quantity: number | null;
  readonly rawStatus: string;
  readonly cancelled: boolean;
  readonly pauseMode: "free" | "void" | null;
  readonly pauseResumesAt: string | null;
  readonly trialEndsAt: string | null;
  readonly billingAnchor: number | null;
  readonly renewsAt: string | null;
  readonly endsAt: string | null;
  readonly upstreamCreatedAt: string;
  readonly upstreamUpdatedAt: string;
}

export interface VerifiedLemonWebhookProcessingInputV1 {
  readonly payload: unknown;
  readonly eventName: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly storeId: string;
  readonly testMode: boolean;
  readonly upstreamEventAt: string;
  readonly idempotencyKey: string;
}

export type ParsedVerifiedLemonWebhookV1 =
  | Readonly<{
    kind: "subscription";
    eventName: LemonSubscriptionWebhookEventV1;
    customDataState: LemonCustomDataStateV1;
    chronoverseUserId: string | null;
    facts: LemonSubscriptionWebhookFactsV1;
  }>
  | Readonly<{ kind: "invalid-subscription" }>
  | Readonly<{ kind: "ignored"; reason: "unsupported-event" }>;

export type LemonWebhookProcessingResultV1 =
  | "processed"
  | "ignored"
  | "duplicate";

/** Parses only already-signature-verified in-memory webhook data. */
export function parseVerifiedLemonSubscriptionWebhookV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): ParsedVerifiedLemonWebhookV1 {
  if (
    !isSubscriptionWebhookEventV1(input.eventName)
    || input.objectType !== "subscriptions"
  ) {
    return Object.freeze({ kind: "ignored", reason: "unsupported-event" });
  }

  const facts = parseSubscriptionFactsV1(input);

  if (facts === null || !isRecord(input.payload)) {
    return Object.freeze({ kind: "invalid-subscription" });
  }

  const parsedIdentity = parseUntrustedLemonCommercialIdentityV1(
    input.payload.meta,
  );

  if (parsedIdentity.ok) {
    return Object.freeze({
      kind: "subscription",
      eventName: input.eventName,
      customDataState: "valid",
      chronoverseUserId: parsedIdentity.chronoverseUserId,
      facts,
    });
  }

  return Object.freeze({
    kind: "subscription",
    eventName: input.eventName,
    customDataState: parsedIdentity.error === "custom-data-missing"
      ? "absent"
      : "invalid",
    chronoverseUserId: null,
    facts,
  });
}

/** Finalizes or applies one verified receipt through the trusted public RPC. */
export async function processVerifiedLemonWebhookV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): Promise<LemonWebhookProcessingResultV1> {
  if (input.eventName === "subscription_payment_refunded") {
    return processVerifiedLemonSubscriptionRefundV1(input);
  }

  const parsed = parseVerifiedLemonSubscriptionWebhookV1(input);
  const client = createSupabaseAdminClientV1();
  const { data, error } = await client.rpc(
    PROCESS_LEMON_SUBSCRIPTION_WEBHOOK_RPC_V1,
    processingRpcArgumentsV1(input, parsed),
  );

  if (error || typeof data !== "string") {
    throw new LemonSubscriptionWebhookPersistenceErrorV1();
  }

  if (data === "processed" || data === "ignored" || data === "duplicate") {
    return data;
  }

  if (data === "failed") {
    return "ignored";
  }

  throw new LemonSubscriptionWebhookPersistenceErrorV1();
}

class LemonSubscriptionWebhookPersistenceErrorV1 extends Error {
  constructor() {
    super("Webhook processing is unavailable.");
    this.name = "LemonSubscriptionWebhookPersistenceErrorV1";
  }
}

function processingRpcArgumentsV1(
  input: VerifiedLemonWebhookProcessingInputV1,
  parsed: ParsedVerifiedLemonWebhookV1,
): Record<string, unknown> {
  const common = {
    p_store_id: input.storeId,
    p_test_mode: input.testMode,
    p_idempotency_key: input.idempotencyKey,
  };

  if (parsed.kind !== "subscription") {
    return {
      ...common,
      p_payload_valid: parsed.kind !== "invalid-subscription",
      p_custom_data_state: "absent",
      p_chronoverse_user_id: null,
      p_lemon_subscription_id: null,
      p_lemon_customer_id: null,
      p_lemon_order_id: null,
      p_lemon_order_item_id: null,
      p_lemon_product_id: null,
      p_lemon_variant_id: null,
      p_lemon_subscription_item_id: null,
      p_lemon_price_id: null,
      p_quantity: null,
      p_raw_status: null,
      p_cancelled: null,
      p_pause_mode: null,
      p_pause_resumes_at: null,
      p_trial_ends_at: null,
      p_billing_anchor: null,
      p_renews_at: null,
      p_ends_at: null,
      p_upstream_created_at: null,
      p_upstream_updated_at: null,
    };
  }

  return {
    ...common,
    p_payload_valid: true,
    p_custom_data_state: parsed.customDataState,
    p_chronoverse_user_id: parsed.chronoverseUserId,
    p_lemon_subscription_id: parsed.facts.lemonSubscriptionId,
    p_lemon_customer_id: parsed.facts.lemonCustomerId,
    p_lemon_order_id: parsed.facts.lemonOrderId,
    p_lemon_order_item_id: parsed.facts.lemonOrderItemId,
    p_lemon_product_id: parsed.facts.lemonProductId,
    p_lemon_variant_id: parsed.facts.lemonVariantId,
    p_lemon_subscription_item_id: parsed.facts.lemonSubscriptionItemId,
    p_lemon_price_id: parsed.facts.lemonPriceId,
    p_quantity: parsed.facts.quantity,
    p_raw_status: parsed.facts.rawStatus,
    p_cancelled: parsed.facts.cancelled,
    p_pause_mode: parsed.facts.pauseMode,
    p_pause_resumes_at: parsed.facts.pauseResumesAt,
    p_trial_ends_at: parsed.facts.trialEndsAt,
    p_billing_anchor: parsed.facts.billingAnchor,
    p_renews_at: parsed.facts.renewsAt,
    p_ends_at: parsed.facts.endsAt,
    p_upstream_created_at: parsed.facts.upstreamCreatedAt,
    p_upstream_updated_at: parsed.facts.upstreamUpdatedAt,
  };
}

function parseSubscriptionFactsV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): LemonSubscriptionWebhookFactsV1 | null {
  if (
    !isRecord(input.payload)
    || !isRecord(input.payload.meta)
    || !isRecord(input.payload.data)
  ) {
    return null;
  }

  const { meta, data } = input.payload;

  if (!isRecord(data.attributes)) {
    return null;
  }

  const attributes = data.attributes;
  const storeId = vendorIdV1(attributes.store_id);
  const subscriptionId = vendorIdV1(data.id);
  const customerId = vendorIdV1(attributes.customer_id);
  const orderId = vendorIdV1(attributes.order_id);
  const orderItemId = vendorIdV1(attributes.order_item_id);
  const productId = vendorIdV1(attributes.product_id);
  const variantId = vendorIdV1(attributes.variant_id);
  const rawStatus = nonBlankStringV1(attributes.status);
  const createdAt = requiredTimestampV1(attributes.created_at);
  const updatedAt = requiredTimestampV1(attributes.updated_at);
  const pause = pauseFactsV1(attributes.pause);
  const item = subscriptionItemFactsV1(attributes.first_subscription_item);
  const trialEndsAt = optionalTimestampV1(attributes.trial_ends_at);
  const renewsAt = optionalTimestampV1(attributes.renews_at);
  const endsAt = optionalTimestampV1(attributes.ends_at);
  const billingAnchor = billingAnchorV1(attributes.billing_anchor);

  if (
    meta.event_name !== input.eventName
    || data.type !== "subscriptions"
    || storeId === null
    || subscriptionId === null
    || customerId === null
    || orderId === null
    || orderItemId === null
    || productId === null
    || variantId === null
    || rawStatus === null
    || createdAt === null
    || updatedAt === null
    || pause === null
    || item === null
    || trialEndsAt === null
    || renewsAt === null
    || endsAt === null
    || billingAnchor === undefined
    || typeof attributes.cancelled !== "boolean"
    || typeof attributes.test_mode !== "boolean"
    || storeId !== input.storeId
    || subscriptionId !== input.objectId
    || attributes.test_mode !== input.testMode
    || updatedAt !== input.upstreamEventAt
    || Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    return null;
  }

  return Object.freeze({
    lemonSubscriptionId: subscriptionId,
    lemonCustomerId: customerId,
    lemonOrderId: orderId,
    lemonOrderItemId: orderItemId,
    lemonProductId: productId,
    lemonVariantId: variantId,
    lemonSubscriptionItemId: item.subscriptionItemId,
    lemonPriceId: item.priceId,
    quantity: item.quantity,
    rawStatus,
    cancelled: attributes.cancelled,
    pauseMode: pause.mode,
    pauseResumesAt: pause.resumesAt,
    trialEndsAt: trialEndsAt.value,
    billingAnchor,
    renewsAt: renewsAt.value,
    endsAt: endsAt.value,
    upstreamCreatedAt: createdAt,
    upstreamUpdatedAt: updatedAt,
  });
}

function isSubscriptionWebhookEventV1(
  eventName: string,
): eventName is LemonSubscriptionWebhookEventV1 {
  return (LEMON_SUBSCRIPTION_WEBHOOK_EVENTS_V1 as readonly string[])
    .includes(eventName);
}

function vendorIdV1(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  return typeof value === "string" && /^[1-9][0-9]*$/.test(value)
    ? value
    : null;
}

function nonBlankStringV1(value: unknown): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
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

type OptionalTimestampResultV1 =
  | Readonly<{ ok: true; value: string | null }>
  | null;

function optionalTimestampV1(value: unknown): OptionalTimestampResultV1 {
  if (value === null) {
    return Object.freeze({ ok: true, value: null });
  }

  const timestamp = requiredTimestampV1(value);
  return timestamp === null
    ? null
    : Object.freeze({ ok: true, value: timestamp });
}

interface PauseFactsV1 {
  readonly mode: "free" | "void" | null;
  readonly resumesAt: string | null;
}

function pauseFactsV1(value: unknown): PauseFactsV1 | null {
  if (value === null) {
    return Object.freeze({ mode: null, resumesAt: null });
  }

  if (!isRecord(value) || (value.mode !== "free" && value.mode !== "void")) {
    return null;
  }

  const resumesAt = optionalTimestampV1(value.resumes_at);
  return resumesAt === null
    ? null
    : Object.freeze({ mode: value.mode, resumesAt: resumesAt.value });
}

interface SubscriptionItemFactsV1 {
  readonly subscriptionItemId: string | null;
  readonly priceId: string | null;
  readonly quantity: number | null;
}

function subscriptionItemFactsV1(
  value: unknown,
): SubscriptionItemFactsV1 | null {
  if (value === null) {
    return Object.freeze({
      subscriptionItemId: null,
      priceId: null,
      quantity: null,
    });
  }

  if (!isRecord(value)) {
    return null;
  }

  const subscriptionItemId = vendorIdV1(value.id);
  const priceId = vendorIdV1(value.price_id);
  const quantity = value.quantity;

  if (
    subscriptionItemId === null
    || priceId === null
    || typeof quantity !== "number"
    || !Number.isSafeInteger(quantity)
    || quantity < 0
  ) {
    return null;
  }

  return Object.freeze({ subscriptionItemId, priceId, quantity });
}

function billingAnchorV1(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= 31
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
