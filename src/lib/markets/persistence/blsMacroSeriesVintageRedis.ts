import { CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  type CanonicalStatisticalSeriesInputV1,
} from "../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1,
  type CanonicalStatisticalSeriesSnapshotV1,
} from "../services/canonicalStatisticalSeriesMemory";
import { assertBlsMacroFamilyV1, BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1,
  buildBlsSelectedSeriesSourceVersionIdV1, isBlsOfficialStatusV1,
  type BlsMacroFamilyV1,
} from "../providers/bls/macroSeries";
import {
  CanonicalStatisticalSeriesVintagePersistenceError,
  createCanonicalStatisticalSeriesVintageRedisAdapterV1,
  type CanonicalStatisticalSeriesVintageRedisDependencies,
  type CanonicalStatisticalSeriesVintagePersistenceErrorCode,
  type CanonicalStatisticalVintageBindingV1,
  type AppendCanonicalStatisticalSeriesVintageRedisResultV1,
  type ReadCanonicalStatisticalSeriesVintageRedisResultV1,
} from "./canonicalStatisticalSeriesVintageRedis";

export type AppendBlsMacroSeriesVintageRedisResultV1 = AppendCanonicalStatisticalSeriesVintageRedisResultV1;
export type ReadBlsMacroSeriesVintageRedisResultV1 = ReadCanonicalStatisticalSeriesVintageRedisResultV1;
export class BlsMacroSeriesVintagePersistenceError extends CanonicalStatisticalSeriesVintagePersistenceError {
  constructor(code: CanonicalStatisticalSeriesVintagePersistenceErrorCode) {
    super(code, `BLS vintage persistence failed: ${code}.`);
    this.name = "BlsMacroSeriesVintagePersistenceError";
  }
}
export interface BlsMacroSeriesVintageRedisAdapterV1 {
  readonly append: (family: BlsMacroFamilyV1, series: CanonicalStatisticalSeriesInputV1) => Promise<AppendBlsMacroSeriesVintageRedisResultV1>;
  readonly readAsKnownAt: (family: BlsMacroFamilyV1, asOf: number) => Promise<ReadBlsMacroSeriesVintageRedisResultV1>;
}

export function buildBlsMacroSeriesVintageRedisKeyV1(family: BlsMacroFamilyV1): string {
  assertBlsMacroFamilyV1(family);
  return `chronoverse:markets:bls:macro-series-vintages-v1:${BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1.canonicalSeriesId}`;
}

function isLockedMetadata(metadata: CanonicalStatisticalSeriesInputV1["metadata"]): boolean {
  const spec = BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1;
  return metadata.provenanceVersion === CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 &&
    metadata.provider === spec.provider && metadata.source === spec.source &&
    metadata.originalPublisher === spec.originalPublisher &&
    metadata.substitution?.status === "none" && Object.keys(metadata.substitution).length === 1 &&
    metadata.canonicalSeriesId === spec.canonicalSeriesId && metadata.sourceSeriesId === spec.sourceSeriesId &&
    metadata.sourceUrl === spec.sourceUrl && metadata.frequency === spec.frequency &&
    metadata.unit === spec.unit && metadata.releaseTimestamp === undefined;
}

function isLockedSnapshot(family: BlsMacroFamilyV1, snapshot: CanonicalStatisticalSeriesSnapshotV1): boolean {
  assertBlsMacroFamilyV1(family);
  const { metadata, observations } = snapshot.series;
  return isLockedMetadata(metadata) && observations.length > 0 &&
    observations.every((entry) => isBlsOfficialStatusV1(entry.officialStatus)) &&
    snapshot.canonicalSeriesId === metadata.canonicalSeriesId && snapshot.knownAt === metadata.fetchedAt &&
    snapshot.sourceVersionId === metadata.sourceVersionId &&
    metadata.sourceVersionId === buildBlsSelectedSeriesSourceVersionIdV1(family, observations);
}

const binding: CanonicalStatisticalVintageBindingV1 = {
  buildKey: (family) => buildBlsMacroSeriesVintageRedisKeyV1(family as BlsMacroFamilyV1),
  canonicalSeriesId: (family) => {
    assertBlsMacroFamilyV1(family as BlsMacroFamilyV1);
    return BLS_CPI_ALL_ITEMS_NSA_SOURCE_SPEC_V1.canonicalSeriesId;
  },
  validateCandidate: (family, series) => {
    assertBlsMacroFamilyV1(family as BlsMacroFamilyV1);
    if (!isLockedMetadata(series.metadata)) throw new BlsMacroSeriesVintagePersistenceError("invalid-current");
    const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
    if (!isLockedSnapshot(family as BlsMacroFamilyV1, snapshot)) throw new BlsMacroSeriesVintagePersistenceError("invalid-current");
    return snapshot;
  },
  isValidSnapshot: (family, snapshot) => isLockedSnapshot(family as BlsMacroFamilyV1, snapshot),
  error: (code) => new BlsMacroSeriesVintagePersistenceError(code),
};

export function createBlsMacroSeriesVintageRedisAdapterV1(
  dependencies: CanonicalStatisticalSeriesVintageRedisDependencies,
): BlsMacroSeriesVintageRedisAdapterV1 {
  return createCanonicalStatisticalSeriesVintageRedisAdapterV1(binding, dependencies);
}
const production = createCanonicalStatisticalSeriesVintageRedisAdapterV1(binding);
export function appendBlsMacroSeriesVintageRedisV1(
  family: BlsMacroFamilyV1, series: CanonicalStatisticalSeriesInputV1,
): Promise<AppendBlsMacroSeriesVintageRedisResultV1> {
  return production.append(family, series);
}
export function readBlsMacroSeriesVintageAsKnownAtRedisV1(
  family: BlsMacroFamilyV1, asOf: number,
): Promise<ReadBlsMacroSeriesVintageRedisResultV1> {
  return production.readAsKnownAt(family, asOf);
}
