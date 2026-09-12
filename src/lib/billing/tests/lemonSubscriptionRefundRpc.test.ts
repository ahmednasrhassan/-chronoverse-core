import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertMatches(source: string, expected: RegExp, label: string): void {
  assertEqual(expected.test(source), true, label);
}

function auditRefundPersistenceV1(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const migration = readFileSync(
    `${repositoryRoot}supabase/migrations/` +
      "202609120004_lemon_subscription_refund.sql",
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const refundSource = readFileSync(
    `${repositoryRoot}src/lib/billing/lemonSubscriptionRefund.ts`,
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const dispatcherSource = readFileSync(
    `${repositoryRoot}src/lib/billing/lemonSubscriptionWebhook.ts`,
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const signature = migration.slice(
    migration.indexOf("create function"),
    migration.indexOf(")\nreturns text") + 1,
  );
  const functionBody = migration.slice(
    migration.indexOf("as $$"),
    migration.indexOf("$$;") + 3,
  );
  const parameters = Array.from(
    signature.matchAll(/^\s{2}(p_[a-z0-9_]+) ([a-z]+),?$/gm),
    (match) => `${match[1]} ${match[2]}`,
  );

  assertMatches(migration,
    /add column refund_affected boolean not null default false/,
    "subscription truth gains a non-null fail-closed refund fact");
  for (const provenanceColumn of [
    "refund_evidence_updated_at timestamptz",
    "refund_evidence_invoice_id text",
    "refund_evidence_status text",
    "refund_evidence_refunded_at timestamptz",
    "refund_evidence_amount bigint",
    "refund_evidence_receipt_id uuid",
  ]) {
    assertEqual(migration.includes(`add column ${provenanceColumn}`), true,
      `${provenanceColumn} records minimal ordered provenance`);
  }
  assertMatches(migration,
    /foreign key \(store_id, test_mode, refund_evidence_receipt_id\)[\s\S]*references app_private\.lemon_webhook_receipts \(store_id, test_mode, id\)/,
    "refund receipt provenance is constrained to the same store/mode scope");

  assertEqual(signature.startsWith(
    "create function public.process_lemon_subscription_refund_v1("), true,
  "refund processing RPC name is exact and public");
  assertEqual(parameters.join("\n"), [
    "p_store_id text",
    "p_test_mode boolean",
    "p_idempotency_key text",
    "p_payload_valid boolean",
    "p_invoice_id text",
    "p_subscription_id text",
    "p_customer_id text",
    "p_refund_status text",
    "p_refunded boolean",
    "p_refunded_at timestamptz",
    "p_refunded_amount bigint",
    "p_invoice_created_at timestamptz",
    "p_invoice_updated_at timestamptz",
  ].join("\n"), "RPC accepts only receipt identity and verified refund facts");
  assertMatches(migration, /\bsecurity definer\b/,
    "refund RPC is SECURITY DEFINER");
  assertMatches(migration, /set search_path = ''/,
    "refund RPC has an empty fixed search path");
  assertEqual(/\bexecute\s+(?:format|\$|')/.test(functionBody), false,
    "refund RPC contains no dynamic SQL");
  assertEqual((migration.match(/^create function /gm) ?? []).length, 1,
    "migration creates exactly one narrow RPC");

  const mutationTargets = Array.from(new Set(Array.from(
    functionBody.matchAll(
      /^\s*(?:insert into|update|delete from)\s+([a-z0-9_.]+)/gm,
    ),
    (match) => match[1],
  ))).sort();
  assertEqual(mutationTargets.join(","), [
    "app_private.lemon_subscriptions",
    "app_private.lemon_webhook_receipts",
  ].join(","), "refund RPC mutates only receipts and existing subscriptions");
  assertEqual(/^\s*insert into app_private\.lemon_subscriptions/gm.test(
    functionBody), false, "unmatched refunds cannot create subscriptions");

  assertMatches(functionBody,
    /where subscription\.store_id = p_store_id\s+and subscription\.test_mode = p_test_mode\s+and subscription\.lemon_subscription_id = p_subscription_id\s+for update/,
    "refund lookup uses exact store, mode, and stable subscription identity");
  assertMatches(functionBody, /processing_outcome = 'refund-subscription-not-found'/,
    "an unmatched subscription fails closed");
  assertMatches(functionBody,
    /v_subscription\.lemon_customer_id is distinct from p_customer_id/,
    "invoice customer must match existing subscription ownership");
  assertMatches(functionBody, /processing_outcome = 'refund-customer-conflict'/,
    "customer mismatch fails closed");
  assertMatches(functionBody,
    /p_refund_status not in \('refunded', 'partial_refund'\)/,
    "only full and partial refund statuses are accepted");
  assertMatches(functionBody, /p_refunded is not true/,
    "refund evidence requires the affirmative vendor flag");

  const staleAt = functionBody.indexOf(
    "p_invoice_updated_at < v_subscription.refund_evidence_updated_at",
  );
  const equalAt = functionBody.indexOf(
    "p_invoice_updated_at = v_subscription.refund_evidence_updated_at",
  );
  const applyAt = functionBody.indexOf("refund_affected = true");
  assertEqual(staleAt >= 0 && staleAt < equalAt && equalAt < applyAt, true,
    "stale and equal refund versions resolve before newer evidence applies");
  assertMatches(functionBody, /processing_outcome = 'stale-refund-evidence'/,
    "older invoice evidence is ignored");
  assertMatches(functionBody,
    /processing_outcome = 'refund-evidence-idempotent'/,
    "equal matching evidence is idempotent");
  assertMatches(functionBody,
    /processing_outcome = 'refund-evidence-version-conflict'/,
    "equal conflicting evidence fails closed");
  assertMatches(functionBody, /refund_affected = true/,
    "newer full or partial refund evidence becomes sticky");
  assertEqual(functionBody.includes("refund_affected = false"), false,
    "refund processing never clears sticky evidence");

  const subscriptionUpdate = functionBody.slice(
    functionBody.lastIndexOf("update app_private.lemon_subscriptions"),
    functionBody.indexOf("where subscription.id = v_subscription.id;") +
      "where subscription.id = v_subscription.id;".length,
  );
  for (const [untouchedFact, pattern] of [
    ["product_id", /\n\s+product_id\s*=/],
    ["variant_id", /\n\s+variant_id\s*=/],
    ["status", /\n\s+status\s*=/],
    ["cancelled", /\n\s+cancelled\s*=/],
    ["upstream_updated_at", /\n\s+upstream_updated_at\s*=/],
    ["last_webhook_receipt_id", /\n\s+last_webhook_receipt_id\s*=/],
  ] as const) {
    assertEqual(pattern.test(subscriptionUpdate), false,
      `refund mutation leaves ${untouchedFact} unchanged`);
  }
  assertEqual(subscriptionUpdate.includes("refund_evidence_receipt_id"), true,
    "refund receipt provenance is stored separately");

  const finalizedAt = functionBody.indexOf(
    "v_processing_status in ('processed', 'ignored', 'failed')",
  );
  const claimAt = functionBody.indexOf("processing_status = 'processing'");
  const attemptAt = functionBody.indexOf(
    "attempt_count = receipt.attempt_count + 1",
  );
  assertEqual(finalizedAt >= 0 && finalizedAt < claimAt && claimAt < attemptAt,
    true, "finalized duplicates return before an attempt is claimed");
  assertEqual(functionBody.includes("v_processing_status = 'processing'"), true,
    "concurrent receipt processing is not re-entered");
  for (const outcome of [
    "invalid-subscription-refund",
    "refund-subscription-not-found",
    "refund-customer-conflict",
    "stale-refund-evidence",
    "refund-evidence-idempotent",
    "refund-evidence-version-conflict",
    "refund-evidence-applied",
  ]) {
    assertEqual(functionBody.includes(`processing_outcome = '${outcome}'`), true,
      `${outcome} finalizes deterministically`);
  }

  const exactTypes = parameters.map((parameter) => parameter.split(" ")[1]);
  const exactSignature =
    String.raw`public\.process_lemon_subscription_refund_v1\(\s*` +
    exactTypes.join(String.raw`,\s*`) + String.raw`\s*\)`;
  assertMatches(migration,
    new RegExp(`revoke all on function ${exactSignature}`),
    "exact refund RPC overload has default execution revoked");
  assertMatches(migration, /\) from public, anon, authenticated;/,
    "PUBLIC and browser roles cannot execute refund processing");
  assertMatches(migration,
    new RegExp(`grant execute on function ${exactSignature}`),
    "exact refund RPC overload receives its sole grant");
  assertMatches(migration, /\) to service_role;/,
    "only service_role receives EXECUTE");
  assertEqual((migration.match(/^grant\s/gm) ?? []).length, 1,
    "migration contains exactly one grant");

  assertMatches(dispatcherSource,
    /if \(input\.eventname === "subscription_payment_refunded"\) \{\s+return processverifiedlemonsubscriptionrefundv1\(input\);/,
    "verified dispatcher routes only refund events to the refund processor");
  assertEqual(refundSource.includes(
    '"process_lemon_subscription_refund_v1"'), true,
  "server processor invokes the exact narrow refund RPC");
  assertEqual(refundSource.includes("fetch("), false,
    "refund processing makes no Lemon API call");

  for (const forbidden of [
    "pgrst.db_schemas",
    "grant usage on schema app_private",
    "grant all",
    "create policy",
    "raw_payload",
    "email",
    "auth_user_id",
    "user_id",
    "vip_active",
    "resolveaccessv1",
    "requirevipv1",
  ]) {
    assertEqual(migration.includes(forbidden), false,
      `migration contains no ${forbidden} exposure or authority`);
  }
}

auditRefundPersistenceV1();

console.log("PASS: Lemon subscription refund RPC security and ordering");
