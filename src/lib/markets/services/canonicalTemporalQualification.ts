import { createHash } from "node:crypto";
import type { EcbEstrSeriesV1 } from "../providers/ecb/estrTypes";
import {
  ECB_ESTR_DATAFLOW_V1,
  ECB_ESTR_SERIES_KEY_V1,
} from "../providers/ecb/estrContract";
import type { EcbFxReferenceProductIdV1 } from "../providers/ecb/types";
import type { CanonicalObservationSeriesV1 } from "./canonicalObservationSeries";
import {
  admitCanonicalObservationSeriesV1,
  CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
  type CanonicalTemporalAdmissionInputV1,
  type CanonicalTemporalAdmissionRejectionReasonV1,
  type CanonicalTemporalAdmissionResultV1,
} from "./canonicalTemporalAdmission";

export const CANONICAL_TEMPORAL_QUALIFICATION_VERSION_V1 =
  "canonical-temporal-qualification-v1" as const;
export const CANONICAL_TEMPORAL_SOURCE_BINDING_VERSION_V1 =
  "canonical-temporal-source-binding-v1" as const;

export type CanonicalTemporalQualificationInputV1 = {
  /** Original computation cutoff, never a request delivery-freshness clock. */
  readonly evaluatedAt: string;
} & (
  | { readonly productId: EcbFxReferenceProductIdV1; readonly source: CanonicalObservationSeriesV1 }
  | { readonly productId: "estr"; readonly source: EcbEstrSeriesV1 }
);

type AdmittedV1 = Extract<CanonicalTemporalAdmissionResultV1, { status: "not-contradicted" }>;

export interface CanonicalTemporalQualificationEnvelopeV1 extends AdmittedV1 {
  readonly schemaVersion: typeof CANONICAL_TEMPORAL_QUALIFICATION_VERSION_V1;
  readonly productId: CanonicalTemporalQualificationInputV1["productId"];
  readonly sourceIdentity: Readonly<{
    provider: "ecb";
    source: "European Central Bank";
    seriesId: string;
    unit: string;
    interval: "1d";
    seriesKind: "reference-rate";
  }>;
  readonly sourceBinding: Readonly<{
    version: typeof CANONICAL_TEMPORAL_SOURCE_BINDING_VERSION_V1;
    algorithm: "sha256";
    digest: string;
  }>;
}

export type CanonicalTemporalQualificationRejectionReasonV1 =
  | CanonicalTemporalAdmissionRejectionReasonV1
  | "invalid-source-wrapper"
  | "invalid-source-metadata"
  | "invalid-qualification-envelope"
  | "qualification-mismatch";

export type CanonicalTemporalQualificationResultV1 =
  | { readonly status: "qualified"; readonly qualification: CanonicalTemporalQualificationEnvelopeV1 }
  | {
      readonly status: "rejected";
      readonly reason: CanonicalTemporalQualificationRejectionReasonV1;
      readonly policyVersion: typeof CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1;
    };

/**
 * Pure, unwired adapter for the existing canonical FX series and complete ECB
 * EUR short-term rate wrapper. The approved primitive owns all temporal rules;
 * this layer checks wrapper/provenance contradictions and binds the admitted data.
 * No normalization, timestamp synthesis, clock sampling, acquisition, or I/O occurs.
 * Optional provenance is never invented. When supplied it must describe the
 * official, unsubstituted ECB source; absent optional provenance remains absent.
 *
 * Supported inputs have the same passive-data boundary as temporal admission:
 * ordinary Object/null-prototype records and dense ordinary arrays, enumerable
 * own data properties, scalar leaves, no cycles/accessors/functions/symbols.
 * Descriptor copies are taken once, before adaptation, admission, and hashing.
 * Arbitrary Proxies and modified built-ins are outside the trust boundary: traps
 * may execute or lie; thrown reflection errors reject, but this is not a sandbox.
 *
 * Binding covers product ID and the ENTIRE supplied source (metadata, every
 * observation, and every EUR short-term rate wrapper/sidecar field). The cutoff
 * is deliberately excluded. Encoding is tagged JSON: scalar type tags, ordered
 * array elements, lexicographically sorted record keys, and explicit undefined
 * and negative-zero tags. Only record keys are sorted, never observations.
 * SHA-256 uses UTF-8 and a binding-version domain tag. This encoding is independent
 * of record insertion order and does not call input iterators or toJSON methods.
 *
 * A digest is an integrity binding, NOT a signature, publication proof, source
 * authentication, or proof of possession. The envelope itself contains no source
 * history and cannot verify its binding alone. See the context-required validator.
 */
export function qualifyCanonicalTemporalSourceV1(
  input: CanonicalTemporalQualificationInputV1,
): CanonicalTemporalQualificationResultV1 {
  try {
    return qualifySnapshot(snapshotPassiveData(input, new WeakSet<object>()));
  } catch {
    return rejected("invalid-input");
  }
}

/**
 * Validate a decoded envelope against independently supplied FULL source state
 * and the ORIGINAL expected cutoff. Re-admits that source using the approved
 * primitive and recomputes all envelope fields and the binding; never upgrades a
 * legacy/missing receipt. Missing context fails closed. Returned data is freshly
 * constructed and frozen, not the caller's mutable decoded envelope.
 *
 * This checks consistency with trusted caller context, not tamper-proof evidence.
 * An attacker controlling BOTH context and envelope can generate another valid
 * unverified envelope. A standalone receipt, delivery clock, truncated history,
 * or latest-only sidecar is not a substitute for the independent context.
 */
export function validateCanonicalTemporalQualificationV1(
  envelope: unknown,
  expected: CanonicalTemporalQualificationInputV1,
): CanonicalTemporalQualificationResultV1 {
  let decoded: unknown;
  try {
    decoded = snapshotPassiveData(envelope, new WeakSet<object>());
  } catch {
    return rejected("invalid-qualification-envelope");
  }
  if (!hasEnvelopeShape(decoded)) return rejected("invalid-qualification-envelope");
  const result = qualifyCanonicalTemporalSourceV1(expected);
  if (result.status === "rejected") return result;
  // Compare all fields, including independently expected original cutoff and
  // source digest. No policy is duplicated in envelope validation.
  try {
    return canonicalEncoding(decoded) === canonicalEncoding(result.qualification)
      ? result
      : rejected("qualification-mismatch");
  } catch {
    return rejected("invalid-qualification-envelope");
  }
}

function qualifySnapshot(input: unknown): CanonicalTemporalQualificationResultV1 {
  if (!isRecord(input)) return rejected("invalid-input");
  const { productId, evaluatedAt, source } = input;
  if (productId !== "estr" && productId !== "eurusd" && productId !== "eurjpy" &&
    productId !== "eurgbp" && productId !== "eurchf") return rejected("invalid-product-identity");
  if (!isRecord(source)) return rejected("invalid-source-wrapper");

  let series: unknown = source;
  if (productId === "estr") {
    if (source.schemaVersion !== "ecb-estr-series-v1" ||
      source.dataflow !== ECB_ESTR_DATAFLOW_V1 || source.seriesKey !== ECB_ESTR_SERIES_KEY_V1) {
      return rejected("invalid-source-wrapper");
    }
    series = source.canonicalSeries;
  }
  if (isRecord(series) && isRecord(series.metadata) && !hasConsistentProvenance(series.metadata)) {
    return rejected("invalid-source-metadata");
  }
  // Type casts cross the runtime boundary only into the primitive that validates
  // these exact fields. No canonical data is repaired or selected by latest row.
  const admissionInput = (productId === "estr"
    ? { productId, evaluatedAt, series, observationMetadata: source.observationMetadata }
    : { productId, evaluatedAt, series }) as CanonicalTemporalAdmissionInputV1;
  const admission = admitCanonicalObservationSeriesV1(admissionInput);
  if (admission.status === "rejected") return admission;
  const metadata = admissionInput.series.metadata;
  const bindingState = [CANONICAL_TEMPORAL_SOURCE_BINDING_VERSION_V1, productId, source];
  return Object.freeze({
    status: "qualified",
    qualification: Object.freeze({
      schemaVersion: CANONICAL_TEMPORAL_QUALIFICATION_VERSION_V1,
      productId,
      ...admission,
      sourceIdentity: Object.freeze({
        provider: "ecb",
        source: "European Central Bank",
        seriesId: metadata.seriesId,
        unit: metadata.unit,
        interval: "1d",
        seriesKind: "reference-rate",
      }),
      sourceBinding: Object.freeze({
        version: CANONICAL_TEMPORAL_SOURCE_BINDING_VERSION_V1,
        algorithm: "sha256",
        digest: createHash("sha256").update(canonicalEncoding(bindingState), "utf8").digest("hex"),
      }),
    }),
  });
}

function hasConsistentProvenance(metadata: Record<string, unknown>): boolean {
  return (metadata.provenanceVersion === undefined || metadata.provenanceVersion === "canonical-observation-provenance-v1") &&
    (metadata.originalPublisher === undefined || metadata.originalPublisher === "European Central Bank") &&
    (metadata.substitution === undefined || (isRecord(metadata.substitution) &&
      metadata.substitution.status === "none" && Object.keys(metadata.substitution).length === 1));
}

function hasEnvelopeShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && exactKeys(value, ["schemaVersion", "productId", "status", "policyVersion",
    "evaluatedAt", "evaluationTimestampMs", "availabilityEvidence", "publicationTime",
    "sameSecondPrecisionAmbiguity", "sourceIdentity", "sourceBinding"]) &&
    value.schemaVersion === CANONICAL_TEMPORAL_QUALIFICATION_VERSION_V1 &&
    value.status === "not-contradicted" && value.availabilityEvidence === "unverified" &&
    value.policyVersion === CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 &&
    typeof value.productId === "string" && typeof value.evaluatedAt === "string" &&
    typeof value.evaluationTimestampMs === "number" && Number.isSafeInteger(value.evaluationTimestampMs) &&
    typeof value.sameSecondPrecisionAmbiguity === "boolean" &&
    (value.publicationTime === "unknown" || value.publicationTime === "supplied-unverified") &&
    isRecord(value.sourceIdentity) && exactKeys(value.sourceIdentity,
      ["provider", "source", "seriesId", "unit", "interval", "seriesKind"]) &&
    isRecord(value.sourceBinding) && exactKeys(value.sourceBinding, ["version", "algorithm", "digest"]) &&
    value.sourceBinding.version === CANONICAL_TEMPORAL_SOURCE_BINDING_VERSION_V1 &&
    value.sourceBinding.algorithm === "sha256" && typeof value.sourceBinding.digest === "string" &&
    /^[a-f0-9]{64}$/.test(value.sourceBinding.digest);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function rejected(reason: CanonicalTemporalQualificationRejectionReasonV1): CanonicalTemporalQualificationResultV1 {
  return Object.freeze({ status: "rejected", reason, policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotPassiveData(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || value === undefined || typeof value === "string" ||
    typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("Unsupported passive data");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Unsupported passive prototype");
  }
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  let copy: unknown;
  if (array) {
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
      throw new TypeError("Unsupported dense array");
    }
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      items.push(snapshotPassiveData(passiveProperty(value, String(index)), ancestors));
    }
    copy = items;
  } else {
    const record: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string") throw new TypeError("Unsupported symbol key");
      record[key] = snapshotPassiveData(passiveProperty(value, key), ancestors);
    }
    copy = record;
  }
  ancestors.delete(value);
  return copy;
}

function passiveProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
    throw new TypeError("Unsupported passive property");
  }
  return descriptor.value;
}

function canonicalEncoding(value: unknown): string {
  function tagged(item: unknown): unknown {
    if (item === undefined) return ["undefined"];
    if (item === null) return ["null"];
    if (typeof item === "number") return ["number", Object.is(item, -0) ? "-0" : String(item)];
    if (typeof item === "string" || typeof item === "boolean") return [typeof item, item];
    if (Array.isArray(item)) {
      const elements: unknown[] = [];
      for (let index = 0; index < item.length; index += 1) elements.push(tagged(item[index]));
      return ["array", elements];
    }
    if (isRecord(item)) return ["record", Object.keys(item).sort().map((key) => [key, tagged(item[key])])];
    throw new TypeError("Unsupported encoding input");
  }
  return JSON.stringify(tagged(value));
}
