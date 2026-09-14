import assert from "node:assert/strict";

import { AccessGuardErrorV1 } from "../../auth/guards";
import type { AuthenticatedAccessV1 } from "../../auth/types";
import {
  createLemonCustomerPortalV1,
  LemonPortalErrorV1,
  parseLemonCustomerPortalResponseV1,
  safeLemonPortalUrlV1,
  type LemonPortalDependenciesV1,
} from "../lemonPortal";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const API_KEY = "private-test-key-never-logged";
const CONFIG = Object.freeze({
  storeId: "294379",
  productId: "1352857",
  monthlyVariantId: "2112907",
  annualVariantId: "2112850",
  variantIds: Object.freeze(["2112907", "2112850"] as const),
});
const ACCESS: AuthenticatedAccessV1 = Object.freeze({
  state: "authenticated_free",
  isAuthenticated: true,
  authSubject: "verified-subject",
  userId: USER_ID,
  role: "user",
  canAccessVip: false,
});
const PORTAL_URL =
  "https://chronoverse.lemonsqueezy.com/billing?expires=123&signature=fake";

function customerRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return Object.freeze({
    user_id: USER_ID,
    lemon_customer_id: "7001",
    store_id: CONFIG.storeId,
    test_mode: false,
    ...overrides,
  });
}

function providerResponse(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    data: {
      type: "customers",
      id: "7001",
      attributes: {
        store_id: 294379,
        test_mode: false,
        urls: { customer_portal: PORTAL_URL },
        ...overrides,
      },
    },
  };
}

interface Harness {
  readonly dependencies: LemonPortalDependenciesV1;
  readonly providerCalls: Array<{ input: string; init?: RequestInit }>;
  readonly mappingUserIds: string[];
}

function harness(
  overrides: Partial<LemonPortalDependenciesV1> = {},
  responseBody: unknown = providerResponse(),
  responseStatus = 200,
): Harness {
  const providerCalls: Array<{ input: string; init?: RequestInit }> = [];
  const mappingUserIds: string[] = [];
  const dependencies: LemonPortalDependenciesV1 = {
    requireAuthenticated: async () => ACCESS,
    loadCustomerRows: async (userId) => {
      mappingUserIds.push(userId);
      return [customerRow()];
    },
    getCommercialConfig: () => CONFIG,
    getApiKey: () => API_KEY,
    fetchProvider: async (input, init) => {
      providerCalls.push({ input: String(input), init });
      return Response.json(responseBody, { status: responseStatus });
    },
    timeoutMs: 100,
    ...overrides,
  };

  return { dependencies, providerCalls, mappingUserIds };
}

async function verifySuccessfulPortal(): Promise<void> {
  const current = harness();
  assert.equal(
    await createLemonCustomerPortalV1(current.dependencies),
    PORTAL_URL,
  );
  assert.deepEqual(current.mappingUserIds, [USER_ID]);
  assert.equal(current.providerCalls.length, 1);
  assert.equal(
    current.providerCalls[0].input,
    "https://api.lemonsqueezy.com/v1/customers/7001",
  );
  assert.equal(current.providerCalls[0].init?.method, "GET");
  const headers = current.providerCalls[0].init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${API_KEY}`);
  assert.equal(headers.Accept, "application/vnd.api+json");
  assert.equal(current.providerCalls[0].init?.cache, "no-store");
}

async function verifyAuthenticationFirst(): Promise<void> {
  let mappingCalls = 0;
  let providerCalls = 0;
  const current = harness({
    requireAuthenticated: async () => {
      throw new AccessGuardErrorV1("authentication-required");
    },
    loadCustomerRows: async () => { mappingCalls += 1; return []; },
    fetchProvider: async () => {
      providerCalls += 1;
      return Response.json(providerResponse());
    },
  });

  await assert.rejects(
    createLemonCustomerPortalV1(current.dependencies),
    (error) => error instanceof AccessGuardErrorV1 &&
      error.code === "authentication-required",
  );
  assert.equal(mappingCalls, 0);
  assert.equal(providerCalls, 0);
}

async function verifyLocalScopeFailures(): Promise<void> {
  for (const rows of [
    [],
    [customerRow({ test_mode: true })],
    [customerRow({ store_id: "999999" })],
    [customerRow({ user_id: "22222222-2222-4222-8222-222222222222" })],
    [customerRow(), customerRow({ lemon_customer_id: "7002", store_id: "999999" })],
  ]) {
    const current = harness({ loadCustomerRows: async () => rows });
    await assert.rejects(
      createLemonCustomerPortalV1(current.dependencies),
      (error) => error instanceof LemonPortalErrorV1 &&
        (error.code === "customer-not-found" ||
          error.code === "customer-mapping-invalid"),
    );
    assert.equal(current.providerCalls.length, 0);
  }
}

async function verifyProviderFailures(): Promise<void> {
  const cases: Harness[] = [
    harness({}, { errors: [] }, 500),
    harness({}, { data: {} }),
    harness({}, providerResponse({ urls: {} })),
    harness({}, providerResponse({ urls: { customer_portal: null } })),
    harness({}, providerResponse({
      urls: { customer_portal: "http://chronoverse.lemonsqueezy.com/billing" },
    })),
    harness({}, providerResponse({
      urls: { customer_portal: "https://attacker.example/billing" },
    })),
    harness({ fetchProvider: async () => { throw new Error(API_KEY); } }),
    harness({ getApiKey: () => "" }),
  ];

  for (const current of cases) {
    await assert.rejects(
      createLemonCustomerPortalV1(current.dependencies),
      (error) => error instanceof LemonPortalErrorV1 &&
        !error.message.includes(API_KEY),
    );
  }

  const timedOut = harness({
    timeoutMs: 5,
    fetchProvider: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Timed out", "AbortError"));
        });
      }),
  });
  await assert.rejects(
    createLemonCustomerPortalV1(timedOut.dependencies),
    (error) => error instanceof LemonPortalErrorV1 &&
      error.code === "provider-unavailable",
  );
}

function verifyResponseValidation(): void {
  assert.equal(
    parseLemonCustomerPortalResponseV1(providerResponse(), "7001", "294379"),
    PORTAL_URL,
  );
  assert.equal(
    parseLemonCustomerPortalResponseV1(providerResponse(), "7002", "294379"),
    null,
  );
  for (const value of [
    "",
    "javascript:alert(1)",
    "http://chronoverse.lemonsqueezy.com/billing",
    "https://user:pass@chronoverse.lemonsqueezy.com/billing",
    "https://chronoverse.lemonsqueezy.com:8443/billing",
    "https://lemonsqueezy.com.attacker.example/billing",
    "https://chronoverse.lemonsqueezy.com/#billing",
  ]) {
    assert.equal(safeLemonPortalUrlV1(value), null);
  }
}

async function main(): Promise<void> {
  verifyResponseValidation();
  await verifySuccessfulPortal();
  await verifyAuthenticationFirst();
  await verifyLocalScopeFailures();
  await verifyProviderFailures();

  console.log("PASS: secure Lemon customer portal service contract");
}

void main();
