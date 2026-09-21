import type {
  CandleInterval,
  MarketDataStatus,
} from "../core/types";

export const CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1 =
  "canonical-observation-series-v1" as const;
export const CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 =
  "canonical-observation-provenance-v1" as const;

export type CanonicalSourceSubstitutionV1 =
  | { readonly status: "none" }
  | { readonly status: "unknown" }
  | {
      readonly status: "substituted";
      readonly provider: string;
      readonly source: string;
    };

export type CanonicalObservationSeriesKindV1 =
  | "spot-price"
  | "reference-rate"
  | "yield"
  | "index-level";

export interface CanonicalObservationValueV1 {
  /** Unix timestamp in seconds. */
  readonly timestamp: number;
  readonly value: number;
}

export interface CanonicalObservationSeriesMetadataV1 {
  readonly provenanceVersion?: typeof CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1;
  readonly provider: string;
  readonly source: string;
  readonly originalPublisher?: string;
  readonly substitution?: CanonicalSourceSubstitutionV1;
  readonly seriesId: string;
  readonly requestedProductId: string;
  readonly canonicalProductId: string;
  readonly interval: CandleInterval;
  readonly fetchedAt: number;
  /** Observation/reference time, distinct from fetch and publication time. */
  readonly observationTimestamp?: number;
  /** Only present when the original publisher supplies a release time. */
  readonly releaseTimestamp?: number;
  /** Compatibility alias for the latest observation/reference timestamp. */
  readonly sourceTimestamp?: number;
  readonly status: MarketDataStatus;
  readonly unit: string;
  readonly seriesKind: CanonicalObservationSeriesKindV1;
}

export interface CanonicalObservationSeriesV1 {
  readonly schemaVersion: typeof CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1;
  readonly observations: readonly CanonicalObservationValueV1[];
  readonly metadata: CanonicalObservationSeriesMetadataV1;
}

export interface CanonicalObservationSeriesInputV1 {
  readonly observations: readonly CanonicalObservationValueV1[];
  readonly metadata: CanonicalObservationSeriesMetadataV1;
}

/**
 * Pure provider-neutral normalization for primary observation series.
 * Finite zero and negative values are valid here; product-specific consumers
 * remain responsible for applying narrower value-domain requirements.
 */
export function normalizeCanonicalObservationSeriesV1(
  input: CanonicalObservationSeriesInputV1,
): CanonicalObservationSeriesV1 {
  const metadata = normalizeMetadata(input.metadata);
  const ordered = input.observations.map((observation) => {
    if (
      !Number.isFinite(observation.timestamp) ||
      !Number.isFinite(observation.value)
    ) {
      throw new TypeError("Canonical observation-series value is invalid.");
    }

    return Object.freeze({
      timestamp: observation.timestamp,
      value: observation.value,
    });
  }).sort((left, right) => left.timestamp - right.timestamp);
  const observations: CanonicalObservationValueV1[] = [];

  for (const observation of ordered) {
    const previous = observations.at(-1);

    if (previous?.timestamp === observation.timestamp) {
      if (previous.value !== observation.value) {
        throw new TypeError(
          "Canonical observation series contains conflicting duplicate timestamps.",
        );
      }

      continue;
    }

    observations.push(observation);
  }

  return Object.freeze({
    schemaVersion: CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1,
    observations: Object.freeze(observations),
    metadata,
  });
}

export function isCanonicalObservationSeriesV1(
  value: unknown,
): value is CanonicalObservationSeriesV1 {
  return typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1;
}

function normalizeMetadata(
  metadata: CanonicalObservationSeriesMetadataV1,
): CanonicalObservationSeriesMetadataV1 {
  const provider = requireIdentifier(metadata.provider, "provider");
  const source = requireIdentifier(metadata.source, "source");
  const seriesId = requireIdentifier(metadata.seriesId, "series ID");
  const requestedProductId = requireIdentifier(
    metadata.requestedProductId,
    "requested product ID",
  );
  const canonicalProductId = requireIdentifier(
    metadata.canonicalProductId,
    "canonical product ID",
  );
  const unit = requireIdentifier(metadata.unit, "unit");

  if (!isCandleInterval(metadata.interval)) {
    throw new TypeError("Canonical observation-series interval is invalid.");
  }

  if (!isMarketDataStatus(metadata.status)) {
    throw new TypeError("Canonical observation-series status is invalid.");
  }

  if (
    !Number.isFinite(metadata.fetchedAt) ||
    (metadata.observationTimestamp !== undefined &&
      !Number.isFinite(metadata.observationTimestamp)) ||
    (metadata.releaseTimestamp !== undefined &&
      !Number.isFinite(metadata.releaseTimestamp)) ||
    (metadata.sourceTimestamp !== undefined &&
      !Number.isFinite(metadata.sourceTimestamp)) ||
    (metadata.observationTimestamp !== undefined &&
      metadata.sourceTimestamp !== undefined &&
      metadata.observationTimestamp !== metadata.sourceTimestamp)
  ) {
    throw new TypeError("Canonical observation-series provenance timestamp is invalid.");
  }

  if (!isSeriesKind(metadata.seriesKind)) {
    throw new TypeError("Canonical observation-series kind is invalid.");
  }

  if (metadata.provenanceVersion !== undefined &&
    metadata.provenanceVersion !== CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1) {
    throw new TypeError("Canonical observation-series provenance version is invalid.");
  }
  const originalPublisher = metadata.originalPublisher === undefined
    ? undefined
    : requireIdentifier(metadata.originalPublisher, "original publisher");
  const substitution = metadata.substitution;
  if (substitution !== undefined &&
    substitution.status !== "none" &&
    substitution.status !== "unknown" &&
    substitution.status !== "substituted") {
    throw new TypeError("Canonical observation-series substitution is invalid.");
  }
  const normalizedSubstitution = substitution?.status === "substituted"
    ? Object.freeze({
        status: "substituted" as const,
        provider: requireIdentifier(substitution.provider, "substitute provider"),
        source: requireIdentifier(substitution.source, "substitute source"),
      })
    : substitution === undefined ? undefined : Object.freeze({ status: substitution.status });

  return Object.freeze({
    ...(metadata.provenanceVersion === undefined ? {} : { provenanceVersion: metadata.provenanceVersion }),
    provider,
    source,
    ...(originalPublisher === undefined ? {} : { originalPublisher }),
    ...(normalizedSubstitution === undefined ? {} : { substitution: normalizedSubstitution }),
    seriesId,
    requestedProductId,
    canonicalProductId,
    interval: metadata.interval,
    fetchedAt: metadata.fetchedAt,
    ...(metadata.observationTimestamp === undefined
      ? {}
      : { observationTimestamp: metadata.observationTimestamp }),
    ...(metadata.releaseTimestamp === undefined
      ? {}
      : { releaseTimestamp: metadata.releaseTimestamp }),
    ...(metadata.sourceTimestamp === undefined
      ? {}
      : { sourceTimestamp: metadata.sourceTimestamp }),
    status: metadata.status,
    unit,
    seriesKind: metadata.seriesKind,
  });
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`Canonical observation-series ${label} is invalid.`);
  }

  return normalized;
}

function isCandleInterval(value: unknown): value is CandleInterval {
  return ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1wk", "1mo"].includes(
    value as CandleInterval,
  );
}

function isMarketDataStatus(value: unknown): value is MarketDataStatus {
  return ["realtime", "delayed", "end_of_day", "stale", "unavailable"].includes(
    value as MarketDataStatus,
  );
}

function isSeriesKind(value: unknown): value is CanonicalObservationSeriesKindV1 {
  return ["spot-price", "reference-rate", "yield", "index-level"].includes(
    value as CanonicalObservationSeriesKindV1,
  );
}
