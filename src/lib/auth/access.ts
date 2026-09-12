import "server-only";

import { evaluateCommercialEntitlementV1 } from "../billing/entitlement";
import {
  normalizeSubscriptionLifecycleV1,
  type LemonSubscriptionLifecycleFactsV1,
} from "../billing/lifecycle";
import {
  getVipCommercialConfigV1,
  type VipCommercialConfigV1,
} from "../billing/vipCommercialConfig";
import { createSupabaseServerClientV1 } from "./supabase/server";
import type {
  AccessResultV1,
  AuthenticatedAccessV1,
  AuthenticatedFreeAccessV1,
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
  readonly loadCommercialAccess: () => Promise<unknown>;
}

export type VerifiedAccessLoaderV1 =
  () => Promise<VerifiedAccessSnapshotV1 | null>;

export type AccessResolverV1 = () => Promise<AccessResultV1>;

export type AccessResolutionErrorCodeV1 =
  | "trusted-access-query-failed"
  | "trusted-access-missing"
  | "trusted-access-invalid"
  | "commercial-access-unavailable";

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

export interface AccessCompositionDependenciesV1 {
  readonly getVipCommercialConfig: () => VipCommercialConfigV1;
  readonly getCurrentTime: () => string;
}

/** Injectable boundary keeps role resolution deterministic and offline-testable. */
export function createAccessResolverV1(
  loadVerifiedAccess: VerifiedAccessLoaderV1,
  dependencies: AccessCompositionDependenciesV1,
): AccessResolverV1 {
  return async () => {
    const snapshot = await loadVerifiedAccess();

    if (snapshot === null) {
      return ANONYMOUS_ACCESS_V1;
    }

    const trustedAccess = parseTrustedAccessV1(
      snapshot.authSubject,
      snapshot.trustedAccess,
    );

    if (trustedAccess.role === "owner" || trustedAccess.role === "admin") {
      return trustedAccess;
    }

    return composeCommercialAccessV1(trustedAccess, snapshot, dependencies);
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

    return {
      authSubject: subject,
      trustedAccess: data,
      loadCommercialAccess: async () => {
        const commercialResult = await supabase.rpc(
          "resolve_my_commercial_access_v1",
        );

        if (commercialResult.error) {
          throw commercialResult.error;
        }

        return commercialResult.data;
      },
    };
  },
  Object.freeze({
    getVipCommercialConfig: getVipCommercialConfigV1,
    getCurrentTime: () => new Date().toISOString(),
  }),
);

async function composeCommercialAccessV1(
  freeAccess: AuthenticatedFreeAccessV1,
  snapshot: VerifiedAccessSnapshotV1,
  dependencies: AccessCompositionDependenciesV1,
): Promise<AuthenticatedAccessV1> {
  try {
    const config = dependencies.getVipCommercialConfig();
    const rawCandidates = await snapshot.loadCommercialAccess();

    if (!Array.isArray(rawCandidates)) {
      throw new TypeError("Commercial access RPC returned an invalid result.");
    }

    let evaluationTime: string | undefined;

    for (const rawCandidate of rawCandidates) {
      const facts = parseCommercialFactsV1(rawCandidate);

      if (facts === null || !matchesVipScopeV1(facts, config)) {
        continue;
      }

      evaluationTime ??= dependencies.getCurrentTime();
      const lifecycle = normalizeSubscriptionLifecycleV1(facts);
      const entitlement = evaluateCommercialEntitlementV1(lifecycle, {
        now: evaluationTime,
        testMode: false,
      });

      if (entitlement.state === "active") {
        return Object.freeze({
          ...freeAccess,
          state: "vip_active",
          canAccessVip: true,
        });
      }
    }

    return freeAccess;
  } catch (cause) {
    throw new AccessResolutionErrorV1(
      "commercial-access-unavailable",
      "Commercial access state could not be resolved.",
      cause,
    );
  }
}

function matchesVipScopeV1(
  facts: LemonSubscriptionLifecycleFactsV1,
  config: VipCommercialConfigV1,
): boolean {
  return facts.storeId === config.storeId
    && facts.productId === config.productId
    && config.variantIds.includes(facts.variantId)
    && facts.testMode === false;
}

function parseCommercialFactsV1(
  value: unknown,
): LemonSubscriptionLifecycleFactsV1 | null {
  if (!isRecord(value)) {
    return null;
  }

  const subscriptionId = value.lemon_subscription_id;
  const storeId = value.store_id;
  const productId = value.product_id;
  const variantId = value.variant_id;
  const rawStatus = value.raw_status;
  const cancelled = value.cancelled;
  const pauseMode = value.pause_mode;
  const pauseResumesAt = value.pause_resumes_at;
  const trialEndsAt = value.trial_ends_at;
  const renewsAt = value.renews_at;
  const endsAt = value.ends_at;
  const upstreamUpdatedAt = value.upstream_updated_at;
  const testMode = value.test_mode;
  const refundAffected = value.refund_affected;

  if (
    !isCanonicalVendorIdV1(subscriptionId)
    || !isCanonicalVendorIdV1(storeId)
    || !isCanonicalVendorIdV1(productId)
    || !isCanonicalVendorIdV1(variantId)
    || typeof rawStatus !== "string"
    || typeof cancelled !== "boolean"
    || !isNullableStringV1(pauseMode)
    || !isNullableStringV1(pauseResumesAt)
    || !isNullableStringV1(trialEndsAt)
    || !isNullableStringV1(renewsAt)
    || !isNullableStringV1(endsAt)
    || typeof upstreamUpdatedAt !== "string"
    || typeof testMode !== "boolean"
    || typeof refundAffected !== "boolean"
  ) {
    return null;
  }

  return Object.freeze({
    subscriptionId,
    storeId,
    rawStatus,
    cancelled,
    renewsAt,
    endsAt,
    pauseMode,
    pauseResumesAt,
    trialEndsAt,
    upstreamUpdatedAt,
    testMode,
    productId,
    variantId,
    refundAffected,
  });
}

function isCanonicalVendorIdV1(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function isNullableStringV1(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseTrustedAccessV1(
  authSubject: string,
  value: unknown,
): Exclude<AuthenticatedAccessV1, { readonly state: "vip_active" }> {
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
