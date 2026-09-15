import "server-only";

import { createSupabaseAdminClientV1 } from "../auth/supabase/admin";
import {
  LEMON_SUBSCRIPTION_WEBHOOK_EVENTS_V1,
  LEMON_SUBSCRIPTION_INVOICE_WEBHOOK_EVENTS_V1,
  type VerifiedLemonWebhookProcessingInputV1,
} from "./lemonSubscriptionWebhook";
import {
  getVipCommercialConfigV1,
  type VipCommercialConfigV1,
} from "./vipCommercialConfig";

const RESOLVE_LEMON_SUBSCRIPTION_SCOPE_RPC_V1 =
  "resolve_lemon_subscription_scope_v1";

export type LemonWebhookProductionScopeResultV1 =
  | "in-scope"
  | "out-of-scope"
  | "not-applicable";

export type LemonWebhookProductionScopeErrorCodeV1 =
  | "configuration-unavailable"
  | "scope-lookup-unavailable";

export class LemonWebhookProductionScopeErrorV1 extends Error {
  readonly code: LemonWebhookProductionScopeErrorCodeV1;

  constructor(code: LemonWebhookProductionScopeErrorCodeV1) {
    super("Webhook production scope could not be resolved.");
    this.name = "LemonWebhookProductionScopeErrorV1";
    this.code = code;
  }
}

export interface LemonWebhookProductionScopeDependenciesV1 {
  readonly getCommercialConfig: () => VipCommercialConfigV1;
  readonly loadSubscriptionScope: (
    storeId: string,
    testMode: boolean,
    subscriptionId: string,
  ) => Promise<unknown>;
}

const PRODUCTION_DEPENDENCIES_V1:
  LemonWebhookProductionScopeDependenciesV1 = Object.freeze({
    getCommercialConfig: getVipCommercialConfigV1,
    loadSubscriptionScope: loadLemonSubscriptionScopeV1,
  });

/** Classifies only already-signature-verified commercial mutation events. */
export async function classifyVerifiedLemonProductionScopeV1(
  input: VerifiedLemonWebhookProcessingInputV1,
  dependencies: LemonWebhookProductionScopeDependenciesV1 =
    PRODUCTION_DEPENDENCIES_V1,
): Promise<LemonWebhookProductionScopeResultV1> {
  const isSubscription = (
    LEMON_SUBSCRIPTION_WEBHOOK_EVENTS_V1 as readonly string[]
  ).includes(input.eventName);
  const isInvoice = (
    LEMON_SUBSCRIPTION_INVOICE_WEBHOOK_EVENTS_V1 as readonly string[]
  ).includes(input.eventName);

  if (!isSubscription && !isInvoice) return "not-applicable";

  const config = commercialConfigV1(dependencies);

  if (input.storeId !== config.storeId || input.testMode !== false) {
    return "out-of-scope";
  }

  if (isSubscription) {
    return subscriptionScopeV1(input, config);
  }

  return invoiceScopeV1(input, config, dependencies);
}

export async function loadLemonSubscriptionScopeV1(
  storeId: string,
  testMode: boolean,
  subscriptionId: string,
): Promise<unknown> {
  if (!isVendorIdV1(storeId) || !isVendorIdV1(subscriptionId)) {
    throw new LemonWebhookProductionScopeErrorV1(
      "scope-lookup-unavailable",
    );
  }

  const client = createSupabaseAdminClientV1();
  const result = await client.rpc(RESOLVE_LEMON_SUBSCRIPTION_SCOPE_RPC_V1, {
    p_store_id: storeId,
    p_test_mode: testMode,
    p_subscription_id: subscriptionId,
  });

  if (result.error) {
    throw new LemonWebhookProductionScopeErrorV1(
      "scope-lookup-unavailable",
    );
  }

  return result.data;
}

function subscriptionScopeV1(
  input: VerifiedLemonWebhookProcessingInputV1,
  config: VipCommercialConfigV1,
): LemonWebhookProductionScopeResultV1 {
  const attributes = payloadAttributesV1(input);

  if (input.objectType !== "subscriptions" || attributes === null) {
    return "out-of-scope";
  }

  const productId = vendorIdV1(attributes.product_id);
  const variantId = vendorIdV1(attributes.variant_id);

  return productId === config.productId && variantId !== null &&
      config.variantIds.includes(variantId)
    ? "in-scope"
    : "out-of-scope";
}

async function invoiceScopeV1(
  input: VerifiedLemonWebhookProcessingInputV1,
  config: VipCommercialConfigV1,
  dependencies: LemonWebhookProductionScopeDependenciesV1,
): Promise<LemonWebhookProductionScopeResultV1> {
  const attributes = payloadAttributesV1(input);

  if (input.objectType !== "subscription-invoices" || attributes === null) {
    return "out-of-scope";
  }

  const subscriptionId = vendorIdV1(attributes.subscription_id);

  if (subscriptionId === null) return "out-of-scope";

  let rows: unknown;

  try {
    rows = await dependencies.loadSubscriptionScope(
      input.storeId,
      input.testMode,
      subscriptionId,
    );
  } catch (error) {
    if (error instanceof LemonWebhookProductionScopeErrorV1) throw error;
    throw new LemonWebhookProductionScopeErrorV1("scope-lookup-unavailable");
  }

  if (!Array.isArray(rows) || rows.length !== 1) return "out-of-scope";

  const scope = rows[0];

  if (!isRecord(scope)) return "out-of-scope";

  return scope.store_id === input.storeId && scope.test_mode === false &&
      scope.lemon_subscription_id === subscriptionId &&
      scope.product_id === config.productId &&
      typeof scope.variant_id === "string" &&
      config.variantIds.includes(scope.variant_id)
    ? "in-scope"
    : "out-of-scope";
}

function payloadAttributesV1(
  input: VerifiedLemonWebhookProcessingInputV1,
): Record<string, unknown> | null {
  if (!isRecord(input.payload) || !isRecord(input.payload.data) ||
    !isRecord(input.payload.data.attributes)) {
    return null;
  }

  const attributes = input.payload.data.attributes;

  return vendorIdV1(attributes.store_id) === input.storeId &&
      attributes.test_mode === input.testMode
    ? attributes
    : null;
}

function commercialConfigV1(
  dependencies: LemonWebhookProductionScopeDependenciesV1,
): VipCommercialConfigV1 {
  try {
    return dependencies.getCommercialConfig();
  } catch {
    throw new LemonWebhookProductionScopeErrorV1(
      "configuration-unavailable",
    );
  }
}

function vendorIdV1(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }

  return isVendorIdV1(value) ? value : null;
}

function isVendorIdV1(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
