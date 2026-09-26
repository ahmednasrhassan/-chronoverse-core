import assert from "node:assert/strict";

import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  normalizeCanonicalStatisticalSeriesV1,
  type CanonicalStatisticalSeriesInputV1,
} from "../../services/canonicalObservationSeries";
import {
  CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1,
  CANONICAL_STATISTICAL_SERIES_SNAPSHOT_SCHEMA_VERSION_V1,
  advanceCanonicalStatisticalSeriesMemoryV1,
  buildCanonicalStatisticalSeriesSnapshotV1,
  parseCanonicalStatisticalSeriesMemoryV1,
  selectCanonicalStatisticalSeriesAsKnownAtV1,
} from "../../services/canonicalStatisticalSeriesMemory";

interface SeriesOptions {
  readonly canonicalSeriesId?: string;
  readonly sourceVersionId?: string;
  readonly fetchedAt?: number;
  readonly releaseTimestamp?: number;
  readonly value?: number;
}

function series(options: SeriesOptions = {}): CanonicalStatisticalSeriesInputV1 {
  const fetchedAt = options.fetchedAt ?? 200;
  return {
    observations: [
      { referencePeriod: "2026-07", value: options.value ?? 100 },
      { referencePeriod: "2026-08", value: 101 },
    ],
    metadata: {
      provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: "official-statistics-provider",
      source: "Official Statistics Publisher",
      originalPublisher: "Official Statistics Publisher",
      substitution: { status: "none" },
      canonicalSeriesId: options.canonicalSeriesId ?? "euro-area-hicp",
      sourceSeriesId: "OFFICIAL.HICP.SERIES",
      sourceUrl: "https://statistics.example.test/datasets/hicp",
      sourceVersionId: options.sourceVersionId ?? "version-1",
      frequency: "monthly",
      fetchedAt,
      ...(options.releaseTimestamp === undefined
        ? {}
        : { releaseTimestamp: options.releaseTimestamp }),
      unit: "index",
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const firstSnapshot = buildCanonicalStatisticalSeriesSnapshotV1(series({
  fetchedAt: 100,
  releaseTimestamp: 50,
}));
assert.equal(firstSnapshot.schemaVersion,
  CANONICAL_STATISTICAL_SERIES_SNAPSHOT_SCHEMA_VERSION_V1);
assert.equal(firstSnapshot.knownAt, 100,
  "knownAt is derived from fetchedAt, not official release time");
assert.equal(firstSnapshot.sourceVersionId, "version-1");
assert.equal(Object.isFrozen(firstSnapshot), true);
assert.equal(Object.isFrozen(firstSnapshot.series), true);
assert.equal(Object.isFrozen(firstSnapshot.series.metadata), true);
assert.equal(Object.isFrozen(firstSnapshot.series.observations), true);

const initialized = advanceCanonicalStatisticalSeriesMemoryV1(
  null,
  series({ fetchedAt: 100, releaseTimestamp: 50 }),
);
assert.equal(initialized.status, "initialized");
let memory = initialized.memory;
assert.equal(memory.schemaVersion,
  CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1);
assert.equal(memory.canonicalSeriesId, "euro-area-hicp");
assert.equal(memory.snapshots.length, 1);
assert.equal(Object.isFrozen(memory), true);
assert.equal(Object.isFrozen(memory.snapshots), true);

const sameTimeSameVersion = advanceCanonicalStatisticalSeriesMemoryV1(
  memory,
  series({ fetchedAt: 100 }),
);
assert.equal(sameTimeSameVersion.status, "unchanged");
assert.equal(sameTimeSameVersion.memory, memory);

const sameTimeDifferentVersion = advanceCanonicalStatisticalSeriesMemoryV1(
  memory,
  series({ fetchedAt: 100, sourceVersionId: "version-conflict" }),
);
assert.equal(sameTimeDifferentVersion.status, "conflict");
assert.equal(sameTimeDifferentVersion.memory, memory);
assert.equal(memory.snapshots.length, 1, "conflict does not mutate history");

const laterSameVersion = advanceCanonicalStatisticalSeriesMemoryV1(
  memory,
  series({ fetchedAt: 150, value: 999 }),
);
assert.equal(laterSameVersion.status, "unchanged");
assert.equal(laterSameVersion.memory, memory);
assert.equal(memory.snapshots.length, 1,
  "same source-version identity does not append duplicate source state");

const stale = advanceCanonicalStatisticalSeriesMemoryV1(
  memory,
  series({ fetchedAt: 99, sourceVersionId: "version-stale" }),
);
assert.equal(stale.status, "stale");
assert.equal(stale.memory, memory);

const mismatch = advanceCanonicalStatisticalSeriesMemoryV1(
  memory,
  series({
    canonicalSeriesId: "euro-area-unemployment",
    fetchedAt: 200,
    sourceVersionId: "unemployment-version-1",
  }),
);
assert.equal(mismatch.status, "series-id-mismatch");
assert.equal(mismatch.memory, memory);

const advanced = advanceCanonicalStatisticalSeriesMemoryV1(
  memory,
  series({ fetchedAt: 200, sourceVersionId: "version-2", value: 102 }),
);
assert.equal(advanced.status, "advanced");
assert.equal(advanced.memory.snapshots.length, 2);
assert.equal(memory.snapshots.length, 1, "advancement preserves prior memory");
memory = advanced.memory;
assert.equal(memory.snapshots[0]!.series.observations[0]!.value, 100);
assert.equal(memory.snapshots[1]!.series.observations[0]!.value, 102,
  "revision is preserved in a later source vintage");

assert.equal(
  selectCanonicalStatisticalSeriesAsKnownAtV1(memory, 99),
  null,
  "nothing is selected before the first knowledge boundary",
);
assert.equal(
  selectCanonicalStatisticalSeriesAsKnownAtV1(memory, 100)?.sourceVersionId,
  "version-1",
);
assert.equal(
  selectCanonicalStatisticalSeriesAsKnownAtV1(memory, 199)?.sourceVersionId,
  "version-1",
  "later revision does not leak into an earlier replay",
);
assert.equal(
  selectCanonicalStatisticalSeriesAsKnownAtV1(memory, 200)?.sourceVersionId,
  "version-2",
);
assert.throws(
  () => selectCanonicalStatisticalSeriesAsKnownAtV1(memory, -1),
  /Invalid canonical statistical-series asOf/,
);

const parsed = parseCanonicalStatisticalSeriesMemoryV1(clone(memory));
assert.notEqual(parsed, null);
assert.equal(Object.isFrozen(parsed), true);
assert.equal(Object.isFrozen(parsed?.snapshots), true);
assert.equal(Object.isFrozen(parsed?.snapshots[0]), true);
assert.equal(Object.isFrozen(parsed?.snapshots[0]?.series), true);
assert.deepEqual(parsed, memory);

const wrongSchema = clone(memory) as unknown as Record<string, unknown>;
wrongSchema.schemaVersion = "wrong-schema";
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(wrongSchema), null);

const emptyIdentity = clone(memory) as unknown as {
  canonicalSeriesId: string;
};
emptyIdentity.canonicalSeriesId = " ";
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(emptyIdentity), null);

const emptySourceVersion = clone(memory) as unknown as {
  snapshots: Array<{ sourceVersionId: string }>;
};
emptySourceVersion.snapshots[0]!.sourceVersionId = "";
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(emptySourceVersion), null);

const malformedSnapshot = clone(memory) as unknown as {
  snapshots: Array<{ schemaVersion: string }>;
};
malformedSnapshot.snapshots[0]!.schemaVersion = "wrong-snapshot";
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(malformedSnapshot), null);

const nonMonotonic = clone(memory) as unknown as {
  snapshots: Array<{ knownAt: number }>;
};
nonMonotonic.snapshots.reverse();
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(nonMonotonic), null);

const duplicateKnownAt = clone(memory) as unknown as {
  snapshots: Array<{ knownAt: number }>;
};
duplicateKnownAt.snapshots[1]!.knownAt = duplicateKnownAt.snapshots[0]!.knownAt;
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(duplicateKnownAt), null);

const snapshotIdentityMismatch = clone(memory) as unknown as {
  snapshots: Array<{ canonicalSeriesId: string }>;
};
snapshotIdentityMismatch.snapshots[0]!.canonicalSeriesId = "other-series";
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(snapshotIdentityMismatch), null);

const sourceVersionMismatch = clone(memory) as unknown as {
  snapshots: Array<{ sourceVersionId: string }>;
};
sourceVersionMismatch.snapshots[0]!.sourceVersionId = "forged-version";
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(sourceVersionMismatch), null);

const malformedSeries = clone(memory) as unknown as {
  snapshots: Array<{
    series: { observations: Array<{ referencePeriod: string }> };
  }>;
};
malformedSeries.snapshots[0]!.series.observations[0]!.referencePeriod = "2026-Q3";
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(malformedSeries), null);

const wrongKnownAt = clone(memory) as unknown as {
  snapshots: Array<{ knownAt: number }>;
};
wrongKnownAt.snapshots[0]!.knownAt += 1;
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(wrongKnownAt), null);

const nonCanonicalSeries = clone(memory) as unknown as {
  snapshots: Array<{
    series: { observations: Array<{ referencePeriod: string }> };
  }>;
};
nonCanonicalSeries.snapshots[0]!.series.observations.reverse();
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(nonCanonicalSeries), null);

const normalizedForVersionCheck = normalizeCanonicalStatisticalSeriesV1(
  series({ fetchedAt: 300, sourceVersionId: "version-3" }),
);
const forgedContainedVersion = clone(memory) as unknown as {
  snapshots: Array<{
    sourceVersionId: string;
    series: { metadata: { sourceVersionId: string } };
  }>;
};
forgedContainedVersion.snapshots[0]!.sourceVersionId =
  normalizedForVersionCheck.metadata.sourceVersionId;
assert.equal(parseCanonicalStatisticalSeriesMemoryV1(forgedContainedVersion), null);

console.log("PASS: Canonical Statistical Series Memory V1");
