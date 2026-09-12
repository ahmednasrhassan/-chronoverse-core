import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AccessGuardErrorV1,
  createAccessGuardsV1,
} from "../../auth/guards";
import type { AccessResultV1 } from "../../auth/types";
import {
  CommercialIdentityErrorV1,
  createLemonCheckoutCustomDataResolverV1,
  parseUntrustedLemonCommercialIdentityV1,
} from "../commercialIdentity";

const FREE_USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_USER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_USER_ID = "33333333-3333-4333-8333-333333333333";

const ANONYMOUS_ACCESS: AccessResultV1 = Object.freeze({
  state: "anonymous_free",
  isAuthenticated: false,
  authSubject: null,
  userId: null,
  role: null,
  canAccessVip: false,
});

function authenticatedAccess(
  kind: "free" | "admin" | "owner",
): AccessResultV1 {
  if (kind === "free") {
    return Object.freeze({
      state: "authenticated_free",
      isAuthenticated: true,
      authSubject: "auth-subject-free",
      userId: FREE_USER_ID,
      role: "user",
      canAccessVip: false,
    });
  }

  if (kind === "admin") {
    return Object.freeze({
      state: "admin",
      isAuthenticated: true,
      authSubject: "auth-subject-admin",
      userId: ADMIN_USER_ID,
      role: "admin",
      canAccessVip: true,
    });
  }

  return Object.freeze({
    state: "owner",
    isAuthenticated: true,
    authSubject: "auth-subject-owner",
    userId: OWNER_USER_ID,
    role: "owner",
    canAccessVip: true,
  });
}

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

async function verifyAuthenticatedOutboundIdentity(): Promise<void> {
  for (const [kind, expectedUserId] of [
    ["free", FREE_USER_ID],
    ["admin", ADMIN_USER_ID],
    ["owner", OWNER_USER_ID],
  ] as const) {
    let resolverCalls = 0;
    const guards = createAccessGuardsV1(async () => {
      resolverCalls += 1;
      return authenticatedAccess(kind);
    });
    const resolveCustomData = createLemonCheckoutCustomDataResolverV1(
      guards.requireAuthenticated,
    );

    assertDeepEqual(
      await resolveCustomData(),
      { chronoverse_user_id: expectedUserId },
      `${kind} outbound custom data contains only the internal user UUID`,
    );
    assertEqual(resolverCalls, 1, `${kind} access resolver runs once`);
  }
}

async function verifyAnonymousDenied(): Promise<void> {
  let resolverCalls = 0;
  const guards = createAccessGuardsV1(async () => {
    resolverCalls += 1;
    return ANONYMOUS_ACCESS;
  });
  const resolveCustomData = createLemonCheckoutCustomDataResolverV1(
    guards.requireAuthenticated,
  );

  try {
    await resolveCustomData();
    throw new Error("anonymous checkout identity unexpectedly succeeded");
  } catch (error) {
    assertEqual(error instanceof AccessGuardErrorV1, true,
      "anonymous denial uses the existing typed auth guard error");
    assertEqual((error as AccessGuardErrorV1).code, "authentication-required",
      "anonymous checkout identity requires authentication");
  }
  assertEqual(resolverCalls, 1, "anonymous access resolver runs once");
}

async function verifyMalformedTrustedIdentityFailsClosed(): Promise<void> {
  let guardCalls = 0;
  const resolveCustomData = createLemonCheckoutCustomDataResolverV1(async () => {
    guardCalls += 1;
    return { userId: "not-a-uuid" };
  });

  try {
    await resolveCustomData();
    throw new Error("malformed trusted identity unexpectedly succeeded");
  } catch (error) {
    assertEqual(error instanceof CommercialIdentityErrorV1, true,
      "malformed trusted identity uses a typed failure");
    assertEqual(
      (error as CommercialIdentityErrorV1).code,
      "trusted-user-id-invalid",
      "malformed trusted identity fails closed",
    );
  }
  assertEqual(guardCalls, 1, "malformed trusted identity guard runs once");
}

function verifyInboundParser(): void {
  const valid = parseUntrustedLemonCommercialIdentityV1({
    custom_data: {
      chronoverse_user_id: FREE_USER_ID,
      role: "owner",
      entitlement: "active",
      unrelated: "ignored",
    },
  });
  assertDeepEqual(
    valid,
    {
      ok: true,
      trust: "unverified",
      grantsAccess: false,
      chronoverseUserId: FREE_USER_ID,
    },
    "valid UUID is syntax-only and extra fields are ignored",
  );

  const failures = [
    [undefined, "custom-data-missing"],
    [{}, "custom-data-missing"],
    [{ custom_data: null }, "custom-data-invalid"],
    [{ custom_data: [] }, "custom-data-invalid"],
    [{ custom_data: {} }, "chronoverse-user-id-missing"],
    [{ custom_data: { chronoverse_user_id: null } },
      "chronoverse-user-id-missing"],
    [{ custom_data: { chronoverse_user_id: 123 } },
      "chronoverse-user-id-not-string"],
    [{ custom_data: { chronoverse_user_id: "not-a-uuid" } },
      "chronoverse-user-id-invalid"],
    [{ custom_data: { chronoverse_user_id: ` ${FREE_USER_ID}` } },
      "chronoverse-user-id-invalid"],
    [{ custom_data: { chronoverse_user_id: `${FREE_USER_ID} ` } },
      "chronoverse-user-id-invalid"],
  ] as const;

  for (const [input, expectedError] of failures) {
    const result = parseUntrustedLemonCommercialIdentityV1(input);
    assertEqual(result.ok, false, `${expectedError} fails safely`);
    if (!result.ok) {
      assertEqual(result.error, expectedError, `${expectedError} typed code`);
      assertEqual(result.trust, "unverified", `${expectedError} stays untrusted`);
      assertEqual(result.grantsAccess, false, `${expectedError} grants no access`);
    }
  }
}

function auditCommercialIdentityIsolation(): void {
  const source = readFileSync(
    fileURLToPath(new URL("../commercialIdentity.ts", import.meta.url)),
    "utf8",
  ).toLowerCase();

  assertEqual(source.includes("requireauthenticatedv1"), true,
    "outbound identity uses the authenticated server guard");
  assertEqual(source.includes('import "server-only"'), true,
    "commercial identity construction remains server-only");

  for (const forbidden of [
    "requirevipv1",
    "vip_active",
    "auth_user_id",
    "email",
    "fetch(",
    "createclient",
    "hmac",
    "subtle.verify",
    "/markets/",
    "unstable_cache",
    "react.cache",
    "secret",
  ]) {
    assertEqual(source.includes(forbidden), false,
      `commercial identity source contains no ${forbidden} dependency or policy`);
  }

  assertEqual(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
      .test(source),
    false,
    "commercial identity source contains no hard-coded user UUID",
  );
}

async function main(): Promise<void> {
  await verifyAuthenticatedOutboundIdentity();
  await verifyAnonymousDenied();
  await verifyMalformedTrustedIdentityFailsClosed();
  verifyInboundParser();
  auditCommercialIdentityIsolation();

  console.log("PASS: trusted Lemon commercial identity mapping");
}

void main();
