import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AccessResolutionErrorV1,
  createAccessResolverV1,
} from "../access";
import {
  AuthConfigurationErrorV1,
  getSupabasePublicConfigV1,
} from "../config";
import {
  ACCESS_STATES_V1,
  CHRONOVERSE_ROLES_V1,
} from "../types";

const FOUNDATION_COMPOSITION_V1 = Object.freeze({
  getVipCommercialConfig: () => Object.freeze({
    storeId: "1",
    productId: "2",
    monthlyVariantId: "3",
    annualVariantId: "4",
    variantIds: Object.freeze(["3", "4"] as const),
  }),
  getCurrentTime: () => "2026-09-12T12:00:00.000Z",
});

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

async function verifyRoleAccessMapping(): Promise<void> {
  assertDeepEqual(CHRONOVERSE_ROLES_V1, ["user", "admin", "owner"],
    "trusted role set is exact");
  assertDeepEqual(ACCESS_STATES_V1, [
    "anonymous_free",
    "authenticated_free",
    "vip_active",
    "admin",
    "owner",
  ], "future-compatible access state set is exact");

  const anonymous = createAccessResolverV1(
    async () => null,
    FOUNDATION_COMPOSITION_V1,
  );
  assertDeepEqual(await anonymous(), {
    state: "anonymous_free",
    isAuthenticated: false,
    authSubject: null,
    userId: null,
    role: null,
    canAccessVip: false,
  }, "anonymous maps to Free");

  const cases = [
    {
      role: "user",
      access_state: "authenticated_free",
      can_access_vip: false,
    },
    { role: "admin", access_state: "admin", can_access_vip: true },
    { role: "owner", access_state: "owner", can_access_vip: true },
  ] as const;

  for (const testCase of cases) {
    const resolver = createAccessResolverV1(
      async () => ({
        authSubject: "verified-auth-subject",
        trustedAccess: [{
          user_id: "stable-chronoverse-user-id",
          auth_user_id: "verified-auth-subject",
          ...testCase,
        }],
        loadCommercialAccess: async () => [],
      }),
      FOUNDATION_COMPOSITION_V1,
    );
    const first = await resolver();
    const second = await resolver();

    assertEqual(first.state, testCase.access_state,
      `${testCase.role} maps to its trusted state`);
    assertEqual(first.canAccessVip, testCase.can_access_vip,
      `${testCase.role} VIP permission is exact`);
    assertEqual(first.userId, "stable-chronoverse-user-id",
      `${testCase.role} uses independent internal identity`);
    assertDeepEqual(second, first,
      `${testCase.role} repeated resolution is deterministic`);
  }

  const fabricatedVip = createAccessResolverV1(
    async () => ({
      authSubject: "verified-auth-subject",
      trustedAccess: [{
        user_id: "stable-chronoverse-user-id",
        auth_user_id: "verified-auth-subject",
        role: "user",
        access_state: "vip_active",
        can_access_vip: true,
      }],
      loadCommercialAccess: async () => [],
    }),
    FOUNDATION_COMPOSITION_V1,
  );

  try {
    await fabricatedVip();
    throw new Error("Foundation resolver accepted fabricated VIP access.");
  } catch (error) {
    assertEqual(error instanceof AccessResolutionErrorV1, true,
      "vip_active cannot be fabricated before entitlement persistence");
  }
}

function verifyConfiguration(): void {
  const config = getSupabasePublicConfigV1({
    NEXT_PUBLIC_SUPABASE_URL: " https://project.supabase.co ",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " publishable-test-key ",
  });

  assertEqual(config.url, "https://project.supabase.co",
    "public URL is validated and normalized");
  assertEqual(config.publishableKey, "publishable-test-key",
    "publishable key is validated and normalized");

  try {
    getSupabasePublicConfigV1({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    });
    throw new Error("Missing public URL was accepted.");
  } catch (error) {
    assertEqual(error instanceof AuthConfigurationErrorV1, true,
      "missing configuration has a deterministic error type");
    assertEqual((error as AuthConfigurationErrorV1).variableName,
      "NEXT_PUBLIC_SUPABASE_URL", "missing variable is identified without value");
  }
}

function auditArchitecture(): void {
  const authDirectory = fileURLToPath(new URL("../", import.meta.url));
  const repositoryDirectory = fileURLToPath(new URL("../../../../", import.meta.url));
  const accessSource = readFileSync(`${authDirectory}access.ts`, "utf8");
  const browserSource = readFileSync(
    `${authDirectory}supabase/browser.ts`, "utf8");
  const serverSource = readFileSync(
    `${authDirectory}supabase/server.ts`, "utf8");
  const adminSource = readFileSync(
    `${authDirectory}supabase/admin.ts`, "utf8");
  const serverConfigSource = readFileSync(
    `${authDirectory}serverConfig.ts`, "utf8");
  const proxyClientSource = readFileSync(
    `${authDirectory}supabase/proxy.ts`, "utf8");
  const canonicalMarketSource = readFileSync(
    `${repositoryDirectory}src/lib/markets/services/canonicalProductResults.ts`,
    "utf8",
  );
  const migrationSource = readFileSync(
    `${repositoryDirectory}supabase/migrations/202609110001_identity_access.sql`,
    "utf8",
  ).toLowerCase();
  const sourceFiles = listTypeScriptFiles(`${repositoryDirectory}src`);
  const clientSources = sourceFiles
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(({ source }) => /^\s*["']use client["'];/m.test(source));

  assertEqual(browserSource.startsWith('"use client"'), true,
    "browser client has an explicit client boundary");
  assertEqual(browserSource.includes("SUPABASE_SECRET_KEY"), false,
    "browser client contains no secret key reference");
  assertEqual(browserSource.includes("serverConfig"), false,
    "browser client cannot reach server secret configuration");
  for (const { path, source } of clientSources) {
    assertEqual(source.includes("SUPABASE_SECRET_KEY"), false,
      `${path} contains no server secret reference`);
    assertEqual(/auth\/supabase\/admin|auth\/serverConfig/.test(source), false,
      `${path} cannot import the admin client or secret accessor`);
  }
  assertEqual(adminSource.includes('import "server-only"'), true,
    "admin client is server-only");
  assertEqual(adminSource.includes("getSupabaseAdminConfigV1"), true,
    "admin client obtains secret only through server accessor");
  assertEqual(serverConfigSource.includes('import "server-only"'), true,
    "secret accessor is server-only");
  assertEqual(serverSource.includes('import "server-only"'), true,
    "request server client is server-only");
  assertEqual(accessSource.includes('import "server-only"'), true,
    "access resolver is server-only");
  assertEqual(accessSource.includes("getClaims()"), true,
    "access resolver verifies claims");
  assertEqual(accessSource.includes("getSession()"), false,
    "getSession is not authorization truth");
  assertEqual(accessSource.includes("unstable_cache"), false,
    "access resolver is not globally cached");
  assertEqual(accessSource.includes('"resolve_my_commercial_access_v1"'), true,
    "normal authenticated access uses the caller-bound commercial RPC");
  assertEqual(accessSource.includes('.schema("app_private")'), false,
    "access resolver never requests the unexposed private schema");
  assertEqual(accessSource.toLowerCase().includes("email"), false,
    "access resolver has no email-based role logic");
  assertEqual(proxyClientSource.includes("getClaims()"), true,
    "proxy refresh uses verified claims path");
  assertEqual(proxyClientSource.includes("getSession()"), false,
    "proxy does not trust getSession");
  for (const forbiddenLookup of [
    ".rpc(",
    ".from(",
    "resolve_my_access",
    "app_private",
    "createSupabaseAdminClientV1",
  ]) {
    assertEqual(proxyClientSource.includes(forbiddenLookup), false,
      `proxy performs no ${forbiddenLookup} authorization lookup`);
  }
  assertEqual(canonicalMarketSource.includes("/auth/"), false,
    "canonical market cache imports no authentication state");
  for (const path of sourceFiles) {
    const source = readFileSync(path, "utf8");
    if (source.includes("unstable_cache")) {
      assertEqual(/from\s+["'][^"']*auth\/access["']/.test(source), false,
        `${path} does not place access resolution in a shared cache`);
    }
  }

  assertEqual(migrationSource.includes("create schema if not exists app_private"),
    true, "migration creates private schema");
  assertEqual(migrationSource.includes("create table app_private.users"), true,
    "migration creates trusted user table");
  assertEqual(migrationSource.includes("default gen_random_uuid()"), true,
    "internal UUID is generated independently");
  assertEqual(migrationSource.includes("default 'user'"), true,
    "trusted role defaults to user");
  assertEqual(migrationSource.includes("new.email"), false,
    "bootstrap performs no email-role inference");
  assertEqual(migrationSource.includes(
    "revoke all privileges on table app_private.users"), true,
    "direct table privileges are revoked");
  assertEqual(migrationSource.includes(
    "alter table app_private.users enable row level security"), true,
    "trusted user table has defense-in-depth RLS");
  assertEqual(/grant\s+.+on\s+(table\s+)?app_private\.users/.test(
    migrationSource), false, "authenticated role mutation is never granted");
  assertEqual(migrationSource.includes("create function public.resolve_my_access"),
    true, "migration creates scoped access function");
  assertEqual(migrationSource.includes("auth.uid()"), true,
    "access function binds to authenticated subject");
  assertEqual((migrationSource.match(/set search_path = ''/g) ?? []).length >= 3,
    true, "database functions use fixed search paths");
  assertEqual(migrationSource.includes(
    "grant execute on function public.resolve_my_access() to authenticated"),
    true, "only authenticated callers receive access resolution execution");
  assertEqual(migrationSource.includes("vip_active"), false,
    "foundation migration does not fabricate subscription access");
  assertEqual(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/
    .test(migrationSource), false, "migration assigns no hard-coded identity");
}

function listTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      return listTypeScriptFiles(path);
    }

    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

async function main(): Promise<void> {
  await verifyRoleAccessMapping();
  verifyConfiguration();
  auditArchitecture();

  console.log("PASS: Supabase authentication identity foundation");
}

void main();
