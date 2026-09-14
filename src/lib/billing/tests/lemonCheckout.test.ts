import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { AccessGuardErrorV1 } from "../../auth/guards";
import {
  createLemonCheckoutV1,
  LemonCheckoutErrorV1,
  parseLemonCheckoutRequestV1,
  type LemonCheckoutDependenciesV1,
  type LemonCheckoutPlanV1,
} from "../lemonCheckout";

const INTERNAL_USER_ID = "6753c8e8-8aa7-43cf-bae2-194bcc841e8d";
const API_KEY = "test-api-key-never-sent-remotely";
const CONFIG = Object.freeze({
  storeId: "294379",
  productId: "1352857",
  monthlyVariantId: "2112907",
  annualVariantId: "2112850",
  variantIds: Object.freeze(["2112907", "2112850"] as const),
});

interface Harness {
  readonly dependencies: LemonCheckoutDependenciesV1;
  readonly calls: RequestInit[];
}

function harness(
  overrides: Partial<LemonCheckoutDependenciesV1> = {},
  responseBody: unknown = providerResponse("2112907"),
  responseStatus = 200,
): Harness {
  const calls: RequestInit[] = [];
  const dependencies: LemonCheckoutDependenciesV1 = {
    resolveCustomData: async () => ({
      chronoverse_user_id: INTERNAL_USER_ID,
    }),
    getCommercialConfig: () => CONFIG,
    getApiKey: () => API_KEY,
    fetchProvider: async (_input, init) => {
      calls.push(init ?? {});
      return Response.json(responseBody, { status: responseStatus });
    },
    getReturnUrl: () => "https://chronoversecapital.com/account",
    timeoutMs: 100,
    ...overrides,
  };

  return { dependencies, calls };
}

function providerResponse(variantId: string): unknown {
  return {
    data: {
      type: "checkouts",
      attributes: {
        store_id: 294379,
        variant_id: Number(variantId),
        test_mode: false,
        url: "https://chronoverse.lemonsqueezy.com/checkout/custom/checkout-id?signature=fake",
      },
    },
  };
}

async function verifyPlanMapping(plan: LemonCheckoutPlanV1, variantId: string) {
  const current = harness({}, providerResponse(variantId));
  const url = await createLemonCheckoutV1(plan, current.dependencies);

  assert.match(url, /^https:\/\/chronoverse\.lemonsqueezy\.com\/checkout\//);
  assert.equal(current.calls.length, 1);

  const request = current.calls[0];
  const headers = request.headers as Record<string, string>;
  const body = JSON.parse(String(request.body)) as Record<string, any>;
  const data = body.data;

  assert.equal(request.method, "POST");
  assert.equal(headers.Accept, "application/vnd.api+json");
  assert.equal(headers["Content-Type"], "application/vnd.api+json");
  assert.equal(headers.Authorization, `Bearer ${API_KEY}`);
  assert.deepEqual(data.relationships.store.data, {
    type: "stores",
    id: "294379",
  });
  assert.deepEqual(data.relationships.variant.data, {
    type: "variants",
    id: variantId,
  });
  assert.deepEqual(data.attributes.product_options.enabled_variants, [
    Number(variantId),
  ]);
  assert.equal(
    data.attributes.product_options.redirect_url,
    "https://chronoversecapital.com/account",
  );
  assert.equal(data.attributes.test_mode, false);
  assert.deepEqual(data.attributes.checkout_data.custom, {
    chronoverse_user_id: INTERNAL_USER_ID,
  });
  assert.deepEqual(Object.keys(data.attributes.checkout_data.custom), [
    "chronoverse_user_id",
  ]);
  assert.equal(JSON.stringify(body).includes("email"), false);
  assert.equal(JSON.stringify(body).includes("auth_user_id"), false);
  assert.equal(JSON.stringify(body).includes("role"), false);
  assert.equal(JSON.stringify(body).includes("entitlement"), false);
  assert.equal(JSON.stringify(body).includes(CONFIG.productId), false);
}

async function verifyAuthenticationPrecedesProvider(): Promise<void> {
  const current = harness({
    resolveCustomData: async () => {
      throw new AccessGuardErrorV1("authentication-required");
    },
  });

  await assert.rejects(
    createLemonCheckoutV1("monthly", current.dependencies),
    (error) => error instanceof AccessGuardErrorV1
      && error.code === "authentication-required",
  );
  assert.equal(current.calls.length, 0);
}

async function verifyConfigurationFailures(): Promise<void> {
  for (const override of [
    { getApiKey: () => "" },
    { getCommercialConfig: () => { throw new Error("invalid config"); } },
  ] satisfies Array<Partial<LemonCheckoutDependenciesV1>>) {
    const current = harness(override);
    await assert.rejects(
      createLemonCheckoutV1("monthly", current.dependencies),
      (error) => error instanceof LemonCheckoutErrorV1
        && error.code === "configuration-unavailable",
    );
    assert.equal(current.calls.length, 0);
  }
}

async function verifyProviderFailures(): Promise<void> {
  const cases: Array<{
    readonly current: Harness;
    readonly code: string;
  }> = [
    { current: harness({}, { errors: [] }, 422), code: "provider-unavailable" },
    { current: harness({}, { data: {} }), code: "invalid-provider-response" },
    {
      current: harness({}, {
        data: {
          type: "checkouts",
          attributes: {
            store_id: 294379,
            variant_id: 2112907,
            test_mode: false,
            url: "https://attacker.example/checkout/custom/id",
          },
        },
      }),
      code: "invalid-provider-response",
    },
    {
      current: harness({
        fetchProvider: async () => { throw new Error("network unavailable"); },
      }),
      code: "provider-unavailable",
    },
  ];

  for (const { current, code } of cases) {
    await assert.rejects(
      createLemonCheckoutV1("monthly", current.dependencies),
      (error) => error instanceof LemonCheckoutErrorV1 && error.code === code,
    );
  }

  const malformedJson = harness({
    fetchProvider: async () => new Response("not-json", { status: 200 }),
  });
  await assert.rejects(
    createLemonCheckoutV1("monthly", malformedJson.dependencies),
    (error) => error instanceof LemonCheckoutErrorV1
      && error.code === "invalid-provider-response",
  );

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
    createLemonCheckoutV1("monthly", timedOut.dependencies),
    (error) => error instanceof LemonCheckoutErrorV1
      && error.code === "provider-unavailable",
  );
}

function verifyRequestParser(): void {
  assert.equal(parseLemonCheckoutRequestV1({ plan: "monthly" }), "monthly");
  assert.equal(parseLemonCheckoutRequestV1({ plan: "annual" }), "annual");

  for (const value of [
    null,
    [],
    {},
    { plan: "weekly" },
    { plan: ["monthly"] },
    { plan: { value: "monthly" } },
    { plan: "monthly", variant: "999" },
    { plan: "monthly", product: "999" },
    { plan: "monthly", store: "999" },
    { plan: "monthly", userId: INTERNAL_USER_ID },
  ]) {
    assert.equal(parseLemonCheckoutRequestV1(value), null);
  }
}

function verifyProductionReturnIdentity(): void {
  const source = readFileSync(
    fileURLToPath(new URL("../lemonCheckout.ts", import.meta.url)),
    "utf8",
  );

  assert.match(source, /buildCanonicalUrl\("\/account"\)/);
  assert.doesNotMatch(
    source,
    /NEXT_PUBLIC_SITE_URL|VERCEL_URL|request\s*host|vip\.chronoversecapital|vault\.chronoversecapital/i,
  );
}

async function main(): Promise<void> {
  verifyRequestParser();
  verifyProductionReturnIdentity();
  await verifyPlanMapping("monthly", "2112907");
  await verifyPlanMapping("annual", "2112850");
  await verifyAuthenticationPrecedesProvider();
  await verifyConfigurationFailures();
  await verifyProviderFailures();

  console.log("PASS: secure Lemon checkout service contract");
}

void main();
