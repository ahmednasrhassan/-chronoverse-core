import { isDeepStrictEqual } from "node:util";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "./ecbMonetaryPolicyMemory";
import {
  selectEcbMonetaryPolicyPriorStateAsKnownAtV1,
  type EcbMonetaryPolicyPriorStateResultV1,
} from "./ecbMonetaryPolicyPriorState";
import {
  buildEcbPolicyDecisionEventClockV1,
  reconstructEcbMonetaryPolicyEventSnapshotV1,
  type EcbPolicyDecisionEventClockResultV1,
} from "./ecbPolicyDecisionEventClock";
import { buildEcbPolicyDecisionDeltaV1, type EcbPolicyDecisionDeltaResultV1 } from "./ecbPolicyDecisionDelta";
import {
  buildEcbPolicyDecisionAssessmentV1,
  type EcbPolicyDecisionAssessmentResultV1,
} from "./ecbPolicyDecisionAssessment";
import { parseEventInstantV1 } from "./eventClock";

export const ECB_POLICY_DECISION_EVIDENCE_STATE_SCHEMA_VERSION_V1 =
  "ecb-policy-decision-evidence-state-v1" as const;

export interface BuildEcbPolicyDecisionEvidenceStateInputV1 {
  /** Selected upstream using existing as-of memory semantics; null if no state was known. */
  readonly current: EcbMonetaryPolicyEventSnapshotV1 | null;
  /** Bounded caller-supplied candidate history only; never globally discovered. */
  readonly memories: readonly EcbMonetaryPolicyEventMemoryV1[];
  /** Prior history cutoff remains separate from the current/target assessment boundary. */
  readonly knowledgeCutoff: number;
  readonly evaluatedAt: string;
}

/**
 * Rebuild retained evidence through the canonical composition, without trusting
 * derived members. The state retains the selected prior, not candidate history:
 * this checks its canonical consistency, not whether omitted history was exhaustive.
 * Unavailable current facts and rejected histories are not retained: validate
 * closed reasons/dependencies without upgrading absence or substituting older facts.
 */
export function reconstructEcbPolicyDecisionEvidenceStateV1(
  supplied: EcbPolicyDecisionEvidenceStateV1,
): EcbPolicyDecisionEvidenceStateV1 {
  let rebuilt: EcbPolicyDecisionEvidenceStateV1;
  if (supplied.current.status === "unavailable") {
    const reason = supplied.current.reason;
    if (reason !== "EVENT_DATA_INCOMPLETE" && reason !== "KNOWLEDGE_INCONSISTENT") {
      throw new TypeError("Invalid unavailable ECB current evidence reason.");
    }
    const empty = buildEcbPolicyDecisionEvidenceStateV1({ current: null, memories: [],
      knowledgeCutoff: 0, evaluatedAt: supplied.evaluatedAt });
    if (empty.canonicalEventId !== null) throw new TypeError("Expected unavailable ECB context.");
    rebuilt = Object.freeze({ ...empty,
      current: Object.freeze({ semantic: "source-fact", status: "unavailable", reason }),
      clock: Object.freeze({ ...empty.clock, reason }),
    });
  } else if (supplied.current.status === "available") {
    // Narrow through the shared top-level discriminator, then compare the entire
    // state below; a forged null identity must not bypass canonical reconstruction.
    if (supplied.canonicalEventId === null) throw new TypeError("Expected ECB event identity.");
    const prior = supplied.prior;
    let memories: readonly EcbMonetaryPolicyEventMemoryV1[] = [];
    if (prior.status === "available") {
      const selected = reconstructEcbMonetaryPolicyEventSnapshotV1(prior.selectedSnapshot);
      // Only canonical data crosses the memory parser's domain-validation boundary.
      memories = [advanceEcbMonetaryPolicyEventMemoryV1(null, selected.event).memory];
    } else if (prior.status !== "unavailable") {
      throw new TypeError("Invalid ECB prior dependency status.");
    }
    rebuilt = buildEcbPolicyDecisionEvidenceStateV1({ current: supplied.current.snapshot,
      memories, knowledgeCutoff: prior.knowledgeCutoff, evaluatedAt: supplied.evaluatedAt });
    if (prior.status === "unavailable" && rebuilt.canonicalEventId !== null) {
      const unavailablePrior = Object.freeze({ status: "unavailable" as const,
        coverage: "provided-history-only" as const, evaluatedAt: rebuilt.evaluatedAt,
        knowledgeCutoff: prior.knowledgeCutoff, reason: prior.reason });
      // The existing delta builder validates the closed prior reason vocabulary.
      const delta = buildEcbPolicyDecisionDeltaV1({ current: rebuilt.current.snapshot.event,
        prior: unavailablePrior, evaluatedAt: rebuilt.evaluatedAt });
      rebuilt = Object.freeze({ ...rebuilt, prior: unavailablePrior, delta,
        assessment: buildEcbPolicyDecisionAssessmentV1({ delta }) });
    }
  } else {
    throw new TypeError("Invalid ECB current evidence status.");
  }
  if (!isDeepStrictEqual(supplied, rebuilt)) {
    throw new TypeError("ECB evidence state does not match its canonical reconstruction.");
  }
  return rebuilt;
}

type UnavailableClock = Extract<EcbPolicyDecisionEventClockResultV1, { status: "unavailable" }>;
type BlockedDependency = {
  readonly status: "not-computed";
  readonly reason: "CURRENT_EVENT_UNAVAILABLE";
};
interface EvidenceStateContext {
  readonly schemaVersion: typeof ECB_POLICY_DECISION_EVIDENCE_STATE_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "ecb-policy-decision-evidence-state";
  readonly coverage: "provided-history-only";
  readonly evaluatedAt: string;
}

/** Availability belongs to each existing layer; no second overall completeness judgment. */
export type EcbPolicyDecisionEvidenceStateV1 = EvidenceStateContext & (
  | {
      readonly canonicalEventId: null;
      readonly evidenceKnownAt: null;
      readonly current: {
        readonly semantic: "source-fact";
        readonly status: "unavailable";
        readonly reason: UnavailableClock["reason"];
      };
      readonly clock: UnavailableClock;
      readonly prior: BlockedDependency;
      readonly delta: BlockedDependency;
      readonly assessment: BlockedDependency;
    }
  | {
      readonly canonicalEventId: string;
      /** Unix seconds: latest capture required by the evidence actually included as available. */
      readonly evidenceKnownAt: number;
      readonly current: {
        readonly semantic: "source-fact";
        readonly status: "available";
        readonly snapshot: EcbMonetaryPolicyEventSnapshotV1;
      };
      readonly clock: Extract<EcbPolicyDecisionEventClockResultV1, { status: "available" }>;
      readonly prior: EcbMonetaryPolicyPriorStateResultV1;
      readonly delta: EcbPolicyDecisionDeltaResultV1;
      readonly assessment: EcbPolicyDecisionAssessmentResultV1;
    }
);

/**
 * INACTIVE composition only. The existing selector owns prior selection and
 * target binding; existing builders own timing, arithmetic and mechanical shape.
 * Caller-supplied derived results are not an alternative evidence input.
 * Neither elapsed time nor complete official evidence implies lifecycle confirmation.
 */
export function buildEcbPolicyDecisionEvidenceStateV1(
  input: BuildEcbPolicyDecisionEvidenceStateInputV1,
): EcbPolicyDecisionEvidenceStateV1 {
  // Keep the input contract closed: derived-result injection must not be ignored.
  const keys = ["current", "memories", "knowledgeCutoff", "evaluatedAt"];
  if (typeof input !== "object" || input === null || Array.isArray(input) ||
      Reflect.ownKeys(input).some((key) => typeof key !== "string" || !keys.includes(key)) ||
      keys.some((key) => !Object.hasOwn(input, key))) {
    throw new TypeError("Expected canonical ECB evidence-state inputs only.");
  }
  const { current, memories, knowledgeCutoff, evaluatedAt } = input;
  if (typeof evaluatedAt !== "string") throw new TypeError("Invalid evaluatedAt.");
  const evaluatedMs = parseEventInstantV1(evaluatedAt, "evaluatedAt");
  if (!Array.isArray(memories)) throw new TypeError("Expected captured ECB event memories.");
  if (!Number.isSafeInteger(knowledgeCutoff) || knowledgeCutoff < 0) {
    throw new TypeError("Invalid knowledgeCutoff: expected nonnegative Unix seconds.");
  }
  if (knowledgeCutoff > Math.floor(evaluatedMs / 1_000)) {
    throw new RangeError("knowledgeCutoff cannot follow evaluatedAt.");
  }
  const snapshot = current === null ? null : reconstructEcbMonetaryPolicyEventSnapshotV1(current);
  const clock = buildEcbPolicyDecisionEventClockV1({ snapshot, evaluatedAt });
  const context = {
    schemaVersion: ECB_POLICY_DECISION_EVIDENCE_STATE_SCHEMA_VERSION_V1,
    semantic: "derived-feature" as const, feature: "ecb-policy-decision-evidence-state" as const,
    coverage: "provided-history-only" as const, evaluatedAt: clock.evaluatedAt,
  };
  if (clock.status === "unavailable") {
    // No target exists for prior selection; do not inspect or expose candidate history.
    const blocked = Object.freeze({ status: "not-computed" as const,
      reason: "CURRENT_EVENT_UNAVAILABLE" as const });
    return Object.freeze({
      ...context, canonicalEventId: null, evidenceKnownAt: null,
      current: Object.freeze({ semantic: "source-fact", status: "unavailable", reason: clock.reason }),
      clock, prior: blocked, delta: blocked, assessment: blocked,
    });
  }
  // An available clock proves that the reconstructed snapshot exists and is known.
  if (snapshot === null) throw new TypeError("Available ECB clock requires a canonical snapshot.");
  const prior = selectEcbMonetaryPolicyPriorStateAsKnownAtV1({
    memories, target: snapshot.event, knowledgeCutoff, evaluatedAt: context.evaluatedAt,
  });
  const delta = buildEcbPolicyDecisionDeltaV1({ current: snapshot.event, prior,
    evaluatedAt: context.evaluatedAt });
  const assessment = buildEcbPolicyDecisionAssessmentV1({ delta });
  const includedKnowledge = [snapshot.knownAt, clock.knownAt];
  if (prior.status === "available") includedKnowledge.push(prior.knownAt, prior.targetSnapshot.knownAt);
  if (delta.status === "available") includedKnowledge.push(delta.knownAt);
  if (assessment.status === "available") includedKnowledge.push(assessment.knownAt);
  return Object.freeze({
    ...context, canonicalEventId: snapshot.canonicalEventId,
    evidenceKnownAt: Math.max(...includedKnowledge),
    current: Object.freeze({ semantic: "source-fact", status: "available", snapshot }),
    clock, prior, delta, assessment,
  });
}
