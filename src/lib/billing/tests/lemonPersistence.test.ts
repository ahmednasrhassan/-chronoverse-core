import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IDENTITY_MIGRATION_SHA256 =
  "ff932dac13adb663586c571fd2ea5ee3b1cb0ea916016794519edbc0167d3411";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertIncludes(source: string, expected: string, label: string): void {
  assertEqual(source.includes(expected), true, label);
}

function assertMatches(
  source: string,
  expected: RegExp,
  label: string,
): void {
  assertEqual(expected.test(source), true, label);
}

function tableDefinition(source: string, table: string): string {
  const startMarker = `create table app_private.${table} (`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf("\n);", start);

  if (start < 0 || end < 0) {
    throw new Error(`Could not isolate app_private.${table}.`);
  }

  return source.slice(start, end + 3);
}

function auditLemonPersistence(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const migrationPath = `${repositoryRoot}supabase/migrations/` +
    "202609120001_lemon_persistence.sql";
  const identityMigrationPath = `${repositoryRoot}supabase/migrations/` +
    "202609110001_identity_access.sql";
  const guardsPath = `${repositoryRoot}src/lib/auth/guards.ts`;
  const migration = readFileSync(migrationPath, "utf8").toLowerCase();
  const identityMigration = readFileSync(identityMigrationPath, "utf8")
    .replace(/\r\n/g, "\n");
  const guards = readFileSync(guardsPath, "utf8");
  const customers = tableDefinition(migration, "lemon_customers");
  const subscriptions = tableDefinition(migration, "lemon_subscriptions");
  const receipts = tableDefinition(migration, "lemon_webhook_receipts");

  for (const table of [
    "lemon_customers",
    "lemon_subscriptions",
    "lemon_webhook_receipts",
  ]) {
    assertIncludes(migration, `create table app_private.${table}`,
      `${table} is private`);
    assertIncludes(migration,
      `alter table app_private.${table} enable row level security`,
      `${table} enables RLS`);
    assertIncludes(migration,
      `alter table app_private.${table} force row level security`,
      `${table} forces RLS`);
    assertEqual(migration.includes(
      `alter table app_private.${table} disable row level security`,
    ), false, `${table} never disables RLS`);
    assertIncludes(migration,
      `revoke all privileges on table app_private.${table}\n` +
        "  from public, anon, authenticated",
      `${table} revokes direct application-role privileges`);
  }

  for (const [table, definition] of [
    ["lemon_customers", customers],
    ["lemon_subscriptions", subscriptions],
    ["lemon_webhook_receipts", receipts],
  ] as const) {
    assertMatches(definition,
      /\bid uuid primary key default gen_random_uuid\(\)/,
      `${table} has an independent UUID PK`);
  }

  assertMatches(customers,
    /constraint lemon_customers_user_fk\s+foreign key \(user_id\)\s+references app_private\.users \(id\)\s+on delete restrict/,
    "customer identity maps directly to app_private.users.id");
  assertMatches(customers,
    /constraint lemon_customers_vendor_identity_key\s+unique \(store_id, test_mode, lemon_customer_id\)/,
    "customer vendor identity is scoped by store and mode");
  assertEqual(/unique \(lemon_customer_id\)/.test(customers), false,
    "unscoped customer identity uniqueness is absent");
  assertEqual(/unique \(store_id, lemon_customer_id\)/.test(customers), false,
    "customer identity never omits test mode");
  assertMatches(customers,
    /constraint lemon_customers_user_store_mode_key\s+unique \(user_id, store_id, test_mode\)/,
    "one user linkage exists per store and mode");

  assertMatches(subscriptions,
    /constraint lemon_subscriptions_vendor_identity_key\s+unique \(store_id, test_mode, lemon_subscription_id\)/,
    "subscription vendor identity is scoped by store and mode");
  assertEqual(/unique \(lemon_subscription_id\)/.test(subscriptions), false,
    "unscoped subscription identity uniqueness is absent");
  assertMatches(subscriptions,
    /constraint lemon_subscriptions_customer_fk\s+foreign key \(store_id, test_mode, lemon_customer_id\)\s+references app_private\.lemon_customers \(\s*store_id,\s*test_mode,\s*lemon_customer_id\s*\)\s+on delete restrict/,
    "subscription customer FK enforces store and mode integrity");

  assertIncludes(receipts, "store_id text not null",
    "webhook receipts persist store scope");
  assertIncludes(receipts, "test_mode boolean not null",
    "webhook receipts persist test/live scope");
  assertIncludes(receipts, "idempotency_key text not null",
    "logical idempotency key is independently supplied");
  assertIncludes(receipts, "payload_sha256 text not null",
    "payload digest remains a replay fingerprint");
  assertEqual(receipts.includes("generated always as"), false,
    "logical idempotency is not a generated body hash");
  assertEqual(receipts.includes("event_type || ':' || payload_sha256"), false,
    "event identity is independent from body serialization");
  assertMatches(receipts,
    /constraint lemon_webhook_receipts_idempotency_key_key\s+unique \(store_id, test_mode, idempotency_key\)/,
    "webhook idempotency is scoped by store and mode");
  assertMatches(receipts,
    /constraint lemon_webhook_receipts_scope_id_key\s+unique \(store_id, test_mode, id\)/,
    "receipt UUID can participate in a scoped FK");
  assertMatches(subscriptions,
    /constraint lemon_subscriptions_last_webhook_receipt_fk\s+foreign key \(store_id, test_mode, last_webhook_receipt_id\)\s+references app_private\.lemon_webhook_receipts \(store_id, test_mode, id\)\s+on delete restrict/,
    "last receipt provenance cannot cross store or mode");

  assertEqual((migration.match(/on delete restrict/g) ?? []).length, 3,
    "all three commercial-history FKs use restrictive deletion");
  assertEqual(migration.includes("on delete cascade"), false,
    "commercial history never cascades on deletion");

  for (const fact of [
    "order_id text not null",
    "order_item_id text not null",
    "product_id text not null",
    "variant_id text not null",
    "subscription_item_id text",
    "price_id text",
    "quantity integer",
    "status text not null",
    "cancelled boolean not null",
    "pause_mode text",
    "pause_resumes_at timestamptz",
    "trial_ends_at timestamptz",
    "billing_anchor smallint",
    "renews_at timestamptz",
    "ends_at timestamptz",
    "upstream_created_at timestamptz not null",
    "upstream_updated_at timestamptz not null",
  ]) {
    assertIncludes(migration, fact, `subscription persists ${fact}`);
  }

  for (const receiptField of [
    "store_id text not null",
    "test_mode boolean not null",
    "event_type text not null",
    "idempotency_key text not null",
    "payload_sha256 text not null",
    "received_at timestamptz not null",
    "processed_at timestamptz",
    "processing_status text not null",
    "processing_outcome text",
    "upstream_object_type text",
    "upstream_object_id text",
    "upstream_event_at timestamptz",
    "attempt_count integer not null",
    "last_attempt_at timestamptz",
  ]) {
    assertIncludes(migration, receiptField,
      `webhook receipt persists ${receiptField}`);
  }

  for (const index of [
    "lemon_customers_user_id_idx",
    "lemon_subscriptions_customer_idx",
    "lemon_subscriptions_lifecycle_idx",
    "lemon_subscriptions_upstream_updated_at_idx",
    "lemon_webhook_receipts_processing_idx",
    "lemon_webhook_receipts_stale_processing_idx",
    "lemon_webhook_receipts_upstream_object_idx",
  ]) {
    assertIncludes(migration, `create index ${index}`,
      `${index} is defined`);
  }
  assertMatches(migration,
    /create index lemon_webhook_receipts_stale_processing_idx\s+on app_private\.lemon_webhook_receipts \(\s*store_id,\s*test_mode,\s*last_attempt_at\s*\)\s+where processing_status = 'processing'/,
    "stale processing claims are indexed by environment and attempt time");
  assertMatches(receipts,
    /constraint lemon_webhook_receipts_processed_at_required\s+check \(processing_status <> 'processed' or processed_at is not null\)/,
    "processed receipts require a completion timestamp");
  assertMatches(receipts,
    /constraint lemon_webhook_receipts_incomplete_at_check\s+check \(\s*processing_status not in \('pending', 'processing'\)\s+or processed_at is null\s*\)/,
    "incomplete receipts cannot claim a completion timestamp");

  for (const forbidden of [
    "email",
    "auth_user_id",
    "owner",
    "admin",
    "vip_active",
    "security definer",
    "create function",
    "create procedure",
    "create policy",
    "raw_payload",
    "jsonb",
    "secret",
    "is_vip",
    "can_access_vip",
    "entitlement_active",
    "effective_access",
  ]) {
    assertEqual(migration.includes(forbidden), false,
      `migration contains no ${forbidden}`);
  }
  assertEqual(/^\s*grant\s/im.test(migration), false,
    "migration grants no direct or RPC privileges");
  assertEqual(/(?:update|alter table)\s+app_private\.users/.test(migration),
    false, "migration does not change trusted users or roles");

  const identityHash = createHash("sha256")
    .update(identityMigration)
    .digest("hex");
  assertEqual(identityHash, IDENTITY_MIGRATION_SHA256,
    "deployed identity migration content remains unchanged");
  assertIncludes(guards, 'access.state === "owner"',
    "owner trusted-role authorization remains explicit");
  assertIncludes(guards, 'access.state === "admin"',
    "admin trusted-role authorization remains explicit");
}

auditLemonPersistence();

console.log("PASS: private Lemon persistence foundation");
