import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1,
  CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1,
  normalizeCanonicalObservationSeriesV1,
  normalizeCanonicalStatisticalSeriesV1,
  type CanonicalObservationSeriesInputV1,
  type CanonicalStatisticalSeriesInputV1,
} from "../../services/canonicalObservationSeries";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(run: () => unknown, label: string): void {
  let threw = false;

  try {
    run();
  } catch {
    threw = true;
  }

  assertEqual(threw, true, label);
}

const metadata = Object.freeze({
  provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  provider: "official-test-provider",
  source: "official-test-publisher",
  originalPublisher: "official-test-publisher",
  substitution: { status: "none" as const },
  seriesId: "OFFICIAL.SERIES.1",
  requestedProductId: "official-request-code",
  canonicalProductId: "oil",
  interval: "1d" as const,
  fetchedAt: 1_800_000_000,
  observationTimestamp: 300,
  sourceTimestamp: 300,
  status: "end_of_day" as const,
  unit: "USD/barrel",
  seriesKind: "spot-price" as const,
});

function input(
  observations: CanonicalObservationSeriesInputV1["observations"],
): CanonicalObservationSeriesInputV1 {
  return { observations, metadata };
}

const normalized = normalizeCanonicalObservationSeriesV1(input([
  { timestamp: 300, value: -1 },
  { timestamp: 100, value: 0 },
  { timestamp: 100, value: 0 },
  { timestamp: 200, value: 2 },
]));

assertEqual(normalized.schemaVersion, CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1, "schema version");
assertEqual(normalized.observations.length, 3, "identical duplicate removal");
assertEqual(normalized.observations.map(({ timestamp }) => timestamp).join(","), "100,200,300", "strict ordering");
assertEqual(normalized.observations.map(({ value }) => value).join(","), "0,2,-1", "finite zero and negative values");
assertEqual(JSON.stringify(normalized.metadata), JSON.stringify(metadata), "metadata survives normalization");
assertEqual(normalized.metadata.observationTimestamp !== normalized.metadata.fetchedAt,
  true, "reference time differs from fetch time");
assertEqual("releaseTimestamp" in normalized.metadata, false,
  "no publication time is invented");
assertEqual(normalized.metadata.substitution?.status, "none",
  "no substitute source is invented");
assertEqual(Object.isFrozen(normalized), true, "series is frozen");
assertEqual(Object.isFrozen(normalized.observations), true, "observations are frozen");
assertEqual(
  JSON.stringify(normalizeCanonicalObservationSeriesV1(input([...normalized.observations].reverse()))),
  JSON.stringify(normalized),
  "normalization is deterministic",
);
assertEqual("open" in normalized.observations[0]!, false, "open is not synthesized");
assertEqual("high" in normalized.observations[0]!, false, "high is not synthesized");
assertEqual("low" in normalized.observations[0]!, false, "low is not synthesized");
assertEqual("close" in normalized.observations[0]!, false, "close is not synthesized");

assertThrows(
  () => normalizeCanonicalObservationSeriesV1(input([
    { timestamp: 1, value: 10 },
    { timestamp: 1, value: 11 },
  ])),
  "conflicting duplicate rejection",
);
assertThrows(
  () => normalizeCanonicalObservationSeriesV1(input([{ timestamp: Number.NaN, value: 1 }])),
  "non-finite timestamp rejection",
);
assertThrows(
  () => normalizeCanonicalObservationSeriesV1(input([{ timestamp: 1, value: Number.POSITIVE_INFINITY }])),
  "non-finite value rejection",
);
assertThrows(
  () => normalizeCanonicalObservationSeriesV1({
    observations: [{ timestamp: 300, value: 1 }],
    metadata: { ...metadata, observationTimestamp: 301 },
  }),
  "observation timestamp cannot contradict compatibility alias",
);

const monthlyMetadata = Object.freeze({
  provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  provider: "official-statistics-provider",
  source: "Official Statistics Publisher",
  originalPublisher: "Official Statistics Publisher",
  substitution: { status: "none" as const },
  canonicalSeriesId: "euro-area-hicp-all-items",
  sourceSeriesId: "OFFICIAL.DATASET.SERIES",
  sourceUrl: "https://statistics.example.test/datasets/hicp",
  sourceVersionId: "sha256:monthly-v1",
  frequency: "monthly" as const,
  fetchedAt: 1_800_000_000,
  releaseTimestamp: 1_799_999_900,
  unit: "index",
});

function statisticalInput(
  observations: CanonicalStatisticalSeriesInputV1["observations"],
  metadata: CanonicalStatisticalSeriesInputV1["metadata"] = monthlyMetadata,
): CanonicalStatisticalSeriesInputV1 {
  return { observations, metadata };
}

const monthly = normalizeCanonicalStatisticalSeriesV1(statisticalInput([
  { referencePeriod: "2026-03", value: -0.1, officialStatus: "provisional" },
  { referencePeriod: "2026-01", value: 0 },
  { referencePeriod: "2026-01", value: 0 },
  { referencePeriod: "2026-02", value: 101.25 },
]));

assertEqual(monthly.schemaVersion, CANONICAL_STATISTICAL_SERIES_SCHEMA_VERSION_V1,
  "statistical schema version");
assertEqual(monthly.observations.length, 3,
  "statistical identical duplicate removal");
assertEqual(monthly.observations.map(({ referencePeriod }) => referencePeriod).join(","),
  "2026-01,2026-02,2026-03", "monthly deterministic ordering");
assertEqual(monthly.observations.map(({ value }) => value).join(","),
  "0,101.25,-0.1", "statistical finite zero and negative values");
assertEqual(monthly.metadata.canonicalSeriesId, "euro-area-hicp-all-items",
  "statistical identity is not a product identity");
assertEqual("requestedProductId" in monthly.metadata, false,
  "statistical metadata has no requested product identity");
assertEqual(Object.isFrozen(monthly), true, "statistical series is frozen");
assertEqual(Object.isFrozen(monthly.metadata), true,
  "statistical metadata is frozen");
assertEqual(Object.isFrozen(monthly.observations), true,
  "statistical observations are frozen");
assertEqual(Object.isFrozen(monthly.observations[0]), true,
  "statistical observation values are frozen");

const quarterly = normalizeCanonicalStatisticalSeriesV1(statisticalInput(
  [
    { referencePeriod: "2026-Q4", value: 4 },
    { referencePeriod: "2026-Q2", value: 2 },
    { referencePeriod: "2026-Q1", value: 1 },
    { referencePeriod: "2026-Q3", value: 3 },
  ],
  {
    ...monthlyMetadata,
    canonicalSeriesId: "euro-area-gdp-volume",
    sourceSeriesId: "OFFICIAL.GDP.SERIES",
    sourceVersionId: "sha256:quarterly-v1",
    frequency: "quarterly",
    unit: "percent-change",
  },
));
assertEqual(quarterly.observations.map(({ referencePeriod }) => referencePeriod).join(","),
  "2026-Q1,2026-Q2,2026-Q3,2026-Q4", "quarterly deterministic ordering");

assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput([
    { referencePeriod: "2026-01", value: 1 },
    { referencePeriod: "2026-01", value: 2 },
  ])),
  "conflicting statistical reference-period rejection",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput([
    { referencePeriod: "2026-Q1", value: 1 },
  ])),
  "quarterly syntax rejected for monthly series",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput(
    [{ referencePeriod: "2026-01", value: 1 }],
    { ...monthlyMetadata, frequency: "quarterly" },
  )),
  "monthly syntax rejected for quarterly series",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput(
    [{ referencePeriod: "2026-01", value: 1 }],
    { ...monthlyMetadata, canonicalSeriesId: " " },
  )),
  "empty canonical statistical-series identity rejection",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput(
    [{ referencePeriod: "2026-01", value: 1 }],
    { ...monthlyMetadata, sourceVersionId: "" },
  )),
  "empty statistical source-version identity rejection",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput(
    [{ referencePeriod: "2026-01", value: 1 }],
    { ...monthlyMetadata, frequency: "weekly" as never },
  )),
  "invalid statistical frequency rejection",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput(
    [{ referencePeriod: "2026-01", value: 1 }],
    { ...monthlyMetadata, sourceUrl: "not-an-absolute-url" },
  )),
  "malformed official source locator rejection",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput(
    [{ referencePeriod: "2026-01", value: 1 }],
    { ...monthlyMetadata, fetchedAt: 1.5 },
  )),
  "non-integer statistical fetchedAt rejection",
);
assertThrows(
  () => normalizeCanonicalStatisticalSeriesV1(statisticalInput(
    [{ referencePeriod: "2026-01", value: 1 }],
    { ...monthlyMetadata, releaseTimestamp: monthlyMetadata.fetchedAt + 1 },
  )),
  "future official release timestamp rejection",
);

console.log("PASS: Canonical Observation Series V1");
