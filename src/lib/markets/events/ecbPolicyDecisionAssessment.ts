import {
  reconstructAvailableEcbPolicyDecisionDeltaV1,
  type EcbPolicyDecisionDeltaResultV1,
} from "./ecbPolicyDecisionDelta";
import { parseEventInstantV1 } from "./eventClock";

export const ECB_POLICY_DECISION_ASSESSMENT_SCHEMA_VERSION_V1 =
  "ecb-policy-decision-assessment-v1" as const;

type AvailableDelta = Extract<EcbPolicyDecisionDeltaResultV1, { status: "available" }>;
type UnavailableDelta = Extract<EcbPolicyDecisionDeltaResultV1, { status: "unavailable" }>;

export interface BuildEcbPolicyDecisionAssessmentInputV1 {
  /** Canonical delta evidence only; no raw-rate or historical selection input. */
  readonly delta: EcbPolicyDecisionDeltaResultV1;
}

interface AssessmentContext {
  readonly schemaVersion: typeof ECB_POLICY_DECISION_ASSESSMENT_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "ecb-policy-decision-mechanical-assessment";
  readonly coverage: "provided-history-only";
  readonly evaluatedAt: string;
}

export type EcbPolicyDecisionAssessmentResultV1 = AssessmentContext & (
  | ({
      readonly status: "available";
      readonly knownAt: AvailableDelta["knownAt"];
      readonly decisionShape: AvailableDelta["aggregate"];
      readonly rates: AvailableDelta["rates"];
      /** Reconstructed delta, including canonical current/prior/target evidence. */
      readonly delta: AvailableDelta;
    } & (
      | { readonly commonMove: "COMMON_MOVE"; readonly commonMoveBp: number;
          readonly commonMovePercentagePoints: number }
      | { readonly commonMove: "NO_COMMON_MOVE"; readonly commonMoveBp: null;
          readonly commonMovePercentagePoints: null }
    ))
  | { readonly status: "unavailable"; readonly reason: "DELTA_UNAVAILABLE";
      readonly deltaReason: UnavailableDelta["reason"] }
);

/** INACTIVE, pure mechanical features of the three validated announced-rate deltas. */
export function buildEcbPolicyDecisionAssessmentV1(
  input: BuildEcbPolicyDecisionAssessmentInputV1,
): EcbPolicyDecisionAssessmentResultV1 {
  const supplied = input.delta;
  const evaluatedMs = parseEventInstantV1(supplied.evaluatedAt, "delta evaluatedAt");
  if (supplied.semantic !== "derived-feature" || supplied.feature !== "ecb-policy-decision-delta" ||
      supplied.coverage !== "provided-history-only") {
    throw new TypeError("Expected a canonical ECB policy-decision delta context.");
  }
  const context: AssessmentContext = Object.freeze({
    schemaVersion: ECB_POLICY_DECISION_ASSESSMENT_SCHEMA_VERSION_V1,
    semantic: "derived-feature", feature: "ecb-policy-decision-mechanical-assessment",
    coverage: "provided-history-only", evaluatedAt: new Date(evaluatedMs).toISOString(),
  });
  if (supplied.status === "unavailable") {
    if (!["PRIOR_STATE_UNAVAILABLE", "CURRENT_POLICY_FACTS_UNAVAILABLE", "EVENT_IDENTITY_CONFLICT",
      "KNOWLEDGE_INCONSISTENT", "UNSUPPORTED_RATE_PRECISION", "UNSUPPORTED_RATE_RANGE"].includes(supplied.reason)) {
      throw new TypeError("Invalid unavailable ECB policy delta reason.");
    }
    return Object.freeze({ ...context, status: "unavailable", reason: "DELTA_UNAVAILABLE",
      deltaReason: supplied.reason });
  }
  if (supplied.status !== "available") throw new TypeError("Invalid ECB policy delta discriminator.");

  const delta = reconstructAvailableEcbPolicyDecisionDeltaV1(supplied);
  const deposit = delta.rates.depositFacility;
  const common = deposit.deltaBasisPoints === delta.rates.mainRefinancingOperations.deltaBasisPoints &&
    deposit.deltaBasisPoints === delta.rates.marginalLendingFacility.deltaBasisPoints;
  // Reuse the validated canonical percentage-point representation of the equal
  // integer-bp move. No second precision rule, averaging, epsilon or rounding.
  const move = common
    ? { commonMove: "COMMON_MOVE" as const, commonMoveBp: deposit.deltaBasisPoints,
        commonMovePercentagePoints: deposit.deltaPercentagePoints }
    : { commonMove: "NO_COMMON_MOVE" as const, commonMoveBp: null, commonMovePercentagePoints: null };
  return Object.freeze({ ...context, status: "available", knownAt: delta.knownAt,
    decisionShape: delta.aggregate, rates: delta.rates, delta, ...move });
}
