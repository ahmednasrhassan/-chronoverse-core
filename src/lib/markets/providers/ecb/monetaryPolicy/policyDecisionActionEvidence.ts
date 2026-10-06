import "server-only";

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { EcbMonetaryPolicyDocumentCaptureV1 } from "./parser";
import {
  extractEcbPolicyDecisionSourceFactsV1,
  type EcbPolicyFactsUnavailableV1,
  type EcbPolicySourceActionV1,
} from "./policyDecisionFacts";

export const ECB_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1 = "ecb-policy-decision-action-evidence-v1" as const;
export const ECB_POLICY_DECISION_ACTION_PARSER_VERSION_V1 = "ecb-policy-decision-source-action-parser-v1" as const;

/** Separate canonical child: no additions to ECB V1 events, snapshots or persistence. */
export interface EcbPolicyDecisionActionEvidenceV1 {
  readonly schemaVersion: typeof ECB_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1;
  readonly parserVersion: typeof ECB_POLICY_DECISION_ACTION_PARSER_VERSION_V1;
  readonly semantic: "source-fact";
  readonly provider: "ecb";
  /** One shared action for DFR, MRO and MLF only; no other policy instruments. */
  readonly scope: "three-key-ecb-interest-rates";
  readonly action: EcbPolicySourceActionV1;
  /** Unix seconds of the verified document capture, never a publication timestamp. */
  readonly knownAt: number;
  readonly sourceVersionId: string;
  /** Complete capture identity, including official decision date/URL and both digests. */
  readonly capture: EcbMonetaryPolicyDocumentCaptureV1;
}

export interface BuildEcbPolicyDecisionActionEvidenceInputV1 {
  readonly html: string;
  readonly capture: EcbMonetaryPolicyDocumentCaptureV1;
}

export type EcbPolicyDecisionActionEvidenceResultV1 =
  | { readonly status: "available"; readonly evidence: EcbPolicyDecisionActionEvidenceV1 }
  | EcbPolicyFactsUnavailableV1;

/** INACTIVE: re-establish the source verb from exact captured bytes, without acquisition or storage. */
export function buildEcbPolicyDecisionActionEvidenceV1(
  input: BuildEcbPolicyDecisionActionEvidenceInputV1,
): EcbPolicyDecisionActionEvidenceResultV1 {
  assertKeys(input, ["html", "capture"]);
  validateSourceInput(input);
  const source = structuredClone(input);
  const extracted = extractEcbPolicyDecisionSourceFactsV1(source.html, source.capture);
  if (extracted.status !== "available") return freezeCopy(extracted);
  const identity = ECB_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1;
  const parserVersion = ECB_POLICY_DECISION_ACTION_PARSER_VERSION_V1;
  const scope = "three-key-ecb-interest-rates" as const;
  // Capture times and raw response identity do not change visible-source semantics.
  const sourceVersionId = `${identity}:sha256:${createHash("sha256").update(JSON.stringify([
    identity, parserVersion, "ecb", scope, extracted.action,
    extracted.capture.reference.sourceInstitution, extracted.capture.reference.decisionDate,
    extracted.capture.reference.documentUrl, extracted.capture.semanticContentDigest,
  ]), "utf8").digest("hex")}`;
  return freezeCopy({ status: "available", evidence: {
    schemaVersion: identity, parserVersion, semantic: "source-fact", provider: "ecb", scope,
    action: extracted.action, knownAt: extracted.capture.fetchedAt, sourceVersionId, capture: extracted.capture,
  } });
}

/** A supplied child is trusted only after its action and complete identity are rebuilt from source bytes. */
export function reconstructEcbPolicyDecisionActionEvidenceV1(input: BuildEcbPolicyDecisionActionEvidenceInputV1 & {
  readonly evidence: EcbPolicyDecisionActionEvidenceV1;
}): EcbPolicyDecisionActionEvidenceV1 {
  assertKeys(input, ["html", "capture", "evidence"]);
  validateSourceInput(input);
  const supplied = input.evidence;
  assertKeys(supplied, ["schemaVersion", "parserVersion", "semantic", "provider", "scope", "action", "knownAt", "sourceVersionId", "capture"]);
  validateCapture(supplied.capture);
  const rebuilt = buildEcbPolicyDecisionActionEvidenceV1({ html: input.html, capture: input.capture });
  if (rebuilt.status !== "available" || !isDeepStrictEqual(supplied, rebuilt.evidence)) {
    throw new TypeError("ECB action evidence disagrees with canonical source reconstruction.");
  }
  return rebuilt.evidence;
}

function validateSourceInput(input: BuildEcbPolicyDecisionActionEvidenceInputV1): void {
  if (typeof input.html !== "string") throw new TypeError("Expected captured ECB decision HTML.");
  validateCapture(input.capture);
}

function validateCapture(capture: EcbMonetaryPolicyDocumentCaptureV1): void {
  assertKeys(capture, ["reference", "fetchedAt", "rawCaptureDigest", "semanticContentDigest"]);
  assertKeys(capture.reference, ["sourceInstitution", "decisionDate", "documentUrl"]);
  if (!Number.isSafeInteger(capture.fetchedAt) || capture.fetchedAt < 0 ||
      typeof capture.rawCaptureDigest !== "string" || !/^[a-f\d]{64}$/.test(capture.rawCaptureDigest) ||
      typeof capture.semanticContentDigest !== "string" || !/^[a-f\d]{64}$/.test(capture.semanticContentDigest)) {
    throw new TypeError("Invalid ECB action document capture.");
  }
  // Existing source reopening validates official host/path/date and both content digests.
}

function assertKeys(value: unknown, keys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed ECB action evidence object.");
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
