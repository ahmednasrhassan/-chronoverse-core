import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ESTR_RUNTIME_MINIMUM_HISTORY_V1,
  getEstrProductionRuntimeV1,
  type EstrProductionRuntimeDataV1,
} from "../../assets/estr/runtime";
import {
  classifyEstrRateLevelRegimeV1,
  classifyEstrRateVolatilityRegimeV1,
} from "../../assets/estr/regimes";
import {
  ECB_ESTR_DATAFLOW_V1,
  ECB_ESTR_SERIES_ID_V1,
  ECB_ESTR_SERIES_KEY_V1,
} from "../../providers/ecb/estrContract";
import {
  ECB_ESTR_CACHE_SECONDS_V1,
} from "../../providers/ecb/estrSeriesCache";
import type {
  EcbEstrObservationMetadataV1,
  EcbEstrSeriesV1,
} from "../../providers/ecb/estrTypes";
import {
  normalizeCanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

function requireAvailable(
  result: Awaited<ReturnType<typeof getEstrProductionRuntimeV1>>,
): EstrProductionRuntimeDataV1 {
  if (result.availability !== "available") {
    throw new Error(`Expected available €STR runtime: ${result.reason}`);
  }

  return result.data;
}

function valuesWithLatest(latest?: number): readonly number[] {
  const values = Array.from({ length: 220 }, (_, index) =>
    1.5 + index * 0.0005 + Math.sin(index / 7) * 0.01);

  if (latest !== undefined) {
    values[values.length - 1] = latest;
  }

  return values;
}

function officialSource(
  values: readonly number[] = valuesWithLatest(),
): EcbEstrSeriesV1 {
  const observations = values.map((value, index) => ({
    timestamp: Date.UTC(2025, 0, 1 + index) / 1000,
    value,
  }));
  const observationMetadata: readonly EcbEstrObservationMetadataV1[] =
    observations.map((observation) => Object.freeze({
      referenceDate: new Date(observation.timestamp * 1000)
        .toISOString().slice(0, 10),
      timestamp: observation.timestamp,
      observationStatus: Object.freeze({
        headline: "A",
        publicationType: "A",
        calculationMethod: "A",
      }),
      confidentialityStatus: Object.freeze({
        headline: "F",
        publicationType: "F",
        calculationMethod: "F",
      }),
      publicationType: "standard" as const,
      calculationMethod: "normal" as const,
    }));
  const canonicalSeries = normalizeCanonicalObservationSeriesV1({
    observations,
    metadata: {
      provider: "ecb",
      source: "European Central Bank",
      seriesId: ECB_ESTR_SERIES_ID_V1,
      requestedProductId: "estr",
      canonicalProductId: "estr",
      interval: "1d",
      fetchedAt: 1_756_972_800,
      sourceTimestamp: observations.at(-1)!.timestamp,
      status: "end_of_day",
      unit: "percent",
      seriesKind: "reference-rate",
    },
  });

  return Object.freeze({
    schemaVersion: "ecb-estr-series-v1",
    dataflow: ECB_ESTR_DATAFLOW_V1,
    seriesKey: ECB_ESTR_SERIES_KEY_V1,
    canonicalSeries,
    observationMetadata: Object.freeze(observationMetadata),
  });
}

async function main(): Promise<void> {
  const source = officialSource();
  let loadCount = 0;
  const result = await getEstrProductionRuntimeV1({
    loadSource: async () => {
      loadCount += 1;
      return source;
    },
  });
  const available = requireAvailable(result);
  const observations = source.canonicalSeries.observations;
  const latest = observations.at(-1)!;
  const previous = observations.at(-2)!;

  assertEqual(loadCount, 1, "one provider load in one runtime execution");
  assertEqual(available.productId, "estr", "canonical product ID");
  assertEqual(available.product, "€STR", "reference-rate product name");
  assertEqual(available.currentRatePercent, latest.value,
    "latest reference-rate level propagated");
  assertEqual(available.features.currentRate, latest.value,
    "single rate-feature snapshot current level");
  assertEqual(available.features.dailyChangeBp,
    (latest.value - previous.value) * 100,
  "daily movement uses absolute basis points");
  assertEqual(
    available.features.momentum.find(
      (item) => item.horizonObservations === 10,
    )?.momentumBp,
    (latest.value - observations.at(-11)!.value) * 100,
    "ten-observation momentum uses absolute basis points",
  );
  assertEqual(available.features.ema.some(
    (item) => item.period === 200 && item.emaDistanceBp !== null,
  ), true, "EMA200 is causally warmed");
  assertEqual(available.features.rsi !== null, true, "RSI14 is available");
  assertEqual(available.features.macd.histogramBp !== null, true,
    "MACD 12/26/9 is available in basis points");
  assertEqual(available.features.dailyBpVolatility !== null, true,
    "daily bp volatility20 is available");

  assertEqual(available.signal.availability, "available",
    "Signal available result propagated");
  assertEqual(available.risk.availability, "available",
    "Risk available result propagated");
  assertEqual(available.marketState.data.signalScore, available.signal.data.score,
    "Signal score propagated into Market State");
  assertEqual(available.marketState.data.riskScore, available.risk.data.score,
    "Risk score propagated into Market State");
  const levelRegime = classifyEstrRateLevelRegimeV1(
    available.currentRatePercent,
  );
  const volatilityRegime = classifyEstrRateVolatilityRegimeV1(
    available.features.dailyBpVolatility,
  );
  if (
    levelRegime.availability !== "available" ||
    volatilityRegime.availability !== "available"
  ) {
    throw new Error("Runtime regime fixtures must be available.");
  }
  assertEqual(available.marketState.data.levelRegime, levelRegime.regime,
    "level regime propagated");
  assertEqual(available.marketState.data.volatilityRegime,
    volatilityRegime.regime, "volatility regime propagated");
  assertEqual(available.engineAdapter.data.rateMarketState,
    available.marketState.data, "Market State propagated to adapter");
  assertEqual(available.engineAdapter.data.engineEvidence.signal.score,
    available.marketState.data.direction === "range-bound"
      ? 0
      : available.signal.data.score,
  "safe Engine signal evidence propagated");
  assertEqual(available.engineAdapter.data.engineEvidence.risk.score,
    available.risk.data.score, "safe Engine Risk evidence propagated");

  assertEqual(available.source.provenance, source.canonicalSeries.metadata,
    "canonical source provenance preserved");
  assertEqual(available.source.dataflow, ECB_ESTR_DATAFLOW_V1,
    "official dataflow preserved");
  assertEqual(available.source.seriesKey, ECB_ESTR_SERIES_KEY_V1,
    "official series key preserved");
  assertEqual(available.source.provenance.source,
    "European Central Bank", "official source preserved");
  assertEqual(available.source.provenance.seriesId,
    "EST.B.EU000A2X2A25.WT", "official series ID preserved");
  assertEqual(available.sourceTimestamp, latest.timestamp,
    "latest source timestamp preserved");
  assertEqual(available.latestReferenceDate,
    source.observationMetadata.at(-1)!.referenceDate,
  "latest reference date preserved");
  assertEqual(available.fetchedAt, source.canonicalSeries.metadata.fetchedAt,
    "source fetch time preserved");
  assertEqual(available.source.latestObservationMetadata,
    source.observationMetadata.at(-1), "latest sidecar metadata preserved");

  const negative = requireAvailable(await getEstrProductionRuntimeV1({
    loadSource: async () => officialSource(valuesWithLatest(-0.593)),
  }));
  assertEqual(negative.currentRatePercent, -0.593,
    "negative latest reference rate accepted");
  const zero = requireAvailable(await getEstrProductionRuntimeV1({
    loadSource: async () => officialSource(valuesWithLatest(0)),
  }));
  assertEqual(zero.currentRatePercent, 0,
    "zero latest reference rate accepted");

  const insufficient = await getEstrProductionRuntimeV1({
    loadSource: async () => officialSource(
      valuesWithLatest().slice(0, ESTR_RUNTIME_MINIMUM_HISTORY_V1 - 1),
    ),
  });
  assertEqual(insufficient.availability, "unavailable",
    "insufficient history fails closed");
  if (insufficient.availability === "unavailable") {
    assertEqual(insufficient.missing[0], "history",
      "insufficient history reason is deterministic");
  }

  const malformedBase = officialSource();
  const malformed = {
    ...malformedBase,
    canonicalSeries: {
      ...malformedBase.canonicalSeries,
      observations: malformedBase.canonicalSeries.observations.map(
        (observation, index) => index === 10
          ? { ...observation, value: Number.NaN }
          : observation,
      ),
    },
  } as EcbEstrSeriesV1;
  const malformedResult = await getEstrProductionRuntimeV1({
    loadSource: async () => malformed,
  });
  assertEqual(malformedResult.availability, "unavailable",
    "non-finite observation fails closed");
  if (malformedResult.availability === "unavailable") {
    assertEqual(malformedResult.missing[0], "sourceIdentity",
      "malformed observation reason is deterministic");
  }

  let failureLoads = 0;
  const unavailableSource = await getEstrProductionRuntimeV1({
    loadSource: async () => {
      failureLoads += 1;
      throw new Error("unavailable");
    },
  });
  assertEqual(unavailableSource.availability, "unavailable",
    "unavailable source fails closed");
  assertEqual(failureLoads, 1, "source failure performs no fallback load");
  if (unavailableSource.availability === "unavailable") {
    assertEqual(unavailableSource.missing[0], "source",
      "source failure reason is deterministic");
  }

  const repeatDependencies = { loadSource: async () => source };
  const firstRepeat = await getEstrProductionRuntimeV1(repeatDependencies);
  const secondRepeat = await getEstrProductionRuntimeV1(repeatDependencies);
  assertDeepEqual(secondRepeat, firstRepeat,
    "repeated canonical input is deterministic");

  const runtimePath = fileURLToPath(new URL(
    "../../assets/estr/runtime.ts",
    import.meta.url,
  ));
  const cachePath = fileURLToPath(new URL(
    "../../providers/ecb/estrSeriesCache.ts",
    import.meta.url,
  ));
  const runtimeSource = readFileSync(runtimePath, "utf8");
  const cacheSource = readFileSync(cachePath, "utf8");
  const productionSource = `${runtimeSource}\n${cacheSource}`.toLowerCase();
  const publicOutput = JSON.stringify([
    available,
    negative,
    zero,
    insufficient,
    malformedResult,
    unavailableSource,
  ]).toLowerCase();

  assertEqual(ECB_ESTR_CACHE_SECONDS_V1, 86_400,
    "shared source cache retains daily cadence");
  assertEqual(cacheSource.match(/= unstable_cache\(/g)?.length, 1,
    "one shared €STR cache entry");
  assertEqual(cacheSource.includes("loadEcbEstrHistoryV1"), true,
    "daily cache uses canonical full-history path");
  assertEqual(runtimeSource.includes("getCanonicalEcbEstrSourceV1"), true,
    "runtime defaults to shared normalized source cache");
  assertEqual(runtimeSource.includes("calculateRateFeaturesV1(observations)"), true,
    "rate features computed once from canonical observations");
  assertEqual(runtimeSource.includes("calculateEstrRateMarketStateV1(features, {"),
    true, "Market State reuses prepared Signal and Risk");
  assertEqual(/\bprice\b/.test(runtimeSource.toLowerCase()), false,
    "runtime source excludes price semantics");
  assertEqual(publicOutput.includes("price"), false,
    "runtime output excludes price semantics");
  assertEqual(publicOutput.includes("bullish"), false,
    "runtime output excludes bullish semantics");
  assertEqual(publicOutput.includes("bearish"), false,
    "runtime output excludes bearish semantics");
  assertEqual(productionSource.includes("yahoo"), false,
    "no Yahoo dependency or fallback");
  assertEqual(productionSource.includes("fred"), false,
    "no FRED dependency or fallback");
  assertEqual(runtimeSource.includes("fetch("), false,
    "runtime has no direct provider fetch");
  assertEqual(runtimeSource.includes("window"), false,
    "runtime has no browser dependency");
  assertEqual(runtimeSource.toLowerCase().includes("historicalmarketdata"), false,
    "runtime has no generic market-data dependency");
  for (const forbidden of ["math.log", "log-return", "percentage roc",
    "emadistancepercent"]) {
    assertEqual(runtimeSource.toLowerCase().includes(forbidden), false,
      `runtime source excludes ${forbidden}`);
  }

  console.log("PASS: €STR Production Runtime V1");
}

void main();
