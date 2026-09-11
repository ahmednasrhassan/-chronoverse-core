import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AccessGuardErrorV1,
  createAccessGuardsV1,
  type AccessDenialCodeV1,
} from "../guards";
import type { AccessResolverV1 } from "../access";
import type { AccessResultV1 } from "../types";

const ANONYMOUS_ACCESS: AccessResultV1 = Object.freeze({
  state: "anonymous_free",
  isAuthenticated: false,
  authSubject: null,
  userId: null,
  role: null,
  canAccessVip: false,
});

const AUTHENTICATED_FREE_ACCESS: AccessResultV1 = Object.freeze({
  state: "authenticated_free",
  isAuthenticated: true,
  authSubject: "verified-user-subject",
  userId: "internal-user-id",
  role: "user",
  canAccessVip: false,
});

const ADMIN_ACCESS: AccessResultV1 = Object.freeze({
  state: "admin",
  isAuthenticated: true,
  authSubject: "verified-admin-subject",
  userId: "internal-admin-id",
  role: "admin",
  canAccessVip: true,
});

const OWNER_ACCESS: AccessResultV1 = Object.freeze({
  state: "owner",
  isAuthenticated: true,
  authSubject: "verified-owner-subject",
  userId: "internal-owner-id",
  role: "owner",
  canAccessVip: true,
});

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

async function expectDenial(
  action: () => Promise<unknown>,
  expectedCode: AccessDenialCodeV1,
  label: string,
): Promise<void> {
  try {
    await action();
    throw new Error(`${label}: guard unexpectedly allowed access.`);
  } catch (error) {
    assertEqual(error instanceof AccessGuardErrorV1, true,
      `${label} uses typed denial`);
    assertEqual((error as AccessGuardErrorV1).code, expectedCode,
      `${label} denial code`);
  }
}

function countingResolver(
  access: AccessResultV1,
): { readonly resolve: AccessResolverV1; readonly calls: () => number } {
  let calls = 0;

  return {
    resolve: async () => {
      calls += 1;
      return access;
    },
    calls: () => calls,
  };
}

async function verifyAnonymousGuards(): Promise<void> {
  const authenticatedResolver = countingResolver(ANONYMOUS_ACCESS);
  const authenticatedGuard = createAccessGuardsV1(
    authenticatedResolver.resolve,
  );
  await expectDenial(authenticatedGuard.requireAuthenticated,
    "authentication-required", "anonymous authenticated guard");
  assertEqual(authenticatedResolver.calls(), 1,
    "anonymous authenticated guard resolves once");

  const vipResolver = countingResolver(ANONYMOUS_ACCESS);
  const vipGuard = createAccessGuardsV1(vipResolver.resolve);
  await expectDenial(vipGuard.requireVip, "authentication-required",
    "anonymous VIP guard");
  assertEqual(vipResolver.calls(), 1, "anonymous VIP guard resolves once");
}

async function verifyAuthenticatedFreeGuards(): Promise<void> {
  const authenticatedResolver = countingResolver(AUTHENTICATED_FREE_ACCESS);
  const authenticatedGuard = createAccessGuardsV1(
    authenticatedResolver.resolve,
  );
  assertEqual(await authenticatedGuard.requireAuthenticated(),
    AUTHENTICATED_FREE_ACCESS, "authenticated Free is authenticated");
  assertEqual(authenticatedResolver.calls(), 1,
    "Free authenticated guard resolves once");

  const vipResolver = countingResolver(AUTHENTICATED_FREE_ACCESS);
  const vipGuard = createAccessGuardsV1(vipResolver.resolve);
  await expectDenial(vipGuard.requireVip, "vip-required",
    "authenticated Free VIP guard");
  assertEqual(vipResolver.calls(), 1, "Free VIP guard resolves once");
}

async function verifyElevatedGuards(
  access: AccessResultV1,
  label: "admin" | "owner",
): Promise<void> {
  const authenticatedResolver = countingResolver(access);
  const authenticatedGuard = createAccessGuardsV1(
    authenticatedResolver.resolve,
  );
  assertEqual(await authenticatedGuard.requireAuthenticated(), access,
    `${label} is authenticated`);
  assertEqual(authenticatedResolver.calls(), 1,
    `${label} authenticated guard resolves once`);

  const vipResolver = countingResolver(access);
  const vipGuard = createAccessGuardsV1(vipResolver.resolve);
  assertEqual(await vipGuard.requireVip(), access, `${label} has VIP access`);
  assertEqual(vipResolver.calls(), 1, `${label} VIP guard resolves once`);
}

async function verifyFailClosedBehavior(): Promise<void> {
  const resolverFailure = new Error("trusted access unavailable");
  let failureCalls = 0;
  const failingGuards = createAccessGuardsV1(async () => {
    failureCalls += 1;
    throw resolverFailure;
  });

  for (const [label, guard] of [
    ["authenticated", failingGuards.requireAuthenticated],
    ["VIP", failingGuards.requireVip],
  ] as const) {
    try {
      await guard();
      throw new Error(`${label} guard allowed a resolver failure.`);
    } catch (error) {
      assertEqual(error, resolverFailure, `${label} resolver failure propagates`);
    }
  }
  assertEqual(failureCalls, 2, "each failed guard resolves exactly once");

  const malformedAccess = Object.freeze({
    ...OWNER_ACCESS,
    canAccessVip: false,
  }) as unknown as AccessResultV1;

  for (const [label, selectGuard] of [
    ["authenticated", (guards: ReturnType<typeof createAccessGuardsV1>) =>
      guards.requireAuthenticated],
    ["VIP", (guards: ReturnType<typeof createAccessGuardsV1>) =>
      guards.requireVip],
  ] as const) {
    const malformedResolver = countingResolver(malformedAccess);
    await expectDenial(
      selectGuard(createAccessGuardsV1(malformedResolver.resolve)),
      "access-invalid",
      `${label} malformed-state guard`,
    );
    assertEqual(malformedResolver.calls(), 1,
      `${label} malformed-state guard resolves once`);
  }
}

function auditGuardIsolation(): void {
  const source = readFileSync(
    fileURLToPath(new URL("../guards.ts", import.meta.url)),
    "utf8",
  ).toLowerCase();

  for (const forbidden of [
    "lemon",
    "subscription",
    "email",
    "uuid",
    "unstable_cache",
    "react.cache",
    "market",
  ]) {
    assertEqual(source.includes(forbidden), false,
      `guard source contains no ${forbidden} dependency`);
  }
  assertEqual(source.includes('access.state === "owner"'), true,
    "owner authorization is explicit");
  assertEqual(source.includes('access.state === "admin"'), true,
    "admin authorization is explicit");
}

async function main(): Promise<void> {
  await verifyAnonymousGuards();
  await verifyAuthenticatedFreeGuards();
  await verifyElevatedGuards(ADMIN_ACCESS, "admin");
  await verifyElevatedGuards(OWNER_ACCESS, "owner");
  await verifyFailClosedBehavior();
  auditGuardIsolation();

  console.log("PASS: server-side authenticated and VIP access guards");
}

void main();
