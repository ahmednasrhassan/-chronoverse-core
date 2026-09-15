import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { evaluateCommercialEntitlementV1 } from "../entitlement";
import { parseVerifiedLemonPaymentV1 } from "../lemonPaymentLifecycle";
import { normalizeSubscriptionLifecycleV1,
  type LemonSubscriptionLifecycleFactsV1 } from "../lifecycle";
import type { VerifiedLemonWebhookProcessingInputV1 } from
  "../lemonSubscriptionWebhook";

const NOW = "2026-09-15T12:00:00.000Z";
const T1 = "2026-09-15T10:00:00.000000Z";
const T2 = "2026-09-15T11:00:00.000000Z";
const BASE: LemonSubscriptionLifecycleFactsV1 = Object.freeze({
  subscriptionId: "42", storeId: "7", rawStatus: "active",
  cancelled: false, renewsAt: "2026-10-15T12:00:00.000Z",
  endsAt: null, pauseMode: null, pauseResumesAt: null,
  trialEndsAt: null, upstreamUpdatedAt: T1, testMode: false,
  productId: "21", variantId: "22", refundAffected: false,
  paymentIssue: false,
});

function input(eventName: string, status: string, updatedAt = T1,
  overrides: Record<string, unknown> = {},
): VerifiedLemonWebhookProcessingInputV1 {
  return {
    eventName, objectType: "subscription-invoices", objectId: "91",
    storeId: "7", testMode: false, upstreamEventAt: updatedAt,
    idempotencyKey: `test:${eventName}:${updatedAt}`,
    payload: { meta: { event_name: eventName }, data: {
      type: "subscription-invoices", id: "91", attributes: {
        store_id: 7, subscription_id: 42, customer_id: 41,
        status, refunded: false, test_mode: false,
        created_at: T1, updated_at: updatedAt, ...overrides,
      },
    } },
  };
}

function access(overrides: Partial<LemonSubscriptionLifecycleFactsV1> = {}):
  "active" | "inactive" | "unresolved" {
  const lifecycle = normalizeSubscriptionLifecycleV1({ ...BASE, ...overrides });
  return evaluateCommercialEntitlementV1(lifecycle,
    { now: NOW, testMode: false }).state;
}

function verifyInvoiceParsing(): void {
  for (const eventName of ["subscription_payment_success",
    "subscription_payment_recovered"]) {
    const parsed = parseVerifiedLemonPaymentV1(input(eventName, "paid", T2));
    assert.equal(parsed?.paymentIssue, false);
    assert.equal(parsed?.subscriptionId, "42");
    assert.equal(parsed?.customerId, "41");
    assert.equal(parsed?.invoiceUpdatedAt, T2);
  }
  assert.equal(parseVerifiedLemonPaymentV1(input(
    "subscription_payment_failed", "pending"))?.paymentIssue, true);
  assert.equal(parseVerifiedLemonPaymentV1(input(
    "subscription_payment_failed", "void"))?.paymentIssue, true);
  for (const invalid of [
    input("subscription_payment_failed", "paid"),
    input("subscription_payment_success", "pending"),
    input("subscription_payment_success", "paid", T1,
      { refunded: true }),
    input("subscription_payment_success", "paid", T1,
      { subscription_id: null }),
    input("subscription_payment_success", "paid", T1,
      { customer_id: 99, updated_at: T2 }),
    input("subscription_payment_success", "paid", T1,
      { test_mode: true }),
  ]) assert.equal(parseVerifiedLemonPaymentV1(invalid), null);
  assert.equal(parseVerifiedLemonPaymentV1(input(
    "future_invoice_event", "paid")), null);
}

function verifyEntitlementCombinations(): void {
  assert.equal(access(), "active");
  assert.equal(access({ paymentIssue: true }), "unresolved");
  assert.equal(access({ pauseMode: "void", rawStatus: "paused",
    pauseResumesAt: "2026-10-01T00:00:00.000Z" }), "unresolved");
  assert.equal(access({ pauseMode: "free", rawStatus: "paused",
    pauseResumesAt: "2026-09-01T00:00:00.000Z" }), "unresolved",
    "past resumes_at alone is not an authoritative unpause");
  assert.equal(access({ paymentIssue: true, pauseMode: "void",
    rawStatus: "paused" }), "unresolved");
  assert.equal(access({ paymentIssue: false, pauseMode: "void",
    rawStatus: "paused" }), "unresolved");
  assert.equal(access({ paymentIssue: true, pauseMode: null }), "unresolved");
  assert.equal(access({ paymentIssue: false, pauseMode: null }), "active");
  assert.equal(access({ refundAffected: true }), "unresolved");
  assert.equal(access({ refundAffected: true, paymentIssue: false,
    pauseMode: null }), "unresolved");
  assert.equal(access({ rawStatus: "expired", endsAt: T1 }), "inactive");
  assert.equal(access({ rawStatus: "past_due" }), "unresolved");
  assert.equal(access({ rawStatus: "cancelled", cancelled: true,
    endsAt: "2026-09-16T00:00:00.000Z" }), "active");
  assert.equal(access({ rawStatus: "cancelled", cancelled: true,
    endsAt: T1 }), "inactive");
  assert.equal(access({ rawStatus: "cancelled", cancelled: true,
    endsAt: "2026-09-16T00:00:00.000Z", paymentIssue: true }),
    "unresolved");
  assert.equal(access({ rawStatus: "cancelled", cancelled: true,
    endsAt: "2026-09-16T00:00:00.000Z", pauseMode: "void" }),
    "unresolved");
}

function verifyPersistenceContract(): void {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const migration = readFileSync(`${root}supabase/migrations/` +
    "202609150003_lemon_payment_lifecycle.sql", "utf8").toLowerCase();
  const rpc = migration.slice(migration.indexOf(
    "create function public.process_lemon_payment_lifecycle_v1"),
    migration.indexOf("$$;", migration.indexOf(
      "create function public.process_lemon_payment_lifecycle_v1")));
  assert.match(migration, /add column payment_issue boolean not null default false/);
  assert.match(migration, /payment_evidence_updated_at timestamptz/);
  assert.match(migration, /foreign key \(store_id, test_mode, payment_evidence_receipt_id\)/);
  assert.match(rpc, /security definer\s+set search_path = ''/);
  assert.match(rpc, /p_test_mode is distinct from false/);
  assert.match(rpc, /lemon_subscription_id = p_subscription_id\s+for update/);
  assert.match(rpc, /lemon_customer_id is distinct from p_customer_id/);
  assert.match(rpc, /trusted subscription is unavailable/);
  assert.match(rpc, /p_invoice_updated_at < v_subscription.payment_evidence_updated_at/);
  assert.match(rpc, /p_invoice_updated_at = v_subscription.payment_evidence_updated_at/);
  assert.match(rpc, /payment-evidence-version-conflict/);
  assert.match(rpc, /payment-evidence-idempotent/);
  assert.match(rpc, /payment-evidence-applied/);
  assert.ok(rpc.indexOf("p_invoice_updated_at <") <
    rpc.indexOf("p_invoice_updated_at ="));
  assert.ok(rpc.indexOf("p_invoice_updated_at =") <
    rpc.lastIndexOf("payment_issue = p_payment_issue"));
  for (const field of ["refund_affected =", "\n    status =", "ends_at =",
    "product_id =", "variant_id =", "upstream_updated_at ="])
    assert.equal(rpc.includes(field), false, `${field} remains authoritative`);
  for (const target of ["app_private.lemon_customers",
    "insert into app_private.lemon_subscriptions"])
    assert.equal(rpc.includes(target), false,
      "invoice event cannot create identity or subscription");
  assert.match(migration, /from app_private.users as app_user[\s\S]*where app_user.auth_user_id = \(select auth.uid\(\)\)/);
  assert.match(migration, /revoke all on function public.process_lemon_payment_lifecycle_v1[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public.process_lemon_payment_lifecycle_v1[\s\S]*to service_role/);
  assert.equal(migration.includes("grant usage on schema app_private"), false);
  const intake = migration.slice(migration.indexOf(
    "create or replace function public.ingest_lemon_webhook_receipt_v1"));
  assert.match(intake, /security definer\s+set search_path = ''/);
  assert.match(intake, /receipt.processing_status = 'failed'/);
  for (const recoverable of ["customer-linkage-missing",
    "commercial-user-not-found", "refund-subscription-not-found"])
    assert.ok(intake.includes(`'${recoverable}'`));
  for (const exactFact of ["payload_sha256 = excluded.payload_sha256",
    "event_type = excluded.event_type",
    "upstream_object_type is not distinct from excluded.upstream_object_type",
    "upstream_object_id is not distinct from excluded.upstream_object_id",
    "upstream_event_at is not distinct from excluded.upstream_event_at"])
    assert.ok(intake.includes(exactFact), `redelivery matches ${exactFact}`);
  assert.match(intake, /set processing_status = 'pending',[\s\S]*processed_at = null/);
  assert.doesNotMatch(intake, /'payment-evidence-version-conflict'|'invalid-payment-evidence'/);
  assert.match(intake, /grant execute on function public.ingest_lemon_webhook_receipt_v1[\s\S]*to service_role/);
}

verifyInvoiceParsing();
verifyEntitlementCombinations();
verifyPersistenceContract();
console.log("PASS: Lemon payment lifecycle parsing, entitlement and RPC contract");
