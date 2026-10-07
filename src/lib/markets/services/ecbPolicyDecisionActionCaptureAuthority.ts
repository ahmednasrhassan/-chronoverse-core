import "server-only";

import { parseEventInstantV1 } from "../events/eventClock";
import { EcbEventTransportError, loadEcbEventHtmlV1 } from "../providers/ecb/monetaryPolicy/acquisitionTransport";
import {
  captureKnownEcbDecisionDocumentHtmlV1,
  validateKnownEcbDecisionReferenceV1,
  type EcbDecisionDocumentCaptureResultV1,
  type EcbKnownMonetaryPolicyDecisionReferenceInputV1,
  type EcbMonetaryPolicyDocumentCaptureV1,
} from "../providers/ecb/monetaryPolicy/parser";
import {
  buildEcbPolicyDecisionActionEvidenceV1,
  reconstructEcbPolicyDecisionActionEvidenceV1,
  type EcbPolicyDecisionActionEvidenceV1,
} from "../providers/ecb/monetaryPolicy/policyDecisionActionEvidence";
import type { EcbPolicyFactsUnavailableV1 } from "../providers/ecb/monetaryPolicy/policyDecisionFacts";

declare const receiptBrand: unique symbol;
/** Process-local capability. Only private registry membership establishes origin. */
export interface EcbPolicyDecisionActionCaptureReceiptV1 {
  readonly [receiptBrand]: true;
}

export interface AcquireEcbPolicyDecisionActionCaptureInputV1 {
  readonly reference: EcbKnownMonetaryPolicyDecisionReferenceInputV1;
  readonly signal: AbortSignal;
}

export interface ReadEcbPolicyDecisionActionCaptureInputV1 {
  readonly receipt: EcbPolicyDecisionActionCaptureReceiptV1;
  readonly evaluatedAt: string;
}

export type EcbPolicyDecisionActionCaptureResultV1 =
  | { readonly status: "acquired"; readonly receipt: EcbPolicyDecisionActionCaptureReceiptV1 }
  | Exclude<EcbDecisionDocumentCaptureResultV1, { readonly status: "available" }>
  | EcbPolicyFactsUnavailableV1;

export type EcbPolicyDecisionActionCaptureReadResultV1 =
  | { readonly status: "available"; readonly evidence: EcbPolicyDecisionActionEvidenceV1 }
  | { readonly status: "not-known-as-of" };

export interface EcbPolicyDecisionActionCaptureAuthorityV1 {
  readonly acquire: (input: AcquireEcbPolicyDecisionActionCaptureInputV1) => Promise<EcbPolicyDecisionActionCaptureResultV1>;
  readonly readAsKnownAt: (input: ReadEcbPolicyDecisionActionCaptureInputV1) => EcbPolicyDecisionActionCaptureReadResultV1;
}

export interface EcbPolicyDecisionActionCaptureDependenciesV1 {
  /** Infrastructure configuration only; never an acquisition-request field. */
  readonly fetchImpl?: typeof fetch;
  readonly nowUnixSeconds: () => number;
}

interface RetainedCapture {
  readonly html: string;
  readonly capture: EcbMonetaryPolicyDocumentCaptureV1;
  readonly evidence: EcbPolicyDecisionActionEvidenceV1;
}

/** Each configured infrastructure owner has its own registry; it cannot mint another owner's receipts. */
export function createEcbPolicyDecisionActionCaptureAuthorityV1(
  dependencies: EcbPolicyDecisionActionCaptureDependenciesV1,
): EcbPolicyDecisionActionCaptureAuthorityV1 {
  assertRecord(dependencies);
  assertKeys(dependencies, Object.hasOwn(dependencies, "fetchImpl") ? ["fetchImpl", "nowUnixSeconds"] : ["nowUnixSeconds"]);
  // Retain the configured functions, not the caller-owned dependency object.
  const { fetchImpl, nowUnixSeconds } = dependencies;
  if (typeof nowUnixSeconds !== "function" || (fetchImpl !== undefined && typeof fetchImpl !== "function")) {
    throw new TypeError("Expected ECB capture infrastructure dependencies.");
  }
  const retainedByReceipt = new WeakMap<object, RetainedCapture>();

  async function acquire(input: AcquireEcbPolicyDecisionActionCaptureInputV1): Promise<EcbPolicyDecisionActionCaptureResultV1> {
    assertKeys(input, ["reference", "signal"]);
    const requestedReference = input.reference;
    assertKeys(requestedReference, ["sourceInstitution", "decisionDate", "documentUrl"]);
    const signal = input.signal;
    if (!(signal instanceof AbortSignal)) throw new TypeError("Expected explicit ECB capture cancellation signal.");
    const validated = validateKnownEcbDecisionReferenceV1(requestedReference);
    if (validated.status !== "available") return freezeCopy(validated);
    // Validation detaches the reference before the asynchronous source read.
    const reference = validated.reference;
    const html = await loadEcbEventHtmlV1(reference.documentUrl, {
      signal, ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
    assertNotAborted(signal);
    // The bounded transport has successfully consumed and decoded the complete body.
    const fetchedAt = nowUnixSeconds();
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new TypeError("Invalid authoritative ECB capture time.");
    assertNotAborted(signal);
    const captured = captureKnownEcbDecisionDocumentHtmlV1(html, reference, fetchedAt);
    if (captured.status !== "available") return freezeCopy(captured);
    const built = buildEcbPolicyDecisionActionEvidenceV1({ html, capture: captured.data });
    if (built.status !== "available") return freezeCopy(built);
    const evidence = reconstructEcbPolicyDecisionActionEvidenceV1({ html, capture: captured.data, evidence: built.evidence });
    assertNotAborted(signal);
    const receipt = Object.freeze(Object.create(null)) as EcbPolicyDecisionActionCaptureReceiptV1;
    retainedByReceipt.set(receipt, Object.freeze({ html, capture: captured.data, evidence }));
    return Object.freeze({ status: "acquired", receipt });
  }

  function readAsKnownAt(input: ReadEcbPolicyDecisionActionCaptureInputV1): EcbPolicyDecisionActionCaptureReadResultV1 {
    assertRecord(input);
    const receipt = input.receipt;
    const retained = typeof receipt === "object" && receipt !== null ? retainedByReceipt.get(receipt) : undefined;
    // Never inspect receipt fields or assessment getters before establishing membership.
    if (retained === undefined) throw new TypeError("Unrecognized ECB action capture receipt.");
    assertKeys(input, ["receipt", "evaluatedAt"]);
    const evaluatedAt = input.evaluatedAt;
    if (typeof evaluatedAt !== "string") throw new TypeError("Expected explicit evaluatedAt.");
    const evaluatedMs = parseEventInstantV1(evaluatedAt, "evaluatedAt");
    if (evaluatedMs < 0) throw new RangeError("evaluatedAt must be nonnegative.");
    if (retained.evidence.knownAt > Math.floor(evaluatedMs / 1_000)) {
      return Object.freeze({ status: "not-known-as-of" });
    }
    return freezeCopy({ status: "available", evidence: retained.evidence });
  }

  return Object.freeze({ acquire, readAsKnownAt });
}

// INACTIVE: constructing the private owner performs no source read or clock sampling.
const productionAuthority = createEcbPolicyDecisionActionCaptureAuthorityV1({
  nowUnixSeconds: () => Math.floor(Date.now() / 1_000),
});

export function acquireEcbPolicyDecisionActionCaptureV1(
  input: AcquireEcbPolicyDecisionActionCaptureInputV1,
): Promise<EcbPolicyDecisionActionCaptureResultV1> {
  return productionAuthority.acquire(input);
}

/** Pure synchronous read of a production-issued capability; no acquisition or current clock. */
export function readEcbPolicyDecisionActionCaptureAsKnownAtV1(
  input: ReadEcbPolicyDecisionActionCaptureInputV1,
): EcbPolicyDecisionActionCaptureReadResultV1 {
  return productionAuthority.readAsKnownAt(input);
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Expected ECB capture authority object.");
}

function assertKeys(value: unknown, keys: readonly string[]): void {
  assertRecord(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed ECB capture authority input.");
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new EcbEventTransportError("aborted");
}

function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(value: unknown): void {
    if (typeof value !== "object" || value === null) return;
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  freeze(copy);
  return copy;
}
