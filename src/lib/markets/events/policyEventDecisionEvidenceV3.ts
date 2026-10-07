import "server-only";

import { isDeepStrictEqual } from "node:util";
import {
  buildPolicyEventDecisionEvidenceV2,
  type BuildPolicyEventDecisionEvidenceInputV2,
  type PolicyEventDecisionEvidenceV2,
} from "./policyEventDecisionEvidenceV2";
import type { EcbPolicyDecisionActionCaptureReceiptV1 } from "../services/ecbPolicyDecisionActionCaptureAuthority";
import {
  readBojPolicyDecisionActionCaptureAsKnownAtV1,
  type BojPolicyDecisionCaptureReceiptV1,
} from "../services/bojPolicyDecisionCaptureAuthority";
import {
  BOJ_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1,
  BOJ_POLICY_DECISION_ACTION_PARSER_VERSION_V1,
  type BojPolicyDecisionActionEvidenceV1,
} from "../providers/boj/policyDecisionActionEvidence";
import type { InputUnavailableReason } from "./bilateralPolicyState";

export const POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3 = "policy-event-decision-evidence-v3" as const;

type EcbInput = Extract<BuildPolicyEventDecisionEvidenceInputV2, { provider: "ecb" }>;
type BojInput = Extract<BuildPolicyEventDecisionEvidenceInputV2, { provider: "boj" }>;
type BojView = Extract<PolicyEventDecisionEvidenceV2, { provider: "boj" }>;

/** Provider-specific production capabilities; null explicitly represents missing action capture. */
export type BuildPolicyEventDecisionEvidenceInputV3 =
  | Exclude<BuildPolicyEventDecisionEvidenceInputV2, { provider: "ecb" | "boj" }>
  | (Omit<EcbInput, "sourceActionReceipt"> & {
      readonly ecbSourceActionReceipt: EcbPolicyDecisionActionCaptureReceiptV1 | null;
    })
  | (BojInput & { readonly bojSourceActionReceipt: BojPolicyDecisionCaptureReceiptV1 | null });

type UnavailableAction = { readonly availability: "unavailable";
  readonly reason: InputUnavailableReason | "KNOWLEDGE_INCONSISTENT"; readonly upstreamReason: null };
type ActionBranch<T> = { readonly availability: "available"; readonly data: T } | UnavailableAction;
type Versioned<V> = V extends PolicyEventDecisionEvidenceV2
  ? Omit<V, "schemaVersion"> & { readonly schemaVersion: typeof POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3 }
  : never;

/** Provider discrimination preserves each native vocabulary; no common direction taxonomy. */
export type PolicyEventDecisionEvidenceV3 =
  | Versioned<Exclude<PolicyEventDecisionEvidenceV2, { provider: "boj" }>>
  | (Omit<BojView, "schemaVersion" | "sourceAction"> & {
      readonly schemaVersion: typeof POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3;
      readonly sourceAction: ActionBranch<BojPolicyDecisionActionEvidenceV1["action"]>;
      readonly sourceActionEvidence: ActionBranch<BojPolicyDecisionActionEvidenceV1>;
    });

/** INACTIVE: compose admitted evidence and production receipts without acquisition or inference. */
export function buildPolicyEventDecisionEvidenceV3(
  input: BuildPolicyEventDecisionEvidenceInputV3,
): PolicyEventDecisionEvidenceV3 {
  assertRecord(input);
  const provider = input.provider;
  if (provider === "ecb") {
    // Validate the original root before projection can erase hidden/symbol fields.
    assertKeys(input, ["productId", "provider", "evaluatedAt", "expectedEcbCanonicalEventId", "evidence", "ecbSourceActionReceipt"]);
    const { productId, evaluatedAt, expectedEcbCanonicalEventId, evidence, ecbSourceActionReceipt } = input;
    const base = buildPolicyEventDecisionEvidenceV2({ productId, provider, evaluatedAt,
      expectedEcbCanonicalEventId, evidence, sourceActionReceipt: ecbSourceActionReceipt });
    if (base.provider !== "ecb") throw new TypeError("Expected delegated ECB evidence.");
    return freezeCopy({ ...base, schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3 });
  }
  if (provider !== "boj") {
    // Delegate the original root and envelopes, including all own properties.
    const base = buildPolicyEventDecisionEvidenceV2(input);
    if (base.provider === "boj") throw new TypeError("Expected non-BoJ evidence.");
    return freezeCopy({ ...base, schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3 });
  }
  assertKeys(input, ["productId", "provider", "evaluatedAt", "decisionDate", "evidence", "bojSourceActionReceipt"]);
  const { productId, evaluatedAt, decisionDate, evidence, bojSourceActionReceipt } = input;
  // Preserve original nested inputs for V2/V1 reconstruction and independent time admission.
  const base = buildPolicyEventDecisionEvidenceV2({ productId, provider, evaluatedAt, decisionDate, evidence });
  if (base.provider !== "boj") throw new TypeError("Expected delegated BoJ evidence.");
  function unavailable(reason: UnavailableAction["reason"]): PolicyEventDecisionEvidenceV3 {
    const rejected: UnavailableAction = { availability: "unavailable", reason, upstreamReason: null };
    return freezeCopy({ ...base, schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3,
      sourceAction: rejected, sourceActionEvidence: rejected });
  }
  if (bojSourceActionReceipt === null) return unavailable("NO_CAPTURED_EVIDENCE");
  // Establish production membership even when base context is missing or future.
  const action = readBojPolicyDecisionActionCaptureAsKnownAtV1({ receipt: bojSourceActionReceipt, evaluatedAt: base.evaluatedAt });
  if (action.status === "not-known-as-of") return unavailable("KNOWLEDGE_INCONSISTENT");
  const child = action.evidence;
  if (child.decisionDate !== decisionDate) throw new TypeError("Trusted BoJ action does not match the requested decision.");
  if (base.auditEvidence.availability !== "available") return unavailable("CAPTURE_COVERAGE_UNKNOWN");
  const snapshot = base.auditEvidence.data;
  const selected = snapshot.evidence;
  const captured = child.capture.evidence;
  if (child.provider !== provider || child.productId !== productId || child.institution !== "Bank of Japan" ||
      child.scope !== "uncollateralized-overnight-call-rate-guideline" || child.action !== "set-guideline" ||
      child.schemaVersion !== BOJ_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1 ||
      child.parserVersion !== BOJ_POLICY_DECISION_ACTION_PARSER_VERSION_V1 ||
      child.decisionDate !== selected.fact.decisionDate || child.decisionDate !== captured.fact.decisionDate ||
      child.documentKind !== selected.fact.documentKind || child.sourceUrl !== selected.fact.sourceUrl ||
      !isDeepStrictEqual(selected.fact, captured.fact) ||
      selected.metadata.provider !== captured.metadata.provider ||
      selected.metadata.originalPublisher !== captured.metadata.originalPublisher ||
      selected.metadata.sourceUrl !== captured.metadata.sourceUrl ||
      selected.metadata.canonicalSeriesId !== captured.metadata.canonicalSeriesId ||
      selected.metadata.sourceSeriesId !== captured.metadata.sourceSeriesId ||
      selected.metadata.sourceVersionId !== captured.metadata.sourceVersionId ||
      snapshot.canonicalSeriesId !== captured.metadata.canonicalSeriesId ||
      snapshot.sourceVersionId !== captured.metadata.sourceVersionId) {
    throw new TypeError("Trusted BoJ action does not match the admitted selected fact and source identity.");
  }
  if (base.evidenceKnownAt === null) throw new TypeError("Expected admitted BoJ evidence knowledge time.");
  // Selected-fact identity is shared; complete document revision and acquisition-time
  // equality are not established by legacy evidence. Never attest or rewrite its knownAt.
  return freezeCopy({ ...base, schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3,
    sourceAction: { availability: "available", data: child.action },
    sourceActionEvidence: { availability: "available", data: child },
    evidenceKnownAt: Math.max(base.evidenceKnownAt, child.knownAt) });
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Expected V3 policy evidence object.");
}
function assertKeys(value: unknown, keys: readonly string[]): void {
  assertRecord(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed V3 policy event evidence input.");
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
