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

function auditReceiptRpc(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const migration = readFileSync(
    `${repositoryRoot}supabase/migrations/` +
      "202609120002_lemon_webhook_receipt_rpc.sql",
    "utf8",
  ).replace(/\r\n/g, "\n").toLowerCase();
  const ingress = readFileSync(
    `${repositoryRoot}src/lib/billing/lemonWebhookIngress.ts`,
    "utf8",
  ).replace(/\r\n/g, "\n");
  const signature = migration.slice(
    migration.indexOf("create function"),
    migration.indexOf(")\nreturns boolean") + 1,
  );
  const rpcCall = ingress.slice(
    ingress.indexOf("client.rpc(LEMON_WEBHOOK_RECEIPT_RPC_V1, {"),
    ingress.indexOf("\n  });", ingress.indexOf(
      "client.rpc(LEMON_WEBHOOK_RECEIPT_RPC_V1, {",
    )),
  );
  const insertColumns = migration.slice(
    migration.indexOf("insert into app_private.lemon_webhook_receipts ("),
    migration.indexOf("\n    )\n    values"),
  );

  assertMatches(signature,
    /^create function public\.ingest_lemon_webhook_receipt_v1\(\s*store_id text,\s*test_mode boolean,\s*event_type text,\s*idempotency_key text,\s*payload_sha256 text,\s*upstream_object_type text,\s*upstream_object_id text,\s*upstream_event_at timestamptz\s*\)$/,
    "RPC accepts exactly the eight receipt-intake fields");
  assertEqual(signature.includes("processing_status"), false,
    "caller cannot select processing status");
  assertEqual(signature.includes("attempt_count"), false,
    "caller cannot select attempt count");
  assertEqual(signature.includes("received_at"), false,
    "caller cannot select receipt timestamps");
  assertEqual(signature.includes("raw_payload"), false,
    "caller cannot submit a raw payload");
  assertEqual(signature.includes("secret"), false,
    "caller cannot submit a secret");

  assertMatches(migration, /\bsecurity definer\b/,
    "RPC executes through a security-definer boundary");
  assertMatches(migration, /set search_path = ''/,
    "RPC has an empty fixed search path");
  assertMatches(migration,
    /insert into app_private\.lemon_webhook_receipts/,
    "RPC targets only the fully qualified private receipt table");
  assertMatches(migration,
    /values \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, 'pending'\)/,
    "RPC fixes new receipts to pending internally");
  for (const managedField of [
    "received_at",
    "attempt_count",
    "processed_at",
  ]) {
    assertEqual(insertColumns.includes(managedField), false,
      `RPC leaves ${managedField} under table control`);
  }
  assertMatches(migration,
    /on conflict \(store_id, test_mode, idempotency_key\) do nothing/,
    "database uniqueness remains authoritative and atomic");
  assertMatches(migration, /select exists \(select 1 from inserted_receipt\)/,
    "RPC returns only whether insertion occurred");
  assertEqual(/\bexecute\s+(?:format|\$|')/.test(migration), false,
    "RPC contains no dynamic SQL");

  const exactSignature =
    String.raw`public\.ingest_lemon_webhook_receipt_v1\(\s*text,\s*boolean,` +
    String.raw`\s*text,\s*text,\s*text,\s*text,\s*text,\s*timestamptz\s*\)`;
  assertMatches(migration,
    new RegExp(`revoke all on function ${exactSignature}`),
    "RPC privileges are revoked on the exact overload");
  assertMatches(migration, /\) from public, anon, authenticated;/,
    "PUBLIC and client roles cannot execute the RPC");
  assertMatches(migration,
    new RegExp(`grant execute on function ${exactSignature}`),
    "only the exact RPC overload receives execute authority");
  assertMatches(migration, /\) to service_role;/,
    "trusted secret-key role alone may execute the RPC");
  assertEqual((migration.match(/^grant\s/gm) ?? []).length, 1,
    "migration contains one narrowly scoped grant");

  for (const forbidden of [
    "pgrst.db_schemas",
    "grant usage on schema app_private",
    "grant all",
    "lemon_customers",
    "lemon_subscriptions",
    "vip_active",
    "entitlement",
    "raw_payload",
    "service_role_key",
  ]) {
    assertEqual(migration.includes(forbidden), false,
      `migration contains no ${forbidden} exposure or mutation`);
  }

  assertEqual(ingress.includes('.schema("app_private")'), false,
    "B5a no longer asks PostgREST for the private schema");
  assertEqual(ingress.includes('"lemon_webhook_receipts"'), false,
    "B5a no longer writes the receipt table directly");
  assertEqual(
    ingress.includes('client.rpc(LEMON_WEBHOOK_RECEIPT_RPC_V1, {'),
    true,
    "B5a invokes the public RPC",
  );
  for (const field of [
    "store_id",
    "test_mode",
    "event_type",
    "idempotency_key",
    "payload_sha256",
    "upstream_object_type",
    "upstream_object_id",
    "upstream_event_at",
  ]) {
    assertMatches(rpcCall, new RegExp(`\\n\\s{4}${field}: receipt\\.`),
      `B5a supplies ${field}`);
  }
  const rpcArgumentNames = Array.from(
    rpcCall.matchAll(/^\s{4}([a-z0-9_]+):/gm),
    (match) => match[1],
  );
  assertEqual(rpcArgumentNames.join(","), [
    "store_id",
    "test_mode",
    "event_type",
    "idempotency_key",
    "payload_sha256",
    "upstream_object_type",
    "upstream_object_id",
    "upstream_event_at",
  ].join(","), "B5a supplies only the exact RPC contract");
  for (const forbidden of [
    "processing_status:",
    "attempt_count:",
    "received_at:",
    "processed_at:",
    "raw_payload:",
    "secret:",
  ]) {
    assertEqual(rpcCall.includes(forbidden), false,
      `B5a does not supply ${forbidden}`);
  }
}

auditReceiptRpc();

console.log("PASS: private Lemon receipt RPC boundary");
