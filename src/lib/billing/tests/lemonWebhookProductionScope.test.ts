import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { handleLemonWebhookIngressV1 } from "../lemonWebhookIngress";
import {
  classifyVerifiedLemonProductionScopeV1,
  LemonWebhookProductionScopeErrorV1,
  type LemonWebhookProductionScopeDependenciesV1,
} from "../lemonWebhookProductionScope";
import type { VerifiedLemonWebhookProcessingInputV1 } from
  "../lemonSubscriptionWebhook";

const SECRET = "scope-test-secret";
const CONFIG = Object.freeze({
  storeId: "7",
  productId: "21",
  monthlyVariantId: "22",
  annualVariantId: "23",
  variantIds: Object.freeze(["22", "23"] as const),
});

function payload(options: Readonly<{
  eventName?: string;
  objectType?: string;
  objectId?: string;
  storeId?: unknown;
  productId?: unknown;
  variantId?: unknown;
  subscriptionId?: unknown;
  testMode?: unknown;
}> = {}): Record<string, unknown> {
  return {
    meta: {
      event_name: options.eventName ?? "subscription_updated",
      custom_data: {
        chronoverse_user_id: "11111111-1111-4111-8111-111111111111",
      },
    },
    data: {
      type: options.objectType ?? "subscriptions",
      id: options.objectId ?? "42",
      attributes: {
        store_id: hasOwn(options, "storeId") ? options.storeId : 7,
        product_id: hasOwn(options, "productId") ? options.productId : 21,
        variant_id: hasOwn(options, "variantId") ? options.variantId : 22,
        subscription_id: hasOwn(options, "subscriptionId")
          ? options.subscriptionId
          : 42,
        test_mode: hasOwn(options, "testMode") ? options.testMode : false,
        updated_at: "2026-09-15T08:15:30.123456Z",
      },
    },
  };
}

function input(
  body: Record<string, unknown>,
  overrides: Partial<VerifiedLemonWebhookProcessingInputV1> = {},
): VerifiedLemonWebhookProcessingInputV1 {
  const data = body.data as Record<string, unknown>;
  const meta = body.meta as Record<string, unknown>;
  const attributes = data.attributes as Record<string, unknown>;

  return Object.freeze({
    payload: body,
    eventName: String(meta.event_name),
    objectType: String(data.type),
    objectId: String(data.id),
    storeId: String(attributes.store_id),
    testMode: attributes.test_mode as boolean,
    upstreamEventAt: String(attributes.updated_at),
    idempotencyKey: "scope-test-key",
    ...overrides,
  });
}

function scopeRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return Object.freeze({
    lemon_subscription_id: "42",
    store_id: "7",
    product_id: "21",
    variant_id: "22",
    test_mode: false,
    ...overrides,
  });
}

function dependencies(
  rows: unknown = [scopeRow()],
): LemonWebhookProductionScopeDependenciesV1 {
  return {
    getCommercialConfig: () => CONFIG,
    loadSubscriptionScope: async () => rows,
  };
}

async function verifySubscriptionScope(): Promise<void> {
  for (const variantId of [22, 23]) {
    assert.equal(
      await classifyVerifiedLemonProductionScopeV1(
        input(payload({ variantId })),
        dependencies(),
      ),
      "in-scope",
    );
  }

  for (const body of [
    payload({ testMode: true }),
    payload({ storeId: 8 }),
    payload({ productId: 24 }),
    payload({ variantId: 25 }),
    payload({ productId: null }),
    payload({ variantId: "unreadable" }),
  ]) {
    assert.equal(
      await classifyVerifiedLemonProductionScopeV1(input(body), dependencies()),
      "out-of-scope",
    );
  }

  assert.equal(
    await classifyVerifiedLemonProductionScopeV1(input(payload({
      eventName: "future_signed_event",
      objectType: "future-objects",
    })), dependencies()),
    "not-applicable",
  );
}

async function verifyRefundScope(): Promise<void> {
  const refund = payload({
    eventName: "subscription_payment_refunded",
    objectType: "subscription-invoices",
    objectId: "91",
  });
  const calls: Array<[string, boolean, string]> = [];
  const refundDependencies: LemonWebhookProductionScopeDependenciesV1 = {
    getCommercialConfig: () => CONFIG,
    loadSubscriptionScope: async (storeId, testMode, subscriptionId) => {
      calls.push([storeId, testMode, subscriptionId]);
      return [scopeRow()];
    },
  };

  assert.equal(
    await classifyVerifiedLemonProductionScopeV1(
      input(refund),
      refundDependencies,
    ),
    "in-scope",
  );
  assert.deepEqual(calls, [["7", false, "42"]]);

  for (const rows of [
    [],
    [scopeRow({ product_id: "24" })],
    [scopeRow({ variant_id: "25" })],
    [scopeRow({ test_mode: true })],
    [scopeRow(), scopeRow()],
  ]) {
    assert.equal(
      await classifyVerifiedLemonProductionScopeV1(
        input(refund),
        dependencies(rows),
      ),
      "out-of-scope",
    );
  }

  let testLookupCalls = 0;
  assert.equal(
    await classifyVerifiedLemonProductionScopeV1(
      input(payload({
        eventName: "subscription_payment_refunded",
        objectType: "subscription-invoices",
        objectId: "91",
        testMode: true,
      })),
      {
        getCommercialConfig: () => CONFIG,
        loadSubscriptionScope: async () => {
          testLookupCalls += 1;
          return [scopeRow()];
        },
      },
    ),
    "out-of-scope",
  );
  assert.equal(testLookupCalls, 0);
}

async function verifyPaymentScope(): Promise<void> {
  for (const eventName of ["subscription_payment_failed",
    "subscription_payment_success", "subscription_payment_recovered"]) {
    const invoice = input(payload({ eventName,
      objectType: "subscription-invoices", objectId: "91",
      productId: null, variantId: null }));
    assert.equal(await classifyVerifiedLemonProductionScopeV1(invoice,
      dependencies([scopeRow()])), "in-scope");
    for (const rows of [[], [scopeRow({ product_id: "24" })],
      [scopeRow({ variant_id: "25" })]]) {
      assert.equal(await classifyVerifiedLemonProductionScopeV1(invoice,
        dependencies(rows)), "out-of-scope");
    }
    assert.equal(await classifyVerifiedLemonProductionScopeV1(
      input(payload({ eventName, objectType: "subscription-invoices",
        objectId: "91", testMode: true })), dependencies()), "out-of-scope");
  }
}

async function verifyIngressOrderingAndMutationBoundary(): Promise<void> {
  for (const [label, body, rows, expectedProcessCalls] of [
    ["monthly lifecycle", payload(), [scopeRow()], 1],
    ["annual lifecycle", payload({ variantId: 23 }), [scopeRow()], 1],
    ["monthly creation", payload({ eventName: "subscription_created" }),
      [scopeRow()], 1],
    ["wrong store", payload({ storeId: 8 }), [scopeRow()], 0],
    ["wrong product", payload({ productId: 24 }), [scopeRow()], 0],
    ["wrong variant", payload({ variantId: 25 }), [scopeRow()], 0],
    ["test subscription", payload({ testMode: true }), [scopeRow()], 0],
    ["missing product", payload({ productId: null }), [scopeRow()], 0],
    ["valid refund", payload({
      eventName: "subscription_payment_refunded",
      objectType: "subscription-invoices",
      objectId: "91",
    }), [scopeRow()], 1],
    ["wrong-product refund", payload({
      eventName: "subscription_payment_refunded",
      objectType: "subscription-invoices",
      objectId: "91",
    }), [scopeRow({ product_id: "24" })], 0],
    ["test refund", payload({
      eventName: "subscription_payment_refunded",
      objectType: "subscription-invoices",
      objectId: "91",
      testMode: true,
    }), [scopeRow()], 0],
    ["valid payment failure", payload({
      eventName: "subscription_payment_failed",
      objectType: "subscription-invoices", objectId: "91",
    }), [scopeRow()], 1],
    ["wrong-product payment failure", payload({
      eventName: "subscription_payment_failed",
      objectType: "subscription-invoices", objectId: "91",
    }), [scopeRow({ product_id: "24" })], 0],
    ["wrong-variant payment failure", payload({
      eventName: "subscription_payment_failed",
      objectType: "subscription-invoices", objectId: "91",
    }), [scopeRow({ variant_id: "25" })], 0],
    ["test payment failure", payload({
      eventName: "subscription_payment_failed",
      objectType: "subscription-invoices", objectId: "91", testMode: true,
    }), [scopeRow()], 0],
  ] as const) {
    const rawBody = JSON.stringify(body);
    let receiptCalls = 0;
    let processCalls = 0;
    const response = await handleLemonWebhookIngressV1(new Request(
      "https://example.test/api/webhooks/lemon-squeezy",
      {
        method: "POST",
        body: rawBody,
        headers: { "X-Signature": signature(rawBody) },
      },
    ), {
      getWebhookSecret: () => SECRET,
      classifyProductionScope: (verifiedInput) =>
        classifyVerifiedLemonProductionScopeV1(
          verifiedInput,
          dependencies(rows),
        ),
      persistReceipt: async () => {
        receiptCalls += 1;
        return "inserted";
      },
      processVerifiedEvent: async () => {
        processCalls += 1;
        return "processed";
      },
    });

    assert.equal(response.status, 200, `${label} returns stable HTTP 200`);
    assert.equal(processCalls, expectedProcessCalls,
      `${label} mutation processing call count`);
    assert.equal(receiptCalls, expectedProcessCalls,
      `${label} receipt call count`);
    assert.equal(
      (await response.json() as { status: string }).status,
      expectedProcessCalls === 1 ? "processed" : "ignored",
      `${label} response status`,
    );
  }
}

async function verifySignatureAndConfigurationFailures(): Promise<void> {
  const rawBody = JSON.stringify(payload());
  let scopeCalls = 0;
  const invalidSignature = await handleLemonWebhookIngressV1(new Request(
    "https://example.test/api/webhooks/lemon-squeezy",
    {
      method: "POST",
      body: rawBody,
      headers: { "X-Signature": "0".repeat(64) },
    },
  ), {
    getWebhookSecret: () => SECRET,
    classifyProductionScope: async () => {
      scopeCalls += 1;
      return "in-scope";
    },
    persistReceipt: async () => "inserted",
    processVerifiedEvent: async () => "processed",
  });
  assert.equal(invalidSignature.status, 401);
  assert.equal(scopeCalls, 0);

  await assert.rejects(
    classifyVerifiedLemonProductionScopeV1(input(payload()), {
      getCommercialConfig: () => { throw new Error("missing config"); },
      loadSubscriptionScope: async () => [],
    }),
    (error) => error instanceof LemonWebhookProductionScopeErrorV1 &&
      error.code === "configuration-unavailable",
  );

  for (const [label, scopeDependencies, publicError] of [
    ["configuration", {
      getCommercialConfig: () => { throw new Error("missing config"); },
      loadSubscriptionScope: async () => [],
    }, "configuration-unavailable"],
    ["refund lookup", {
      getCommercialConfig: () => CONFIG,
      loadSubscriptionScope: async () => {
        throw new Error("database unavailable");
      },
    }, "persistence-unavailable"],
  ] as const) {
    const failureBody = label === "refund lookup"
      ? payload({
        eventName: "subscription_payment_refunded",
        objectType: "subscription-invoices",
        objectId: "91",
      })
      : payload();
    const failureRawBody = JSON.stringify(failureBody);
    let receiptCalls = 0;
    let processCalls = 0;
    const response = await handleLemonWebhookIngressV1(new Request(
      "https://example.test/api/webhooks/lemon-squeezy",
      {
        method: "POST",
        body: failureRawBody,
        headers: { "X-Signature": signature(failureRawBody) },
      },
    ), {
      getWebhookSecret: () => SECRET,
      classifyProductionScope: (verifiedInput) =>
        classifyVerifiedLemonProductionScopeV1(
          verifiedInput,
          scopeDependencies,
        ),
      persistReceipt: async () => {
        receiptCalls += 1;
        return "inserted";
      },
      processVerifiedEvent: async () => {
        processCalls += 1;
        return "processed";
      },
    });
    assert.equal(response.status, 500, `${label} failure is server failure`);
    assert.equal(
      (await response.json() as { error: string }).error,
      publicError,
    );
    assert.equal(receiptCalls, 0);
    assert.equal(processCalls, 0);
  }
}

function signature(rawBody: string): string {
  return createHmac("sha256", SECRET).update(rawBody).digest("hex");
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

async function main(): Promise<void> {
  await verifySubscriptionScope();
  await verifyRefundScope();
  await verifyPaymentScope();
  await verifyIngressOrderingAndMutationBoundary();
  await verifySignatureAndConfigurationFailures();

  console.log("PASS: verified webhook production scope precedes mutation");
}

void main();
