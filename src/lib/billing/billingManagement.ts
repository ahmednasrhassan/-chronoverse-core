import "server-only";

import { resolveAccessV1, type AccessResolverV1 } from "../auth/access";
import { createSupabaseAdminClientV1 } from "../auth/supabase/admin";
import { createSupabaseServerClientV1 } from "../auth/supabase/server";
import type { AccessState, AuthenticatedAccessV1 } from "../auth/types";
import { evaluateCommercialEntitlementV1 } from "./entitlement";
import {
  normalizeSubscriptionLifecycleV1,
  type LemonSubscriptionLifecycleFactsV1,
} from "./lifecycle";
import {
  getVipCommercialConfigV1,
  type VipCommercialConfigV1,
} from "./vipCommercialConfig";

export type BillingPlanLabelV1 =
  | "Monthly"
  | "Annual"
  | "Unknown / unsupported";

export interface BillingSubscriptionSummaryV1 {
  readonly plan: BillingPlanLabelV1;
  readonly providerStatus: string;
  readonly cancelled: boolean;
  readonly renewsAt: string | null;
  readonly endsAt: string | null;
  readonly trialEndsAt: string | null;
  readonly pauseMode: string | null;
  readonly pauseResumesAt: string | null;
  readonly commercialEntitlement: "active" | "inactive" | "unresolved";
}

export type BillingPageStateV1 =
  | Readonly<{ kind: "anonymous" }>
  | Readonly<{
    kind: "authenticated";
    accessState: Exclude<AccessState, "anonymous_free">;
    role: AuthenticatedAccessV1["role"];
    subscription: BillingSubscriptionSummaryV1 | null;
    portalAvailable: boolean;
  }>;

export interface TrustedLemonCustomerV1 {
  readonly userId: string;
  readonly customerId: string;
  readonly storeId: string;
  readonly testMode: false;
}

export type BillingManagementErrorCodeV1 =
  | "commercial-summary-unavailable"
  | "customer-mapping-conflict";

export class BillingManagementErrorV1 extends Error {
  readonly code: BillingManagementErrorCodeV1;

  constructor(code: BillingManagementErrorCodeV1) {
    super("Billing information is currently unavailable.");
    this.name = "BillingManagementErrorV1";
    this.code = code;
  }
}

export interface BillingPageStateDependenciesV1 {
  readonly resolveAccess: AccessResolverV1;
  readonly loadCommercialRows: () => Promise<unknown>;
  readonly loadCustomerRows: (userId: string) => Promise<unknown>;
  readonly getCommercialConfig: () => VipCommercialConfigV1;
  readonly getCurrentTime: () => string;
}

const PRODUCTION_DEPENDENCIES_V1: BillingPageStateDependenciesV1 =
  Object.freeze({
    resolveAccess: resolveAccessV1,
    loadCommercialRows: async () => {
      const supabase = await createSupabaseServerClientV1();
      const result = await supabase.rpc("resolve_my_commercial_access_v1");

      if (result.error) throw result.error;
      return result.data;
    },
    loadCustomerRows: loadPrivateLemonCustomerRowsV1,
    getCommercialConfig: getVipCommercialConfigV1,
    getCurrentTime: () => new Date().toISOString(),
  });

/** Builds a browser-safe summary from caller-bound and private server data. */
export async function loadBillingPageStateV1(
  dependencies: BillingPageStateDependenciesV1 = PRODUCTION_DEPENDENCIES_V1,
): Promise<BillingPageStateV1> {
  const access = await dependencies.resolveAccess();

  if (!access.isAuthenticated) {
    return Object.freeze({ kind: "anonymous" });
  }

  try {
    const config = dependencies.getCommercialConfig();
    const [commercialRows, customerRows] = await Promise.all([
      dependencies.loadCommercialRows(),
      dependencies.loadCustomerRows(access.userId),
    ]);
    const customer = resolveTrustedProductionCustomerV1(
      customerRows,
      access.userId,
      config.storeId,
    );
    const subscription = summarizeCommercialRowsV1(
      commercialRows,
      config,
      dependencies.getCurrentTime(),
    );

    return Object.freeze({
      kind: "authenticated",
      accessState: access.state,
      role: access.role,
      subscription,
      portalAvailable: customer !== null,
    });
  } catch (error) {
    if (error instanceof BillingManagementErrorV1) throw error;
    throw new BillingManagementErrorV1("commercial-summary-unavailable");
  }
}

/** Resolves exactly one production mapping for the derived internal app user. */
export function resolveTrustedProductionCustomerV1(
  value: unknown,
  expectedUserId: string,
  expectedStoreId: string,
): TrustedLemonCustomerV1 | null {
  if (!Array.isArray(value) || !isUuidV1(expectedUserId) ||
    !isVendorIdV1(expectedStoreId)) {
    throw new BillingManagementErrorV1("customer-mapping-conflict");
  }

  const rows = value.map(parseCustomerRowV1);
  const productionRows = rows.filter((row) => row.testMode === false);

  if (productionRows.length === 0) return null;

  if (productionRows.length !== 1) {
    throw new BillingManagementErrorV1("customer-mapping-conflict");
  }

  const [customer] = productionRows;

  if (customer.userId !== expectedUserId ||
    customer.storeId !== expectedStoreId) {
    throw new BillingManagementErrorV1("customer-mapping-conflict");
  }

  return Object.freeze({ ...customer, testMode: false });
}

export async function loadPrivateLemonCustomerRowsV1(
  userId: string,
): Promise<unknown> {
  if (!isUuidV1(userId)) {
    throw new BillingManagementErrorV1("customer-mapping-conflict");
  }

  const supabase = createSupabaseAdminClientV1();
  const result = await supabase.rpc("resolve_lemon_customers_for_user_v1", {
    p_user_id: userId,
  });

  if (result.error) throw result.error;
  return result.data;
}

export function summarizeCommercialRowsV1(
  value: unknown,
  config: VipCommercialConfigV1,
  now: string,
): BillingSubscriptionSummaryV1 | null {
  if (!Array.isArray(value)) {
    throw new BillingManagementErrorV1("commercial-summary-unavailable");
  }

  const candidates = value
    .map(parseCommercialFactsV1)
    .filter((facts) => facts.storeId === config.storeId &&
      facts.productId === config.productId && facts.testMode === false)
    .map((facts) => ({
      facts,
      lifecycle: normalizeSubscriptionLifecycleV1(facts),
    }));

  for (const candidate of candidates) {
    if (candidate.lifecycle.invalidTimestampFields.length > 0) {
      throw new BillingManagementErrorV1("commercial-summary-unavailable");
    }
  }

  const summaries = candidates.map(({ facts, lifecycle }) => {
    const plan = facts.variantId === config.monthlyVariantId
      ? "Monthly"
      : facts.variantId === config.annualVariantId
      ? "Annual"
      : "Unknown / unsupported";
    const commercialEntitlement = plan === "Unknown / unsupported"
      ? "unresolved"
      : evaluateCommercialEntitlementV1(lifecycle, {
        now,
        testMode: false,
      }).state;

    return { facts, lifecycle, plan, commercialEntitlement } as const;
  });
  summaries.sort((left, right) =>
    entitlementPriorityV1(right.commercialEntitlement) -
      entitlementPriorityV1(left.commercialEntitlement) ||
    Date.parse(right.facts.upstreamUpdatedAt) -
      Date.parse(left.facts.upstreamUpdatedAt));
  const selected = summaries[0];

  if (!selected) return null;

  return Object.freeze({
    plan: selected.plan,
    providerStatus: selected.facts.rawStatus,
    cancelled: selected.facts.cancelled,
    renewsAt: selected.lifecycle.renewsAt,
    endsAt: selected.lifecycle.endsAt,
    trialEndsAt: selected.lifecycle.trialEndsAt,
    pauseMode: selected.lifecycle.pauseMode,
    pauseResumesAt: selected.lifecycle.pauseResumesAt,
    commercialEntitlement: selected.commercialEntitlement,
  });
}

function entitlementPriorityV1(
  state: BillingSubscriptionSummaryV1["commercialEntitlement"],
): number {
  if (state === "active") return 3;
  if (state === "unresolved") return 2;
  return 1;
}

function parseCustomerRowV1(value: unknown): {
  userId: string;
  customerId: string;
  storeId: string;
  testMode: boolean;
} {
  if (!isRecord(value) || !isUuidV1(value.user_id) ||
    !isVendorIdV1(value.lemon_customer_id) ||
    !isVendorIdV1(value.store_id) || typeof value.test_mode !== "boolean") {
    throw new BillingManagementErrorV1("customer-mapping-conflict");
  }

  return Object.freeze({
    userId: value.user_id,
    customerId: value.lemon_customer_id,
    storeId: value.store_id,
    testMode: value.test_mode,
  });
}

function parseCommercialFactsV1(
  value: unknown,
): LemonSubscriptionLifecycleFactsV1 {
  if (!isRecord(value) ||
    !isVendorIdV1(value.lemon_subscription_id) ||
    !isVendorIdV1(value.store_id) || !isVendorIdV1(value.product_id) ||
    !isVendorIdV1(value.variant_id) || typeof value.raw_status !== "string" ||
    value.raw_status.trim().length === 0 ||
    typeof value.cancelled !== "boolean" ||
    !isNullableStringV1(value.pause_mode) ||
    !isNullableStringV1(value.pause_resumes_at) ||
    !isNullableStringV1(value.trial_ends_at) ||
    !isNullableStringV1(value.renews_at) ||
    !isNullableStringV1(value.ends_at) ||
    typeof value.upstream_updated_at !== "string" ||
    typeof value.test_mode !== "boolean" ||
    typeof value.refund_affected !== "boolean") {
    throw new BillingManagementErrorV1("commercial-summary-unavailable");
  }

  return Object.freeze({
    subscriptionId: value.lemon_subscription_id,
    storeId: value.store_id,
    productId: value.product_id,
    variantId: value.variant_id,
    rawStatus: value.raw_status,
    cancelled: value.cancelled,
    pauseMode: value.pause_mode,
    pauseResumesAt: value.pause_resumes_at,
    trialEndsAt: value.trial_ends_at,
    renewsAt: value.renews_at,
    endsAt: value.ends_at,
    upstreamUpdatedAt: value.upstream_updated_at,
    testMode: value.test_mode,
    refundAffected: value.refund_affected,
  });
}

function isVendorIdV1(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function isUuidV1(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function isNullableStringV1(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
