import {
  CANONICAL_OBSERVATION_SERIES_SCHEMA_VERSION_V1,
  normalizeCanonicalObservationSeriesV1,
  type CanonicalObservationSeriesInputV1,
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
  provider: "official-test-provider",
  source: "official-test-publisher",
  seriesId: "OFFICIAL.SERIES.1",
  requestedProductId: "official-request-code",
  canonicalProductId: "oil",
  interval: "1d" as const,
  fetchedAt: 1_800_000_000,
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

console.log("PASS: Canonical Observation Series V1");
