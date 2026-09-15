import assert from "node:assert/strict";

import type { AccessResultV1 } from "../../auth/types";
import {
  BillingManagementErrorV1,
  loadBillingPageStateV1,
  resolveTrustedProductionCustomerV1,
  summarizeCommercialRowsV1,
  type BillingPageStateDependenciesV1,
} from "../billingManagement";

const NOW = "2026-09-15T12:00:00.000Z";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CONFIG = Object.freeze({
  storeId: "294379",
  productId: "1352857",
  monthlyVariantId: "2112907",
  annualVariantId: "2112850",
  variantIds: Object.freeze(["2112907", "2112850"] as const),
});
const BASE_ROW = Object.freeze({
  lemon_subscription_id: "9001",
  store_id: CONFIG.storeId,
  product_id: CONFIG.productId,
  variant_id: CONFIG.monthlyVariantId,
  raw_status: "active",
  cancelled: false,
  pause_mode: null,
  pause_resumes_at: null,
  trial_ends_at: null,
  renews_at: "2026-10-15T12:00:00.000Z",
  ends_at: null,
  upstream_updated_at: "2026-09-15T10:00:00.000Z",
  test_mode: false,
  refund_affected: false,
  payment_issue: false,
});

function row(overrides: Readonly<Record<string, unknown>> = {}) {
  return Object.freeze({ ...BASE_ROW, ...overrides });
}

function access(
  state: "anonymous_free" | "authenticated_free" | "vip_active" |
    "owner" | "admin",
): AccessResultV1 {
  if (state === "anonymous_free") {
    return Object.freeze({
      state,
      isAuthenticated: false,
      authSubject: null,
      userId: null,
      role: null,
      canAccessVip: false,
    });
  }

  const role = state === "owner" ? "owner" : state === "admin" ? "admin" : "user";
  return Object.freeze({
    state,
    isAuthenticated: true,
    authSubject: `verified-${role}`,
    userId: USER_ID,
    role,
    canAccessVip: state !== "authenticated_free",
  }) as AccessResultV1;
}

function customer(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    user_id: USER_ID,
    lemon_customer_id: "7001",
    store_id: CONFIG.storeId,
    test_mode: false,
    ...overrides,
  });
}

async function verifyAnonymousIsolation(): Promise<void> {
  let commercialCalls = 0;
  let customerCalls = 0;
  let configCalls = 0;
  const state = await loadBillingPageStateV1({
    resolveAccess: async () => access("anonymous_free"),
    loadCommercialRows: async () => { commercialCalls += 1; return []; },
    loadCustomerRows: async () => { customerCalls += 1; return []; },
    getCommercialConfig: () => { configCalls += 1; return CONFIG; },
    getCurrentTime: () => NOW,
  });

  assert.deepEqual(state, { kind: "anonymous" });
  assert.equal(commercialCalls, 0);
  assert.equal(customerCalls, 0);
  assert.equal(configCalls, 0);
}

function verifySummaryNormalization(): void {
  assert.deepEqual(summarizeCommercialRowsV1([row()], CONFIG, NOW), {
    plan: "Monthly",
    providerStatus: "active",
    cancelled: false,
    renewsAt: "2026-10-15T12:00:00.000Z",
    endsAt: null,
    trialEndsAt: null,
    pauseMode: null,
    pauseResumesAt: null,
    commercialEntitlement: "active",
    paymentIssue: false,
  });
  assert.equal(summarizeCommercialRowsV1([
    row({ variant_id: CONFIG.annualVariantId }),
  ], CONFIG, NOW)?.plan, "Annual");

  const unknown = summarizeCommercialRowsV1([
    row({ variant_id: "2999999" }),
  ], CONFIG, NOW);
  assert.equal(unknown?.plan, "Unknown / unsupported");
  assert.equal(unknown?.commercialEntitlement, "unresolved");

  const cancelled = summarizeCommercialRowsV1([row({
    raw_status: "cancelled",
    cancelled: true,
    renews_at: null,
    ends_at: "2026-09-20T12:00:00.000Z",
  })], CONFIG, NOW);
  assert.equal(cancelled?.cancelled, true);
  assert.equal(cancelled?.endsAt, "2026-09-20T12:00:00.000Z");
  assert.equal(cancelled?.commercialEntitlement, "active");

  assert.equal(summarizeCommercialRowsV1([row({
    raw_status: "expired",
    renews_at: null,
    ends_at: "2026-09-14T12:00:00.000Z",
  })], CONFIG, NOW)?.commercialEntitlement, "inactive");
  assert.equal(summarizeCommercialRowsV1([row({
    refund_affected: true,
  })], CONFIG, NOW)?.commercialEntitlement, "unresolved");
  const paymentTrouble = summarizeCommercialRowsV1([row({
    payment_issue: true,
  })], CONFIG, NOW);
  assert.equal(paymentTrouble?.paymentIssue, true);
  assert.equal(paymentTrouble?.commercialEntitlement, "unresolved");

  const currentActive = summarizeCommercialRowsV1([
    row(),
    row({
      lemon_subscription_id: "9002",
      variant_id: CONFIG.annualVariantId,
      raw_status: "expired",
      renews_at: null,
      ends_at: "2026-09-14T12:00:00.000Z",
      upstream_updated_at: "2026-09-15T11:00:00.000Z",
    }),
  ], CONFIG, NOW);
  assert.equal(currentActive?.plan, "Monthly");
  assert.equal(currentActive?.commercialEntitlement, "active");
}

function verifyCustomerScope(): void {
  assert.deepEqual(
    resolveTrustedProductionCustomerV1([customer()], USER_ID, CONFIG.storeId),
    {
      userId: USER_ID,
      customerId: "7001",
      storeId: CONFIG.storeId,
      testMode: false,
    },
  );
  assert.equal(resolveTrustedProductionCustomerV1([
    customer({ test_mode: true }),
  ], USER_ID, CONFIG.storeId), null);

  for (const rows of [
    [customer({ user_id: OTHER_USER_ID })],
    [customer({ store_id: "999999" })],
    [customer(), customer({ lemon_customer_id: "7002", store_id: "999999" })],
  ]) {
    assert.throws(
      () => resolveTrustedProductionCustomerV1(rows, USER_ID, CONFIG.storeId),
      (error) => error instanceof BillingManagementErrorV1 &&
        error.code === "customer-mapping-conflict",
    );
  }
}

async function verifyRoleAndFreeStates(): Promise<void> {
  for (const state of ["owner", "admin", "authenticated_free"] as const) {
    const dependencies: BillingPageStateDependenciesV1 = {
      resolveAccess: async () => access(state),
      loadCommercialRows: async () => [],
      loadCustomerRows: async (userId) => {
        assert.equal(userId, USER_ID);
        return [];
      },
      getCommercialConfig: () => CONFIG,
      getCurrentTime: () => NOW,
    };
    const result = await loadBillingPageStateV1(dependencies);

    assert.equal(result.kind, "authenticated");
    if (result.kind === "authenticated") {
      assert.equal(result.accessState, state);
      assert.equal(result.subscription, null);
      assert.equal(result.portalAvailable, false);
    }
  }

  const paid = await loadBillingPageStateV1({
    resolveAccess: async () => access("vip_active"),
    loadCommercialRows: async () => [row()],
    loadCustomerRows: async (userId) => {
      assert.equal(userId, USER_ID);
      return [customer()];
    },
    getCommercialConfig: () => CONFIG,
    getCurrentTime: () => NOW,
  });
  assert.equal(paid.kind === "authenticated" && paid.portalAvailable, true);
  assert.equal(
    paid.kind === "authenticated" && paid.subscription?.plan,
    "Monthly",
  );
}

async function main(): Promise<void> {
  await verifyAnonymousIsolation();
  verifySummaryNormalization();
  verifyCustomerScope();
  await verifyRoleAndFreeStates();

  console.log("PASS: authenticated billing summary and customer scope");
}

void main();
