import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseVerifiedLemonSubscriptionRefundV1,
  type LemonSubscriptionRefundFactsV1,
} from "../lemonSubscriptionRefund";
import type { VerifiedLemonWebhookProcessingInputV1 } from
  "../lemonSubscriptionWebhook";

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

interface RefundPayloadOptionsV1 {
  readonly objectType?: string;
  readonly objectId?: unknown;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

function refundPayloadV1(
  options: RefundPayloadOptionsV1 = {},
): Record<string, unknown> {
  return {
    meta: {
      event_name: "subscription_payment_refunded",
      custom_data: {
        chronoverse_user_id: "11111111-1111-4111-8111-111111111111",
      },
    },
    data: {
      type: options.objectType ?? "subscription-invoices",
      id: options.objectId ?? "91",
      attributes: {
        store_id: 7,
        subscription_id: 42,
        customer_id: 8,
        status: "refunded",
        refunded: true,
        refunded_at: "2026-09-12T08:00:00.000000Z",
        refunded_amount: 2500,
        created_at: "2026-09-01T08:00:00.000000Z",
        updated_at: "2026-09-12T08:15:30.123456Z",
        test_mode: false,
        user_email: "not-used@example.test",
        card_brand: "visa",
        card_last_four: "4242",
        urls: { invoice_url: "https://example.test/private-invoice" },
        affiliate_id: "not-persisted",
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
    eventName: "subscription_payment_refunded",
    objectType: "subscription-invoices",
    objectId: "91",
    storeId: "7",
    testMode: false,
    upstreamEventAt: "2026-09-12T08:15:30.123456Z",
    idempotencyKey: "refund-logical-event-key",
    ...overrides,
  });
}

function parsedFactsV1(
  payload: unknown,
  overrides: Partial<VerifiedLemonWebhookProcessingInputV1> = {},
): LemonSubscriptionRefundFactsV1 {
  const parsed = parseVerifiedLemonSubscriptionRefundV1(
    processingInputV1(payload, overrides),
  );
  assertEqual(parsed.kind, "subscription-refund", "refund fixture parses");

  if (parsed.kind !== "subscription-refund") {
    throw new Error("Expected parsed subscription refund fixture.");
  }

  return parsed.facts;
}

function verifyFullAndPartialRefunds(): void {
  const full = parsedFactsV1(refundPayloadV1());
  assertDeepEqual(full, {
    invoiceId: "91",
    lemonSubscriptionId: "42",
    lemonCustomerId: "8",
    refundStatus: "refunded",
    refunded: true,
    refundedAt: "2026-09-12T08:00:00.000000Z",
    refundedAmount: 2500,
    invoiceCreatedAt: "2026-09-01T08:00:00.000000Z",
    invoiceUpdatedAt: "2026-09-12T08:15:30.123456Z",
  }, "full refund preserves only required verified facts");

  const partial = parsedFactsV1(refundPayloadV1({
    attributes: { status: "partial_refund", refunded_amount: 500 },
  }));
  assertEqual(partial.refundStatus, "partial_refund",
    "partial refund status is accepted");
  assertEqual(partial.refundedAmount, 500,
    "partial refund amount is preserved");
  assertEqual(partial.refunded, true,
    "partial refund is refund-affected evidence");
}

function verifyStrictRefundParsing(): void {
  const invalidCases: readonly Readonly<{
    label: string;
    payload: Record<string, unknown>;
    overrides?: Partial<VerifiedLemonWebhookProcessingInputV1>;
  }>[] = [
    {
      label: "wrong object type",
      payload: refundPayloadV1({ objectType: "subscriptions" }),
      overrides: { objectType: "subscriptions" },
    },
    {
      label: "malformed invoice ID",
      payload: refundPayloadV1({ objectId: "invoice-91" }),
      overrides: { objectId: "invoice-91" },
    },
    {
      label: "malformed subscription ID",
      payload: refundPayloadV1({ attributes: { subscription_id: "sub-42" } }),
    },
    {
      label: "malformed store ID",
      payload: refundPayloadV1({ attributes: { store_id: "07" } }),
    },
    {
      label: "malformed customer ID",
      payload: refundPayloadV1({ attributes: { customer_id: 0 } }),
    },
    {
      label: "invalid updated timestamp",
      payload: refundPayloadV1({ attributes: { updated_at: "2026-09-12 08:15:30" } }),
    },
    {
      label: "missing refund timestamp",
      payload: refundPayloadV1({ attributes: { refunded_at: null } }),
    },
    {
      label: "refund after invoice version",
      payload: refundPayloadV1({
        attributes: { refunded_at: "2026-09-13T08:00:00.000000Z" },
      }),
    },
    {
      label: "negative refund amount",
      payload: refundPayloadV1({ attributes: { refunded_amount: -1 } }),
    },
    {
      label: "unsupported refund status",
      payload: refundPayloadV1({ attributes: { status: "paid" } }),
    },
    {
      label: "refunded flag false",
      payload: refundPayloadV1({ attributes: { refunded: false } }),
    },
    {
      label: "test mode envelope mismatch",
      payload: refundPayloadV1({ attributes: { test_mode: true } }),
    },
  ] as const;

  for (const testCase of invalidCases) {
    const parsed = parseVerifiedLemonSubscriptionRefundV1(processingInputV1(
      testCase.payload,
      testCase.overrides ?? {},
    ));
    assertEqual(parsed.kind, "invalid-subscription-refund",
      `${testCase.label} fails closed`);
  }
}

function verifySensitiveFieldsAreIgnored(): void {
  const parsed = parseVerifiedLemonSubscriptionRefundV1(
    processingInputV1(refundPayloadV1()),
  );
  const serialized = JSON.stringify(parsed);

  for (const sensitive of [
    "not-used@example.test",
    "visa",
    "4242",
    "example.test/private-invoice",
    "not-persisted",
    "chronoverse_user_id",
  ]) {
    assertEqual(serialized.includes(sensitive), false,
      `refund contract excludes ${sensitive}`);
  }
}

function auditRefundIsolation(): void {
  const source = readFileSync(
    fileURLToPath(new URL("../lemonSubscriptionRefund.ts", import.meta.url)),
    "utf8",
  ).toLowerCase();

  for (const forbidden of [
    "email",
    "card_brand",
    "card_last_four",
    "invoice_url",
    "affiliate",
    "raw_payload",
    "fetch(",
    "vip_active",
    "resolveaccessv1",
    ".schema(\"app_private\")",
  ]) {
    assertEqual(source.includes(forbidden), false,
      `refund processor contains no ${forbidden} authority or persistence`);
  }
}

function main(): void {
  verifyFullAndPartialRefunds();
  verifyStrictRefundParsing();
  verifySensitiveFieldsAreIgnored();
  auditRefundIsolation();

  console.log("PASS: verified Lemon subscription refund parsing");
}

main();
