import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1,
  normalizeCanonicalStatisticalSeriesV1,
  type CanonicalSourceSubstitutionV1,
  type CanonicalStatisticalFrequencyV1,
  type CanonicalStatisticalObservationValueV1,
  type CanonicalStatisticalSeriesInputV1,
  type CanonicalStatisticalSeriesMetadataV1,
  type CanonicalStatisticalSeriesV1,
} from "./canonicalObservationSeries";

export const CANONICAL_STATISTICAL_SERIES_SNAPSHOT_SCHEMA_VERSION_V1 =
  "canonical-statistical-series-snapshot-v1" as const;
export const CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1 =
  "canonical-statistical-series-memory-v1" as const;

export interface CanonicalStatisticalSeriesSnapshotV1 {
  readonly schemaVersion:
    typeof CANONICAL_STATISTICAL_SERIES_SNAPSHOT_SCHEMA_VERSION_V1;
  readonly canonicalSeriesId: string;
  /** Unix seconds at which Chronoverse possessed this complete source state. */
  readonly knownAt: number;
  readonly sourceVersionId: string;
  readonly series: CanonicalStatisticalSeriesV1;
}

export interface CanonicalStatisticalSeriesMemoryV1 {
  readonly schemaVersion:
    typeof CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1;
  readonly canonicalSeriesId: string;
  readonly snapshots: readonly CanonicalStatisticalSeriesSnapshotV1[];
}

export type AdvanceCanonicalStatisticalSeriesMemoryResultV1 =
  | {
      readonly status: "initialized";
      readonly memory: CanonicalStatisticalSeriesMemoryV1;
      readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "advanced";
      readonly memory: CanonicalStatisticalSeriesMemoryV1;
      readonly previous: CanonicalStatisticalSeriesSnapshotV1;
      readonly snapshot: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "unchanged";
      readonly memory: CanonicalStatisticalSeriesMemoryV1;
      readonly latest: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "stale";
      readonly memory: CanonicalStatisticalSeriesMemoryV1;
      readonly latest: CanonicalStatisticalSeriesSnapshotV1;
      readonly candidate: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "conflict";
      readonly memory: CanonicalStatisticalSeriesMemoryV1;
      readonly latest: CanonicalStatisticalSeriesSnapshotV1;
      readonly candidate: CanonicalStatisticalSeriesSnapshotV1;
    }
  | {
      readonly status: "series-id-mismatch";
      readonly memory: CanonicalStatisticalSeriesMemoryV1;
      readonly expectedCanonicalSeriesId: string;
      readonly candidateCanonicalSeriesId: string;
    };

/** fetchedAt is the conservative no-lookahead boundary for this source state. */
export function buildCanonicalStatisticalSeriesSnapshotV1(
  input: CanonicalStatisticalSeriesInputV1,
): CanonicalStatisticalSeriesSnapshotV1 {
  const series = normalizeCanonicalStatisticalSeriesV1(input);
  const knownAt = assertCaptureTime(series.metadata.fetchedAt, "knownAt");

  return Object.freeze({
    schemaVersion: CANONICAL_STATISTICAL_SERIES_SNAPSHOT_SCHEMA_VERSION_V1,
    canonicalSeriesId: series.metadata.canonicalSeriesId,
    knownAt,
    sourceVersionId: series.metadata.sourceVersionId,
    series,
  });
}

export function advanceCanonicalStatisticalSeriesMemoryV1(
  memory: CanonicalStatisticalSeriesMemoryV1 | null,
  input: CanonicalStatisticalSeriesInputV1,
): AdvanceCanonicalStatisticalSeriesMemoryResultV1 {
  const candidate = buildCanonicalStatisticalSeriesSnapshotV1(input);

  if (memory === null) {
    const initialized = freezeMemory(candidate.canonicalSeriesId, [candidate]);
    return Object.freeze({
      status: "initialized",
      memory: initialized,
      snapshot: candidate,
    });
  }

  assertMemory(memory);
  if (candidate.canonicalSeriesId !== memory.canonicalSeriesId) {
    return Object.freeze({
      status: "series-id-mismatch",
      memory,
      expectedCanonicalSeriesId: memory.canonicalSeriesId,
      candidateCanonicalSeriesId: candidate.canonicalSeriesId,
    });
  }

  const latest = memory.snapshots[memory.snapshots.length - 1]!;
  if (candidate.knownAt < latest.knownAt) {
    return Object.freeze({
      status: "stale",
      memory,
      latest,
      candidate,
    });
  }

  if (candidate.knownAt === latest.knownAt) {
    return candidate.sourceVersionId === latest.sourceVersionId
      ? Object.freeze({ status: "unchanged", memory, latest })
      : Object.freeze({ status: "conflict", memory, latest, candidate });
  }

  if (candidate.sourceVersionId === latest.sourceVersionId) {
    return Object.freeze({ status: "unchanged", memory, latest });
  }

  const advanced = freezeMemory(memory.canonicalSeriesId, [
    ...memory.snapshots,
    candidate,
  ]);
  return Object.freeze({
    status: "advanced",
    memory: advanced,
    previous: latest,
    snapshot: candidate,
  });
}

/** Parse persisted history without trusting its structure or normalization. */
export function parseCanonicalStatisticalSeriesMemoryV1(
  value: unknown,
): CanonicalStatisticalSeriesMemoryV1 | null {
  try {
    if (
      !isRecord(value) ||
      value.schemaVersion !==
        CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1 ||
      !isNonEmptyString(value.canonicalSeriesId) ||
      value.canonicalSeriesId !== value.canonicalSeriesId.trim() ||
      !Array.isArray(value.snapshots) ||
      value.snapshots.length === 0
    ) {
      return null;
    }

    const snapshots: CanonicalStatisticalSeriesSnapshotV1[] = [];
    let previousKnownAt = -1;

    for (const candidate of value.snapshots) {
      const snapshot = parseSnapshot(candidate, value.canonicalSeriesId);
      if (snapshot === null || snapshot.knownAt <= previousKnownAt) {
        return null;
      }
      snapshots.push(snapshot);
      previousKnownAt = snapshot.knownAt;
    }

    return freezeMemory(value.canonicalSeriesId, snapshots);
  } catch {
    return null;
  }
}

/** Return only a source state Chronoverse possessed by the explicit boundary. */
export function selectCanonicalStatisticalSeriesAsKnownAtV1(
  memory: CanonicalStatisticalSeriesMemoryV1,
  asOf: number,
): CanonicalStatisticalSeriesSnapshotV1 | null {
  assertMemory(memory);
  assertCaptureTime(asOf, "asOf");

  for (let index = memory.snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = memory.snapshots[index]!;
    if (snapshot.knownAt <= asOf) return snapshot;
  }

  return null;
}

function freezeMemory(
  canonicalSeriesId: string,
  snapshots: readonly CanonicalStatisticalSeriesSnapshotV1[],
): CanonicalStatisticalSeriesMemoryV1 {
  return Object.freeze({
    schemaVersion: CANONICAL_STATISTICAL_SERIES_MEMORY_SCHEMA_VERSION_V1,
    canonicalSeriesId,
    snapshots: Object.freeze([...snapshots]),
  });
}

function parseSnapshot(
  value: unknown,
  canonicalSeriesId: string,
): CanonicalStatisticalSeriesSnapshotV1 | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !==
      CANONICAL_STATISTICAL_SERIES_SNAPSHOT_SCHEMA_VERSION_V1 ||
    value.canonicalSeriesId !== canonicalSeriesId ||
    !Number.isSafeInteger(value.knownAt) ||
    (value.knownAt as number) < 0 ||
    !isNonEmptyString(value.sourceVersionId) ||
    value.sourceVersionId !== value.sourceVersionId.trim()
  ) {
    return null;
  }

  const series = parseCanonicalStatisticalSeries(value.series);
  if (
    series === null ||
    series.metadata.canonicalSeriesId !== canonicalSeriesId ||
    series.metadata.sourceVersionId !== value.sourceVersionId
  ) {
    return null;
  }

  const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
  return snapshot.knownAt === value.knownAt ? snapshot : null;
}

function parseCanonicalStatisticalSeries(
  value: unknown,
): CanonicalStatisticalSeriesV1 | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1 ||
    !Array.isArray(value.observations) ||
    !isRecord(value.metadata)
  ) {
    return null;
  }

  const metadata = parseMetadata(value.metadata);
  if (metadata === null) return null;

  const observations: CanonicalStatisticalObservationValueV1[] = [];
  for (const observation of value.observations) {
    if (
      !isRecord(observation) ||
      typeof observation.referencePeriod !== "string" ||
      typeof observation.value !== "number" ||
      (observation.officialStatus !== undefined &&
        typeof observation.officialStatus !== "string")
    ) {
      return null;
    }
    observations.push({
      referencePeriod: observation.referencePeriod,
      value: observation.value,
      ...(observation.officialStatus === undefined
        ? {}
        : { officialStatus: observation.officialStatus }),
    });
  }

  const normalized = normalizeCanonicalStatisticalSeriesV1({
    observations,
    metadata,
  });
  return sameCanonicalSeries(normalized, value) ? normalized : null;
}

function parseMetadata(
  value: Record<string, unknown>,
): CanonicalStatisticalSeriesMetadataV1 | null {
  if (
    (value.provenanceVersion !== undefined &&
      value.provenanceVersion !== CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1) ||
    typeof value.provider !== "string" ||
    typeof value.source !== "string" ||
    (value.originalPublisher !== undefined &&
      typeof value.originalPublisher !== "string") ||
    typeof value.canonicalSeriesId !== "string" ||
    typeof value.sourceSeriesId !== "string" ||
    typeof value.sourceUrl !== "string" ||
    typeof value.sourceVersionId !== "string" ||
    !isStatisticalFrequency(value.frequency) ||
    typeof value.fetchedAt !== "number" ||
    (value.releaseTimestamp !== undefined &&
      typeof value.releaseTimestamp !== "number") ||
    typeof value.unit !== "string"
  ) {
    return null;
  }

  const substitution = parseSubstitution(value.substitution);
  if (substitution === null) return null;

  return {
    ...(value.provenanceVersion === undefined
      ? {}
      : { provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1 }),
    provider: value.provider,
    source: value.source,
    ...(value.originalPublisher === undefined
      ? {}
      : { originalPublisher: value.originalPublisher }),
    ...(substitution === undefined ? {} : { substitution }),
    canonicalSeriesId: value.canonicalSeriesId,
    sourceSeriesId: value.sourceSeriesId,
    sourceUrl: value.sourceUrl,
    sourceVersionId: value.sourceVersionId,
    frequency: value.frequency,
    fetchedAt: value.fetchedAt,
    ...(value.releaseTimestamp === undefined
      ? {}
      : { releaseTimestamp: value.releaseTimestamp }),
    unit: value.unit,
  };
}

function parseSubstitution(
  value: unknown,
): CanonicalSourceSubstitutionV1 | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  if (value.status === "none" || value.status === "unknown") {
    return { status: value.status };
  }
  if (
    value.status === "substituted" &&
    typeof value.provider === "string" &&
    typeof value.source === "string"
  ) {
    return {
      status: "substituted",
      provider: value.provider,
      source: value.source,
    };
  }
  return null;
}

function sameCanonicalSeries(
  normalized: CanonicalStatisticalSeriesV1,
  raw: Record<string, unknown>,
): boolean {
  if (!isRecord(raw.metadata) || !Array.isArray(raw.observations)) return false;
  const metadata = normalized.metadata;
  const rawMetadata = raw.metadata;
  const rawObservations = raw.observations;
  const substitutionMatches = sameSubstitution(
    metadata.substitution,
    rawMetadata.substitution,
  );
  const sameMetadata =
    metadata.provenanceVersion === rawMetadata.provenanceVersion &&
    metadata.provider === rawMetadata.provider &&
    metadata.source === rawMetadata.source &&
    metadata.originalPublisher === rawMetadata.originalPublisher &&
    substitutionMatches &&
    metadata.canonicalSeriesId === rawMetadata.canonicalSeriesId &&
    metadata.sourceSeriesId === rawMetadata.sourceSeriesId &&
    metadata.sourceUrl === rawMetadata.sourceUrl &&
    metadata.sourceVersionId === rawMetadata.sourceVersionId &&
    metadata.frequency === rawMetadata.frequency &&
    metadata.fetchedAt === rawMetadata.fetchedAt &&
    metadata.releaseTimestamp === rawMetadata.releaseTimestamp &&
    metadata.unit === rawMetadata.unit;

  return sameMetadata &&
    normalized.observations.length === rawObservations.length &&
    normalized.observations.every((observation, index) => {
      const candidate = rawObservations[index];
      return isRecord(candidate) &&
        observation.referencePeriod === candidate.referencePeriod &&
        observation.value === candidate.value &&
        observation.officialStatus === candidate.officialStatus;
    });
}

function sameSubstitution(
  normalized: CanonicalSourceSubstitutionV1 | undefined,
  raw: unknown,
): boolean {
  if (normalized === undefined || raw === undefined) {
    return normalized === raw;
  }
  if (!isRecord(raw) || normalized.status !== raw.status) return false;
  return normalized.status !== "substituted" ||
    (normalized.provider === raw.provider && normalized.source === raw.source);
}

function assertMemory(memory: CanonicalStatisticalSeriesMemoryV1): void {
  if (parseCanonicalStatisticalSeriesMemoryV1(memory) === null) {
    throw new TypeError("Invalid canonical statistical-series memory.");
  }
}

function assertCaptureTime(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid canonical statistical-series ${label}.`);
  }
  return value;
}

function isStatisticalFrequency(
  value: unknown,
): value is CanonicalStatisticalFrequencyV1 {
  return value === "monthly" || value === "quarterly";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
