import { createHmac } from "node:crypto";

import {
  LEMON_SUBSCRIPTION_INVOICE_WEBHOOK_EVENTS_V1,
  LEMON_SUBSCRIPTION_WEBHOOK_EVENTS_V1,
  parseVerifiedLemonSubscriptionWebhookV1,
  type VerifiedLemonWebhookProcessingInputV1,
} from "../lemonSubscriptionWebhook";
import { handleLemonWebhookIngressV1 } from "../lemonWebhookIngress";

const SECRET = "b5b-test-secret";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

interface PayloadOptionsV1 {
  readonly eventName?: string;
  readonly objectType?: string;
  readonly customData?: unknown;
  readonly omitCustomData?: boolean;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

function subscriptionPayloadV1(
  options: PayloadOptionsV1 = {},
): Record<string, unknown> {
  const eventName = options.eventName ?? "subscription_created";
  const meta: Record<string, unknown> = { event_name: eventName };

  if (!options.omitCustomData) {
    meta.custom_data = options.customData ?? {
      chronoverse_user_id: USER_ID,
      role: "owner-is-ignored",
      entitlement: "active-is-ignored",
    };
  }

  return {
    meta,
    data: {
      type: options.objectType ?? "subscriptions",
      id: "42",
      attributes: {
        store_id: 7,
        customer_id: 8,
        order_id: 9,
        order_item_id: 10,
        product_id: 11,
        variant_id: 12,
        status: "active",
        cancelled: false,
        pause: null,
        trial_ends_at: null,
        billing_anchor: 17,
        first_subscription_item: {
          id: 13,
          price_id: 14,
          quantity: 2,
          card_brand: "not-read",
        },
        renews_at: "2026-10-12T08:15:30.000000Z",
        ends_at: null,
        created_at: "2026-09-01T08:15:30.000000Z",
        updated_at: "2026-09-12T08:15:30.123456Z",
        test_mode: false,
        user_name: "Not Persisted",
        user_email: "not-used@example.test",
        card_brand: "visa",
        card_last_four: "4242",
        payment_processor: "stripe",
        urls: {
          customer_portal: "https://example.test/private",
          update_payment_method: "https://example.test/payment",
        },
        ...options.attributes,
      },
    },
  };
}

function processingInputV1(
  payload: unknown,
  overrides: Partial<VerifiedLemonWebhookProcessingInputV1> = {},
): VerifiedLemonWebhookProcessingInputV1 {
  return Object.freeze({
    payload,
    eventName: "subscription_created",
    objectType: "subscriptions",
    objectId: "42",
    storeId: "7",
    testMode: false,
    upstreamEventAt: "2026-09-12T08:15:30.123456Z",
    idempotencyKey: "logical-event-key",
    ...overrides,
  });
}

function parsedSubscriptionV1(
  payload: unknown,
  overrides: Partial<VerifiedLemonWebhookProcessingInputV1> = {},
) {
  const parsed = parseVerifiedLemonSubscriptionWebhookV1(
    processingInputV1(payload, overrides),
  );
  assertEqual(parsed.kind, "subscription", "fixture parses as a subscription");

  if (parsed.kind !== "subscription") {
    throw new Error("Expected parsed subscription fixture.");
  }

  return parsed;
}

function verifyCreatedFactsAndIdentity(): void {
  const parsed = parsedSubscriptionV1(subscriptionPayloadV1());

  assertEqual(parsed.customDataState, "valid",
    "created payload carries syntax-valid custom identity");
  assertEqual(parsed.chronoverseUserId, USER_ID,
    "only the Chronoverse UUID crosses into the DB contract");
  assertDeepEqual(parsed.facts, {
    lemonSubscriptionId: "42",
    lemonCustomerId: "8",
    lemonOrderId: "9",
    lemonOrderItemId: "10",
    lemonProductId: "11",
    lemonVariantId: "12",
    lemonSubscriptionItemId: "13",
    lemonPriceId: "14",
    quantity: 2,
    rawStatus: "active",
    cancelled: false,
    pauseMode: null,
    pauseResumesAt: null,
    trialEndsAt: null,
    billingAnchor: 17,
    renewsAt: "2026-10-12T08:15:30.000000Z",
    endsAt: null,
    upstreamCreatedAt: "2026-09-01T08:15:30.000000Z",
    upstreamUpdatedAt: "2026-09-12T08:15:30.123456Z",
  }, "created payload preserves only deployed subscription facts");

  const serialized = JSON.stringify(parsed);
  for (const sensitive of [
    "not-used@example.test",
    "Not Persisted",
    "4242",
    "stripe",
    "example.test/private",
    "owner-is-ignored",
    "active-is-ignored",
  ]) {
    assertEqual(serialized.includes(sensitive), false,
      `parsed persistence contract excludes ${sensitive}`);
  }
}

function verifyIdentityStates(): void {
  const absent = parsedSubscriptionV1(subscriptionPayloadV1({
    eventName: "subscription_updated",
    omitCustomData: true,
  }), { eventName: "subscription_updated" });
  assertEqual(absent.customDataState, "absent",
    "later event may defer to an existing customer mapping");
  assertEqual(absent.chronoverseUserId, null,
    "absent custom data invents no internal identity");

  for (const customData of [
    { chronoverse_user_id: "not-a-uuid" },
    { auth_user_id: USER_ID },
    { user_email: "not-identity@example.test" },
  ]) {
    const invalid = parsedSubscriptionV1(subscriptionPayloadV1({ customData }));
    assertEqual(invalid.customDataState, "invalid",
      "present malformed custom data cannot become trusted identity");
    assertEqual(invalid.chronoverseUserId, null,
      "email and auth subject never substitute for the internal UUID");
  }
}

function verifyLifecycleFacts(): void {
  const cases = [
    {
      eventName: "subscription_cancelled",
      attributes: {
        status: "cancelled",
        cancelled: true,
        ends_at: "2026-10-12T08:15:30.000000Z",
      },
      check: (facts: ReturnType<typeof parsedSubscriptionV1>["facts"]) => {
        assertEqual(facts.cancelled, true, "cancelled flag is preserved");
        assertEqual(facts.endsAt, "2026-10-12T08:15:30.000000Z",
          "cancellation end is preserved");
      },
    },
    {
      eventName: "subscription_paused",
      attributes: {
        status: "paused",
        pause: {
          mode: "void",
          resumes_at: "2026-09-20T08:15:30.000000Z",
        },
      },
      check: (facts: ReturnType<typeof parsedSubscriptionV1>["facts"]) => {
        assertEqual(facts.pauseMode, "void", "pause mode is preserved");
        assertEqual(facts.pauseResumesAt, "2026-09-20T08:15:30.000000Z",
          "pause resumption is preserved");
      },
    },
    {
      eventName: "subscription_unpaused",
      attributes: { status: "active", pause: null },
      check: (facts: ReturnType<typeof parsedSubscriptionV1>["facts"]) => {
        assertEqual(facts.pauseMode, null, "unpause clears pause mode");
        assertEqual(facts.pauseResumesAt, null,
          "unpause clears pause resumption");
      },
    },
    {
      eventName: "subscription_resumed",
      attributes: { status: "active", cancelled: false, ends_at: null },
      check: (facts: ReturnType<typeof parsedSubscriptionV1>["facts"]) => {
        assertEqual(facts.cancelled, false, "resume clears cancellation");
        assertEqual(facts.endsAt, null, "resume clears end time from payload");
      },
    },
    {
      eventName: "subscription_plan_changed",
      attributes: { product_id: 21, variant_id: 22 },
      check: (facts: ReturnType<typeof parsedSubscriptionV1>["facts"]) => {
        assertEqual(facts.lemonProductId, "21", "plan product is preserved");
        assertEqual(facts.lemonVariantId, "22", "plan variant is preserved");
      },
    },
    {
      eventName: "subscription_expired",
      attributes: {
        status: "expired",
        ends_at: "2026-09-12T08:15:30.123456Z",
      },
      check: (facts: ReturnType<typeof parsedSubscriptionV1>["facts"]) => {
        assertEqual(facts.rawStatus, "expired", "expired status is preserved");
        assertEqual(facts.endsAt, "2026-09-12T08:15:30.123456Z",
          "expiration time is preserved");
      },
    },
  ] as const;

  for (const testCase of cases) {
    const parsed = parsedSubscriptionV1(subscriptionPayloadV1({
      eventName: testCase.eventName,
      attributes: testCase.attributes,
    }), { eventName: testCase.eventName });
    testCase.check(parsed.facts);
  }

  const noItem = parsedSubscriptionV1(subscriptionPayloadV1({
    attributes: { first_subscription_item: null },
  }));
  assertDeepEqual({
    id: noItem.facts.lemonSubscriptionItemId,
    price: noItem.facts.lemonPriceId,
    quantity: noItem.facts.quantity,
  }, { id: null, price: null, quantity: null },
  "missing first subscription item remains explicitly null");

  const usageBased = parsedSubscriptionV1(subscriptionPayloadV1({
    attributes: {
      first_subscription_item: { id: 13, price_id: 14, quantity: 0 },
    },
  }));
  assertEqual(usageBased.facts.quantity, 0,
    "documented usage-based zero quantity is preserved faithfully");
}

function verifyStrictParsing(): void {
  const invalidAttributes = [
    { store_id: Number.MAX_SAFE_INTEGER + 1 },
    { customer_id: "customer-eight" },
    { status: " active" },
    { cancelled: "false" },
    { test_mode: 0 },
    { created_at: "2026-09-01 08:15:30" },
    { created_at: "2026-09-13T08:15:30.000000Z" },
    { updated_at: "not-a-time" },
    { renews_at: undefined },
    { pause: { mode: "later", resumes_at: null } },
    { first_subscription_item: { id: 13, price_id: 14, quantity: -1 } },
    { billing_anchor: 32 },
  ];

  for (const attributes of invalidAttributes) {
    const parsed = parseVerifiedLemonSubscriptionWebhookV1(processingInputV1(
      subscriptionPayloadV1({ attributes }),
    ));
    assertEqual(parsed.kind, "invalid-subscription",
      `invalid subscription facts fail closed: ${JSON.stringify(attributes)}`);
  }
}

function verifySupportedAndIgnoredEvents(): void {
  for (const eventName of LEMON_SUBSCRIPTION_WEBHOOK_EVENTS_V1) {
    const parsed = parseVerifiedLemonSubscriptionWebhookV1(processingInputV1(
      subscriptionPayloadV1({ eventName }),
      { eventName },
    ));
    assertEqual(parsed.kind, "subscription",
      `${eventName} accepts a Subscription object`);
  }

  for (const eventName of LEMON_SUBSCRIPTION_INVOICE_WEBHOOK_EVENTS_V1) {
    const parsed = parseVerifiedLemonSubscriptionWebhookV1(processingInputV1(
      subscriptionPayloadV1({ eventName, objectType: "subscription-invoices" }),
      { eventName, objectType: "subscription-invoices", objectId: "invoice-42" },
    ));
    assertEqual(parsed.kind, "ignored",
      `${eventName} does not guess Subscription facts from an invoice`);
  }

  for (const [eventName, objectType] of [
    ["future_vendor_event", "future-objects"],
    ["order_refunded", "orders"],
    ["subscription_updated", "orders"],
  ] as const) {
    const parsed = parseVerifiedLemonSubscriptionWebhookV1(processingInputV1(
      subscriptionPayloadV1({ eventName, objectType }),
      { eventName, objectType },
    ));
    assertEqual(parsed.kind, "ignored",
      `${eventName}/${objectType} is safely unsupported`);
  }
}

function signatureV1(rawBody: string): string {
  return createHmac("sha256", SECRET).update(rawBody).digest("hex");
}

async function verifyIngressOrderingAndResults(): Promise<void> {
  const rawBody = JSON.stringify(subscriptionPayloadV1());
  const sequence: string[] = [];
  let processingCalls = 0;
  const dependencies = {
    getWebhookSecret: () => {
      sequence.push("secret");
      return SECRET;
    },
    persistReceipt: async () => {
      sequence.push("receipt");
      return "inserted" as const;
    },
    processVerifiedEvent: async (input: VerifiedLemonWebhookProcessingInputV1) => {
      sequence.push("process");
      processingCalls += 1;
      assertEqual(
        parseVerifiedLemonSubscriptionWebhookV1(input).kind,
        "subscription",
        "commercial parsing receives the verified in-memory payload",
      );
      return "processed" as const;
    },
  };

  const invalid = await handleLemonWebhookIngressV1(new Request(
    "https://example.test/api/webhooks/lemon-squeezy",
    { method: "POST", body: rawBody, headers: { "X-Signature": "0".repeat(64) } },
  ), dependencies);
  assertEqual(invalid.status, 401, "invalid signature is rejected");
  assertEqual(processingCalls, 0,
    "invalid signature causes zero commercial processing");

  sequence.length = 0;
  const valid = await handleLemonWebhookIngressV1(new Request(
    "https://example.test/api/webhooks/lemon-squeezy",
    {
      method: "POST",
      body: rawBody,
      headers: { "X-Signature": signatureV1(rawBody) },
    },
  ), dependencies);
  assertEqual(valid.status, 200, "verified subscription is acknowledged");
  assertEqual((await valid.json() as { status: string }).status, "processed",
    "applied subscription returns processed");
  assertDeepEqual(sequence, ["secret", "receipt", "process"],
    "receipt intake precedes verified commercial processing");

  for (const [processingResult, expectedStatus] of [
    ["ignored", "ignored"],
    ["duplicate", "duplicate"],
  ] as const) {
    const response = await handleLemonWebhookIngressV1(new Request(
      "https://example.test/api/webhooks/lemon-squeezy",
      {
        method: "POST",
        body: rawBody,
        headers: { "X-Signature": signatureV1(rawBody) },
      },
    ), {
      ...dependencies,
      processVerifiedEvent: async () => processingResult,
    });
    assertEqual(response.status, 200, `${processingResult} returns HTTP 200`);
    assertEqual((await response.json() as { status: string }).status,
      expectedStatus, `${processingResult} has a minimal deterministic body`);
  }
}

async function main(): Promise<void> {
  verifyCreatedFactsAndIdentity();
  verifyIdentityStates();
  verifyLifecycleFacts();
  verifyStrictParsing();
  verifySupportedAndIgnoredEvents();
  await verifyIngressOrderingAndResults();

  console.log("PASS: verified Lemon subscription webhook processing");
}

void main();
