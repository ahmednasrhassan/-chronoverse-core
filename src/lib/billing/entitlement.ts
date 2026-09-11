import "server-only";

import type { NormalizedSubscriptionLifecycleV1 } from "./lifecycle";

export const COMMERCIAL_ENTITLEMENT_STATES_V1 = [
  "active",
  "inactive",
  "unresolved",
] as const;

export type CommercialEntitlementStateV1 =
  (typeof COMMERCIAL_ENTITLEMENT_STATES_V1)[number];

export type CommercialEntitlementReasonV1 =
  | "subscription-active"
  | "cancelled-paid-through"
  | "subscription-expired"
  | "cancelled-ended"
  | "ending-date-missing"
  | "paused-policy-unresolved"
  | "payment-policy-unresolved"
  | "refund-policy-unresolved"
  | "trial-policy-unresolved"
  | "unknown-status"
  | "invalid-timestamp"
  | "active-facts-conflict"
  | "commercial-mode-mismatch";

export interface CommercialEntitlementContextV1 {
  readonly now: string;
  readonly testMode: boolean;
}

export interface CommercialEntitlementResultV1 {
  readonly version: "commercial-entitlement-evaluation-v1";
  readonly state: CommercialEntitlementStateV1;
  readonly reason: CommercialEntitlementReasonV1;
  readonly evaluatedAt: string;
  readonly subscriptionId: string;
  readonly storeId: string;
  readonly testMode: boolean;
  readonly productId: string;
  readonly variantId: string;
}

/** Evaluates explicit policy only; every unresolved lifecycle fails closed. */
export function evaluateCommercialEntitlementV1(
  lifecycle: NormalizedSubscriptionLifecycleV1,
  context: CommercialEntitlementContextV1,
): CommercialEntitlementResultV1 {
  const evaluatedAt = normalizeEvaluationTimeV1(context.now);
  const result = (
    state: CommercialEntitlementStateV1,
    reason: CommercialEntitlementReasonV1,
  ): CommercialEntitlementResultV1 => Object.freeze({
    version: "commercial-entitlement-evaluation-v1",
    state,
    reason,
    evaluatedAt,
    subscriptionId: lifecycle.subscriptionId,
    storeId: lifecycle.storeId,
    testMode: lifecycle.testMode,
    productId: lifecycle.productId,
    variantId: lifecycle.variantId,
  });

  if (context.testMode !== lifecycle.testMode) {
    return result("unresolved", "commercial-mode-mismatch");
  }

  if (lifecycle.state === "expired") {
    return result("inactive", "subscription-expired");
  }

  if (lifecycle.invalidTimestampFields.length > 0) {
    return result("unresolved", "invalid-timestamp");
  }

  if (lifecycle.state === "active") {
    if (lifecycle.endsAt !== null || lifecycle.pauseMode !== null) {
      return result("unresolved", "active-facts-conflict");
    }

    return result("active", "subscription-active");
  }

  if (lifecycle.state === "ending") {
    if (lifecycle.endsAt === null) {
      return result("unresolved", "ending-date-missing");
    }

    return Date.parse(lifecycle.endsAt) > Date.parse(evaluatedAt)
      ? result("active", "cancelled-paid-through")
      : result("inactive", "cancelled-ended");
  }

  if (lifecycle.state === "paused") {
    return result("unresolved", "paused-policy-unresolved");
  }

  if (lifecycle.state === "payment_issue") {
    return result("unresolved", "payment-policy-unresolved");
  }

  if (lifecycle.state === "refund_affected") {
    return result("unresolved", "refund-policy-unresolved");
  }

  if (lifecycle.state === "trial") {
    return result("unresolved", "trial-policy-unresolved");
  }

  return result("unresolved", "unknown-status");
}

function normalizeEvaluationTimeV1(value: string): string {
  if (!/(?:z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new TypeError("Evaluation time must include a UTC offset.");
  }

  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Evaluation time must be a valid timestamp.");
  }

  return new Date(milliseconds).toISOString();
}
