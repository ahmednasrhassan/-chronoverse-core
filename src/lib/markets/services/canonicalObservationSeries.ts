import type {
  CandleInterval,
  MarketDataStatus,
} from "../core/types";

export const CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1 =
  "canonical-observation-series-v1" as const;
export const CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 =
  "canonical-observation-provenance-v1" as const;
export const CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1 =
  "canonical-statistical-series-v1" as const;

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

export type CanonicalStatisticalFrequencyV1 = "monthly" | "quarterly";

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

export interface CanonicalStatisticalObservationValueV1 {
  /** Explicit economic period identity; never inferred from capture time. */
  readonly referencePeriod: string;
  readonly value: number;
  /** Opaque official marker preserved without provider-specific interpretation. */
  readonly officialStatus?: string;
}

export interface CanonicalStatisticalSeriesMetadataV1 {
  readonly provenanceVersion?: typeof CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1;
  readonly provider: string;
  readonly source: string;
  readonly originalPublisher?: string;
  readonly substitution?: CanonicalSourceSubstitutionV1;
  /** Stable provider-neutral identity; this is not a market product ID. */
  readonly canonicalSeriesId: string;
  /** Official dataset/series identity supplied by the source adapter. */
  readonly sourceSeriesId: string;
  /** Absolute locator for the official source dataset or series. */
  readonly sourceUrl: string;
  /** Identity of this captured official source state; never inferred from fetchedAt. */
  readonly sourceVersionId: string;
  readonly frequency: CanonicalStatisticalFrequencyV1;
  /** Unix seconds at which Chronoverse possessed this source state. */
  readonly fetchedAt: number;
  /** Actual publisher-supplied release time, when known; never inferred. */
  readonly releaseTimestamp?: number;
  readonly unit: string;
}

export interface CanonicalStatisticalSeriesV1 {
  readonly schemaVersion: typeof CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1;
  readonly observations: readonly CanonicalStatisticalObservationValueV1[];
  readonly metadata: CanonicalStatisticalSeriesMetadataV1;
}

export interface CanonicalStatisticalSeriesInputV1 {
  readonly observations: readonly CanonicalStatisticalObservationValueV1[];
  readonly metadata: CanonicalStatisticalSeriesMetadataV1;
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

/**
 * Pure normalization for official statistical observations. Revisions belong
 * to distinct source vintages, so one snapshot may contain only one value for
 * each reference period.
 */
export function normalizeCanonicalStatisticalSeriesV1(
  input: CanonicalStatisticalSeriesInputV1,
): CanonicalStatisticalSeriesV1 {
  const metadata = normalizeStatisticalMetadata(input.metadata);
  const ordered = input.observations.map((observation) => {
    const referencePeriod = normalizeReferencePeriod(
      observation.referencePeriod,
      metadata.frequency,
    );

    if (!Number.isFinite(observation.value)) {
      throw new TypeError("Canonical statistical-series value is invalid.");
    }

    const officialStatus = observation.officialStatus === undefined
      ? undefined
      : requireStatisticalIdentifier(
          observation.officialStatus,
          "official status",
        );

    return Object.freeze({
      referencePeriod,
      value: observation.value,
      ...(officialStatus === undefined ? {} : { officialStatus }),
    });
  }).sort((left, right) =>
    left.referencePeriod.localeCompare(right.referencePeriod)
  );
  const observations: CanonicalStatisticalObservationValueV1[] = [];

  for (const observation of ordered) {
    const previous = observations.at(-1);

    if (previous?.referencePeriod === observation.referencePeriod) {
      if (
        previous.value !== observation.value ||
        previous.officialStatus !== observation.officialStatus
      ) {
        throw new TypeError(
          "Canonical statistical series contains conflicting duplicate reference periods.",
        );
      }

      continue;
    }

    observations.push(observation);
  }

  return Object.freeze({
    schemaVersion: CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1,
    observations: Object.freeze(observations),
    metadata,
  });
}

export function isCanonicalStatisticalSeriesV1(
  value: unknown,
): value is CanonicalStatisticalSeriesV1 {
  return typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1;
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

function normalizeStatisticalMetadata(
  metadata: CanonicalStatisticalSeriesMetadataV1,
): CanonicalStatisticalSeriesMetadataV1 {
  const provider = requireStatisticalIdentifier(metadata.provider, "provider");
  const source = requireStatisticalIdentifier(metadata.source, "source");
  const canonicalSeriesId = requireStatisticalIdentifier(
    metadata.canonicalSeriesId,
    "canonical series ID",
  );
  const sourceSeriesId = requireStatisticalIdentifier(
    metadata.sourceSeriesId,
    "source series ID",
  );
  const sourceVersionId = requireStatisticalIdentifier(
    metadata.sourceVersionId,
    "source version ID",
  );
  const unit = requireStatisticalIdentifier(metadata.unit, "unit");
  const sourceUrl = normalizeOfficialSourceUrl(metadata.sourceUrl);

  if (!isStatisticalFrequency(metadata.frequency)) {
    throw new TypeError("Canonical statistical-series frequency is invalid.");
  }

  if (
    !Number.isSafeInteger(metadata.fetchedAt) ||
    metadata.fetchedAt < 0 ||
    (metadata.releaseTimestamp !== undefined &&
      (!Number.isSafeInteger(metadata.releaseTimestamp) ||
        metadata.releaseTimestamp < 0 ||
        metadata.releaseTimestamp > metadata.fetchedAt))
  ) {
    throw new TypeError("Canonical statistical-series provenance timestamp is invalid.");
  }

  if (
    metadata.provenanceVersion !== undefined &&
    metadata.provenanceVersion !== CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1
  ) {
    throw new TypeError("Canonical statistical-series provenance version is invalid.");
  }

  const originalPublisher = metadata.originalPublisher === undefined
    ? undefined
    : requireStatisticalIdentifier(
        metadata.originalPublisher,
        "original publisher",
      );
  const substitution = normalizeSourceSubstitution(
    metadata.substitution,
    "Canonical statistical-series",
  );

  return Object.freeze({
    ...(metadata.provenanceVersion === undefined
      ? {}
      : { provenanceVersion: metadata.provenanceVersion }),
    provider,
    source,
    ...(originalPublisher === undefined ? {} : { originalPublisher }),
    ...(substitution === undefined ? {} : { substitution }),
    canonicalSeriesId,
    sourceSeriesId,
    sourceUrl,
    sourceVersionId,
    frequency: metadata.frequency,
    fetchedAt: metadata.fetchedAt,
    ...(metadata.releaseTimestamp === undefined
      ? {}
      : { releaseTimestamp: metadata.releaseTimestamp }),
    unit,
  });
}

function normalizeReferencePeriod(
  value: string,
  frequency: CanonicalStatisticalFrequencyV1,
): string {
  const normalized = value.trim();
  const valid = frequency === "monthly"
    ? /^\d{4}-(?:0[1-9]|1[0-2])$/.test(normalized)
    : /^\d{4}-Q[1-4]$/.test(normalized);

  if (!valid) {
    throw new TypeError(
      "Canonical statistical-series reference period is invalid for its frequency.",
    );
  }

  return normalized;
}

function normalizeOfficialSourceUrl(value: string): string {
  const normalized = requireStatisticalIdentifier(value, "source URL");
  let sourceUrl: URL;

  try {
    sourceUrl = new URL(normalized);
  } catch {
    throw new TypeError("Canonical statistical-series source URL is invalid.");
  }

  if (
    (sourceUrl.protocol !== "https:" && sourceUrl.protocol !== "http:") ||
    sourceUrl.hostname.length === 0 ||
    sourceUrl.username.length > 0 ||
    sourceUrl.password.length > 0
  ) {
    throw new TypeError("Canonical statistical-series source URL is invalid.");
  }

  return sourceUrl.toString();
}

function requireStatisticalIdentifier(value: string, label: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`Canonical statistical-series ${label} is invalid.`);
  }

  return normalized;
}

function normalizeSourceSubstitution(
  substitution: CanonicalSourceSubstitutionV1 | undefined,
  contract: string,
): CanonicalSourceSubstitutionV1 | undefined {
  if (
    substitution !== undefined &&
    substitution.status !== "none" &&
    substitution.status !== "unknown" &&
    substitution.status !== "substituted"
  ) {
    throw new TypeError(`${contract} substitution is invalid.`);
  }

  return substitution?.status === "substituted"
    ? Object.freeze({
        status: "substituted" as const,
        provider: requireStatisticalIdentifier(
          substitution.provider,
          "substitute provider",
        ),
        source: requireStatisticalIdentifier(
          substitution.source,
          "substitute source",
        ),
      })
    : substitution === undefined
      ? undefined
      : Object.freeze({ status: substitution.status });
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

function isStatisticalFrequency(
  value: unknown,
): value is CanonicalStatisticalFrequencyV1 {
  return value === "monthly" || value === "quarterly";
}
