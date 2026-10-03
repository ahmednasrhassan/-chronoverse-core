import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalSeriesInputV1,
} from "../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1,
  type CanonicalStatisticalSeriesSnapshotV1,
} from "../services/canonicalStatisticalSeriesMemory";
import { EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  buildEurostatSelectedSeriesSourceVersionIdV1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../providers/eurostat/macroSeries";
import {
  CanonicalStatisticalSeriesVintagePersistenceError,
  createCanonicalStatisticalSeriesVintageRedisAdapterV1,
  type CanonicalStatisticalSeriesVintageRedisDependencies,
  type CanonicalStatisticalVintageBindingV1,
} from "./canonicalStatisticalSeriesVintageRedis";
export type {
  CanonicalStatisticalSeriesVintageRedisReadHead as EurostatMacroSeriesVintageRedisReadHead,
  CanonicalStatisticalSeriesVintageRedisReadAsKnownAt as EurostatMacroSeriesVintageRedisReadAsKnownAt,
  CanonicalStatisticalSeriesVintageRedisExpectedHeadV1 as EurostatMacroSeriesVintageRedisExpectedHeadV1,
  CanonicalStatisticalSeriesVintageRedisCompareAndAppend as EurostatMacroSeriesVintageRedisCompareAndAppend,
  CanonicalStatisticalSeriesVintagePersistenceErrorCode as EurostatMacroSeriesVintagePersistenceErrorCode,
  AppendCanonicalStatisticalSeriesVintageRedisResultV1 as AppendEurostatMacroSeriesVintageRedisResultV1,
  ReadCanonicalStatisticalSeriesVintageRedisResultV1 as ReadEurostatMacroSeriesVintageRedisResultV1,
} from "./canonicalStatisticalSeriesVintageRedis";
import type {
  CanonicalStatisticalSeriesVintagePersistenceErrorCode,
  AppendCanonicalStatisticalSeriesVintageRedisResultV1,
  ReadCanonicalStatisticalSeriesVintageRedisResultV1,
} from "./canonicalStatisticalSeriesVintageRedis";

export class EurostatMacroSeriesVintagePersistenceError extends CanonicalStatisticalSeriesVintagePersistenceError {
  constructor(code: CanonicalStatisticalSeriesVintagePersistenceErrorCode, message: string) {
    super(code, message);
    this.name = "EurostatMacroSeriesVintagePersistenceError";
  }
}
export interface EurostatMacroSeriesVintageRedisAdapterV1 {
  readonly append: (family: EurostatEuroAreaMacroFamilyV1, series: CanonicalStatisticalSeriesInputV1) => Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
  readonly readAsKnownAt: (family: EurostatEuroAreaMacroFamilyV1, asOf: number) => Promise<ReadCanonicalStatisticalSeriesVintageRedisResultV1>;
}
const KEY_PREFIX = "chronoverse:markets:eurostat:macro-series-vintages-v1:";
export function buildEurostatMacroSeriesVintageRedisKeyV1(family: EurostatEuroAreaMacroFamilyV1): string {
  return `${KEY_PREFIX}${lockedSpec(family).canonicalSeriesId}`;
}
const messages: Record<CanonicalStatisticalSeriesVintagePersistenceErrorCode, string> = {
  "invalid-current": "Current Eurostat macro-series vintage or family is invalid.",
  "stored-snapshot-invalid": "Stored Eurostat macro vintage is invalid and was not changed.",
  "duplicate-score": "Stored Eurostat macro vintages contain a duplicate score.",
  "redis-failure": "Reading the Eurostat macro-vintage head from Redis failed.",
  "invalid-response": "Redis returned an invalid Eurostat macro-vintage response.",
  "concurrency-conflict": "Eurostat macro-vintage append retry limit was exhausted.",
};
const binding: CanonicalStatisticalVintageBindingV1 = {
  buildKey: (family) => buildEurostatMacroSeriesVintageRedisKeyV1(family as EurostatEuroAreaMacroFamilyV1),
  canonicalSeriesId: (family) => lockedSpec(family as EurostatEuroAreaMacroFamilyV1).canonicalSeriesId,
  validateCandidate: (family, series) => validateCandidate(family as EurostatEuroAreaMacroFamilyV1, series),
  isValidSnapshot: (family, snapshot) => isLockedSnapshot(family as EurostatEuroAreaMacroFamilyV1, snapshot),
  error: (code, message) => new EurostatMacroSeriesVintagePersistenceError(code,
    message === "Atomic canonical statistical-series-vintage append failed."
      ? "Atomic Eurostat macro-vintage append failed." : messages[code]),
};
export function createEurostatMacroSeriesVintageRedisAdapterV1(
  dependencies: CanonicalStatisticalSeriesVintageRedisDependencies,
): EurostatMacroSeriesVintageRedisAdapterV1 {
  return createCanonicalStatisticalSeriesVintageRedisAdapterV1(binding, dependencies);
}
const production = createCanonicalStatisticalSeriesVintageRedisAdapterV1(binding);
export function appendEurostatMacroSeriesVintageRedisV1(
  family: EurostatEuroAreaMacroFamilyV1, series: CanonicalStatisticalSeriesInputV1,
): Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1> {
  return production.append(family, series);
}
export function readEurostatMacroSeriesVintageAsKnownAtRedisV1(
  family: EurostatEuroAreaMacroFamilyV1, asOf: number,
): Promise<ReadCanonicalStatisticalSeriesVintageRedisResultV1> {
  return production.readAsKnownAt(family, asOf);
}

function validateCandidate(
  family: EurostatEuroAreaMacroFamilyV1,
  series: CanonicalStatisticalSeriesInputV1,
): CanonicalStatisticalSeriesSnapshotV1 {
  if (!hasExactLockedProvenance(family, series.metadata)) {
    throw new TypeError("Eurostat macro-series provenance is not locked.");
  }
  const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
  if (!isLockedSnapshot(family, snapshot)) {
    throw new TypeError("Eurostat macro-series candidate is not locked.");
  }
  return snapshot;
}

function hasExactLockedProvenance(
  family: EurostatEuroAreaMacroFamilyV1,
  metadata: CanonicalStatisticalSeriesInputV1["metadata"],
): boolean {
  const spec = lockedSpec(family);
  return metadata.provenanceVersion ===
      CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 &&
    metadata.provider === "eurostat" &&
    metadata.source === "Eurostat Statistics API" &&
    metadata.originalPublisher === "Eurostat" &&
    metadata.substitution?.status === "none" &&
    Object.keys(metadata.substitution).length === 1 &&
    metadata.canonicalSeriesId === spec.canonicalSeriesId &&
    metadata.sourceSeriesId === spec.sourceSeriesId &&
    metadata.sourceUrl === spec.sourceUrl &&
    metadata.frequency === spec.frequency &&
    metadata.unit === spec.unit &&
    metadata.releaseTimestamp === undefined;
}

function isLockedSnapshot(
  family: EurostatEuroAreaMacroFamilyV1,
  snapshot: CanonicalStatisticalSeriesSnapshotV1,
): boolean {
  const spec = lockedSpec(family);
  const { metadata, observations } = snapshot.series;
  if (
    observations.length === 0 ||
    snapshot.canonicalSeriesId !== spec.canonicalSeriesId ||
    snapshot.knownAt !== metadata.fetchedAt ||
    snapshot.sourceVersionId !== metadata.sourceVersionId ||
    metadata.provenanceVersion !==
      CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 ||
    metadata.provider !== "eurostat" ||
    metadata.source !== "Eurostat Statistics API" ||
    metadata.originalPublisher !== "Eurostat" ||
    metadata.substitution?.status !== "none" ||
    metadata.canonicalSeriesId !== spec.canonicalSeriesId ||
    metadata.sourceSeriesId !== spec.sourceSeriesId ||
    metadata.sourceUrl !== spec.sourceUrl ||
    metadata.frequency !== spec.frequency ||
    metadata.unit !== spec.unit ||
    metadata.releaseTimestamp !== undefined
  ) {
    return false;
  }
  return metadata.sourceVersionId ===
    buildEurostatSelectedSeriesSourceVersionIdV1(family, observations);
}

function lockedSpec(family: EurostatEuroAreaMacroFamilyV1) {
  if (
    !Object.prototype.hasOwnProperty.call(
      EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
      family,
    )
  ) {
    throw new TypeError("Invalid Eurostat macro family.");
  }
  return EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family];
}
