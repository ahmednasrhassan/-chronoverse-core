import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";
import {
  buildAvailabilityBoundV1, compareAvailabilityAsOfV1, comparePublicationCivilDateV1,
  createAcquisitionCompletionV1, createClockAccuracyV1, createEvaluationInstantV1,
  createEvidenceAvailabilityV1, createHistoricalCutoffV1, createLegacyAcquisitionBucketV1,
  createPublicationCivilDateConstraintV1,
  type AcquisitionCompletionV1, type ClockAccuracyV1, type EvidenceAvailabilityV1,
  type LegacyAcquisitionBucketV1, type PublicationCivilDateConstraintV1,
  type TemporalComparisonV1, type TemporalInstantInputV1,
} from "../events/temporalTrust";
import {
  assertBojPolicyServerV1, bojPolicyDocumentUrlV1, BojPolicyTransportError,
  loadBojPolicyDocumentV1,
} from "../providers/boj/transport";
import { normalizeBojPolicyFactV1, parseBojPolicyDocumentV1 } from "../providers/boj/facts";
import { buildBojPolicyEvidenceV1, buildBojPolicySourceVersionIdV1 } from "../providers/boj/canonical";
import { prepareBojPolicyDecisionActionEvidenceV1,
  type BojPolicyDecisionActionEvidenceV1 } from "../providers/boj/policyDecisionActionEvidence";
import type { BojPolicyDecisionCaptureV1 } from "./bojPolicyDecisionCaptureAuthority";

export const BOJ_POLICY_DECISION_CAPTURE_SCHEMA_VERSION_V2 = "boj-policy-decision-capture-v2" as const;
declare const receiptBrandV2: unique symbol;
/** Exact private owner membership only; copies and descriptions cannot be adopted. */
export interface BojPolicyDecisionCaptureReceiptV2 { readonly [receiptBrandV2]: true }
export interface AcquireBojPolicyDecisionCaptureInputV2 {
  readonly decisionDate: "2024-04-26" | "2024-06-14";
  readonly signal: AbortSignal;
}
export interface ReadBojPolicyDecisionCaptureInputV2 {
  readonly receipt: BojPolicyDecisionCaptureReceiptV2;
  readonly evaluatedAt: TemporalInstantInputV1;
  readonly knowledgeCutoff: TemporalInstantInputV1;
}
/** Acquisition description only: no historical admission or transferable capability. */
export interface BojPolicyDecisionCaptureV2 {
  readonly schemaVersion: typeof BOJ_POLICY_DECISION_CAPTURE_SCHEMA_VERSION_V2;
  readonly semantic: "qualified-acquisition-description";
  readonly acquisitionCompletion: AcquisitionCompletionV1;
  /** In-memory exposure commit; not a persistence acknowledgment or a publication instant. */
  readonly evidenceAvailability: EvidenceAvailabilityV1;
  readonly clock: {
    readonly basis: "owner-wall-clock-samples";
    readonly accuracy: ClockAccuracyV1;
    readonly historicalPossession: "not-certified";
  };
  readonly publication: {
    readonly policy: "unqualified-timezone-fail-closed";
    readonly constraint: PublicationCivilDateConstraintV1;
    readonly releaseInstant: "unavailable";
  };
  /** Existing source/action schemas keep seconds. This explicit bucket is never
   * promoted to exact milliseconds, nor used to admit a V2 historical read. */
  readonly legacy: {
    readonly completionBucket: LegacyAcquisitionBucketV1;
    readonly capture: BojPolicyDecisionCaptureV1;
    readonly actionEvidence: BojPolicyDecisionActionEvidenceV1;
  };
}
export interface BojPolicyDecisionCaptureAcquiredV2 {
  readonly status: "acquired";
  readonly receipt: BojPolicyDecisionCaptureReceiptV2;
  readonly capture: BojPolicyDecisionCaptureV2;
}
/** No available branch until an independently qualified owner accuracy bound and
 * publication policy exist. Caller assertions cannot enable one. */
export interface BojPolicyDecisionCaptureReadResultV2 {
  readonly status: "unavailable";
  readonly reasons: readonly ["clock-accuracy-unavailable", "publication-date-policy-unavailable"];
  readonly availabilityComparison: TemporalComparisonV1;
  readonly publicationComparison: TemporalComparisonV1;
  readonly historicalPossession: "not-certified";
}
export interface BojPolicyDecisionCaptureAuthorityV2 {
  readonly acquire: (input: AcquireBojPolicyDecisionCaptureInputV2) => Promise<BojPolicyDecisionCaptureAcquiredV2>;
  readonly readAsKnownAt: (input: ReadBojPolicyDecisionCaptureInputV2) => BojPolicyDecisionCaptureReadResultV2;
}
export interface BojPolicyDecisionCaptureDependenciesV2 {
  /** Isolated infrastructure owner only; never acquisition/read request fields.
   * Precision does not authenticate a clock or establish its absolute error. */
  readonly fetchImpl: typeof fetch;
  readonly nowUnixMilliseconds: () => number;
}

const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!;

/** A separate registry and public version. Never wraps, adopts or changes V1 receipts. */
export function createBojPolicyDecisionCaptureAuthorityV2(
  dependencies: BojPolicyDecisionCaptureDependenciesV2,
): BojPolicyDecisionCaptureAuthorityV2 {
  assertBojPolicyServerV1();
  const configuration = closedData(dependencies, ["fetchImpl", "nowUnixMilliseconds"]);
  if (typeof configuration.fetchImpl !== "function" || typeof configuration.nowUnixMilliseconds !== "function") {
    throw new TypeError("Expected V2 acquisition infrastructure functions.");
  }
  const fetchImpl = configuration.fetchImpl as typeof fetch;
  const nowUnixMilliseconds = configuration.nowUnixMilliseconds as () => number;
  const captures = new WeakMap<object, BojPolicyDecisionCaptureV2>();
  // No clock synchronization evidence exists in the current owner. This is not
  // supplied by a caller or inferred from timestamp granularity, HTTPS, or a label.
  const accuracy = createClockAccuracyV1({ status: "unknown" });
  let lastSample: AcquisitionCompletionV1 | null = null;
  let sampling = false;

  function sample(): AcquisitionCompletionV1 {
    if (sampling) throw new TypeError("Reentrant V2 capture clock.");
    sampling = true;
    try {
      const sampled = createAcquisitionCompletionV1({ unit: "epoch-milliseconds", value: nowUnixMilliseconds() });
      if (lastSample !== null) {
        // Reuse the temporal ordering validator, including equal samples. Do not
        // silently clamp a regressing clock or convert seconds to milliseconds.
        createEvidenceAvailabilityV1({ completion: lastSample,
          at: { unit: "epoch-milliseconds", value: sampled.epochMilliseconds } });
      }
      lastSample = sampled;
      return sampled;
    } finally { sampling = false; }
  }

  async function acquire(input: AcquireBojPolicyDecisionCaptureInputV2): Promise<BojPolicyDecisionCaptureAcquiredV2> {
    assertBojPolicyServerV1();
    const data = closedData(input, ["decisionDate", "signal"]);
    const decisionDate = data.decisionDate;
    if (decisionDate !== "2024-04-26" && decisionDate !== "2024-06-14") {
      throw new TypeError("V2 requires an independently approved April or June decision.");
    }
    const signal = cancellationSignal(data.signal);
    checkCancellation(signal);
    const document = await loadBojPolicyDocumentV1(bojPolicyDocumentUrlV1(decisionDate), { fetchImpl, signal });
    checkCancellation(signal);
    const fact = normalizeBojPolicyFactV1(parseBojPolicyDocumentV1(document, decisionDate));
    const sourceVersionId = buildBojPolicySourceVersionIdV1(decisionDate, fact);
    const decodedSourceDigest = "sha256:" + createHash("sha256").update(document.html, "utf8").digest("hex");
    const completeAction = prepareBojPolicyDecisionActionEvidenceV1({ document, decisionDate });
    // The approved references have no qualified release instant. No UTC/JST
    // midnight is invented from their civil dates or their unzoned release labels.
    if (fact.releaseTimestamp !== null) throw new TypeError("Approved V2 release contract changed.");
    const publication = Object.freeze({ policy: "unqualified-timezone-fail-closed" as const,
      constraint: createPublicationCivilDateConstraintV1({ date: fact.decisionDate, utcOffsetMinutes: null }),
      releaseInstant: "unavailable" as const });
    checkCancellation(signal);
    // Qualification of the whole decoded document, selected fact, action grammar
    // and semantic identities precedes the first acquisition completion sample.
    const acquisitionCompletion = sample();
    checkCancellation(signal);
    // A new measurement is explicitly projected into the old seconds schema;
    // existing V1 seconds are never reconstructed as an exact acquisition instant.
    const legacySecond = Math.floor(acquisitionCompletion.epochMilliseconds / 1_000);
    const completionBucket = createLegacyAcquisitionBucketV1({ unit: "epoch-seconds",
      value: legacySecond, acquisitionProvenance: "owner-asserted-authenticated" });
    const evidence = buildBojPolicyEvidenceV1(fact, legacySecond);
    if (evidence.metadata.sourceVersionId !== sourceVersionId) throw new TypeError("V2 selected source identity disagrees.");
    const capture = Object.freeze({ knownAt: legacySecond, evidence, decodedSourceDigest });
    const actionEvidence = completeAction(capture);
    const legacy = Object.freeze({ completionBucket, capture, actionEvidence });
    const clock = Object.freeze({ basis: "owner-wall-clock-samples" as const, accuracy,
      historicalPossession: "not-certified" as const });
    // All evidence is prepared before the final sample; everything after this
    // point is synchronous data construction, native cancellation inspection and
    // private membership registration. No await, callbacks, I/O or durable ack.
    const receipt = Object.freeze(Object.create(null)) as BojPolicyDecisionCaptureReceiptV2;
    checkCancellation(signal);
    const availabilitySample = sample();
    const evidenceAvailability = createEvidenceAvailabilityV1({ completion: acquisitionCompletion,
      at: { unit: "epoch-milliseconds", value: availabilitySample.epochMilliseconds } });
    checkCancellation(signal);
    const description: BojPolicyDecisionCaptureV2 = Object.freeze({
      schemaVersion: BOJ_POLICY_DECISION_CAPTURE_SCHEMA_VERSION_V2,
      semantic: "qualified-acquisition-description", acquisitionCompletion, evidenceAvailability,
      clock, publication, legacy,
    });
    const result = Object.freeze({ status: "acquired" as const, receipt, capture: description });
    captures.set(receipt, description);
    return result;
  }

  function readAsKnownAt(input: ReadBojPolicyDecisionCaptureInputV2): BojPolicyDecisionCaptureReadResultV2 {
    assertBojPolicyServerV1();
    // Membership precedes assessment inspection. Receipt contents never run.
    const receipt = ownData(input, "receipt");
    const capture = typeof receipt === "object" && receipt !== null ? captures.get(receipt) : undefined;
    if (capture === undefined) throw new TypeError("Unrecognized V2 BoJ decision capture receipt.");
    const data = closedData(input, ["receipt", "evaluatedAt", "knowledgeCutoff"]);
    const evaluation = createEvaluationInstantV1(data.evaluatedAt as TemporalInstantInputV1);
    const cutoff = createHistoricalCutoffV1({ evaluation, at: data.knowledgeCutoff as TemporalInstantInputV1 });
    // Recompute both comparisons for every assessment of the original receipt.
    // Temporal descriptions perform arithmetic only; private membership is the
    // source of acquisition ownership, never a temporal brand or caller label.
    const bound = buildAvailabilityBoundV1({ availability: capture.evidenceAvailability,
      acquisitionProvenance: "owner-asserted-authenticated", clockAccuracy: capture.clock.accuracy });
    const availabilityComparison = compareAvailabilityAsOfV1({ bound, cutoff });
    const publicationComparison = comparePublicationCivilDateV1({ constraint: capture.publication.constraint, instant: cutoff });
    if (availabilityComparison.status !== "unavailable" || publicationComparison.status !== "unavailable") {
      throw new TypeError("V2 unqualified admission prerequisites changed.");
    }
    return Object.freeze({ status: "unavailable", reasons: Object.freeze([
      "clock-accuracy-unavailable", "publication-date-policy-unavailable",
    ] as const), availabilityComparison, publicationComparison, historicalPossession: "not-certified" });
  }
  return Object.freeze({ acquire, readAsKnownAt });
}

// INACTIVE: no fetch, clock, synchronization, storage, environment or scheduling work.
const productionAuthorityV2 = createBojPolicyDecisionCaptureAuthorityV2({
  fetchImpl: (input, init) => globalThis.fetch(input, init), nowUnixMilliseconds: () => Date.now(),
});
export function acquireBojPolicyDecisionCaptureV2(input: AcquireBojPolicyDecisionCaptureInputV2) {
  return productionAuthorityV2.acquire(input);
}
export function readBojPolicyDecisionCaptureAsKnownAtV2(
  input: ReadBojPolicyDecisionCaptureInputV2,
): BojPolicyDecisionCaptureReadResultV2 {
  return productionAuthorityV2.readAsKnownAt(input);
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || types.isProxy(value)) throw new TypeError("Expected non-proxy V2 data.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Expected plain V2 data.");
}
function ownData(value: unknown, key: string): unknown {
  record(value);
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("Expected V2 own data fields.");
  return descriptor.value;
}
function closedData(value: unknown, keys: readonly string[]): Record<string, unknown> {
  record(value);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key))) {
    throw new TypeError("Expected closed V2 input.");
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) result[key] = ownData(value, key);
  return result;
}
function cancellationSignal(value: unknown): AbortSignal {
  if (typeof value !== "object" || value === null || types.isProxy(value) || Object.getPrototypeOf(value) !== AbortSignal.prototype) {
    throw new TypeError("Expected native V2 cancellation signal.");
  }
  signalAborted.call(value);
  // The shared transport invokes these methods. Reject own overrides rather than
  // accepting request hooks during acquisition or final membership registration.
  if (Reflect.ownKeys(value).some(key => typeof key === "string")) throw new TypeError("Unsupported cancellation signal overrides.");
  return value as AbortSignal;
}
function checkCancellation(signal: AbortSignal): void {
  if (signalAborted.call(signal)) throw new BojPolicyTransportError("aborted");
}
