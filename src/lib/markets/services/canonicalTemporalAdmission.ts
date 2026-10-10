import type { EcbEstrObservationMetadataV1 } from "../providers/ecb/estrTypes";
import type { ECB_ESTR_SERIES_ID_V1 } from "../providers/ecb/estrContract";
import type { EcbFxReferenceProductIdV1 } from "../providers/ecb/types";
import type { CanonicalObservationSeriesV1 } from "./canonicalObservationSeries";

export const CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 =
  "canonical-temporal-admission-v1" as const;

const MAX_SECONDS = 253_402_300_799;
const MAX_MILLISECONDS = 253_402_300_799_999;
const DAY_SECONDS = 86_400;

interface TemporalAdmissionBaseV1 {
  readonly series: CanonicalObservationSeriesV1;
  /** Explicit cutoff; this primitive never samples an acquisition or evaluation clock. */
  readonly evaluatedAt: string;
}

export type CanonicalTemporalAdmissionInputV1 = TemporalAdmissionBaseV1 & (
  | {
      readonly productId: EcbFxReferenceProductIdV1;
      readonly observationMetadata?: never;
    }
  | {
      readonly productId: "estr";
      readonly observationMetadata: readonly EcbEstrObservationMetadataV1[];
    }
);

export type CanonicalTemporalAdmissionRejectionReasonV1 =
  | "invalid-input"
  | "invalid-product-identity"
  | "invalid-evaluation-instant"
  | "invalid-series"
  | "invalid-acquisition-timestamp"
  | "acquisition-after-evaluation"
  | "empty-history"
  | "invalid-observation-timestamp"
  | "non-midnight-observation"
  | "observation-after-evaluation"
  | "invalid-observation-value"
  | "non-canonical-history"
  | "invalid-source-timestamp"
  | "inconsistent-source-timestamp"
  | "invalid-observation-alias"
  | "inconsistent-observation-alias"
  | "invalid-release-timestamp"
  | "release-after-evaluation"
  | "release-after-acquisition"
  | "estr-sidecars-missing"
  | "estr-sidecar-count-mismatch"
  | "estr-sidecar-invalid"
  | "estr-sidecar-timestamp-mismatch"
  | "estr-sidecar-reference-date-invalid"
  | "estr-sidecar-enum-invalid";

export type CanonicalTemporalAdmissionResultV1 =
  | {
      readonly status: "not-contradicted";
      readonly availabilityEvidence: "unverified";
      readonly policyVersion: typeof CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1;
      readonly evaluatedAt: string;
      readonly evaluationTimestampMs: number;
      /** True when acquisition/release/evaluation comparisons share a second bucket. */
      readonly sameSecondPrecisionAmbiguity: boolean;
      readonly publicationTime: "unknown" | "supplied-unverified";
    }
  | {
      readonly status: "rejected";
      readonly reason: CanonicalTemporalAdmissionRejectionReasonV1;
      readonly policyVersion: typeof CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1;
    };

/**
 * Pure structural admission for complete, already canonical daily ECB histories.
 * Product/provider/series/unit identity follows the existing daily ECB contracts:
 * FX is quote currency per EUR, never inverted; €STR is the WT series in percent.
 * This result must not replace source-owner validation, freshness, or history minimums.
 * No normalization, alias repair, filtering, analytical calculation, or I/O occurs.
 * Acceptance means only that supplied timestamps do not contradict the cutoff.
 * It authenticates neither publication, clock accuracy, nor historical possession.
 * Seconds must be integers in 0..253402300799; the cutoff retains milliseconds.
 * For E = evaluation milliseconds and Q = floor(E / 1000), every O must satisfy
 * O * 1000 <= E, acquisition F <= Q, and an optional release R <= Q and R <= F.
 * Equality of acquisition/release second buckets is allowed with ambiguity flagged.
 * An absent release remains unknown; no release or possession time is inferred.
 * Rejection priority is input/clock, acquisition, history, aliases, release, sidecars.
 * Supported input is an acyclic graph of ordinary passive records (Object.prototype
 * or null prototype) and dense ordinary arrays, with own enumerable data properties
 * and string/number/boolean/null/undefined leaves. Undefined is allowed for optional
 * fields. Accessors, custom
 * prototypes, symbol keys/values, functions, and extra array properties are rejected
 * as invalid-input. Descriptor snapshots preserve every index without invoking getters
 * or input iterators; no external fields are reread after snapshotting.
 * Proxies and modified built-in intrinsics are outside this trust boundary. JavaScript
 * cannot portably detect every Proxy or safely introspect arbitrary traps: traps may
 * execute or lie. Detectable shape failures and thrown introspection errors reject;
 * this is not a sandbox for executable hostile objects or a guarantee against traps.
 */
export function admitCanonicalObservationSeriesV1(
  input: CanonicalTemporalAdmissionInputV1,
): CanonicalTemporalAdmissionResultV1 {
  const passiveInput = snapshotPassiveInput(input);
  if (!isRecord(passiveInput)) return rejected("invalid-input");
  const productId = passiveInput.productId;
  if (!isProductId(productId)) return rejected("invalid-product-identity");

  const evaluatedAt = passiveInput.evaluatedAt;
  const evaluationTimestampMs = parseEvaluationInstant(evaluatedAt);
  if (typeof evaluatedAt !== "string" || evaluationTimestampMs === null) return rejected("invalid-evaluation-instant");
  const evaluationSeconds = Math.floor(evaluationTimestampMs / 1_000);
  const series = passiveInput.series;
  if (
    !isRecord(series) ||
    series.schemaVersion !== "canonical-observation-series-v1" ||
    !isRecord(series.metadata) ||
    !Array.isArray(series.observations) ||
    series.metadata.interval !== "1d" ||
    series.metadata.seriesKind !== "reference-rate"
  ) return rejected("invalid-series");

  const metadata = series.metadata;
  if (
    metadata.requestedProductId !== productId ||
    metadata.canonicalProductId !== productId ||
    !matchesProductSource(metadata, productId)
  ) return rejected("invalid-product-identity");
  const fetchedAt = metadata.fetchedAt;
  if (!isUnixSeconds(fetchedAt)) return rejected("invalid-acquisition-timestamp");
  if (fetchedAt > evaluationSeconds) return rejected("acquisition-after-evaluation");
  const observations = series.observations;
  if (observations.length === 0) return rejected("empty-history");

  let latestTimestamp = 0;
  let previousTimestamp: number | undefined;
  let nonCanonicalOrder = false;
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    if (!isRecord(observation) || !isUnixSeconds(observation.timestamp)) {
      return rejected("invalid-observation-timestamp");
    }
    if (observation.timestamp % DAY_SECONDS !== 0) return rejected("non-midnight-observation");
    if (observation.timestamp * 1_000 > evaluationTimestampMs) {
      return rejected("observation-after-evaluation");
    }
    if (
      typeof observation.value !== "number" || !Number.isFinite(observation.value) ||
      (productId !== "estr" && observation.value <= 0)
    ) return rejected("invalid-observation-value");
    if (previousTimestamp !== undefined && observation.timestamp <= previousTimestamp) {
      nonCanonicalOrder = true;
    }
    latestTimestamp = Math.max(latestTimestamp, observation.timestamp);
    previousTimestamp = observation.timestamp;
  }
  // Scan temporal coordinates before rejecting order, so a raw interior future row
  // cannot hide behind its position or an otherwise noncanonical ordering.
  if (nonCanonicalOrder) return rejected("non-canonical-history");
  if (!isUnixSeconds(metadata.sourceTimestamp)) return rejected("invalid-source-timestamp");
  if (metadata.sourceTimestamp !== latestTimestamp) return rejected("inconsistent-source-timestamp");
  if (metadata.observationTimestamp !== undefined) {
    if (!isUnixSeconds(metadata.observationTimestamp)) return rejected("invalid-observation-alias");
    if (metadata.observationTimestamp !== latestTimestamp) return rejected("inconsistent-observation-alias");
  }

  const releaseTimestamp = metadata.releaseTimestamp;
  if (releaseTimestamp !== undefined) {
    if (!isUnixSeconds(releaseTimestamp)) return rejected("invalid-release-timestamp");
    if (releaseTimestamp > evaluationSeconds) return rejected("release-after-evaluation");
    if (releaseTimestamp > fetchedAt) return rejected("release-after-acquisition");
  }
  if (productId === "estr") {
    const observationMetadata = passiveInput.observationMetadata;
    if (!Array.isArray(observationMetadata)) return rejected("estr-sidecars-missing");
    if (observationMetadata.length !== observations.length) {
      return rejected("estr-sidecar-count-mismatch");
    }
    for (let index = 0; index < observations.length; index += 1) {
      const sidecar = observationMetadata[index];
      if (!isRecord(sidecar) || !hasStatusTriplet(sidecar.observationStatus) ||
        !hasStatusTriplet(sidecar.confidentialityStatus)) return rejected("estr-sidecar-invalid");
      if (!isUnixSeconds(sidecar.timestamp) || sidecar.timestamp !== observations[index]!.timestamp) {
        return rejected("estr-sidecar-timestamp-mismatch");
      }
      if (!matchesReferenceDate(sidecar.referenceDate, sidecar.timestamp)) {
        return rejected("estr-sidecar-reference-date-invalid");
      }
      if (
        (sidecar.publicationType !== "standard" && sidecar.publicationType !== "republication") ||
        (sidecar.calculationMethod !== "normal" && sidecar.calculationMethod !== "contingency")
      ) return rejected("estr-sidecar-enum-invalid");
    }
  }

  return Object.freeze({
    status: "not-contradicted",
    availabilityEvidence: "unverified",
    policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
    evaluatedAt,
    evaluationTimestampMs,
    sameSecondPrecisionAmbiguity: fetchedAt === evaluationSeconds ||
      (releaseTimestamp !== undefined &&
        (releaseTimestamp === evaluationSeconds || releaseTimestamp === fetchedAt)),
    publicationTime: releaseTimestamp === undefined ? "unknown" : "supplied-unverified",
  });
}

function matchesProductSource(
  metadata: Record<string, unknown>, productId: CanonicalTemporalAdmissionInputV1["productId"],
): boolean {
  // The four allowlisted FX IDs encode the quote currency. Use the existing EXR
  // key/quotation convention, not another product registry or a provider import.
  const quoteCurrency = productId.slice(3).toUpperCase();
  const estrSeriesId: typeof ECB_ESTR_SERIES_ID_V1 = "EST.B.EU000A2X2A25.WT";
  return metadata.provider === "ecb" && metadata.source === "European Central Bank" &&
    metadata.status === "end_of_day" &&
    metadata.seriesId === (productId === "estr" ? estrSeriesId : `EXR.D.${quoteCurrency}.EUR.SP00.A`) &&
    metadata.unit === (productId === "estr" ? "percent" : `${quoteCurrency} per EUR`);
}

function snapshotPassiveInput(value: unknown): unknown {
  try {
    return snapshotPassiveData(value, new WeakSet<object>());
  } catch {
    // Includes shape failures, revoked Proxies, throwing reflection traps, and
    // excessive nesting. No application getter is deliberately invoked.
    return undefined;
  }
}

function snapshotPassiveData(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || value === undefined || typeof value === "string" ||
    typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("Unsupported passive data");
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Unsupported passive prototype");
  }
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  let snapshot: unknown;
  if (isArray) {
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) {
      throw new TypeError("Unsupported or sparse array");
    }
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      items.push(snapshotPassiveData(passiveProperty(value, String(index)), ancestors));
    }
    snapshot = items;
  } else {
    const record: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string") throw new TypeError("Unsupported symbol key");
      record[key] = snapshotPassiveData(passiveProperty(value, key), ancestors);
    }
    snapshot = record;
  }
  ancestors.delete(value);
  return snapshot;
}

function passiveProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
    throw new TypeError("Unsupported passive property");
  }
  return descriptor.value;
}

function rejected(reason: CanonicalTemporalAdmissionRejectionReasonV1): CanonicalTemporalAdmissionResultV1 {
  return Object.freeze({ status: "rejected", reason, policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 });
}

function parseEvaluationInstant(value: unknown): number | null {
  if (typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= MAX_MILLISECONDS &&
    new Date(milliseconds).toISOString() === value ? milliseconds : null;
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) &&
    value >= 0 && value <= MAX_SECONDS;
}

function matchesReferenceDate(value: unknown, timestamp: number): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= MAX_MILLISECONDS &&
    milliseconds / 1_000 === timestamp && new Date(milliseconds).toISOString().slice(0, 10) === value;
}

function isProductId(value: unknown): value is CanonicalTemporalAdmissionInputV1["productId"] {
  return value === "eurusd" || value === "eurjpy" || value === "eurgbp" || value === "eurchf" || value === "estr";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasStatusTriplet(value: unknown): boolean {
  return isRecord(value) && typeof value.headline === "string" &&
    typeof value.publicationType === "string" && typeof value.calculationMethod === "string";
}
