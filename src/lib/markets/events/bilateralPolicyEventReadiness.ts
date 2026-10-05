import {
  buildBilateralPolicyStateV1,
  type BuildBilateralPolicyStateInputV1,
  type BilateralPolicyStateV1,
  type BilateralPolicyUnavailableReasonV1,
} from "./bilateralPolicyState";
import { buildEcbPolicyDecisionEventClockV1 } from "./ecbPolicyDecisionEventClock";
import {
  eventPhaseWithVerifiedReleaseV1, parseEventInstantV1,
  type EventPhaseV1, type EventScheduleMilestonesV1,
} from "./eventClock";
import type { EventLifecycleStateV1 } from "./eventLifecycle";

export const BILATERAL_POLICY_EVENT_READINESS_SCHEMA_VERSION_V1 =
  "bilateral-policy-event-readiness-v1" as const;

export interface BuildBilateralPolicyEventReadinessInputV1 {
  readonly policyInput: BuildBilateralPolicyStateInputV1;
  /** Request metadata only; does not assert an update, recency or causal importance. */
  readonly focusSide: "left" | "right";
}

type PolicyPath = BilateralPolicyStateV1["missing"][number];
type OfficialRequirement = PolicyPath | "left.eventContext" | "right.eventContext";
type TimingRequirement = "focused.schedule" | "focused.verifiedReleaseTime";
type ReviewReason = BilateralPolicyUnavailableReasonV1 | "POLICY_SETTING_UNAVAILABLE" | "EVENT_DATA_INCOMPLETE";
type ReviewGate = { readonly status: "eligible" } | {
  readonly status: "blocked";
  readonly reason: ReviewReason;
  readonly upstreamReason: string | null;
  readonly missing: readonly OfficialRequirement[];
};
type TimingCapability<T> = { readonly status: "available"; readonly data: T } | {
  readonly status: "unavailable";
  readonly reason: BilateralPolicyUnavailableReasonV1 | "EVENT_DATA_INCOMPLETE";
  readonly upstreamReason: string | null;
};
type ReleaseWindow = Extract<EventPhaseV1, "release" | "post-5m" | "post-15m" | "post-30m" | "post-1h">;
type AdvancedState = Extract<EventLifecycleStateV1,
  "CONFIRMING" | "CONFIRMED" | "CONTRADICTED" | "INVALIDATED" | "REENTRY_WATCH">;
const RELEASE_WINDOWS: readonly ReleaseWindow[] = Object.freeze([
  "release", "post-5m", "post-15m", "post-30m", "post-1h",
]);
const ADVANCED_STATES: readonly AdvancedState[] = Object.freeze([
  "CONFIRMING", "CONFIRMED", "CONTRADICTED", "INVALIDATED", "REENTRY_WATCH",
]);
const COUNTERPARTY_INSTITUTIONS = Object.freeze({
  eurusd: "Board of Governors of the Federal Reserve System / FOMC",
  eurjpy: "Bank of Japan", eurgbp: "Bank of England", eurchf: "Swiss National Bank",
} as const);

type Focus = {
  readonly side: "left";
  readonly institution: "ECB";
  readonly requestedIdentity: {
    readonly semantic: "request-metadata"; readonly kind: "ecb-event"; readonly canonicalEventId: string;
  };
  readonly admittedCanonicalReference: {
    readonly kind: "ecb-event"; readonly canonicalEventId: string; readonly eventSourceVersionId: string;
  } | null;
  readonly knownAt: number | null;
} | {
  readonly side: "right";
  readonly institution: (typeof COUNTERPARTY_INSTITUTIONS)[BilateralPolicyStateV1["productId"]];
  readonly requestedIdentity: {
    readonly semantic: "request-metadata"; readonly kind: "decision-date" | "publication-date"; readonly date: string;
  };
  readonly admittedCanonicalReference: {
    readonly kind: "policy-series"; readonly canonicalSeriesId: string; readonly sourceVersionId: string;
  } | null;
  readonly knownAt: number | null;
};

type MissingMarketEvidence = { readonly status: "unavailable"; readonly reason: "MARKET_FEED_UNAVAILABLE" };
export interface BilateralPolicyEventReadinessV1 {
  readonly schemaVersion: typeof BILATERAL_POLICY_EVENT_READINESS_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "bilateral-policy-event-readiness";
  readonly productId: BilateralPolicyStateV1["productId"];
  readonly evaluatedAt: string;
  readonly evidenceKnownAt: number | null;
  readonly policyState: BilateralPolicyStateV1;
  readonly focus: Focus;
  readonly temporalReadiness: {
    readonly schedule: TimingCapability<EventScheduleMilestonesV1>;
    readonly verifiedRelease: TimingCapability<{ readonly actualReleasedAt: string }>;
    readonly phase: EventPhaseV1 | null;
    /** Elapsed canonical boundaries only; never observed market reactions. */
    readonly releaseRelativeWindowsReached: readonly ReleaseWindow[];
  };
  readonly reviewReadiness: {
    readonly structuralEvaluation: ReviewGate;
    readonly focusedPolicyFactReview: ReviewGate;
    readonly bilateralPolicyFactReview: ReviewGate;
    readonly advancedTransitions: {
      readonly status: "blocked"; readonly reason: "LIFECYCLE_ASSESSMENT_UNAVAILABLE";
      readonly states: readonly AdvancedState[];
    };
  };
  readonly marketReadiness: {
    readonly observation: MissingMarketEvidence;
    readonly confirmation: MissingMarketEvidence;
  };
  /** Independent capability dependencies, not a combined trade-entry checklist. */
  readonly nextEvidenceRequirements: {
    readonly officialPolicyReview: readonly OfficialRequirement[];
    readonly eventTiming: readonly TimingRequirement[];
    readonly lifecycleProgression: readonly "productEventHypothesisAssessment"[];
    readonly marketConfirmation: readonly ("directIntradayFxObservation" | "observationBackedAssessment")[];
  };
}

/**
 * INACTIVE: canonical supplied evidence and explicit time only. Review eligibility
 * is not policy interpretation, currentness, a lifecycle state or a recommendation.
 * No market observations or hypothesis assessments are supplied, so their gates
 * remain blocked even when all official facts and elapsed windows are available.
 */
export function buildBilateralPolicyEventReadinessV1(
  input: BuildBilateralPolicyEventReadinessInputV1,
): BilateralPolicyEventReadinessV1 {
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      Reflect.ownKeys(input).length !== 2 || !Object.hasOwn(input, "policyInput") ||
      !Object.hasOwn(input, "focusSide")) throw new TypeError("Expected policyInput and focusSide only.");
  const focusSide = input.focusSide;
  if (focusSide !== "left" && focusSide !== "right") throw new TypeError("Invalid policy event focus side.");
  const policyInput = input.policyInput;
  const policyState = buildBilateralPolicyStateV1(policyInput);
  // After reconstruction, raw input is used only for explicitly labeled request
  // identifiers. No raw snapshot, provenance or timing is inspected below.
  const focused = focusSide === "left" ? policyState.left : policyState.right;
  const focus = buildFocus(policyInput, policyState, focusSide);
  const temporalReadiness = buildTiming(policyState, focusSide);
  const contextPath = `${focusSide}.eventContext` as const;
  const settingPath = `${focusSide}.policySetting` as const;
  const eligible = Object.freeze({ status: "eligible" as const });
  const structuralEvaluation = focused.availability === "unavailable"
    ? blocked(focused.reason, [contextPath], focused.upstreamReason) : eligible;
  const focusedPolicyFactReview = focused.availability === "available" ? eligible
    : blocked(focused.availability === "unavailable" ? focused.reason : "POLICY_SETTING_UNAVAILABLE",
      [settingPath], focused.availability === "unavailable" ? focused.upstreamReason : null);
  const bilateralPolicyFactReview = policyState.missing.length === 0 ? eligible
    : blocked("EVENT_DATA_INCOMPLETE", policyState.missing);
  const officialPolicyReview: OfficialRequirement[] = [
    ...(focused.availability === "unavailable" ? [contextPath] : []), ...policyState.missing,
  ];
  const eventTiming: TimingRequirement[] = [];
  if (temporalReadiness.schedule.status === "unavailable") eventTiming.push("focused.schedule");
  if (temporalReadiness.verifiedRelease.status === "unavailable") eventTiming.push("focused.verifiedReleaseTime");
  const missingMarket: MissingMarketEvidence = Object.freeze({ status: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" });
  return Object.freeze({
    schemaVersion: BILATERAL_POLICY_EVENT_READINESS_SCHEMA_VERSION_V1,
    semantic: "derived-feature", feature: "bilateral-policy-event-readiness",
    productId: policyState.productId, evaluatedAt: policyState.evaluatedAt,
    evidenceKnownAt: policyState.evidenceKnownAt, policyState, focus, temporalReadiness,
    reviewReadiness: Object.freeze({ structuralEvaluation, focusedPolicyFactReview, bilateralPolicyFactReview,
      advancedTransitions: Object.freeze({ status: "blocked", reason: "LIFECYCLE_ASSESSMENT_UNAVAILABLE",
        states: ADVANCED_STATES }) }),
    marketReadiness: Object.freeze({ observation: missingMarket, confirmation: missingMarket }),
    nextEvidenceRequirements: Object.freeze({
      officialPolicyReview: Object.freeze(officialPolicyReview), eventTiming: Object.freeze(eventTiming),
      lifecycleProgression: Object.freeze(["productEventHypothesisAssessment"] as const),
      marketConfirmation: Object.freeze(["directIntradayFxObservation", "observationBackedAssessment"] as const),
    }),
  });
}

function buildFocus(
  request: BuildBilateralPolicyStateInputV1, state: BilateralPolicyStateV1, side: "left" | "right",
): Focus {
  if (side === "left") {
    const admitted = state.left.availability === "unavailable" ? null : state.left.data;
    return Object.freeze({ side, institution: "ECB",
      requestedIdentity: Object.freeze({ semantic: "request-metadata", kind: "ecb-event",
        canonicalEventId: request.expectedEcbCanonicalEventId }),
      admittedCanonicalReference: admitted === null ? null : Object.freeze({ kind: "ecb-event",
        canonicalEventId: admitted.snapshot.canonicalEventId,
        eventSourceVersionId: admitted.snapshot.eventSourceVersionId }),
      knownAt: admitted?.knownAt ?? null,
    });
  }
  const admitted = state.right.availability === "unavailable" ? null : state.right.data;
  return Object.freeze({ side, institution: COUNTERPARTY_INSTITUTIONS[state.productId],
    requestedIdentity: Object.freeze({ semantic: "request-metadata",
      kind: request.productId === "eurgbp" ? "publication-date" : "decision-date",
      date: request.productId === "eurgbp" ? request.counterparty.publicationDate : request.counterparty.decisionDate }),
    admittedCanonicalReference: admitted === null ? null : Object.freeze({ kind: "policy-series",
      canonicalSeriesId: admitted.snapshot.canonicalSeriesId, sourceVersionId: admitted.snapshot.sourceVersionId }),
    knownAt: admitted?.knownAt ?? null,
  });
}

function buildTiming(
  state: BilateralPolicyStateV1, side: "left" | "right",
): BilateralPolicyEventReadinessV1["temporalReadiness"] {
  const focused = side === "left" ? state.left : state.right;
  const unavailable = focused.availability === "unavailable"
    ? Object.freeze({ status: "unavailable" as const, reason: focused.reason, upstreamReason: focused.upstreamReason })
    : Object.freeze({ status: "unavailable" as const, reason: "EVENT_DATA_INCOMPLETE" as const, upstreamReason: null });
  let schedule: TimingCapability<EventScheduleMilestonesV1> = unavailable;
  let actualReleasedAt: string | null = null;
  let phase: EventPhaseV1 | null = null;
  if (side === "left" && state.left.availability !== "unavailable") {
    const clock = buildEcbPolicyDecisionEventClockV1({ snapshot: state.left.data.snapshot, evaluatedAt: state.evaluatedAt });
    if (clock.status !== "available") throw new TypeError("Admitted ECB context requires an available canonical clock.");
    schedule = Object.freeze({ status: "available", data: clock.milestones.schedule });
    actualReleasedAt = clock.actualReleasedAt;
    phase = clock.phase;
  } else if (side === "right" && state.right.availability !== "unavailable") {
    const releaseTimestamp = state.right.data.timing.releaseTimestamp;
    if (releaseTimestamp !== null) {
      const releaseMs = releaseTimestamp * 1_000;
      phase = eventPhaseWithVerifiedReleaseV1(parseEventInstantV1(state.evaluatedAt, "evaluatedAt"), releaseMs);
      actualReleasedAt = new Date(releaseMs).toISOString();
    }
  }
  const verifiedRelease: TimingCapability<{ readonly actualReleasedAt: string }> = actualReleasedAt === null
    ? unavailable : Object.freeze({ status: "available", data: Object.freeze({ actualReleasedAt }) });
  const windowIndex = RELEASE_WINDOWS.findIndex((window) => window === phase);
  return Object.freeze({ schedule, verifiedRelease, phase,
    releaseRelativeWindowsReached: Object.freeze(RELEASE_WINDOWS.slice(0, windowIndex + 1)) });
}

function blocked(reason: ReviewReason, missing: readonly OfficialRequirement[], upstreamReason: string | null = null): ReviewGate {
  return Object.freeze({ status: "blocked", reason, upstreamReason, missing: Object.freeze([...missing]) });
}
