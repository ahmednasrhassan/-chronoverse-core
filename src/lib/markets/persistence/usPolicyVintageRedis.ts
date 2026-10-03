import { buildCanonicalStatisticalSeriesSnapshotV1, type CanonicalStatisticalSeriesSnapshotV1 } from "../services/canonicalStatisticalSeriesMemory";
import type { CanonicalStatisticalSeriesInputV1 } from "../services/canonicalObservationSeries";
import { assertUsPolicyServerV1 } from "../providers/federalReserve/transport";
import { getUsPolicySpecV1, readUsPolicyFactsV1, buildUsPolicySourceVersionIdV1, type UsPolicyFamilyV1 } from "../providers/federalReserve/canonical";
import { CanonicalStatisticalSeriesVintagePersistenceError, createCanonicalStatisticalSeriesVintageRedisAdapterV1,
  type CanonicalStatisticalSeriesVintageRedisDependencies, type CanonicalStatisticalSeriesVintagePersistenceErrorCode,
  type CanonicalStatisticalVintageBindingV1, type AppendCanonicalStatisticalSeriesVintageRedisResultV1,
  type ReadCanonicalStatisticalSeriesVintageRedisResultV1,
} from "./canonicalStatisticalSeriesVintageRedis";

export class UsPolicyVintagePersistenceError extends CanonicalStatisticalSeriesVintagePersistenceError {
  constructor(code: CanonicalStatisticalSeriesVintagePersistenceErrorCode) {
    super(code, `U.S. policy vintage persistence failed: ${code}.`); this.name = "UsPolicyVintagePersistenceError";
  }
}
export function buildUsPolicyVintageKeyV1(family: UsPolicyFamilyV1): string {
  const spec = getUsPolicySpecV1(family);
  return `chronoverse:markets:${spec.provider}:evidence-vintages-v1:${spec.canonicalSeriesId}`;
}
function valid(family: UsPolicyFamilyV1, snapshot: CanonicalStatisticalSeriesSnapshotV1): boolean {
  try {
    readUsPolicyFactsV1(family, snapshot.series);
    return snapshot.knownAt === snapshot.series.metadata.fetchedAt && snapshot.canonicalSeriesId === snapshot.series.metadata.canonicalSeriesId &&
      snapshot.sourceVersionId === snapshot.series.metadata.sourceVersionId &&
      snapshot.sourceVersionId === buildUsPolicySourceVersionIdV1(family, snapshot.series);
  } catch { return false; }
}
const binding: CanonicalStatisticalVintageBindingV1 = {
  buildKey: (family) => buildUsPolicyVintageKeyV1(family as UsPolicyFamilyV1),
  canonicalSeriesId: (family) => getUsPolicySpecV1(family as UsPolicyFamilyV1).canonicalSeriesId,
  validateCandidate: (family, series) => {
    readUsPolicyFactsV1(family as UsPolicyFamilyV1, series);
    const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
    if (!valid(family as UsPolicyFamilyV1, snapshot)) throw new UsPolicyVintagePersistenceError("invalid-current");
    return snapshot;
  },
  isValidSnapshot: (family, snapshot) => valid(family as UsPolicyFamilyV1, snapshot),
  error: (code) => new UsPolicyVintagePersistenceError(code),
};
export interface UsPolicyVintageAdapterV1 {
  readonly append: (family: UsPolicyFamilyV1, series: CanonicalStatisticalSeriesInputV1) => Promise<AppendCanonicalStatisticalSeriesVintageRedisResultV1>;
  readonly readAsKnownAt: (family: UsPolicyFamilyV1, asOf: number) => Promise<ReadCanonicalStatisticalSeriesVintageRedisResultV1>;
}
/** The established generic engine remains unchanged; no production instance or env wiring. */
export function createUsPolicyVintageAdapterV1(dependencies: CanonicalStatisticalSeriesVintageRedisDependencies): UsPolicyVintageAdapterV1 {
  assertUsPolicyServerV1();
  async function run<T>(operation: (adapter: ReturnType<typeof createCanonicalStatisticalSeriesVintageRedisAdapterV1>) => Promise<T>): Promise<T> {
    assertUsPolicyServerV1(); let defect: TypeError | ReferenceError | undefined;
    const capture = async (operation: () => Promise<unknown>) => {
      try { return await operation(); } catch (error) {
        if (error instanceof TypeError || error instanceof ReferenceError) defect = error; throw error;
      }
    };
    const adapter = createCanonicalStatisticalSeriesVintageRedisAdapterV1(binding, {
      readHead: (key) => capture(() => dependencies.readHead(key)),
      readAsKnownAt: (key, asOf) => capture(() => dependencies.readAsKnownAt(key, asOf)),
      compareAndAppend: (key, expected, score, member) => capture(() => dependencies.compareAndAppend(key, expected, score, member)),
    });
    try { const result = await operation(adapter); if (defect !== undefined) throw defect; return result; }
    catch (error) { throw defect ?? error; }
  }
  return Object.freeze({
    append: (family: UsPolicyFamilyV1, series: CanonicalStatisticalSeriesInputV1) => run((adapter) => adapter.append(family, series)),
    readAsKnownAt: (family: UsPolicyFamilyV1, asOf: number) => run((adapter) => adapter.readAsKnownAt(family, asOf)),
  });
}