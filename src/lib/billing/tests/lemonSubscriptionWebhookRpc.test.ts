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

function auditSubscriptionProcessingRpcV1(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const migration = readFileSync(
    `${repositoryRoot}supabase/migrations/` +
      "202609120003_lemon_subscription_webhook.sql",
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const processingSource = readFileSync(
    `${repositoryRoot}src/lib/billing/lemonSubscriptionWebhook.ts`,
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const ingressSource = readFileSync(
    `${repositoryRoot}src/lib/billing/lemonWebhookIngress.ts`,
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

  assertEqual(
    signature.startsWith(
      "create function public.process_lemon_subscription_webhook_v1(",
    ),
    true,
    "processing RPC name is exact and public",
  );
  assertEqual(parameters.join("\n"), [
    "p_store_id text",
    "p_test_mode boolean",
    "p_idempotency_key text",
    "p_payload_valid boolean",
    "p_custom_data_state text",
    "p_chronoverse_user_id uuid",
    "p_lemon_subscription_id text",
    "p_lemon_customer_id text",
    "p_lemon_order_id text",
    "p_lemon_order_item_id text",
    "p_lemon_product_id text",
    "p_lemon_variant_id text",
    "p_lemon_subscription_item_id text",
    "p_lemon_price_id text",
    "p_quantity integer",
    "p_raw_status text",
    "p_cancelled boolean",
    "p_pause_mode text",
    "p_pause_resumes_at timestamptz",
    "p_trial_ends_at timestamptz",
    "p_billing_anchor smallint",
    "p_renews_at timestamptz",
    "p_ends_at timestamptz",
    "p_upstream_created_at timestamptz",
    "p_upstream_updated_at timestamptz",
  ].join("\n"), "RPC accepts only receipt identity, verified identity, and facts");

  for (const forbiddenInput of [
    "email",
    "auth_user_id",
    "user_name",
    "card",
    "portal",
    "raw_payload",
    "secret",
    "role",
    "entitlement",
    "schema_name",
    "table_name",
  ]) {
    assertEqual(signature.includes(forbiddenInput), false,
      `RPC signature accepts no ${forbiddenInput}`);
  }

  assertMatches(migration, /\bsecurity definer\b/,
    "RPC is SECURITY DEFINER");
  assertMatches(migration, /set search_path = ''/,
    "RPC has an empty fixed search path");
  assertEqual(/\bexecute\s+(?:format|\$|')/.test(functionBody), false,
    "RPC contains no dynamic SQL");
  assertEqual((migration.match(/^create function /gm) ?? []).length, 1,
    "migration creates exactly one RPC");
  assertMatches(migration,
    /alter table app_private\.lemon_subscriptions\s+drop constraint lemon_subscriptions_quantity_check;\s*alter table app_private\.lemon_subscriptions\s+add constraint lemon_subscriptions_quantity_check\s+check \(quantity is null or quantity >= 0\);/,
    "documented usage-based zero quantity is compatible with persistence");

  const mutationTargets = Array.from(new Set(Array.from(
    functionBody.matchAll(
      /^\s*(?:insert into|update|delete from)\s+([a-z0-9_.]+)/gm,
    ),
    (match) => match[1],
  ))).sort();
  assertEqual(mutationTargets.join(","), [
    "app_private.lemon_customers",
    "app_private.lemon_subscriptions",
    "app_private.lemon_webhook_receipts",
  ].join(","), "RPC can mutate only the three required private tables");
  assertEqual(/^\s*delete from\s/gm.test(functionBody), false,
    "RPC deletes no commercial records");

  for (const privateObject of [
    "app_private.lemon_webhook_receipts",
    "app_private.users",
    "app_private.lemon_customers",
    "app_private.lemon_subscriptions",
  ]) {
    assertEqual(functionBody.includes(privateObject), true,
      `${privateObject} is fully qualified`);
  }

  const finalStatusAt = functionBody.indexOf(
    "v_processing_status in ('processed', 'ignored', 'failed')",
  );
  const claimAt = functionBody.indexOf("processing_status = 'processing'");
  const attemptAt = functionBody.indexOf(
    "attempt_count = receipt.attempt_count + 1",
  );
  const staleAt = functionBody.indexOf(
    "p_upstream_updated_at < v_subscription.upstream_updated_at",
  );
  const equalAt = functionBody.indexOf(
    "p_upstream_updated_at = v_subscription.upstream_updated_at",
  );
  const customerInsertAt = functionBody.indexOf(
    "insert into app_private.lemon_customers",
  );
  const subscriptionMutationAt = functionBody.indexOf(
    "update app_private.lemon_subscriptions",
  );

  assertEqual(finalStatusAt >= 0 && finalStatusAt < claimAt, true,
    "finalized receipts return duplicate before a new attempt");
  assertEqual(claimAt >= 0 && claimAt < attemptAt, true,
    "pending receipt claim increments its attempt atomically");
  assertEqual(functionBody.includes("v_processing_status = 'processing'"), true,
    "concurrent processing is not re-entered");
  assertEqual(functionBody.includes("v_processing_status <> 'pending'"), true,
    "only pending receipts may start processing");
  assertEqual(functionBody.includes("for update;"), true,
    "receipt and subscription rows use database row locks");
  assertEqual(functionBody.includes("pg_catalog.pg_advisory_xact_lock("), true,
    "subscription versions are serialized transactionally");
  assertEqual(staleAt >= 0 && staleAt < customerInsertAt, true,
    "stale events finalize before any customer creation");
  assertEqual(staleAt < subscriptionMutationAt, true,
    "stale events cannot overwrite subscription facts");
  assertEqual(equalAt >= 0 && equalAt < subscriptionMutationAt, true,
    "equal versions are resolved before mutation");
  assertMatches(functionBody,
    /processing_outcome = 'subscription-version-idempotent'/,
    "equal matching facts finish idempotently");
  assertMatches(functionBody,
    /processing_outcome = 'subscription-version-conflict'/,
    "equal conflicting facts fail closed");
  assertMatches(functionBody,
    /processing_outcome = 'stale-subscription-event'/,
    "older facts are deterministically ignored");
  assertMatches(functionBody,
    /upstream_updated_at = p_upstream_updated_at/,
    "newer applied facts advance the authoritative version");
  assertEqual(functionBody.includes("received_at <"), false,
    "arrival time is never ordering authority");

  assertMatches(functionBody,
    /from app_private\.users as app_user\s+where app_user\.id = p_chronoverse_user_id\s+for key share/,
    "custom UUID existence is verified against app_private.users");
  assertMatches(functionBody,
    /processing_outcome = 'commercial-user-not-found'/,
    "unknown internal UUID fails closed");
  assertMatches(functionBody,
    /processing_outcome = 'customer-linkage-conflict'/,
    "customer ownership conflicts fail closed");
  assertMatches(functionBody,
    /processing_outcome = 'customer-linkage-missing'/,
    "later events require an existing Lemon customer mapping");
  assertMatches(functionBody,
    /v_event_type = 'subscription_created'\s+and p_custom_data_state <> 'valid'/,
    "subscription creation requires valid custom identity");
  assertMatches(functionBody, /on conflict do nothing/,
    "customer creation races are resolved by database uniqueness");

  assertMatches(functionBody,
    /last_webhook_receipt_id = v_receipt_id/,
    "applied updates record receipt provenance");
  const staleBranch = functionBody.slice(
    staleAt,
    functionBody.indexOf("end if;", staleAt),
  );
  assertEqual(staleBranch.includes("last_webhook_receipt_id"), false,
    "stale events cannot replace applied provenance");
  for (const status of ["processed", "ignored", "failed"] as const) {
    assertMatches(functionBody,
      new RegExp(`processing_status = '${status}'[\\s\\S]*?processed_at = `),
      `${status} completion records processed_at`);
  }

  for (const eventName of [
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
    "subscription_resumed",
    "subscription_expired",
    "subscription_paused",
    "subscription_unpaused",
    "subscription_plan_changed",
  ]) {
    assertEqual(functionBody.includes(`'${eventName}'`), true,
      `${eventName} is explicitly supported`);
  }
  for (const invoiceEvent of [
    "subscription_payment_failed",
    "subscription_payment_success",
    "subscription_payment_recovered",
    "subscription_payment_refunded",
  ]) {
    assertEqual(functionBody.includes(`'${invoiceEvent}'`), true,
      `${invoiceEvent} is explicitly finalized as unsupported invoice data`);
  }
  assertMatches(functionBody,
    /processing_outcome = case[\s\S]*'unsupported-subscription-invoice-event'[\s\S]*'unsupported-webhook-event'/,
    "unknown and invoice events are safely ignored without commercial mutation");

  const exactTypes = parameters.map((parameter) => parameter.split(" ")[1]);
  const exactSignature = String.raw`public\.process_lemon_subscription_webhook_v1\(\s*` +
    exactTypes.join(String.raw`,\s*`) + String.raw`\s*\)`;
  assertMatches(migration,
    new RegExp(`revoke all on function ${exactSignature}`),
    "exact RPC overload has all default execution revoked");
  assertMatches(migration, /\) from public, anon, authenticated;/,
    "PUBLIC and browser roles cannot execute processing");
  assertMatches(migration,
    new RegExp(`grant execute on function ${exactSignature}`),
    "exact RPC overload receives its sole grant");
  assertMatches(migration, /\) to service_role;/,
    "only service_role receives EXECUTE");
  assertEqual((migration.match(/^grant\s/gm) ?? []).length, 1,
    "migration contains exactly one grant");

  for (const forbidden of [
    "pgrst.db_schemas",
    "grant usage on schema app_private",
    "grant all",
    "create policy",
    "raw_payload",
    "user_email",
    "auth_user_id",
    "card_brand",
    "card_last_four",
    "payment_processor",
    "customer_portal",
    "vip_active",
    "resolveaccessv1",
    "requirevipv1",
  ]) {
    assertEqual(migration.includes(forbidden), false,
      `migration contains no ${forbidden} exposure or authority`);
  }

  assertEqual(processingSource.includes("fetch("), false,
    "B5b makes no Lemon or other network call");
  assertEqual(processingSource.includes("raw_payload"), false,
    "B5b stores no raw payload");
  assertEqual(processingSource.includes("vip_active"), false,
    "B5b implements no VIP state");
  assertEqual(processingSource.includes("resolveaccessv1"), false,
    "B5b does not compose access");
  assertEqual(processingSource.includes('.schema("app_private")'), false,
    "B5b never requests the private Data API schema");
  assertEqual(ingressSource.includes('.schema("app_private")'), false,
    "webhook route path has no direct private table access");
  assertEqual(
    processingSource.includes(
      '"process_lemon_subscription_webhook_v1"',
    ),
    true,
    "B5b uses the exact public processing RPC",
  );
  assertMatches(processingSource,
    /if \(data === "failed"\) \{\s+return "ignored";/,
    "deterministic failed-closed outcomes are acknowledged without retry loops");
  assertEqual(processingSource.includes('data === "busy"'), false,
    "concurrent busy state is not acknowledged as successful");
}

auditSubscriptionProcessingRpcV1();

console.log("PASS: Lemon subscription processing RPC security and ordering");
