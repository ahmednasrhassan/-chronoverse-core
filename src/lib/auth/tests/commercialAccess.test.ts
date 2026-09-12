import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AccessResolutionErrorV1,
  createAccessResolverV1,
  type AccessCompositionDependenciesV1,
  type AccessResolverV1,
} from "../access";
import type { ChronoverseRole } from "../types";
import {
  getVipCommercialConfigV1,
  VipCommercialConfigurationErrorV1,
  type VipCommercialConfigV1,
} from "../../billing/vipCommercialConfig";

const NOW = "2026-09-12T12:00:00.000Z";
const CONFIG_ENVIRONMENT = Object.freeze({
  LEMON_SQUEEZY_STORE_ID: "294379",
  LEMON_SQUEEZY_VIP_PRODUCT_ID: "1352857",
  LEMON_SQUEEZY_VIP_MONTHLY_VARIANT_ID: "2112907",
  LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID: "2112850",
});
const VIP_CONFIG = getVipCommercialConfigV1(CONFIG_ENVIRONMENT);

const BASE_SUBSCRIPTION = Object.freeze({
  lemon_subscription_id: "9001",
  store_id: "294379",
  product_id: "1352857",
  variant_id: "2112907",
  raw_status: "active",
  cancelled: false,
  pause_mode: null,
  pause_resumes_at: null,
  trial_ends_at: null,
  renews_at: "2026-10-12T12:00:00.000Z",
  ends_at: null,
  upstream_updated_at: "2026-09-12T10:00:00.000Z",
  test_mode: false,
  refund_affected: false,
});

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function subscription(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...BASE_SUBSCRIPTION, ...overrides });
}

interface ResolverHarnessV1 {
  readonly resolve: AccessResolverV1;
  readonly commercialCalls: () => number;
  readonly configCalls: () => number;
}

function resolverHarnessV1(
  role: ChronoverseRole | null,
  rows: unknown = [],
  options: Readonly<{
    commercialError?: unknown;
    configError?: unknown;
    config?: VipCommercialConfigV1;
    now?: string;
  }> = {},
): ResolverHarnessV1 {
  let commercialCalls = 0;
  let configCalls = 0;
  const dependencies: AccessCompositionDependenciesV1 = Object.freeze({
    getVipCommercialConfig: () => {
      configCalls += 1;

      if (options.configError !== undefined) {
        throw options.configError;
      }

      return options.config ?? VIP_CONFIG;
    },
    getCurrentTime: () => options.now ?? NOW,
  });
  const resolve = createAccessResolverV1(
    async () => {
      if (role === null) {
        return null;
      }

      const accessState = role === "owner"
        ? "owner"
        : role === "admin"
        ? "admin"
        : "authenticated_free";

      return {
        authSubject: `verified-${role}-subject`,
        trustedAccess: [{
          user_id: `stable-${role}-user-id`,
          auth_user_id: `verified-${role}-subject`,
          role,
          access_state: accessState,
          can_access_vip: role !== "user",
        }],
        loadCommercialAccess: async () => {
          commercialCalls += 1;

          if (options.commercialError !== undefined) {
            throw options.commercialError;
          }

          return rows;
        },
      };
    },
    dependencies,
  );

  return Object.freeze({
    resolve,
    commercialCalls: () => commercialCalls,
    configCalls: () => configCalls,
  });
}

async function assertState(
  role: ChronoverseRole | null,
  rows: unknown,
  expected: "anonymous_free" | "authenticated_free" | "vip_active" |
    "admin" | "owner",
  label: string,
): Promise<void> {
  const access = await resolverHarnessV1(role, rows).resolve();
  assertEqual(access.state, expected, label);
}

async function verifyBaseAndActiveAccess(): Promise<void> {
  const anonymous = resolverHarnessV1(null, [subscription()]);
  assertEqual((await anonymous.resolve()).state, "anonymous_free",
    "commercial rows cannot authenticate an anonymous caller");
  assertEqual(anonymous.commercialCalls(), 0,
    "anonymous access performs no commercial lookup");
  assertEqual(anonymous.configCalls(), 0,
    "anonymous access does not load commercial configuration");

  await assertState("user", [], "authenticated_free",
    "normal authenticated caller without subscriptions remains Free");
  await assertState("user", [subscription()], "vip_active",
    "exact active monthly subscription grants VIP");
  await assertState("user", [subscription({ variant_id: "2112850" })],
    "vip_active", "exact active annual subscription grants VIP");
  await assertState("user", [subscription({
    raw_status: "cancelled",
    cancelled: true,
    renews_at: null,
    ends_at: "2026-09-13T12:00:00.000Z",
  })], "vip_active", "cancelled paid-through subscription grants VIP");
}

async function verifyWrongScopeAndNonGrantStates(): Promise<void> {
  const cases = [
    ["wrong store", { store_id: "294380" }],
    ["wrong product", { product_id: "1352858" }],
    ["wrong variant", { variant_id: "2112908" }],
    ["test mode", { test_mode: true }],
    ["expired", {
      raw_status: "expired",
      ends_at: "2026-09-11T12:00:00.000Z",
    }],
    ["cancelled and ended", {
      raw_status: "cancelled",
      cancelled: true,
      renews_at: null,
      ends_at: "2026-09-11T12:00:00.000Z",
    }],
    ["paused", { raw_status: "paused", pause_mode: "void" }],
    ["payment issue", { raw_status: "past_due" }],
    ["trial", {
      raw_status: "on_trial",
      trial_ends_at: "2026-09-20T12:00:00.000Z",
    }],
    ["unknown", { raw_status: "future-status" }],
    ["invalid timestamp", { renews_at: "2026-10-12 12:00:00" }],
    ["conflicting active facts", {
      ends_at: "2026-10-12T12:00:00.000Z",
    }],
    ["full refund evidence", { refund_affected: true }],
    ["partial refund evidence", { refund_affected: true }],
  ] as const;

  for (const [label, overrides] of cases) {
    await assertState("user", [subscription(overrides)], "authenticated_free",
      `${label} cannot grant VIP`);
  }

  const missingRefundFact = { ...BASE_SUBSCRIPTION } as Record<string, unknown>;
  delete missingRefundFact.refund_affected;
  await assertState("user", [missingRefundFact], "authenticated_free",
    "missing refund truth is ignored rather than defaulted to false");
}

async function verifyAbsoluteRolePrecedence(): Promise<void> {
  const cases = [
    ["owner", []],
    ["owner", [subscription()]],
    ["owner", [subscription({ refund_affected: true })]],
    ["owner", [subscription({ renews_at: "bad" })]],
    ["admin", []],
    ["admin", [subscription({ variant_id: "2112850" })]],
    ["admin", [subscription({ raw_status: "expired" })]],
    ["admin", [subscription({ refund_affected: "invalid" })]],
  ] as const;

  for (const [role, rows] of cases) {
    const harness = resolverHarnessV1(role, rows);
    assertEqual((await harness.resolve()).state, role,
      `${role} remains elevated regardless of commercial state`);
    assertEqual(harness.commercialCalls(), 0,
      `${role} performs no commercial lookup`);
    assertEqual(harness.configCalls(), 0,
      `${role} does not load commercial configuration`);
  }

  for (const role of ["owner", "admin"] as const) {
    const harness = resolverHarnessV1(role, [], {
      commercialError: new Error("commercial unavailable"),
      configError: new Error("configuration unavailable"),
    });
    assertEqual((await harness.resolve()).state, role,
      `${role} survives commercial infrastructure failure`);
    assertEqual(harness.commercialCalls(), 0,
      `${role} failure path still skips commercial lookup`);
  }
}

async function verifyMultipleSubscriptionComposition(): Promise<void> {
  await assertState("user", [
    subscription(),
    subscription({
      lemon_subscription_id: "9002",
      variant_id: "2112850",
      raw_status: "expired",
      ends_at: "2026-09-11T12:00:00.000Z",
    }),
  ], "vip_active", "expired annual does not cancel active monthly");

  await assertState("user", [
    subscription({ variant_id: "2112850" }),
    subscription({
      lemon_subscription_id: "9002",
      raw_status: "paused",
      pause_mode: "void",
    }),
  ], "vip_active", "unresolved row does not cancel active annual");

  await assertState("user", [
    subscription(),
    subscription({ lemon_subscription_id: "9002", refund_affected: true }),
  ], "vip_active", "refunded row does not cancel separate active VIP");

  await assertState("user", [
    subscription({ refund_affected: true }),
    subscription({
      lemon_subscription_id: "9002",
      variant_id: "2112850",
      refund_affected: true,
    }),
  ], "authenticated_free", "only refunded rows grant no VIP");

  await assertState("user", [
    subscription({ raw_status: "paused", pause_mode: "void" }),
    subscription({
      lemon_subscription_id: "9002",
      raw_status: "future-status",
    }),
  ], "authenticated_free", "only unresolved rows grant no VIP");

  await assertState("user", [
    subscription({ product_id: "999", raw_status: "active" }),
    subscription({
      lemon_subscription_id: "9002",
      raw_status: "expired",
      ends_at: "2026-09-11T12:00:00.000Z",
    }),
  ], "authenticated_free",
  "wrong-scope active row cannot override expired correct scope");
}

async function verifyCommercialFailureBehavior(): Promise<void> {
  for (const [label, options, rows] of [
    ["lookup failure", { commercialError: new Error("database unavailable") }, []],
    ["configuration failure", {
      configError: new Error("configuration unavailable"),
    }, []],
    ["invalid RPC result", {}, { unexpected: true }],
    ["evaluation clock failure", { now: "invalid-time" }, [subscription()]],
  ] as const) {
    const harness = resolverHarnessV1("user", rows, options);

    try {
      await harness.resolve();
      throw new Error(`${label} unexpectedly returned access.`);
    } catch (error) {
      assertEqual(error instanceof AccessResolutionErrorV1, true,
        `${label} uses the controlled access error`);
      assertEqual((error as AccessResolutionErrorV1).code,
        "commercial-access-unavailable", `${label} fails as unavailable`);
    }
  }
}

function verifyCommercialConfiguration(): void {
  assertEqual(VIP_CONFIG.storeId, "294379", "approved store ID is accepted");
  assertEqual(VIP_CONFIG.productId, "1352857",
    "approved product ID is accepted");
  assertEqual(VIP_CONFIG.monthlyVariantId, "2112907",
    "approved monthly variant is accepted");
  assertEqual(VIP_CONFIG.annualVariantId, "2112850",
    "approved annual variant is accepted");

  for (const variableName of Object.keys(CONFIG_ENVIRONMENT)) {
    const environment = { ...CONFIG_ENVIRONMENT } as Record<
      string,
      string | undefined
    >;
    environment[variableName] = undefined;
    expectConfigurationFailure(environment, "missing-or-malformed",
      `${variableName} is required`);
  }

  for (const malformed of ["", " 1", "01", "0", "-1", "1.5", "abc"]) {
    expectConfigurationFailure({
      ...CONFIG_ENVIRONMENT,
      LEMON_SQUEEZY_STORE_ID: malformed,
    }, "missing-or-malformed", `malformed ID ${JSON.stringify(malformed)}`);
  }

  expectConfigurationFailure({
    ...CONFIG_ENVIRONMENT,
    LEMON_SQUEEZY_VIP_ANNUAL_VARIANT_ID: "2112907",
  }, "duplicate-variant-id", "monthly and annual variants must be distinct");

  const configSource = readFileSync(fileURLToPath(new URL(
    "../../billing/vipCommercialConfig.ts",
    import.meta.url,
  )), "utf8");
  assertEqual(configSource.includes('import "server-only"'), true,
    "commercial config is server-only");
  assertEqual(configSource.includes("NEXT_PUBLIC"), false,
    "commercial identifiers are never public environment values");
  for (const approvedValue of ["294379", "1352857", "2112907", "2112850"]) {
    assertEqual(configSource.includes(approvedValue), false,
      "production commercial values are not source-code literals");
  }
}

function expectConfigurationFailure(
  environment: Readonly<Record<string, string | undefined>>,
  expectedReason: "missing-or-malformed" | "duplicate-variant-id",
  label: string,
): void {
  try {
    getVipCommercialConfigV1(environment);
    throw new Error(`${label}: configuration unexpectedly succeeded.`);
  } catch (error) {
    assertEqual(error instanceof VipCommercialConfigurationErrorV1, true,
      `${label} uses a typed configuration failure`);
    assertEqual((error as VipCommercialConfigurationErrorV1).reason,
      expectedReason, `${label} failure reason`);
  }
}

async function main(): Promise<void> {
  verifyCommercialConfiguration();
  await verifyBaseAndActiveAccess();
  await verifyWrongScopeAndNonGrantStates();
  await verifyAbsoluteRolePrecedence();
  await verifyMultipleSubscriptionComposition();
  await verifyCommercialFailureBehavior();

  console.log("PASS: caller-bound VIP commercial access composition");
}

void main();
