import {
  calculateDecisionLifecycleV3,
} from "../core/decisionLifecycle";
import {
  buildCanonicalDecisionSnapshot,
  type AdvanceDecisionSnapshotResult,
  type CanonicalDecisionSnapshot,
} from "./decisionPersistence";
import type {
  EngineAssetId,
  EngineDecisionLifecycleSectionV3,
  EngineDecisionSectionV3,
} from "./contracts";

export type AdvanceCanonicalDecisionSnapshot = (
  currentSnapshot: CanonicalDecisionSnapshot,
) => Promise<AdvanceDecisionSnapshotResult>;

export interface IntegrateCanonicalDecisionLifecycleV3Input {
  readonly assetId: EngineAssetId;
  readonly computedAt: string;
  readonly currentDecision: EngineDecisionSectionV3;
  readonly advanceSnapshot: AdvanceCanonicalDecisionSnapshot;
}

export interface EngineDecisionLifecycleIntegrationV3 {
  readonly decision: EngineDecisionSectionV3;
  readonly decisionLifecycle: EngineDecisionLifecycleSectionV3;
}

const PERSISTENCE_FAILURE_REASON =
  "Decision Lifecycle is unavailable because canonical Decision persistence failed.";
const STALE_DECISION_REASON =
  "Decision Lifecycle is unavailable because this Decision did not become the canonical snapshot.";

/**
 * Fresh-computation orchestration boundary for canonical Decision persistence.
 * Cache owners call this once after Engine V3 has computed the current Decision.
 */
export async function integrateCanonicalDecisionLifecycleV3(
  input: IntegrateCanonicalDecisionLifecycleV3Input,
): Promise<EngineDecisionLifecycleIntegrationV3> {
  const decision = input.currentDecision;

  if (
    decision.availability !== "available" &&
    decision.availability !== "partial"
  ) {
    return {
      decision,
      decisionLifecycle: calculateDecisionLifecycleV3({
        currentDecision: decision,
        previousDecision: null,
      }),
    };
  }

  try {
    const currentSnapshot = buildCanonicalDecisionSnapshot({
      assetId: input.assetId,
      computedAt: input.computedAt,
      decision,
    });
    const persistence = await input.advanceSnapshot(currentSnapshot);

    if (persistence.status === "stale") {
      return {
        decision,
        decisionLifecycle: {
          availability: "unavailable",
          reason: STALE_DECISION_REASON,
        },
      };
    }

    const previousDecision =
      persistence.status === "initialized"
        ? null
        : persistence.previous.decision;

    return {
      decision,
      decisionLifecycle: calculateDecisionLifecycleV3({
        currentDecision: currentSnapshot.decision,
        previousDecision,
      }),
    };
  } catch {
    return {
      decision,
      decisionLifecycle: {
        availability: "unavailable",
        reason: PERSISTENCE_FAILURE_REASON,
      },
    };
  }
}
