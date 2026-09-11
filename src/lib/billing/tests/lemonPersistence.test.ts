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
    assertIncludes(migration,
      `revoke all privileges on table app_private.${table}\n` +
        "  from public, anon, authenticated",
      `${table} revokes direct application-role privileges`);
  }

  assertIncludes(migration, "references app_private.users (id)",
    "commercial identity maps to app_private.users.id");
  assertEqual((migration.match(
    /id uuid primary key default gen_random_uuid\(\)/g,
  ) ?? []).length, 3, "all commercial tables have independent UUID PKs");
  assertIncludes(migration, "constraint lemon_customers_user_fk",
    "customer linkage has an explicit user FK");
  assertIncludes(migration,
    "references app_private.lemon_customers (store_id, lemon_customer_id)",
    "subscription customer FK preserves upstream store identity");
  assertIncludes(migration,
    "references app_private.lemon_webhook_receipts (id)",
    "subscription records their last applied webhook receipt");
  assertIncludes(migration,
    "constraint lemon_customers_lemon_customer_id_key\n" +
      "    unique (lemon_customer_id)",
    "Lemon customer identity is unique");
  assertIncludes(migration,
    "constraint lemon_customers_user_store_mode_key\n" +
      "    unique (user_id, store_id, test_mode)",
    "one user linkage exists per store and mode");
  assertIncludes(migration,
    "constraint lemon_subscriptions_lemon_subscription_id_key\n" +
      "    unique (lemon_subscription_id)",
    "Lemon subscription identity is unique");
  assertIncludes(migration,
    "constraint lemon_webhook_receipts_idempotency_key_key\n" +
      "    unique (idempotency_key)",
    "webhook event identity is unique");
  assertIncludes(migration,
    "idempotency_key text generated always as\n" +
      "    (event_type || ':' || payload_sha256) stored",
    "idempotency identity is deterministic");

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
    "event_type text not null",
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
    "lemon_webhook_receipts_upstream_object_idx",
  ]) {
    assertIncludes(migration, `create index ${index}`,
      `${index} is defined`);
  }

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
