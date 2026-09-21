import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  normalizeCanonicalObservationSeriesV1,
  type CanonicalObservationSeriesV1,
  type CanonicalObservationValueV1,
} from "../../services/canonicalObservationSeries";
import { ecbClientV1 } from "./client";
import {
  ECB_ESTR_DATAFLOW_V1,
  ECB_ESTR_SERIES_ID_V1,
  ECB_ESTR_SERIES_KEY_V1,
} from "./estrContract";
import type {
  EcbEstrDataResultV1,
  EcbEstrDataTypeV1,
  EcbEstrObservationMetadataV1,
  EcbEstrRawObservationV1,
  EcbEstrSeriesV1,
} from "./estrTypes";

const ECB_ESTR_SCHEMA_VERSION_V1 = "ecb-estr-series-v1" as const;

export interface EcbEstrSeriesDependenciesV1 {
  readonly loadData?: () => Promise<EcbEstrDataResultV1>;
  readonly now?: () => Date;
}

interface NormalizedRawObservation {
  readonly raw: EcbEstrRawObservationV1;
  readonly timestamp: number;
  readonly value: number;
}

export async function loadEcbEstrSeriesV1(
  dependencies: EcbEstrSeriesDependenciesV1 = {},
): Promise<EcbEstrSeriesV1> {
  const result = await (dependencies.loadData ?? (() =>
    ecbClientV1.getEstrReferenceRate()))();

  return normalizeEcbEstrSeriesV1(result, dependencies.now);
}

/** Full-history path; production callers must reuse it through the daily cache. */
export async function loadEcbEstrHistoryV1(
  dependencies: EcbEstrSeriesDependenciesV1 = {},
): Promise<EcbEstrSeriesV1> {
  const result = await (dependencies.loadData ?? (() =>
    ecbClientV1.getEstrReferenceRateHistory()))();

  return normalizeEcbEstrSeriesV1(result, dependencies.now);
}

export function normalizeEcbEstrSeriesV1(
  result: EcbEstrDataResultV1,
  now: (() => Date) = () => new Date(),
): EcbEstrSeriesV1 {
  if (result.provider !== "ecb") {
    throw new TypeError("[Chronoverse ECB €STR] Provider identity is invalid.");
  }

  const byType = {
    WT: normalizeRawType(result.observations, "WT"),
    RP: normalizeRawType(result.observations, "RP"),
    CM: normalizeRawType(result.observations, "CM"),
  } as const;
  const timestamps = [...byType.WT.keys()].sort((left, right) => left - right);

  if (timestamps.length === 0) {
    throw new TypeError("[Chronoverse ECB €STR] Headline observations are unavailable.");
  }

  assertMatchedDates(timestamps, byType.RP, "publication type");
  assertMatchedDates(timestamps, byType.CM, "calculation method");

  const observations: CanonicalObservationValueV1[] = [];
  const observationMetadata: EcbEstrObservationMetadataV1[] = [];

  for (const timestamp of timestamps) {
    const headline = byType.WT.get(timestamp)!;
    const publication = byType.RP.get(timestamp)!;
    const calculation = byType.CM.get(timestamp)!;

    observations.push(Object.freeze({ timestamp, value: headline.value }));
    observationMetadata.push(Object.freeze({
      referenceDate: headline.raw.period,
      timestamp,
      observationStatus: Object.freeze({
        headline: headline.raw.observationStatus,
        publicationType: publication.raw.observationStatus,
        calculationMethod: calculation.raw.observationStatus,
      }),
      confidentialityStatus: Object.freeze({
        headline: headline.raw.confidentialityStatus,
        publicationType: publication.raw.confidentialityStatus,
        calculationMethod: calculation.raw.confidentialityStatus,
      }),
      publicationType: publication.value === 0
        ? "standard"
        : "republication",
      calculationMethod: calculation.value === 0
        ? "normal"
        : "contingency",
    }));
  }

  const fetchedAt = Math.floor(now().getTime() / 1000);

  if (!Number.isFinite(fetchedAt)) {
    throw new TypeError("[Chronoverse ECB €STR] Fetch timestamp is invalid.");
  }

  return createEcbEstrSeries(
    normalizeCanonicalObservationSeriesV1({
      observations,
      metadata: {
        provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
        provider: "ecb",
        source: "European Central Bank",
        originalPublisher: "European Central Bank",
        substitution: { status: "none" },
        seriesId: ECB_ESTR_SERIES_ID_V1,
        requestedProductId: "estr",
        canonicalProductId: "estr",
        interval: "1d",
        fetchedAt,
        // This is the latest ECB reference date, not a publication timestamp.
        observationTimestamp: timestamps.at(-1)!,
        sourceTimestamp: timestamps.at(-1)!,
        status: "end_of_day",
        unit: "percent",
        seriesKind: "reference-rate",
      },
    }),
    observationMetadata,
  );
}

/**
 * Applies a bounded current-state overlap to persisted history. The newly
 * fetched official value and its exact-date sidecar replace persisted state.
 */
export function mergeEcbEstrOverlapV1(
  persisted: EcbEstrSeriesV1,
  overlap: EcbEstrSeriesV1,
): EcbEstrSeriesV1 {
  validateEcbEstrSeriesIdentity(persisted);
  validateEcbEstrSeriesIdentity(overlap);

  const persistedLatest = persisted.canonicalSeries.observations.at(-1)?.timestamp;
  const overlapLatest = overlap.canonicalSeries.observations.at(-1)?.timestamp;

  if (
    persistedLatest === undefined ||
    overlapLatest === undefined ||
    overlapLatest < persistedLatest
  ) {
    throw new TypeError("[Chronoverse ECB €STR] Overlap is stale.");
  }

  const observations = new Map(
    persisted.canonicalSeries.observations.map((item) => [item.timestamp, item]),
  );
  for (const item of overlap.canonicalSeries.observations) {
    observations.set(item.timestamp, item);
  }

  const metadata = new Map(
    persisted.observationMetadata.map((item) => [item.timestamp, item]),
  );

  for (const item of overlap.observationMetadata) {
    metadata.set(item.timestamp, item);
  }

  const mergedObservations = [...observations.values()];
  const mergedLatest = Math.max(...mergedObservations.map((item) => item.timestamp));
  const canonicalSeries = normalizeCanonicalObservationSeriesV1({
    observations: mergedObservations,
    metadata: {
      ...overlap.canonicalSeries.metadata,
      observationTimestamp: mergedLatest,
      sourceTimestamp: mergedLatest,
    },
  });

  return createEcbEstrSeries(
    canonicalSeries,
    [...metadata.values()].sort((left, right) => left.timestamp - right.timestamp),
  );
}

function normalizeRawType(
  observations: readonly EcbEstrRawObservationV1[],
  dataType: EcbEstrDataTypeV1,
): ReadonlyMap<number, NormalizedRawObservation> {
  const matches = observations.filter((item) => item.dataType === dataType);

  if (matches.length === 0) {
    throw new TypeError(`[Chronoverse ECB €STR] ${dataType} observations are unavailable.`);
  }

  const normalized = new Map<number, NormalizedRawObservation>();

  for (const raw of matches) {
    const timestamp = parseEcbEstrReferenceDate(raw.period);
    const value = Number(raw.value);

    if (!Number.isFinite(value)) {
      throw new TypeError("[Chronoverse ECB €STR] Observation value is invalid.");
    }

    if ((dataType === "RP" || dataType === "CM") && value !== 0 && value !== 1) {
      throw new TypeError(`[Chronoverse ECB €STR] ${dataType} value is invalid.`);
    }

    const candidate = Object.freeze({ raw, timestamp, value });
    const previous = normalized.get(timestamp);

    if (previous !== undefined) {
      if (
        previous.value !== candidate.value ||
        previous.raw.seriesId !== candidate.raw.seriesId ||
        previous.raw.observationStatus !== candidate.raw.observationStatus ||
        previous.raw.confidentialityStatus !== candidate.raw.confidentialityStatus
      ) {
        throw new TypeError(
          "[Chronoverse ECB €STR] Conflicting duplicate observation exists.",
        );
      }

      continue;
    }

    normalized.set(timestamp, candidate);
  }

  return normalized;
}

function assertMatchedDates(
  timestamps: readonly number[],
  companion: ReadonlyMap<number, NormalizedRawObservation>,
  label: string,
): void {
  if (
    companion.size !== timestamps.length ||
    timestamps.some((timestamp) => !companion.has(timestamp))
  ) {
    throw new TypeError(`[Chronoverse ECB €STR] ${label} dates are inconsistent.`);
  }
}

function parseEcbEstrReferenceDate(period: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);

  if (match === null) {
    throw new TypeError("[Chronoverse ECB €STR] Reference date is invalid.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day) / 1000;
  const date = new Date(timestamp * 1000);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError("[Chronoverse ECB €STR] Reference date is invalid.");
  }

  return timestamp;
}

function createEcbEstrSeries(
  canonicalSeries: CanonicalObservationSeriesV1,
  observationMetadata: readonly EcbEstrObservationMetadataV1[],
): EcbEstrSeriesV1 {
  return Object.freeze({
    schemaVersion: ECB_ESTR_SCHEMA_VERSION_V1,
    dataflow: ECB_ESTR_DATAFLOW_V1,
    seriesKey: ECB_ESTR_SERIES_KEY_V1,
    canonicalSeries,
    observationMetadata: Object.freeze([...observationMetadata]),
  });
}

function validateEcbEstrSeriesIdentity(series: EcbEstrSeriesV1): void {
  const metadata = series.canonicalSeries.metadata;

  if (
    series.schemaVersion !== ECB_ESTR_SCHEMA_VERSION_V1 ||
    series.dataflow !== ECB_ESTR_DATAFLOW_V1 ||
    series.seriesKey !== ECB_ESTR_SERIES_KEY_V1 ||
    metadata.provider !== "ecb" ||
    metadata.source !== "European Central Bank" ||
    metadata.seriesId !== ECB_ESTR_SERIES_ID_V1 ||
    metadata.requestedProductId !== "estr" ||
    metadata.canonicalProductId !== "estr" ||
    metadata.interval !== "1d" ||
    metadata.status !== "end_of_day" ||
    metadata.unit !== "percent" ||
    metadata.seriesKind !== "reference-rate"
  ) {
    throw new TypeError("[Chronoverse ECB €STR] Canonical identity is invalid.");
  }
}
