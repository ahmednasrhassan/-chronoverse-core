import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  evaluateCommercialEntitlementV1,
  type CommercialEntitlementResultV1,
} from "../entitlement";
import {
  normalizeSubscriptionLifecycleV1,
  type LemonSubscriptionLifecycleFactsV1,
  type NormalizedSubscriptionLifecycleV1,
} from "../lifecycle";

const NOW = "2026-09-12T12:00:00.000Z";

const BASE_FACTS: LemonSubscriptionLifecycleFactsV1 = Object.freeze({
  subscriptionId: "subscription-1",
  storeId: "store-1",
  rawStatus: "active",
  cancelled: false,
  renewsAt: "2026-10-12T12:00:00.000Z",
  endsAt: null,
  pauseMode: null,
  pauseResumesAt: null,
  trialEndsAt: null,
  upstreamUpdatedAt: "2026-09-12T10:00:00.000Z",
  testMode: false,
  productId: "product-1",
  variantId: "variant-1",
  refundAffected: false,
  paymentIssue: false,
});

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

function facts(
  overrides: Partial<LemonSubscriptionLifecycleFactsV1> = {},
): LemonSubscriptionLifecycleFactsV1 {
  return Object.freeze({ ...BASE_FACTS, ...overrides });
}

function normalize(
  overrides: Partial<LemonSubscriptionLifecycleFactsV1> = {},
): NormalizedSubscriptionLifecycleV1 {
  return normalizeSubscriptionLifecycleV1(facts(overrides));
}

function evaluate(
  lifecycle: NormalizedSubscriptionLifecycleV1,
  now = NOW,
  testMode = lifecycle.testMode,
): CommercialEntitlementResultV1 {
  return evaluateCommercialEntitlementV1(lifecycle, { now, testMode });
}

function verifyActiveAndExpired(): void {
  const active = normalize();
  assertEqual(active.state, "active", "active lifecycle state");
  assertDeepEqual(
    { state: evaluate(active).state, reason: evaluate(active).reason },
    { state: "active", reason: "subscription-active" },
    "clearly active subscription is commercially active",
  );

  const expired = normalize({
    rawStatus: "expired",
    endsAt: "2026-09-01T00:00:00.000Z",
  });
  assertEqual(expired.state, "expired", "expired lifecycle state");
  assertDeepEqual(
    { state: evaluate(expired).state, reason: evaluate(expired).reason },
    { state: "inactive", reason: "subscription-expired" },
    "expired subscription is inactive",
  );
}

function verifyCancellationBoundaries(): void {
  const futureEnd = normalize({
    rawStatus: "cancelled",
    cancelled: true,
    renewsAt: null,
    endsAt: "2026-09-13T12:00:00.000Z",
  });
  assertEqual(futureEnd.state, "ending", "future cancellation lifecycle");
  assertDeepEqual(
    { state: evaluate(futureEnd).state, reason: evaluate(futureEnd).reason },
    { state: "active", reason: "cancelled-paid-through" },
    "cancelled subscription remains active before its explicit end",
  );

  const pastEnd = normalize({
    rawStatus: "cancelled",
    cancelled: true,
    renewsAt: null,
    endsAt: "2026-09-11T12:00:00.000Z",
  });
  assertDeepEqual(
    { state: evaluate(pastEnd).state, reason: evaluate(pastEnd).reason },
    { state: "inactive", reason: "cancelled-ended" },
    "cancelled subscription is inactive after its explicit end",
  );

  const exactEnd = evaluate(futureEnd, "2026-09-13T12:00:00.000Z");
  assertDeepEqual(
    { state: exactEnd.state, reason: exactEnd.reason },
    { state: "inactive", reason: "cancelled-ended" },
    "paid-through boundary is deterministic",
  );

  const missingEnd = normalize({
    rawStatus: "cancelled",
    cancelled: true,
    renewsAt: null,
  });
  assertDeepEqual(
    { state: evaluate(missingEnd).state, reason: evaluate(missingEnd).reason },
    { state: "unresolved", reason: "ending-date-missing" },
    "cancelled subscription without an end remains unresolved",
  );
}

function verifyUnresolvedPolicies(): void {
  const cases = [
    {
      lifecycle: normalize({
        rawStatus: "paused",
        pauseMode: "void",
        pauseResumesAt: "2026-10-01T00:00:00.000Z",
      }),
      state: "paused",
      reason: "paused-policy-unresolved",
    },
    {
      lifecycle: normalize({ rawStatus: "past_due" }),
      state: "payment_issue",
      reason: "payment-policy-unresolved",
    },
    {
      lifecycle: normalize({ refundAffected: true }),
      state: "refund_affected",
      reason: "refund-policy-unresolved",
    },
    {
      lifecycle: normalize({ rawStatus: "future_vendor_status" }),
      state: "unknown",
      reason: "unknown-status",
    },
    {
      lifecycle: normalize({
        rawStatus: "on_trial",
        trialEndsAt: "2026-09-20T00:00:00.000Z",
      }),
      state: "trial",
      reason: "trial-policy-unresolved",
    },
  ] as const;

  for (const testCase of cases) {
    assertEqual(testCase.lifecycle.state, testCase.state,
      `${testCase.state} lifecycle state`);
    const entitlement = evaluate(testCase.lifecycle);
    assertEqual(entitlement.state, "unresolved",
      `${testCase.state} does not silently grant access`);
    assertEqual(entitlement.reason, testCase.reason,
      `${testCase.state} unresolved reason`);
  }

  for (const rawStatus of ["past_due", "unpaid", "payment_failed"] as const) {
    const lifecycle = normalize({ rawStatus });
    const entitlement = evaluate(lifecycle);
    assertEqual(lifecycle.state, "payment_issue",
      `${rawStatus} normalizes as a payment issue`);
    assertDeepEqual(
      { state: entitlement.state, reason: entitlement.reason },
      { state: "unresolved", reason: "payment-policy-unresolved" },
      `${rawStatus} remains unresolved without payment policy`,
    );
  }

  const unknown = cases[3].lifecycle;
  assertEqual(unknown.rawStatus, "future_vendor_status",
    "unknown provider status is preserved");
}

function verifyTimestampsAndMode(): void {
  const missingOptional = normalize({ renewsAt: null });
  assertEqual(evaluate(missingOptional).state, "active",
    "missing optional renewal time does not invent a failure");

  const invalid = normalize({ renewsAt: "2026-10-12 12:00:00" });
  assertDeepEqual(invalid.invalidTimestampFields, ["renewsAt"],
    "timestamp without an explicit zone is rejected safely");
  assertEqual(evaluate(invalid).state, "unresolved",
    "invalid upstream timestamp fails closed");

  const testLifecycle = normalize({ testMode: true });
  assertEqual(testLifecycle.testMode, true,
    "test mode is preserved in normalized facts");
  assertDeepEqual(
    {
      state: evaluate(testLifecycle, NOW, false).state,
      reason: evaluate(testLifecycle, NOW, false).reason,
    },
    { state: "unresolved", reason: "commercial-mode-mismatch" },
    "test subscription cannot be evaluated as live",
  );
  assertEqual(evaluate(testLifecycle, NOW, true).state, "active",
    "matching test context remains explicitly distinguishable");

  const first = evaluate(normalize(), "2026-09-12T14:00:00+02:00");
  const second = evaluate(normalize(), NOW);
  assertDeepEqual(first, second,
    "equivalent explicit instants produce deterministic UTC output");
  assertEqual(first.evaluatedAt, NOW, "evaluation time is normalized to UTC");
}

function auditIsolation(): void {
  const billingDirectory = fileURLToPath(new URL("../", import.meta.url));
  const source = [
    readFileSync(`${billingDirectory}lifecycle.ts`, "utf8"),
    readFileSync(`${billingDirectory}entitlement.ts`, "utf8"),
  ].join("\n").toLowerCase();

  for (const forbidden of [
    "date.now",
    "unstable_cache",
    "react.cache",
    "resolveaccess",
    "requirevip",
    "vip_active",
    "/auth/",
    "/markets/",
    "owner",
    "admin",
    "email",
    "secret",
    "supabase",
    "fetch(",
  ]) {
    assertEqual(source.includes(forbidden), false,
      `commercial domain source contains no ${forbidden} dependency or policy`);
  }
  assertEqual((source.match(/import "server-only"/g) ?? []).length, 2,
    "commercial normalization and evaluation remain server-only");
}

function main(): void {
  verifyActiveAndExpired();
  verifyCancellationBoundaries();
  verifyUnresolvedPolicies();
  verifyTimestampsAndMode();
  auditIsolation();

  console.log("PASS: subscription lifecycle normalization and entitlement contract");
}

main();
