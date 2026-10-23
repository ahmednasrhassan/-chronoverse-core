import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseUntrustedLemonCommercialIdentityV1 } from "../commercialIdentity";

const FREE_USER_ID = "11111111-1111-4111-8111-111111111111";
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

  assertEqual(source.includes("requireauthenticatedv1"), false,
    "historical webhook identity parsing needs no checkout authentication");
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
  verifyInboundParser();
  auditCommercialIdentityIsolation();

  console.log("PASS: trusted Lemon commercial identity mapping");
}

void main();
