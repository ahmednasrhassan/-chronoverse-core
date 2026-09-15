import "server-only";

export const SUBSCRIPTION_LIFECYCLE_STATES_V1 = [
  "active",
  "ending",
  "expired",
  "paused",
  "payment_issue",
  "refund_affected",
  "trial",
  "unknown",
] as const;

export type SubscriptionLifecycleStateV1 =
  (typeof SUBSCRIPTION_LIFECYCLE_STATES_V1)[number];

export const SUBSCRIPTION_TIMESTAMP_FIELDS_V1 = [
  "renewsAt",
  "endsAt",
  "pauseResumesAt",
  "trialEndsAt",
  "upstreamUpdatedAt",
] as const;

export type SubscriptionTimestampFieldV1 =
  (typeof SUBSCRIPTION_TIMESTAMP_FIELDS_V1)[number];

/**
 * Upstream facts assembled from private subscription persistence and, for
 * refundAffected and paymentIssue, verified persisted commercial-event evidence.
 */
export interface LemonSubscriptionLifecycleFactsV1 {
  readonly subscriptionId: string;
  readonly storeId: string;
  readonly rawStatus: string;
  readonly cancelled: boolean;
  readonly renewsAt: string | null;
  readonly endsAt: string | null;
  readonly pauseMode: string | null;
  readonly pauseResumesAt: string | null;
  readonly trialEndsAt: string | null;
  readonly upstreamUpdatedAt: string;
  readonly testMode: boolean;
  readonly productId: string;
  readonly variantId: string;
  readonly refundAffected: boolean;
  readonly paymentIssue: boolean;
}

export interface NormalizedSubscriptionLifecycleV1 {
  readonly version: "lemon-subscription-lifecycle-v1";
  readonly state: SubscriptionLifecycleStateV1;
  readonly subscriptionId: string;
  readonly storeId: string;
  readonly rawStatus: string;
  readonly cancelled: boolean;
  readonly renewsAt: string | null;
  readonly endsAt: string | null;
  readonly pauseMode: string | null;
  readonly pauseResumesAt: string | null;
  readonly trialEndsAt: string | null;
  readonly upstreamUpdatedAt: string | null;
  readonly testMode: boolean;
  readonly productId: string;
  readonly variantId: string;
  readonly refundAffected: boolean;
  readonly paymentIssue: boolean;
  readonly invalidTimestampFields: readonly SubscriptionTimestampFieldV1[];
}

/** Normalizes provider facts without deciding whether access should be granted. */
export function normalizeSubscriptionLifecycleV1(
  facts: LemonSubscriptionLifecycleFactsV1,
): NormalizedSubscriptionLifecycleV1 {
  const invalidTimestampFields: SubscriptionTimestampFieldV1[] = [];
  const rawStatusKey = facts.rawStatus.trim().toLowerCase();

  return Object.freeze({
    version: "lemon-subscription-lifecycle-v1",
    state: lifecycleStateV1(facts, rawStatusKey),
    subscriptionId: facts.subscriptionId,
    storeId: facts.storeId,
    rawStatus: facts.rawStatus,
    cancelled: facts.cancelled,
    renewsAt: normalizeOptionalTimestampV1(
      "renewsAt",
      facts.renewsAt,
      invalidTimestampFields,
    ),
    endsAt: normalizeOptionalTimestampV1(
      "endsAt",
      facts.endsAt,
      invalidTimestampFields,
    ),
    pauseMode: facts.pauseMode,
    pauseResumesAt: normalizeOptionalTimestampV1(
      "pauseResumesAt",
      facts.pauseResumesAt,
      invalidTimestampFields,
    ),
    trialEndsAt: normalizeOptionalTimestampV1(
      "trialEndsAt",
      facts.trialEndsAt,
      invalidTimestampFields,
    ),
    upstreamUpdatedAt: normalizeOptionalTimestampV1(
      "upstreamUpdatedAt",
      facts.upstreamUpdatedAt,
      invalidTimestampFields,
    ),
    testMode: facts.testMode,
    productId: facts.productId,
    variantId: facts.variantId,
    refundAffected: facts.refundAffected,
    paymentIssue: facts.paymentIssue,
    invalidTimestampFields: Object.freeze(invalidTimestampFields),
  });
}

function lifecycleStateV1(
  facts: LemonSubscriptionLifecycleFactsV1,
  rawStatusKey: string,
): SubscriptionLifecycleStateV1 {
  if (rawStatusKey === "expired") {
    return "expired";
  }

  if (facts.refundAffected) {
    return "refund_affected";
  }

  if (facts.paymentIssue) {
    return "payment_issue";
  }

  if (facts.cancelled || rawStatusKey === "cancelled") {
    return "ending";
  }

  if (rawStatusKey === "paused" || facts.pauseMode !== null) {
    return "paused";
  }

  if (
    rawStatusKey === "past_due" ||
    rawStatusKey === "unpaid" ||
    rawStatusKey === "payment_failed"
  ) {
    return "payment_issue";
  }

  if (rawStatusKey === "active") {
    return "active";
  }

  if (rawStatusKey === "on_trial") {
    return "trial";
  }

  return "unknown";
}

function normalizeOptionalTimestampV1(
  field: SubscriptionTimestampFieldV1,
  value: string | null,
  invalidFields: SubscriptionTimestampFieldV1[],
): string | null {
  if (value === null) {
    return null;
  }

  if (!hasExplicitTimeZoneV1(value)) {
    invalidFields.push(field);
    return null;
  }

  const milliseconds = Date.parse(value);

  if (!Number.isFinite(milliseconds)) {
    invalidFields.push(field);
    return null;
  }

  return new Date(milliseconds).toISOString();
}

function hasExplicitTimeZoneV1(value: string): boolean {
  return /(?:z|[+-]\d{2}:\d{2})$/i.test(value);
}
