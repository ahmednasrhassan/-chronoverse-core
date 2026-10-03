import { CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1, type CanonicalStatisticalSeriesInputV1 } from "../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1, type CanonicalStatisticalSeriesSnapshotV1 } from "../services/canonicalStatisticalSeriesMemory";
import { assertBeaServerV1 } from "../providers/bea/client";
import { getBeaMacroSourceSpecV1, validateBeaFactsV1, buildBeaSelectedSeriesSourceVersionIdV1, type BeaMacroFamilyV1 } from "../providers/bea/macroSeries";
import { CanonicalStatisticalSeriesVintagePersistenceError, createCanonicalStatisticalSeriesVintageRedisAdapterV1,
  type CanonicalStatisticalSeriesVintageRedisDependencies, type CanonicalStatisticalSeriesVintagePersistenceErrorCode,
  type CanonicalStatisticalVintageBindingV1, type AppendCanonicalStatisticalSeriesVintageRedisResultV1,
  type ReadCanonicalStatisticalSeriesVintageRedisResultV1,
} from "./canonicalStatisticalSeriesVintageRedis";

export class BeaMacroSeriesVintagePersistenceError extends CanonicalStatisticalSeriesVintagePersistenceError {
  constructor(code: CanonicalStatisticalSeriesVintagePersistenceErrorCode) {
    super(code, `BEA vintage persistence failed: ${code}.`);
    this.name = "BeaMacroSeriesVintagePersistenceError";
  }
}
export interface BeaMacroSeriesVintageRedisAdapterV1 {
  readonly append: (family: BeaMacroFamilyV1, series: CanonicalStatisticalSeriesInputV1) => Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
  readonly readAsKnownAt: (family: BeaMacroFamilyV1, asOf: number) => Promise<ReadCanonicalStatisticalSeriesVintageRedisResultV1>;
}
export function buildBeaMacroSeriesVintageRedisKeyV1(family: BeaMacroFamilyV1): string {
  return `chronoverse:markets:bea:macro-series-vintages-v1:${getBeaMacroSourceSpecV1(family).canonicalSeriesId}`;
}
function isLockedMetadata(family: BeaMacroFamilyV1, metadata: CanonicalStatisticalSeriesInputV1["metadata"]): boolean {
  const spec = getBeaMacroSourceSpecV1(family);
  return metadata.provenanceVersion === CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 && metadata.provider === spec.provider &&
    metadata.source === spec.source && metadata.originalPublisher === spec.originalPublisher &&
    metadata.substitution?.status === "none" && Object.keys(metadata.substitution).length === 1 &&
    metadata.canonicalSeriesId === spec.canonicalSeriesId && metadata.sourceSeriesId === spec.sourceSeriesId &&
    metadata.sourceUrl === spec.sourceUrl && metadata.frequency === spec.frequency && !Object.hasOwn(metadata, "releaseTimestamp");
}
function isLockedSnapshot(family: BeaMacroFamilyV1, snapshot: CanonicalStatisticalSeriesSnapshotV1): boolean {
  try {
    const { metadata, observations } = snapshot.series;
    if (!isLockedMetadata(family, metadata)) return false;
    const facts = validateBeaFactsV1(family, { unit: metadata.unit, observations });
    return snapshot.canonicalSeriesId === metadata.canonicalSeriesId && snapshot.knownAt === metadata.fetchedAt &&
      snapshot.sourceVersionId === metadata.sourceVersionId &&
      metadata.sourceVersionId === buildBeaSelectedSeriesSourceVersionIdV1(family, facts);
  } catch { return false; }
}
const binding: CanonicalStatisticalVintageBindingV1 = {
  buildKey: (family) => buildBeaMacroSeriesVintageRedisKeyV1(family as BeaMacroFamilyV1),
  canonicalSeriesId: (family) => getBeaMacroSourceSpecV1(family as BeaMacroFamilyV1).canonicalSeriesId,
  validateCandidate: (family, series) => {
    if (!isLockedMetadata(family as BeaMacroFamilyV1, series.metadata)) throw new BeaMacroSeriesVintagePersistenceError("invalid-current");
    validateBeaFactsV1(family as BeaMacroFamilyV1, { unit: series.metadata.unit, observations: series.observations });
    const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
    if (!isLockedSnapshot(family as BeaMacroFamilyV1, snapshot)) throw new BeaMacroSeriesVintagePersistenceError("invalid-current");
    return snapshot;
  },
  isValidSnapshot: (family, snapshot) => isLockedSnapshot(family as BeaMacroFamilyV1, snapshot),
  error: (code) => new BeaMacroSeriesVintagePersistenceError(code),
};

/** Dependency-only binding; no production instance, environment reads or Redis work on import. */
export function createBeaMacroSeriesVintageRedisAdapterV1(dependencies: CanonicalStatisticalSeriesVintageRedisDependencies): BeaMacroSeriesVintageRedisAdapterV1 {
  assertBeaServerV1();
  // Preserve injected programming defects without changing the shared vintage engine.
  async function run<T>(operation: (adapter: ReturnType<typeof createCanonicalStatisticalSeriesVintageRedisAdapterV1>) => Promise<T>): Promise<T> {
    assertBeaServerV1();
    let defect: TypeError | ReferenceError | undefined;
    const capture = async (operation: () => Promise<unknown>) => {
      try { return await operation(); }
      catch (error) {
        if (error instanceof TypeError || error instanceof ReferenceError) defect = error;
        throw error;
      }
    };
    const adapter = createCanonicalStatisticalSeriesVintageRedisAdapterV1(binding, {
      readHead: (key) => capture(() => dependencies.readHead(key)),
      readAsKnownAt: (key, asOf) => capture(() => dependencies.readAsKnownAt(key, asOf)),
      compareAndAppend: (key, expected, score, member) => capture(() => dependencies.compareAndAppend(key, expected, score, member)),
    });
    try {
      const result = await operation(adapter);
      if (defect !== undefined) throw defect;
      return result;
    } catch (error) { throw defect ?? error; }
  }
  return Object.freeze({
    append: (family: BeaMacroFamilyV1, series: CanonicalStatisticalSeriesInputV1) => run((adapter) => adapter.append(family, series)),
    readAsKnownAt: (family: BeaMacroFamilyV1, asOf: number) => run((adapter) => adapter.readAsKnownAt(family, asOf)),
  });
}