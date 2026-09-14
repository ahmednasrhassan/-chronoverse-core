import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/202609150001_lemon_billing_customer_rpc.sql",
);
const migration = readFileSync(migrationPath, "utf8").toLowerCase();

assert.match(
  migration,
  /create function public\.resolve_lemon_customers_for_user_v1\(\s*p_user_id uuid\s*\)/,
);
assert.match(migration, /security definer/);
assert.match(migration, /set search_path = ''/);
assert.match(migration, /from app_private\.lemon_customers/);
assert.match(migration, /where customer\.user_id = p_user_id/);
assert.doesNotMatch(migration, /app_private\.lemon_subscriptions/);
assert.doesNotMatch(migration, /select\s+\*/);
assert.match(
  migration,
  /revoke all on function public\.resolve_lemon_customers_for_user_v1\(uuid\)\s+from public, anon, authenticated;/,
);
assert.match(
  migration,
  /grant execute on function public\.resolve_lemon_customers_for_user_v1\(uuid\)\s+to service_role;/,
);
assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);

console.log("PASS: billing customer RPC is exact-user and service-role-only");
