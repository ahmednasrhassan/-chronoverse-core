import "server-only";

import { resolveAccessV1, type AccessResolverV1 } from "./access";
import type {
  AccessResultV1,
  AuthenticatedAccessV1,
} from "./types";

export type AccessDenialCodeV1 =
  | "authentication-required"
  | "vip-required"
  | "access-invalid";

export class AccessGuardErrorV1 extends Error {
  readonly code: AccessDenialCodeV1;

  constructor(code: AccessDenialCodeV1) {
    super(messageForDenialV1(code));
    this.name = "AccessGuardErrorV1";
    this.code = code;
  }
}

export type VipAuthorizedAccessV1 = Extract<
  AuthenticatedAccessV1,
  { readonly canAccessVip: true }
>;

export interface AccessGuardsV1 {
  readonly requireAuthenticated: () => Promise<AuthenticatedAccessV1>;
  readonly requireVip: () => Promise<VipAuthorizedAccessV1>;
}

/** Creates stateless guards that invoke the authoritative resolver per call. */
export function createAccessGuardsV1(
  resolveAccess: AccessResolverV1,
): AccessGuardsV1 {
  return Object.freeze({
    requireAuthenticated: async () => {
      const access = validateResolvedAccessV1(await resolveAccess());

      if (!access.isAuthenticated) {
        throw new AccessGuardErrorV1("authentication-required");
      }

      return access;
    },
    requireVip: async () => {
      const access = validateResolvedAccessV1(await resolveAccess());

      if (!access.isAuthenticated) {
        throw new AccessGuardErrorV1("authentication-required");
      }

      // Trusted elevated roles authorize directly, before entitlement state.
      if (access.state === "owner" || access.state === "admin") {
        return access;
      }

      if (access.state === "vip_active") {
        return access;
      }

      throw new AccessGuardErrorV1("vip-required");
    },
  });
}

const productionGuardsV1 = createAccessGuardsV1(resolveAccessV1);

export const requireAuthenticatedV1 =
  productionGuardsV1.requireAuthenticated;
export const requireVipV1 = productionGuardsV1.requireVip;

function validateResolvedAccessV1(value: AccessResultV1): AccessResultV1 {
  if (!isRecord(value)) {
    throw invalidAccess();
  }

  if (value.state === "anonymous_free") {
    if (value.isAuthenticated === false && value.authSubject === null &&
      value.userId === null && value.role === null &&
      value.canAccessVip === false) {
      return value;
    }

    throw invalidAccess();
  }

  if (!hasVerifiedIdentityV1(value)) {
    throw invalidAccess();
  }

  if (value.state === "authenticated_free" && value.role === "user" &&
    value.canAccessVip === false) {
    return value;
  }

  if (value.state === "vip_active" && value.role === "user" &&
    value.canAccessVip === true) {
    return value;
  }

  if (value.state === "admin" && value.role === "admin" &&
    value.canAccessVip === true) {
    return value;
  }

  if (value.state === "owner" && value.role === "owner" &&
    value.canAccessVip === true) {
    return value;
  }

  throw invalidAccess();
}

function hasVerifiedIdentityV1(
  value: AccessResultV1,
): boolean {
  return value.isAuthenticated === true &&
    typeof value.authSubject === "string" && value.authSubject.length > 0 &&
    typeof value.userId === "string" && value.userId.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidAccess(): AccessGuardErrorV1 {
  return new AccessGuardErrorV1("access-invalid");
}

function messageForDenialV1(code: AccessDenialCodeV1): string {
  if (code === "authentication-required") {
    return "A verified authenticated identity is required.";
  }

  if (code === "vip-required") {
    return "VIP access is required.";
  }

  return "Resolved access state is invalid.";
}
