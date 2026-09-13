import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createAccessGuardsV1,
  type VipAuthorizedAccessV1,
} from "../../../auth/guards";
import type { AccessResultV1 } from "../../../auth/types";
import { enforceVipPageAccessV1 } from "../../../auth/vipPageAccess";
import {
  projectFiveProductFreeLiteV1,
} from "../../projections/fiveProductProjections";
import type {
  MarketProductVipDeepProjectionV1,
} from "../../projections/types";
import {
  handleVipDeepApiRequestV1,
} from "../../services/vipDeepDelivery";

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

const ADMIN_ACCESS = Object.freeze({
  state: "admin",
  isAuthenticated: true,
  authSubject: "verified-admin-subject",
  userId: "internal-admin-id",
  role: "admin",
  canAccessVip: true,
} as const);

const OWNER_ACCESS = Object.freeze({
  state: "owner",
  isAuthenticated: true,
  authSubject: "verified-owner-subject",
  userId: "internal-owner-id",
  role: "owner",
  canAccessVip: true,
} as const);

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

async function verifyVipPageBoundary(): Promise<void> {
  for (const [access, label] of [
    [ADMIN_ACCESS, "admin"],
    [OWNER_ACCESS, "owner"],
  ] as const) {
    const guards = createAccessGuardsV1(async () => access);
    const result = await enforceVipPageAccessV1(
      guards.requireVip,
      unexpectedRedirect,
    );
    assertEqual(result, access, `${label} reaches protected VIP pages`);
  }

  for (const [access, expectedDestination, label] of [
    [ANONYMOUS_ACCESS, "/account", "anonymous"],
    [AUTHENTICATED_FREE_ACCESS, "/pricing", "authenticated Free"],
  ] as const) {
    let destination: string | null = null;
    const redirectMarker = new Error("redirect");
    const guards = createAccessGuardsV1(async () => access);

    try {
      await enforceVipPageAccessV1(
        guards.requireVip,
        (value) => {
          destination = value;
          throw redirectMarker;
        },
      );
      throw new Error(`${label} page request was not denied.`);
    } catch (error) {
      assertEqual(error, redirectMarker, `${label} uses page redirect`);
    }
    assertEqual(destination, expectedDestination,
      `${label} page denial destination`);
  }
}

async function verifyVipApiDenials(): Promise<void> {
  const malformedAccess = Object.freeze({
    ...OWNER_ACCESS,
    canAccessVip: false,
  }) as unknown as AccessResultV1;

  for (const [access, expectedStatus, expectedBodyError, label] of [
    [ANONYMOUS_ACCESS, 401, "authentication-required", "anonymous"],
    [AUTHENTICATED_FREE_ACCESS, 403, "vip-required", "authenticated Free"],
    [malformedAccess, 500, "access-unavailable", "malformed access"],
  ] as const) {
    let canonicalCalls = 0;
    let projectionCalls = 0;
    const guards = createAccessGuardsV1(async () => access);
    const response = await handleVipDeepApiRequestV1({
      requireVip: guards.requireVip,
      loadCanonical: async () => {
        canonicalCalls += 1;
        return { source: "canonical" };
      },
      buildProjection: () => {
        projectionCalls += 1;
        return availableProjection();
      },
    });
    const body = await response.json() as { readonly error: string };

    assertEqual(response.status, expectedStatus,
      `${label} HTTP status`);
    assertEqual(body.error, expectedBodyError,
      `${label} public error code`);
    assertEqual(canonicalCalls, 0,
      `${label} does not read canonical data`);
    assertEqual(projectionCalls, 0,
      `${label} does not build VIP output`);
  }
}

async function verifyAllowedVipApi(
  access: VipAuthorizedAccessV1,
  label: "admin" | "owner",
): Promise<void> {
  const events: string[] = [];
  const canonical = Object.freeze({ source: "shared-canonical-result" });
  const projection = availableProjection();
  const response = await handleVipDeepApiRequestV1({
    requireVip: async () => {
      events.push("authorize");
      return access;
    },
    loadCanonical: async () => {
      events.push("canonical");
      return canonical;
    },
    buildProjection: (receivedCanonical) => {
      events.push("projection");
      assertEqual(receivedCanonical, canonical,
        `${label} projects the shared canonical result`);
      return projection;
    },
  });

  assertEqual(response.status, 200, `${label} VIP response status`);
  assertEqual(JSON.stringify(events),
    JSON.stringify(["authorize", "canonical", "projection"]),
    `${label} authorization/data/projection ordering`);
  assertEqual(events.filter((event) => event === "canonical").length, 1,
    `${label} reads canonical result exactly once`);
  assertEqual(events.filter((event) => event === "projection").length, 1,
    `${label} builds VIP projection exactly once`);
}

function verifyFreeLiteRemainsPublic(): void {
  const projection = projectFiveProductFreeLiteV1({
    productId: "estr",
    canonical: {
      availability: "unavailable",
      reason: "Public source is temporarily unavailable.",
      missing: Object.freeze(["source"]),
    },
  });

  assertEqual(projection.tier, "free-lite",
    "Free Lite projection requires no auth dependency");
}

function auditProtectedRoutes(): void {
  const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
  const protectedRoutes = [
    ["eurusd", "src/app/api/markets/eurusd/intelligence/route.ts"],
    ["eurjpy", "src/app/api/markets/eurjpy/intelligence/route.ts"],
    ["eurgbp", "src/app/api/markets/eurgbp/intelligence/route.ts"],
    ["eurchf", "src/app/api/markets/eurchf/intelligence/route.ts"],
    ["estr", "src/app/api/markets/estr/intelligence/route.ts"],
  ] as const;

  for (const [productId, relativePath] of protectedRoutes) {
    const source = readFileSync(`${repositoryRoot}${relativePath}`, "utf8");
    assertEqual(source.includes(
      `getFiveProductVipDeepResponseV1("${productId}")`,
    ), true, `${productId} route uses protected VIP adapter`);
    assertEqual(source.includes("getCanonicalProductResultV1"), false,
      `${productId} route cannot read canonical data before its guard`);
  }

  for (const relativePath of [
    "src/app/(vip)/vip/page.tsx",
    "src/app/(vip)/vip/markets/page.tsx",
  ]) {
    const source = readFileSync(`${repositoryRoot}${relativePath}`, "utf8");
    const guardIndex = source.indexOf(
      "await enforceVipPageAccessV1(requireVipV1, redirect)",
    );
    assertEqual(guardIndex >= 0, true, `${relativePath} has leaf-page guard`);
    assertEqual(guardIndex < source.indexOf("return ("), true,
      `${relativePath} guards before rendering protected content`);
  }

  const legacyMarketDataRoute = readFileSync(
    `${repositoryRoot}src/app/api/market-data/route.ts`,
    "utf8",
  );
  assertEqual(legacyMarketDataRoute.includes("status: 410"), true,
    "legacy generic market-data route is retired");
  assertEqual(legacyMarketDataRoute.includes("getHistoricalMarketData"), false,
    "retired generic route cannot invoke market providers");

  const deliverySource = readFileSync(
    `${repositoryRoot}src/lib/markets/services/vipDeepDelivery.ts`,
    "utf8",
  ).toLowerCase();
  for (const forbidden of ["lemon", "subscription", "email", "owner_email"]) {
    assertEqual(deliverySource.includes(forbidden), false,
      `VIP delivery contains no ${forbidden} dependency or bypass`);
  }
}

function availableProjection(): MarketProductVipDeepProjectionV1 {
  return Object.freeze({
    version: "market-product-projection-v1",
    tier: "vip-deep",
    availability: "available",
    productId: "eurusd",
  }) as unknown as MarketProductVipDeepProjectionV1;
}

function unexpectedRedirect(destination: string): never {
  throw new Error(`Unexpected redirect to ${destination}.`);
}

async function main(): Promise<void> {
  await verifyVipPageBoundary();
  await verifyVipApiDenials();
  await verifyAllowedVipApi(ADMIN_ACCESS, "admin");
  await verifyAllowedVipApi(OWNER_ACCESS, "owner");
  verifyFreeLiteRemainsPublic();
  auditProtectedRoutes();

  console.log("PASS: VIP pages and five-product Deep delivery protection");
}

void main();
