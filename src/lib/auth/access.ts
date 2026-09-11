import "server-only";

import { createSupabaseServerClientV1 } from "./supabase/server";
import type {
  AccessResultV1,
  AuthenticatedAccessV1,
  ChronoverseRole,
} from "./types";

const ANONYMOUS_ACCESS_V1 = Object.freeze({
  state: "anonymous_free",
  isAuthenticated: false,
  authSubject: null,
  userId: null,
  role: null,
  canAccessVip: false,
} as const);

interface VerifiedAccessSnapshotV1 {
  readonly authSubject: string;
  readonly trustedAccess: unknown;
}

export type VerifiedAccessLoaderV1 =
  () => Promise<VerifiedAccessSnapshotV1 | null>;

export type AccessResolverV1 = () => Promise<AccessResultV1>;

export type AccessResolutionErrorCodeV1 =
  | "trusted-access-query-failed"
  | "trusted-access-missing"
  | "trusted-access-invalid";

export class AccessResolutionErrorV1 extends Error {
  readonly code: AccessResolutionErrorCodeV1;
  readonly cause?: unknown;

  constructor(
    code: AccessResolutionErrorCodeV1,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AccessResolutionErrorV1";
    this.code = code;
    this.cause = cause;
  }
}

/** Injectable boundary keeps role resolution deterministic and offline-testable. */
export function createAccessResolverV1(
  loadVerifiedAccess: VerifiedAccessLoaderV1,
): AccessResolverV1 {
  return async () => {
    const snapshot = await loadVerifiedAccess();

    if (snapshot === null) {
      return ANONYMOUS_ACCESS_V1;
    }

    return parseTrustedAccessV1(snapshot.authSubject, snapshot.trustedAccess);
  };
}

/** Verifies the JWT first, then reads role truth through the scoped DB RPC. */
export const resolveAccessV1: AccessResolverV1 = createAccessResolverV1(
  async () => {
    const supabase = await createSupabaseServerClientV1();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const subject = claimsData?.claims?.sub;

    if (claimsError || typeof subject !== "string" || subject.length === 0) {
      return null;
    }

    const { data, error } = await supabase.rpc("resolve_my_access");

    if (error) {
      throw new AccessResolutionErrorV1(
        "trusted-access-query-failed",
        "Trusted access state could not be resolved.",
        error,
      );
    }

    return { authSubject: subject, trustedAccess: data };
  },
);

function parseTrustedAccessV1(
  authSubject: string,
  value: unknown,
): AuthenticatedAccessV1 {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (Array.isArray(value) && value.length !== 1) {
    throw missingAccess();
  }

  if (!isRecord(candidate)) {
    throw missingAccess();
  }

  const authUserId = candidate.auth_user_id;
  const userId = candidate.user_id;
  const role = candidate.role;
  const state = candidate.access_state;
  const canAccessVip = candidate.can_access_vip;

  if (
    authUserId !== authSubject ||
    typeof userId !== "string" ||
    userId.length === 0 ||
    !isChronoverseRoleV1(role)
  ) {
    throw invalidAccess();
  }

  if (role === "user" && state === "authenticated_free" &&
    canAccessVip === false) {
    return Object.freeze({
      state,
      isAuthenticated: true,
      authSubject,
      userId,
      role,
      canAccessVip,
    });
  }

  if (role === "admin" && state === "admin" && canAccessVip === true) {
    return Object.freeze({
      state,
      isAuthenticated: true,
      authSubject,
      userId,
      role,
      canAccessVip,
    });
  }

  if (role === "owner" && state === "owner" && canAccessVip === true) {
    return Object.freeze({
      state,
      isAuthenticated: true,
      authSubject,
      userId,
      role,
      canAccessVip,
    });
  }

  throw invalidAccess();
}

function isChronoverseRoleV1(value: unknown): value is ChronoverseRole {
  return value === "user" || value === "admin" || value === "owner";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function missingAccess(): AccessResolutionErrorV1 {
  return new AccessResolutionErrorV1(
    "trusted-access-missing",
    "The verified identity has no trusted Chronoverse access record.",
  );
}

function invalidAccess(): AccessResolutionErrorV1 {
  return new AccessResolutionErrorV1(
    "trusted-access-invalid",
    "Trusted access state is invalid or inconsistent.",
  );
}
