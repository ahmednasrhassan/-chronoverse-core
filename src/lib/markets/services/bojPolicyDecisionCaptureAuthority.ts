import "server-only";

import { createHash } from "node:crypto";
import { parseEventInstantV1 } from "../events/eventClock";
import {
  assertBojPolicyServerV1,
  bojPolicyDocumentUrlV1,
  BojPolicyTransportError,
  loadBojPolicyDocumentV1,
} from "../providers/boj/transport";
import { normalizeBojPolicyFactV1, parseBojPolicyDocumentV1 } from "../providers/boj/facts";
import {
  buildBojPolicyEvidenceV1,
  buildBojPolicySourceVersionIdV1,
  getBojPolicySpecV1,
  type BojPolicyEvidenceV1,
} from "../providers/boj/canonical";

declare const receiptBrand: unique symbol;
/** Process-local capability. Exact private registry membership establishes origin. */
export interface BojPolicyDecisionCaptureReceiptV1 {
  readonly [receiptBrand]: true;
}

export interface AcquireBojPolicyDecisionCaptureInputV1 {
  readonly decisionDate: string;
  readonly signal: AbortSignal;
}

export interface ReadBojPolicyDecisionCaptureInputV1 {
  readonly receipt: BojPolicyDecisionCaptureReceiptV1;
  readonly evaluatedAt: string;
}

/** Trusted selected-fact context; complete decoded source text stays private. */
export interface BojPolicyDecisionCaptureV1 {
  readonly knownAt: number;
  readonly evidence: BojPolicyEvidenceV1;
  /** SHA-256 of retained decoded HTML encoded as UTF-8, not original wire bytes. */
  readonly decodedSourceDigest: string;
}

export type BojPolicyDecisionCaptureReadResultV1 =
  | { readonly status: "available"; readonly capture: BojPolicyDecisionCaptureV1 }
  | { readonly status: "not-known-as-of" };

export interface BojPolicyDecisionCaptureAuthorityV1 {
  readonly acquire: (input: AcquireBojPolicyDecisionCaptureInputV1) => Promise<{
    readonly status: "acquired"; readonly receipt: BojPolicyDecisionCaptureReceiptV1;
  }>;
  readonly readAsKnownAt: (input: ReadBojPolicyDecisionCaptureInputV1) => BojPolicyDecisionCaptureReadResultV1;
}

export interface BojPolicyDecisionCaptureDependenciesV1 {
  /** Non-production factory configuration only; never acquisition-request fields. */
  readonly fetchImpl: typeof fetch;
  readonly nowUnixSeconds: () => number;
}

interface RetainedCapture {
  readonly html: string;
  readonly capture: BojPolicyDecisionCaptureV1;
}

/** Isolated infrastructure/test owner. Its receipts cannot authorize production reads. */
export function createBojPolicyDecisionCaptureAuthorityV1(
  dependencies: BojPolicyDecisionCaptureDependenciesV1,
): BojPolicyDecisionCaptureAuthorityV1 {
  assertBojPolicyServerV1();
  assertKeys(dependencies, ["fetchImpl", "nowUnixSeconds"]);
  // Retain configured functions rather than the mutable configuration object.
  const { fetchImpl, nowUnixSeconds } = dependencies;
  if (typeof fetchImpl !== "function" || typeof nowUnixSeconds !== "function") {
    throw new TypeError("Expected BoJ capture infrastructure dependencies.");
  }
  const retainedByReceipt = new WeakMap<object, RetainedCapture>();

  async function acquire(input: AcquireBojPolicyDecisionCaptureInputV1) {
    assertBojPolicyServerV1();
    assertKeys(input, ["decisionDate", "signal"]);
    // Read caller fields once, before any asynchronous work.
    const { decisionDate, signal } = input;
    if (!(signal instanceof AbortSignal)) throw new TypeError("Expected explicit BoJ capture cancellation signal.");
    getBojPolicySpecV1(decisionDate);
    assertNotAborted(signal);
    const document = await loadBojPolicyDocumentV1(bojPolicyDocumentUrlV1(decisionDate), { fetchImpl, signal });
    assertNotAborted(signal);
    const fact = normalizeBojPolicyFactV1(parseBojPolicyDocumentV1(document, decisionDate));
    const sourceVersionId = buildBojPolicySourceVersionIdV1(decisionDate, fact);
    const decodedSourceDigest = `sha256:${createHash("sha256").update(document.html, "utf8").digest("hex")}`;
    assertNotAborted(signal);
    // Complete bounded acquisition, decoding, parsing and canonical identity precede the clock.
    const fetchedAt = nowUnixSeconds();
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) throw new TypeError("Invalid authoritative BoJ capture time.");
    assertNotAborted(signal);
    // Reuse the existing time/provenance contract, including explicit release-time bounds.
    const evidence = buildBojPolicyEvidenceV1(fact, fetchedAt);
    if (evidence.metadata.sourceVersionId !== sourceVersionId) throw new TypeError("BoJ capture canonical identity disagrees.");
    const capture = Object.freeze({ knownAt: fetchedAt, evidence, decodedSourceDigest });
    assertNotAborted(signal);
    const receipt = Object.freeze(Object.create(null)) as BojPolicyDecisionCaptureReceiptV1;
    retainedByReceipt.set(receipt, Object.freeze({ html: document.html, capture }));
    return Object.freeze({ status: "acquired" as const, receipt });
  }

  function readAsKnownAt(input: ReadBojPolicyDecisionCaptureInputV1): BojPolicyDecisionCaptureReadResultV1 {
    assertBojPolicyServerV1();
    assertRecord(input);
    const receipt = input.receipt;
    const retained = typeof receipt === "object" && receipt !== null ? retainedByReceipt.get(receipt) : undefined;
    // Do not inspect receipt fields or assessment getters before establishing membership.
    if (retained === undefined) throw new TypeError("Unrecognized BoJ decision capture receipt.");
    assertKeys(input, ["receipt", "evaluatedAt"]);
    const evaluatedAt = input.evaluatedAt;
    if (typeof evaluatedAt !== "string") throw new TypeError("Expected explicit evaluatedAt.");
    const evaluatedMs = parseEventInstantV1(evaluatedAt, "evaluatedAt");
    if (evaluatedMs < 0) throw new RangeError("evaluatedAt must be nonnegative.");
    if (retained.capture.knownAt > Math.floor(evaluatedMs / 1_000)) {
      return Object.freeze({ status: "not-known-as-of" });
    }
    return freezeCopy({ status: "available", capture: retained.capture });
  }

  return Object.freeze({ acquire, readAsKnownAt });
}

// INACTIVE: configuration performs no acquisition, clock sampling or environment reads.
const productionAuthority = createBojPolicyDecisionCaptureAuthorityV1({
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  nowUnixSeconds: () => Math.floor(Date.now() / 1_000),
});

export function acquireBojPolicyDecisionCaptureV1(input: AcquireBojPolicyDecisionCaptureInputV1) {
  return productionAuthority.acquire(input);
}

/** Pure assessment of production-issued capability; no acquisition or current clock. */
export function readBojPolicyDecisionCaptureAsKnownAtV1(
  input: ReadBojPolicyDecisionCaptureInputV1,
): BojPolicyDecisionCaptureReadResultV1 {
  return productionAuthority.readAsKnownAt(input);
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Expected BoJ capture object.");
}

function assertKeys(value: unknown, keys: readonly string[]): void {
  assertRecord(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed BoJ capture input.");
  }
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new BojPolicyTransportError("aborted");
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
