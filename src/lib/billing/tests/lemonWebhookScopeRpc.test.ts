import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(path.resolve(
  process.cwd(),
  "supabase/migrations/202609150002_lemon_webhook_scope_rpc.sql",
), "utf8").toLowerCase();

assert.match(
  migration,
  /create function public\.resolve_lemon_subscription_scope_v1\(\s*p_store_id text,\s*p_test_mode boolean,\s*p_subscription_id text\s*\)/,
);
assert.match(migration, /security definer/);
assert.match(migration, /set search_path = ''/);
assert.match(migration, /from app_private\.lemon_subscriptions/);
assert.match(migration, /subscription\.store_id = p_store_id/);
assert.match(migration, /subscription\.test_mode = p_test_mode/);
assert.match(
  migration,
  /subscription\.lemon_subscription_id = p_subscription_id/,
);
assert.doesNotMatch(migration, /insert\s+into|update\s+app_private|delete\s+from/);
assert.doesNotMatch(migration, /select\s+\*/);
assert.match(
  migration,
  /revoke all on function public\.resolve_lemon_subscription_scope_v1\([\s\S]*?\) from public, anon, authenticated;/,
);
assert.match(
  migration,
  /grant execute on function public\.resolve_lemon_subscription_scope_v1\([\s\S]*?\) to service_role;/,
);
assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);

console.log("PASS: refund scope lookup RPC is read-only and service-role-only");
