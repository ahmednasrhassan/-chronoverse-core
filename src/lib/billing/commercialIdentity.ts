import "server-only";


export const LEMON_CHRONOVERSE_USER_ID_FIELD_V1 =
  "chronoverse_user_id" as const;

export type UntrustedLemonIdentityErrorCodeV1 =
  | "custom-data-missing"
  | "custom-data-invalid"
  | "chronoverse-user-id-missing"
  | "chronoverse-user-id-not-string"
  | "chronoverse-user-id-invalid";

export type UntrustedLemonIdentityResultV1 =
  | Readonly<{
    ok: true;
    trust: "unverified";
    grantsAccess: false;
    chronoverseUserId: string;
  }>
  | Readonly<{
    ok: false;
    trust: "unverified";
    grantsAccess: false;
    error: UntrustedLemonIdentityErrorCodeV1;
  }>;

/**
 * Parses syntax only. A successful result remains unverified and grants no
 * access until future signature verification and private database linkage.
 */
export function parseUntrustedLemonCommercialIdentityV1(
  meta: unknown,
): UntrustedLemonIdentityResultV1 {
  if (!isRecord(meta) || !hasOwn(meta, "custom_data")) {
    return untrustedFailure("custom-data-missing");
  }

  const customData = meta.custom_data;

  if (!isRecord(customData)) {
    return untrustedFailure("custom-data-invalid");
  }

  if (!hasOwn(customData, LEMON_CHRONOVERSE_USER_ID_FIELD_V1)) {
    return untrustedFailure("chronoverse-user-id-missing");
  }

  const userId = customData[LEMON_CHRONOVERSE_USER_ID_FIELD_V1];

  if (userId === null || userId === undefined) {
    return untrustedFailure("chronoverse-user-id-missing");
  }

  if (typeof userId !== "string") {
    return untrustedFailure("chronoverse-user-id-not-string");
  }

  if (!isCanonicalUuidV1(userId)) {
    return untrustedFailure("chronoverse-user-id-invalid");
  }

  return Object.freeze({
    ok: true,
    trust: "unverified",
    grantsAccess: false,
    chronoverseUserId: userId,
  });
}

function isCanonicalUuidV1(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}

function untrustedFailure(
  error: UntrustedLemonIdentityErrorCodeV1,
): UntrustedLemonIdentityResultV1 {
  return Object.freeze({
    ok: false,
    trust: "unverified",
    grantsAccess: false,
    error,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
