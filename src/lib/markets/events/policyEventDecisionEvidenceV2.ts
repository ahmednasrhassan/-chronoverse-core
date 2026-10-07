import "server-only";

import {
  buildPolicyEventDecisionEvidenceV1,
  type BuildPolicyEventDecisionEvidenceInputV1,
  type PolicyEventDecisionEvidenceV1,
} from "./policyEventDecisionEvidence";
import {
  readEcbPolicyDecisionActionCaptureAsKnownAtV1,
  type EcbPolicyDecisionActionCaptureReceiptV1,
} from "../services/ecbPolicyDecisionActionCaptureAuthority";
import {
  ECB_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1,
  ECB_POLICY_DECISION_ACTION_PARSER_VERSION_V1,
  type EcbPolicyDecisionActionEvidenceV1,
} from "../providers/ecb/monetaryPolicy/policyDecisionActionEvidence";
import type { InputUnavailableReason } from "./bilateralPolicyState";

export const POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2 = "policy-event-decision-evidence-v2" as const;

type EcbInput = Extract<BuildPolicyEventDecisionEvidenceInputV1, { provider: "ecb" }>;
type EcbView = Extract<PolicyEventDecisionEvidenceV1, { provider: "ecb" }>;

/** ECB accepts only a production-issued capability; null means no captured action. */
export type BuildPolicyEventDecisionEvidenceInputV2 =
  | Exclude<BuildPolicyEventDecisionEvidenceInputV1, { provider: "ecb" }>
  | (EcbInput & { readonly sourceActionReceipt: EcbPolicyDecisionActionCaptureReceiptV1 | null });

type UnavailableAction = {
  readonly availability: "unavailable";
  readonly reason: InputUnavailableReason | "KNOWLEDGE_INCONSISTENT";
  readonly upstreamReason: null;
};
type ActionBranch<T> = { readonly availability: "available"; readonly data: T } | UnavailableAction;
type Versioned<V> = V extends PolicyEventDecisionEvidenceV1
  ? Omit<V, "schemaVersion"> & { readonly schemaVersion: typeof POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2 }
  : never;

/** Single-event source evidence. Native action provenance is an ECB-only branch. */
export type PolicyEventDecisionEvidenceV2 =
  | Versioned<Exclude<PolicyEventDecisionEvidenceV1, { provider: "ecb" }>>
  | (Omit<EcbView, "schemaVersion" | "sourceAction"> & {
      readonly schemaVersion: typeof POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2;
      readonly sourceAction: ActionBranch<EcbPolicyDecisionActionEvidenceV1["action"]>;
      readonly sourceActionEvidence: ActionBranch<EcbPolicyDecisionActionEvidenceV1>;
    });

/** INACTIVE: consume existing evidence and receipts; never acquire or infer source action. */
export function buildPolicyEventDecisionEvidenceV2(
  input: BuildPolicyEventDecisionEvidenceInputV2,
): PolicyEventDecisionEvidenceV2 {
  assertRecord(input);
  if (input.provider !== "ecb") {
    // Pass the original object to V1, including hidden/symbol fields and envelopes.
    const base = buildPolicyEventDecisionEvidenceV1(input);
    if (base.provider === "ecb") throw new TypeError("Expected non-ECB provider evidence.");
    return freezeCopy({ ...base,
      schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2 });
  }
  assertKeys(input, ["productId", "provider", "evaluatedAt", "expectedEcbCanonicalEventId", "evidence", "sourceActionReceipt"]);
  const { productId, evaluatedAt, expectedEcbCanonicalEventId, evidence, sourceActionReceipt } = input;
  // V1 reconstructs the original evidence envelope and owns all event/rate admission.
  const base = buildPolicyEventDecisionEvidenceV1({
    productId, provider: "ecb", evaluatedAt, expectedEcbCanonicalEventId, evidence,
  });
  if (base.provider !== "ecb") throw new TypeError("Expected reconstructed ECB event context.");

  function unavailable(reason: UnavailableAction["reason"]): PolicyEventDecisionEvidenceV2 {
    const rejected: UnavailableAction = { availability: "unavailable", reason, upstreamReason: null };
    return freezeCopy({ ...base, schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2,
      sourceAction: rejected, sourceActionEvidence: rejected });
  }
  if (sourceActionReceipt === null) return unavailable("NO_CAPTURED_EVIDENCE");
  // Verify origin even when event context is unavailable. Forgery must never become absence.
  const action = readEcbPolicyDecisionActionCaptureAsKnownAtV1({ receipt: sourceActionReceipt, evaluatedAt: base.evaluatedAt });
  if (action.status === "not-known-as-of") return unavailable("KNOWLEDGE_INCONSISTENT");
  if (base.auditEvidence.availability !== "available" || base.auditEvidence.data.event.decision === null) {
    // A receipt has no canonical schedule anchor. Future or missing context cannot supply one.
    return unavailable("CAPTURE_COVERAGE_UNKNOWN");
  }
  const event = base.auditEvidence.data.event;
  const decision = event.decision;
  if (decision === null) throw new TypeError("Expected admitted ECB decision context.");
  const child = action.evidence;
  const reference = child.capture.reference;
  if (event.canonicalEventId !== expectedEcbCanonicalEventId ||
      event.sourceInstitution !== "ECB" || decision.sourceInstitution !== reference.sourceInstitution ||
      reference.sourceInstitution !== "ECB" || child.provider !== "ecb" ||
      child.scope !== "three-key-ecb-interest-rates" ||
      child.schemaVersion !== ECB_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1 ||
      child.parserVersion !== ECB_POLICY_DECISION_ACTION_PARSER_VERSION_V1 ||
      decision.decisionDate !== reference.decisionDate || event.schedule.meetingDate !== reference.decisionDate ||
      decision.documentUrl !== reference.documentUrl || decision.contentDigest !== child.capture.semanticContentDigest) {
    throw new TypeError("Trusted ECB action does not match the requested canonical event context.");
  }
  // Sibling semantic versions and capture times are independent; never force equality.
  return freezeCopy({ ...base, schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2,
    sourceAction: { availability: "available", data: child.action },
    sourceActionEvidence: { availability: "available", data: child },
    evidenceKnownAt: Math.max(base.auditEvidence.data.knownAt, child.knownAt) });
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Expected V2 policy evidence object.");
}
function assertKeys(value: unknown, keys: readonly string[]): void {
  assertRecord(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed V2 policy event evidence input.");
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
