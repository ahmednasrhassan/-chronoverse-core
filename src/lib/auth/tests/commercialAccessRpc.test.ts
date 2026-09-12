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

function auditCallerBoundCommercialAccessV1(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const migration = readFileSync(
    `${repositoryRoot}supabase/migrations/` +
      "202609120005_lemon_commercial_access.sql",
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const accessSource = readFileSync(
    `${repositoryRoot}src/lib/auth/access.ts`,
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const configSource = readFileSync(
    `${repositoryRoot}src/lib/billing/vipCommercialConfig.ts`,
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const signature = migration.slice(
    migration.indexOf("create function"),
    migration.indexOf(")\nreturns table") + 1,
  );
  const returnShape = migration.slice(
    migration.indexOf("returns table (") + "returns table (".length,
    migration.indexOf(")\nlanguage sql"),
  );
  const returnedColumns = Array.from(
    returnShape.matchAll(/^\s{2}([a-z0-9_]+) ([a-z]+),?$/gm),
    (match) => `${match[1]} ${match[2]}`,
  );
  const functionBody = migration.slice(
    migration.indexOf("as $$"),
    migration.indexOf("$$;") + 3,
  );

  assertEqual(signature,
    "create function public.resolve_my_commercial_access_v1()",
    "commercial read RPC is public and accepts no identity arguments");
  assertEqual(returnedColumns.join("\n"), [
    "lemon_subscription_id text",
    "store_id text",
    "product_id text",
    "variant_id text",
    "raw_status text",
    "cancelled boolean",
    "pause_mode text",
    "pause_resumes_at timestamptz",
    "trial_ends_at timestamptz",
    "renews_at timestamptz",
    "ends_at timestamptz",
    "upstream_updated_at timestamptz",
    "test_mode boolean",
    "refund_affected boolean",
  ].join("\n"), "RPC returns exactly the minimum persisted B2 facts");

  assertMatches(migration, /\blanguage sql\b/,
    "commercial read RPC is a static SQL function");
  assertMatches(migration, /\bstable\b/,
    "commercial read RPC is stable");
  assertMatches(migration, /\bsecurity definer\b/,
    "commercial read RPC is SECURITY DEFINER");
  assertMatches(migration, /set search_path = ''/,
    "commercial read RPC has an empty fixed search path");
  assertEqual(/\bexecute\s+(?:format|\$|')/.test(functionBody), false,
    "commercial read RPC contains no dynamic SQL");

  for (const privateObject of [
    "app_private.users",
    "app_private.lemon_customers",
    "app_private.lemon_subscriptions",
  ]) {
    assertEqual(functionBody.includes(privateObject), true,
      `${privateObject} is fully qualified`);
  }
  assertMatches(functionBody,
    /where app_user\.auth_user_id = \(select auth\.uid\(\)\)/,
    "commercial read derives the caller solely from auth.uid()");
  assertMatches(functionBody,
    /customer\.user_id = app_user\.id/,
    "commercial customer linkage uses the internal Chronoverse user ID");
  assertMatches(functionBody,
    /subscription\.store_id = customer\.store_id[\s\S]*subscription\.test_mode = customer\.test_mode[\s\S]*subscription\.lemon_customer_id = customer\.lemon_customer_id/,
    "subscription linkage preserves customer store and mode scope");
  assertMatches(functionBody,
    /order by[\s\S]*subscription\.store_id[\s\S]*subscription\.test_mode[\s\S]*subscription\.lemon_subscription_id/,
    "candidate ordering is deterministic without latest-row-wins policy");

  assertMatches(migration,
    /revoke all on function public\.resolve_my_commercial_access_v1\(\)\s+from public, anon, authenticated;/,
    "commercial RPC execution is explicitly revoked from default roles");
  assertMatches(migration,
    /grant execute on function public\.resolve_my_commercial_access_v1\(\)\s+to authenticated;/,
    "only authenticated callers receive necessary RPC execution");
  assertEqual((migration.match(/^grant\s/gm) ?? []).length, 1,
    "migration contains exactly one narrow grant");

  for (const forbidden of [
    "pgrst.db_schemas",
    "grant usage on schema app_private",
    "grant all",
    "create policy",
    "lemon_webhook_receipts",
    "refund_evidence_receipt_id",
    "email",
    "raw_payload",
    "customer_id text",
    "auth_user_id uuid",
    "user_id uuid",
    "role text",
    "vip_active",
  ]) {
    assertEqual(migration.includes(forbidden), false,
      `migration exposes no ${forbidden}`);
  }

  const elevatedReturnAt = accessSource.indexOf(
    'trustedaccess.role === "owner" || trustedaccess.role === "admin"',
  );
  const compositionAt = accessSource.indexOf("composecommercialaccessv1(");
  assertEqual(elevatedReturnAt >= 0 && elevatedReturnAt < compositionAt, true,
    "owner and admin return before commercial composition");
  assertEqual(accessSource.includes('"resolve_my_commercial_access_v1"'), true,
    "production resolver calls the exact caller-bound RPC");
  assertEqual(accessSource.includes('.schema("app_private")'), false,
    "production resolver never selects the private Data API schema");
  assertEqual(accessSource.includes("unstable_cache"), false,
    "commercial access is not globally cached");
  assertEqual(accessSource.includes("react.cache"), false,
    "commercial access is not placed in a shared React cache");
  assertEqual(accessSource.includes("refund_affected"), true,
    "persisted refund evidence maps into entitlement facts");
  assertEqual(accessSource.includes("fetch("), false,
    "commercial resolution makes no Lemon API call");

  assertEqual(configSource.includes('import "server-only"'), true,
    "VIP configuration has a server-only boundary");
  assertEqual(configSource.includes("next_public"), false,
    "VIP configuration exposes no browser environment values");
  for (const productionValue of ["294379", "1352857", "2112907", "2112850"]) {
    assertEqual(configSource.includes(productionValue), false,
      "approved deployment values are not hard-coded in production source");
  }
}

auditCallerBoundCommercialAccessV1();

console.log("PASS: caller-bound commercial access RPC security contract");
