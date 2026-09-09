import {
  EIA_WTI_SPOT_SERIES,
  loadEiaWtiPriceSeriesV1,
} from "../../providers/eia/wtiPriceSeries";
import type {
  EiaSeriesPoint,
  EiaSeriesRequest,
  EiaSeriesResult,
} from "../../providers/eia/types";
import {
  createCanonicalMarketSnapshotV1,
} from "../../services/canonicalMarketSnapshot";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function assertRejects(
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> {
  let rejected = false;

  try {
    await operation();
  } catch {
    rejected = true;
  }

  assertEqual(rejected, true, label);
}

function dailyPoints(count: number): EiaSeriesPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 1 + index));

    return {
      period: date.toISOString().slice(0, 10),
      value: 65 + index * 0.05,
    };
  }).reverse();
}

function result(points: EiaSeriesPoint[]): EiaSeriesResult {
  return {
    seriesId: "petroleum/pri/spt:value",
    frequency: "daily",
    unit: "USD/barrel",
    points,
    provider: "eia",
  };
}

async function main(): Promise<void> {
  let request: EiaSeriesRequest | undefined;
  const points = dailyPoints(200);
  const latestPeriod = points[0]!.period;
  const series = await loadEiaWtiPriceSeriesV1({
    loadSeries: async (input) => {
      request = input;
      return result([
        ...points,
        points[0]!,
        { period: "not-a-date", value: 70 },
        { period: "2025-02-30", value: 71 },
        { period: "2025-03-01", value: Number.NaN },
      ]);
    },
    now: () => new Date("2026-09-09T12:34:56.000Z"),
  });

  assertEqual(request?.route, "petroleum/pri/spt", "EIA route");
  assertEqual(request?.valueField, "value", "EIA value field");
  assertEqual(request?.frequency, "daily", "EIA frequency");
  assertEqual(request?.facets?.series?.join(","), "RWTC", "EIA series facet");
  assertEqual(request?.length, 600, "EIA bounded history length");
  assertEqual(request?.unit, "USD/barrel", "EIA request unit");
  assertEqual(EIA_WTI_SPOT_SERIES.seriesId, "PET.RWTC.D", "official series identity");
  assertEqual(series.observations.length, 200, "valid history retained");
  assertEqual(
    series.observations.every((observation, index) =>
      index === 0 || observation.timestamp > series.observations[index - 1]!.timestamp),
    true,
    "deterministic ascending order",
  );
  assertEqual(series.metadata.provider, "eia", "provider identity");
  assertEqual(series.metadata.source, "U.S. Energy Information Administration", "source identity");
  assertEqual(series.metadata.seriesId, "PET.RWTC.D", "series provenance");
  assertEqual(series.metadata.requestedProductId, "RWTC", "requested product identity");
  assertEqual(series.metadata.canonicalProductId, "oil", "canonical product identity");
  assertEqual(series.metadata.unit, "USD/barrel", "canonical unit");
  assertEqual(series.metadata.interval, "1d", "canonical cadence");
  assertEqual(series.metadata.status, "end_of_day", "truthful delivery status");
  assertEqual(series.metadata.seriesKind, "spot-price", "spot semantic type");
  assertEqual(
    series.metadata.fetchedAt,
    Date.parse("2026-09-09T12:34:56.000Z") / 1000,
    "fetchedAt provenance",
  );
  assertEqual(
    series.metadata.sourceTimestamp,
    Date.parse(`${latestPeriod}T00:00:00.000Z`) / 1000,
    "latest observation sourceTimestamp",
  );
  assertEqual(
    series.metadata.sourceTimestamp === series.metadata.fetchedAt,
    false,
    "sourceTimestamp and fetchedAt remain distinct",
  );
  for (const field of ["open", "high", "low", "close", "volume"] as const) {
    assertEqual(field in series.observations[0]!, false, `no synthesized ${field}`);
  }

  await assertRejects(
    () => loadEiaWtiPriceSeriesV1({
      loadSeries: async () => result([
        { period: "2026-01-02", value: 70 },
        { period: "2026-01-02", value: 71 },
      ]),
    }),
    "conflicting duplicate date rejected",
  );

  const insufficientSeries = await loadEiaWtiPriceSeriesV1({
    loadSeries: async () => result(dailyPoints(199)),
    now: () => new Date("2026-09-09T12:34:56.000Z"),
  });
  const insufficient = await createCanonicalMarketSnapshotV1(
    {
      assetIds: ["oil"],
      interval: "1d",
      history: {
        kind: "required-observations",
        requiredObservationCount: 200,
        range: "5y",
      },
    },
    {
      loadHistoricalMarketData: async () => insufficientSeries,
      now: () => new Date("2026-09-09T12:34:56.000Z"),
    },
  );
  assertEqual(insufficient.assets[0]?.observationCount, 199, "insufficient valid count retained");
  assertEqual(insufficient.assets[0]?.availability, "unavailable", "insufficient history unavailable");

  console.log("PASS: EIA Official WTI Spot Price Series V1");
}

void main();
