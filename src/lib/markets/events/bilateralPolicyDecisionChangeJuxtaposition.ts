import { isDeepStrictEqual } from "node:util";
import {
  buildBilateralPolicyEventReadinessV1,
  type BilateralPolicyEventReadinessV1,
  type BuildBilateralPolicyEventReadinessInputV1,
} from "./bilateralPolicyEventReadiness";
import {
  buildPolicyEventDecisionChangeV1,
  type PolicyEventDecisionChangeV1,
} from "./policyEventDecisionChange";
import type { PolicyEventPriorHistoryV1 } from "./policyEventPriorSelection";
import { parseEventInstantV1 } from "./eventClock";

export const BILATERAL_POLICY_DECISION_CHANGE_JUXTAPOSITION_SCHEMA_VERSION_V1 =
  "bilateral-policy-decision-change-juxtaposition-v1" as const;

export interface BuildBilateralPolicyDecisionChangeJuxtapositionInputV1 {
  readonly readinessInput: BuildBilateralPolicyEventReadinessInputV1;
  /** Inclusive prior-history knowledge boundary; targets are admitted at evaluatedAt. */
  readonly knowledgeCutoff: number;
  readonly leftHistory: Extract<PolicyEventPriorHistoryV1, { institution: "ECB" }>;
  /** Runtime binding requires the institution belonging to the supplied FX product. */
  readonly rightHistory: Exclude<PolicyEventPriorHistoryV1, { institution: "ECB" }>;
}

export interface BilateralPolicyDecisionChangeJuxtapositionV1 {
  readonly schemaVersion: typeof BILATERAL_POLICY_DECISION_CHANGE_JUXTAPOSITION_SCHEMA_VERSION_V1;
  readonly semantic: "derived-feature";
  readonly feature: "bilateral-policy-decision-change-juxtaposition";
  readonly productId: PolicyEventDecisionChangeV1["productId"];
  readonly evaluatedAt: string;
  readonly knowledgeCutoff: number;
  readonly basis: "explicitly-supplied-decisions";
  readonly coverage: "provided-history-only";
  /** Shared knowledge boundaries only; the two decision identities and dates stay independent. */
  readonly alignment: "shared-assessment-time-and-prior-cutoff";
  readonly focus: {
    readonly semantic: "request-metadata";
    readonly side: "left" | "right";
    readonly admittedTarget: PolicyEventDecisionChangeV1["priorSelection"]["target"];
  };
  readonly left: PolicyEventDecisionChangeV1;
  readonly right: PolicyEventDecisionChangeV1;
  /** Admitted context/change completeness only. */
  readonly availability: "available" | "partial" | "unavailable";
  readonly missingChangePaths: readonly ("left.change" | "right.change")[];
  readonly evidenceKnownAt: number | null;
}

/** INACTIVE: retain two supplied decision changes under shared explicit knowledge boundaries. */
export function buildBilateralPolicyDecisionChangeJuxtapositionV1(
  input: BuildBilateralPolicyDecisionChangeJuxtapositionInputV1,
): BilateralPolicyDecisionChangeJuxtapositionV1 {
  assertRoot(input);
  const readinessInput = input.readinessInput;
  const readiness = buildBilateralPolicyEventReadinessV1(readinessInput);
  const policyInput = readinessInput.policyInput;
  const knowledgeCutoff = input.knowledgeCutoff;
  if (!Number.isSafeInteger(knowledgeCutoff) || knowledgeCutoff < 0) {
    throw new TypeError("Expected nonnegative safe-integer knowledgeCutoff.");
  }
  if (knowledgeCutoff > Math.floor(parseEventInstantV1(readiness.evaluatedAt, "evaluatedAt") / 1_000)) {
    throw new RangeError("knowledgeCutoff cannot follow evaluatedAt.");
  }

  // Only trusted builders inspect histories, admit source evidence, select priors,
  // and compute changes. Neither raw history is read again after construction.
  const left = buildPolicyEventDecisionChangeV1({
    readinessInput: { policyInput, focusSide: "left" },
    knowledgeCutoff, history: input.leftHistory,
  });
  const right = buildPolicyEventDecisionChangeV1({
    readinessInput: { policyInput, focusSide: "right" },
    knowledgeCutoff, history: input.rightHistory,
  });
  const rightInstitution = ({ eurusd: "FOMC", eurjpy: "BoJ", eurgbp: "BoE", eurchf: "SNB" } as const)[readiness.productId];
  assertChildAgreement(readiness, left, "left", "ECB", knowledgeCutoff);
  assertChildAgreement(readiness, right, "right", rightInstitution, knowledgeCutoff);
  const focused = readiness.focus.side === "left" ? left : right;
  const admittedTarget = focused.priorSelection.target;
  requireAgreement(isDeepStrictEqual(readiness.focus.admittedCanonicalReference,
    admittedTarget?.canonicalReference ?? null) && readiness.focus.knownAt === (admittedTarget?.knownAt ?? null));

  const missingChangePaths: BilateralPolicyDecisionChangeJuxtapositionV1["missingChangePaths"][number][] = [];
  if (left.change.status === "unavailable") missingChangePaths.push("left.change");
  if (right.change.status === "unavailable") missingChangePaths.push("right.change");
  const admitted = [left, right].filter((child) => child.targetEvidence.status === "available");
  const availability = missingChangePaths.length === 0 ? "available"
    : admitted.length > 0 ? "partial" : "unavailable";
  const knowledge = admitted.map((child) => {
    if (child.evidenceKnownAt === null) throw new TypeError("Admitted target requires evidence knowledge.");
    return child.evidenceKnownAt;
  });
  return freezeCopy({
    schemaVersion: BILATERAL_POLICY_DECISION_CHANGE_JUXTAPOSITION_SCHEMA_VERSION_V1,
    semantic: "derived-feature", feature: "bilateral-policy-decision-change-juxtaposition",
    productId: readiness.productId, evaluatedAt: readiness.evaluatedAt, knowledgeCutoff,
    basis: "explicitly-supplied-decisions", coverage: "provided-history-only",
    alignment: "shared-assessment-time-and-prior-cutoff",
    focus: { semantic: "request-metadata", side: readiness.focus.side, admittedTarget },
    left, right, availability, missingChangePaths,
    evidenceKnownAt: knowledge.length === 0 ? null : Math.max(...knowledge),
  });
}

/** Agreement checks inspect rebuilt canonical evidence only, never caller policy facts. */
function assertChildAgreement(
  readiness: BilateralPolicyEventReadinessV1, child: PolicyEventDecisionChangeV1,
  side: "left" | "right", institution: PolicyEventPriorHistoryV1["institution"], cutoff: number,
): void {
  requireAgreement(child.productId === readiness.productId && child.evaluatedAt === readiness.evaluatedAt &&
    child.knowledgeCutoff === cutoff && child.focusSide === side && child.institution === institution);
  const context = side === "left" ? readiness.policyState.left : readiness.policyState.right;
  const target = child.targetEvidence;
  if (context.availability === "unavailable") {
    requireAgreement(target.status === "unavailable" && target.targetReason === context.reason &&
      target.upstreamReason === context.upstreamReason && child.priorSelection.target === null && child.evidenceKnownAt === null);
    return;
  }
  if (target.status !== "available") throw new TypeError("Independent canonical juxtaposition contexts disagree.");
  const data = context.data;
  requireAgreement(target.institution === institution && isDeepStrictEqual(target.data, {
    snapshot: data.snapshot, policySetting: data.policySetting, instrument: data.instrument,
    timing: data.timing, knownAt: data.knownAt,
  }));
  let reference: NonNullable<PolicyEventDecisionChangeV1["priorSelection"]["target"]>["canonicalReference"];
  let date: string;
  let dateKind: "meeting-date" | "decision-date" | "publication-date";
  if (side === "left") {
    const left = readiness.policyState.left;
    if (left.availability === "unavailable") throw new TypeError("Expected admitted ECB context.");
    reference = { kind: "ecb-event", canonicalEventId: left.data.snapshot.canonicalEventId,
      eventSourceVersionId: left.data.snapshot.eventSourceVersionId };
    date = left.data.snapshot.event.schedule.meetingDate;
    dateKind = "meeting-date";
  } else {
    const right = readiness.policyState.right;
    if (right.availability !== "available") throw new TypeError("Expected complete counterparty context.");
    reference = { kind: "policy-series", canonicalSeriesId: right.data.snapshot.canonicalSeriesId,
      sourceVersionId: right.data.snapshot.sourceVersionId };
    const fact = right.data.policySetting.data;
    date = "meetingEndDate" in fact ? fact.publicationDate : fact.decisionDate;
    dateKind = institution === "BoE" ? "publication-date" : "decision-date";
  }
  requireAgreement(isDeepStrictEqual(target.binding, {
    institution, selectionDateKind: dateKind, selectionDate: date,
    canonicalReference: reference, knownAt: data.knownAt,
  }) && isDeepStrictEqual(child.priorSelection.target, target.binding));
}

function requireAgreement(agrees: boolean): void {
  if (!agrees) throw new TypeError("Independent canonical juxtaposition contexts disagree.");
}

function assertRoot(value: unknown): void {
  const keys = ["readinessInput", "knowledgeCutoff", "leftHistory", "rightHistory"];
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed bilateral juxtaposition fields.");
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
