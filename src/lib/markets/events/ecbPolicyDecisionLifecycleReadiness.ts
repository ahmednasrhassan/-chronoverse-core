import {
  reconstructEcbPolicyDecisionEvidenceStateV1,
  type EcbPolicyDecisionEvidenceStateV1,
} from "./ecbPolicyDecisionEvidenceState";
import type { EventPhaseV1 } from "./eventClock";
import type { EventLifecycleStateV1 } from "./eventLifecycle";

export const ECB_POLICY_DECISION_LIFECYCLE_READINESS_SCHEMA_VERSION_V1 =
  "ecb-policy-decision-lifecycle-readiness-v1" as const;

export interface BuildEcbPolicyDecisionLifecycleReadinessInputV1 {
  /** Canonical evidence already binds evaluatedAt; no independent clock or market inputs. */
  readonly evidenceState: EcbPolicyDecisionEvidenceStateV1;
}

type ReleaseWindow = Extract<EventPhaseV1,
  "release" | "post-5m" | "post-15m" | "post-30m" | "post-1h">;
type AdvancedState = Extract<EventLifecycleStateV1,
  "CONFIRMING" | "CONFIRMED" | "CONTRADICTED" | "INVALIDATED" | "REENTRY_WATCH">;
const RELEASE_WINDOWS: readonly ReleaseWindow[] = Object.freeze([
  "release", "post-5m", "post-15m", "post-30m", "post-1h",
]);
const ADVANCED_STATES: readonly AdvancedState[] = Object.freeze([
  "CONFIRMING", "CONFIRMED", "CONTRADICTED", "INVALIDATED", "REENTRY_WATCH",
]);
type MissingMarketEvidence = {
  readonly status: "unavailable";
  readonly reason: "MARKET_FEED_UNAVAILABLE";
};

export interface EcbPolicyDecisionLifecycleReadinessV1 {
  readonly schemaVersion: typeof ECB_POLICY_DECISION_LIFECYCLE_READINESS_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "ecb-policy-decision-lifecycle-readiness";
  readonly evaluatedAt: string;
  readonly canonicalEventId: string | null;
  readonly evidenceKnownAt: number | null;
  readonly officialEvidence: {
    readonly eventContext: boolean;
    readonly schedule: boolean;
    readonly decisionDocument: boolean;
    readonly verifiedRelease: boolean;
    readonly currentPolicyFacts: boolean;
    readonly priorPolicyState: boolean;
    readonly decisionDelta: boolean;
    readonly mechanicalAssessment: boolean;
  };
  readonly temporalReadiness: {
    readonly phase: EventPhaseV1 | null;
    /** Reached canonical clock boundaries only; never observations or confirmation. */
    readonly releaseRelativeWindowsReached: readonly ReleaseWindow[];
  };
  readonly marketReadiness: {
    readonly observation: MissingMarketEvidence;
    readonly confirmation: MissingMarketEvidence;
  };
  readonly lifecycleReadiness: {
    /** Eligibility to review structural context, not a selected/allowed transition. */
    readonly structuralEvaluation: { readonly status: "eligible" } | {
      readonly status: "blocked";
      readonly reason: "EVENT_DATA_INCOMPLETE" | "KNOWLEDGE_INCONSISTENT";
    };
    readonly advancedTransitions: {
      readonly status: "blocked";
      readonly reason: "LIFECYCLE_ASSESSMENT_UNAVAILABLE";
      readonly states: readonly AdvancedState[];
    };
  };
  /** One rebuilt audit context preserves all source provenance and dependency reasons. */
  readonly evidenceState: EcbPolicyDecisionEvidenceStateV1;
}

/**
 * INACTIVE gates only: no lifecycle execution, policy interpretation or trade output.
 * WAIT/WATCH/INITIAL_REACTION are existing structural engine behavior. In particular,
 * INITIAL_REACTION means release-document reassessment, not observed FX reaction.
 * Advanced transitions require explicit EventLifecycleEvidenceV1 engine assessments
 * for a product/hypothesis. The mechanical ECB assessment is not that contract.
 * Existing lifecycle accepts qualified official-release assessments; it does not
 * universally require market data. Neither such assessments nor direct market
 * observations are supplied here, so both boundaries remain explicitly blocked.
 */
export function buildEcbPolicyDecisionLifecycleReadinessV1(
  input: BuildEcbPolicyDecisionLifecycleReadinessInputV1,
): EcbPolicyDecisionLifecycleReadinessV1 {
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(input, "evidenceState")) {
    throw new TypeError("Expected canonical ECB evidence state only.");
  }
  const evidenceState = reconstructEcbPolicyDecisionEvidenceStateV1(input.evidenceState);
  const present = evidenceState.canonicalEventId !== null ? evidenceState : null;
  const phase = present?.clock.phase ?? null;
  // Derive window membership from the clock's phase, never recalculate timestamps.
  const windowIndex = RELEASE_WINDOWS.findIndex((window) => window === phase);
  const releaseRelativeWindowsReached = Object.freeze(RELEASE_WINDOWS.slice(0, windowIndex + 1));
  const missingMarket: MissingMarketEvidence = Object.freeze({
    status: "unavailable", reason: "MARKET_FEED_UNAVAILABLE",
  });
  const structuralEvaluation: EcbPolicyDecisionLifecycleReadinessV1["lifecycleReadiness"]["structuralEvaluation"] =
    evidenceState.canonicalEventId === null ? Object.freeze({
      status: "blocked", reason: evidenceState.current.reason,
    }) : Object.freeze({ status: "eligible" });
  return Object.freeze({
    schemaVersion: ECB_POLICY_DECISION_LIFECYCLE_READINESS_SCHEMA_VERSION_V1,
    semantic: "derived-feature", feature: "ecb-policy-decision-lifecycle-readiness",
    evaluatedAt: evidenceState.evaluatedAt, canonicalEventId: evidenceState.canonicalEventId,
    evidenceKnownAt: evidenceState.evidenceKnownAt,
    officialEvidence: Object.freeze({
      eventContext: present !== null, schedule: present !== null,
      decisionDocument: present !== null && present.current.snapshot.event.decision !== null,
      verifiedRelease: present !== null && present.clock.actualReleasedAt !== null,
      currentPolicyFacts: present?.current.snapshot.event.availability === "available",
      priorPolicyState: present?.prior.status === "available",
      decisionDelta: present?.delta.status === "available",
      mechanicalAssessment: present?.assessment.status === "available",
    }),
    temporalReadiness: Object.freeze({ phase, releaseRelativeWindowsReached }),
    marketReadiness: Object.freeze({ observation: missingMarket, confirmation: missingMarket }),
    lifecycleReadiness: Object.freeze({ structuralEvaluation,
      advancedTransitions: Object.freeze({ status: "blocked",
        reason: "LIFECYCLE_ASSESSMENT_UNAVAILABLE", states: ADVANCED_STATES }),
    }),
    evidenceState,
  });
}
