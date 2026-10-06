import {
  buildBilateralPolicyDecisionChangeJuxtapositionV1,
  type BilateralPolicyDecisionChangeJuxtapositionV1,
  type BuildBilateralPolicyDecisionChangeJuxtapositionInputV1,
} from "./bilateralPolicyDecisionChangeJuxtaposition";
import type { PolicyEventDecisionChangeV1 } from "./policyEventDecisionChange";
import { parseEventInstantV1 } from "./eventClock";

export const BILATERAL_POLICY_DECISION_DIRECTION_SCHEMA_VERSION_V1 = "bilateral-policy-decision-direction-v1" as const;
export const BILATERAL_POLICY_DECISION_DIRECTION_METHODOLOGY_ID_V1 = "modern-bilateral-policy-decision-direction-v1" as const;

export interface BuildBilateralPolicyDecisionDirectionInputV1 {
  readonly juxtapositionInput: BuildBilateralPolicyDecisionChangeJuxtapositionInputV1;
  /** Supplied adoption metadata in Unix seconds; not inferred from T/K or independently attested. */
  readonly methodologyKnownAt: number;
}

type Direction = "INCREASE" | "DECREASE" | "UNCHANGED" | "MIXED";
type Institution = PolicyEventDecisionChangeV1["institution"];
type UnavailableChange = Extract<PolicyEventDecisionChangeV1["change"], { status: "unavailable" }>;
type SideDirection = { readonly institution: Institution } & (
  | { readonly direction: Direction }
  | { readonly direction: "UNAVAILABLE"; readonly reason: "SIDE_DIRECTION_UNAVAILABLE";
      readonly canonicalReason: UnavailableChange["reason"] }
  | { readonly direction: "UNAVAILABLE";
      readonly reason: "METHODOLOGY_DATE_NOT_QUALIFIED" | "METHODOLOGY_REGIME_UNSUPPORTED" }
);

export interface BilateralPolicyDecisionDirectionV1 {
  readonly schemaVersion: typeof BILATERAL_POLICY_DECISION_DIRECTION_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "bilateral-policy-decision-direction";
  readonly interpretation: "chronoverse-methodology-bound";
  readonly methodologyId: typeof BILATERAL_POLICY_DECISION_DIRECTION_METHODOLOGY_ID_V1;
  readonly methodologyVersion: 1;
  /** Supplied adoption metadata, validated against T; separate from K and evidence knowledge. */
  readonly methodologyKnownAt: number;
  readonly methodologyKnowledge: "as-known-under-supplied-adoption";
  readonly productId: BilateralPolicyDecisionChangeJuxtapositionV1["productId"];
  readonly evaluatedAt: string;
  readonly knowledgeCutoff: number;
  readonly coverage: "provided-history-only";
  readonly basis: "target-minus-selected-earlier-supplied-announcement";
  readonly left: SideDirection;
  readonly right: SideDirection;
  /** Cartesian directions only, without asserting instrument or interval equivalence. */
  readonly relationship: { readonly leftDirection: Direction; readonly rightDirection: Direction } | null;
  readonly availability: "available" | "partial" | "unavailable";
  readonly missingDirectionPaths: readonly ("left.direction" | "right.direction")[];
  /** Source evidence knowledge only; deliberately separate from methodology adoption. */
  readonly evidenceKnownAt: number | null;
  /** One unchanged canonical audit context; includes source actions and every component. */
  readonly juxtaposition: BilateralPolicyDecisionChangeJuxtapositionV1;
}

// V1 inspected/qualified-date coverage, not economic regime boundaries. These
// dates are documented in ecb/monetaryPolicy/policyDecisionFacts.ts and the
// Federal Reserve / BoE CONTRACT.md files. Both target and selected prior must
// be qualified. Other dates remain unqualified in this immutable V1.
const DOCUMENTED_DATES = {
  ECB: ["2026-04-30", "2026-09-10"],
  FOMC: ["2023-07-26", "2024-12-18", "2025-01-29"],
  BoE: ["2023-08-03", "2025-05-08", "2026-09-17"],
} as const;

/**
 * INACTIVE Chronoverse selection of supplied-history arithmetic directions only.
 * ECB uses named depositFacility; range providers use both endpoints. This is
 * neither a source-reported target action nor an economic or product assessment.
 * Supplied adoption metadata is temporally validated, not independently attested.
 */
export function buildBilateralPolicyDecisionDirectionV1(
  input: BuildBilateralPolicyDecisionDirectionInputV1,
): BilateralPolicyDecisionDirectionV1 {
  assertRoot(input);
  const methodologyKnownAt = input.methodologyKnownAt;
  if (!Number.isSafeInteger(methodologyKnownAt) || methodologyKnownAt < 0) {
    throw new TypeError("Expected nonnegative safe-integer methodologyKnownAt.");
  }
  const juxtaposition = buildBilateralPolicyDecisionChangeJuxtapositionV1(input.juxtapositionInput);
  if (methodologyKnownAt > Math.floor(parseEventInstantV1(juxtaposition.evaluatedAt, "evaluatedAt") / 1_000)) {
    throw new RangeError("Methodology was not yet known at evaluatedAt.");
  }
  const left = interpret(juxtaposition.left);
  const right = interpret(juxtaposition.right);
  const missingDirectionPaths: BilateralPolicyDecisionDirectionV1["missingDirectionPaths"][number][] = [];
  if (left.direction === "UNAVAILABLE") missingDirectionPaths.push("left.direction");
  if (right.direction === "UNAVAILABLE") missingDirectionPaths.push("right.direction");
  return freezeCopy({
    schemaVersion: BILATERAL_POLICY_DECISION_DIRECTION_SCHEMA_VERSION_V1,
    semantic: "derived-feature", feature: "bilateral-policy-decision-direction",
    interpretation: "chronoverse-methodology-bound",
    methodologyId: BILATERAL_POLICY_DECISION_DIRECTION_METHODOLOGY_ID_V1,
    methodologyVersion: 1, methodologyKnownAt, methodologyKnowledge: "as-known-under-supplied-adoption",
    productId: juxtaposition.productId, evaluatedAt: juxtaposition.evaluatedAt,
    knowledgeCutoff: juxtaposition.knowledgeCutoff, coverage: juxtaposition.coverage,
    basis: "target-minus-selected-earlier-supplied-announcement",
    left, right,
    relationship: left.direction === "UNAVAILABLE" || right.direction === "UNAVAILABLE" ? null
      : { leftDirection: left.direction, rightDirection: right.direction },
    availability: missingDirectionPaths.length === 0 ? "available"
      : missingDirectionPaths.length === 1 ? "partial" : "unavailable",
    missingDirectionPaths, evidenceKnownAt: juxtaposition.evidenceKnownAt, juxtaposition,
  });
}

function interpret(child: PolicyEventDecisionChangeV1): SideDirection {
  const change = child.change;
  if (change.status === "unavailable") return {
    institution: child.institution, direction: "UNAVAILABLE",
    reason: "SIDE_DIRECTION_UNAVAILABLE", canonicalReason: change.reason,
  };
  const target = child.targetEvidence;
  const prior = child.priorSelection.prior;
  if (target.status !== "available" || prior.status !== "available" ||
      target.institution !== change.institution || prior.institution !== change.institution) {
    throw new TypeError("Available canonical change requires matching target and prior evidence.");
  }
  // ECB's ordering binding is a meeting date, not necessarily the decision date.
  // Applicability uses retained announcement facts, never schedule/capture time.
  const targetDate = target.institution === "ECB" ? target.data.snapshot.event.decision?.decisionDate
    : target.binding.selectionDate;
  if (targetDate === undefined) throw new TypeError("Available ECB change requires a decision date.");
  if (!supportedDate(change.institution, targetDate) || !supportedDate(change.institution, prior.selectionDate)) {
    return { institution: child.institution, direction: "UNAVAILABLE",
      reason: change.institution === "BoJ" || change.institution === "SNB"
        ? "METHODOLOGY_REGIME_UNSUPPORTED" : "METHODOLOGY_DATE_NOT_QUALIFIED" };
  }
  let direction: Direction;
  switch (change.institution) {
    case "ECB": direction = change.rates.depositFacility.direction; break;
    case "FOMC": direction = endpoints(change.targetLower.direction, change.targetUpper.direction); break;
    case "BoJ": direction = change.shape === "scalar" ? change.nominalTarget.direction
      : endpoints(change.lower.direction, change.upper.direction); break;
    case "BoE": direction = change.bankRate.direction; break;
    case "SNB": direction = change.policyRate.direction; break;
  }
  return { institution: child.institution, direction };
}

function supportedDate(institution: Institution, date: string): boolean {
  // BoJ and SNB canonical readers already enforce these exact documented cutoffs.
  if (institution === "BoJ") return date >= "2024-03-19";
  if (institution === "SNB") return date >= "2019-06-13";
  return (DOCUMENTED_DATES[institution] as readonly string[]).includes(date);
}

function endpoints(left: Exclude<Direction, "MIXED">, right: Exclude<Direction, "MIXED">): Direction {
  return left === right ? left : "MIXED";
}

function assertRoot(value: unknown): void {
  const keys = ["juxtapositionInput", "methodologyKnownAt"];
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed bilateral decision-direction input.");
  }
}

function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(nested: unknown): void {
    if (typeof nested !== "object" || nested === null) return;
    for (const child of Object.values(nested)) freeze(child);
    Object.freeze(nested);
  }
  freeze(copy);
  return copy;
}
