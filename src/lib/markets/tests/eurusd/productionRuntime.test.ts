import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getCanonicalLiveEurUsdIntelligence,
} from "../../assets/eurusd/productionRuntime";
import { eurusdProfile } from "../../assets/eurusd/profile";
import {
  calculateMinimumTechnicalObservationCountV1,
} from "../../engine/preparedAssetEvaluation";
import {
  ECB_FX_REFERENCE_PRODUCTS_V1,
} from "../../providers/ecb/fxReferenceSeries";
import {
  ECB_FX_REFERENCE_CACHE_SECONDS_V1,
} from "../../providers/ecb/fxReferenceSeriesCache";
import {
  normalizeCanonicalObservationSeriesV1,
  type CanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
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

function officialSeries(
  overrides: Partial<CanonicalObservationSeriesV1["metadata"]> = {},
): CanonicalObservationSeriesV1 {
  return normalizeCanonicalObservationSeriesV1({
    observations: Array.from({ length: 600 }, (_, index) => ({
      timestamp: 1_700_000_000 + index * 86_400,
      value: 1.08 + index * 0.00001 + Math.sin(index / 9) * 0.002,
    })),
    metadata: {
      provider: "ecb",
      source: "European Central Bank",
      seriesId: "EXR.D.USD.EUR.SP00.A",
      requestedProductId: "eurusd",
      canonicalProductId: "eurusd",
      interval: "1d",
      fetchedAt: 1_751_000_000,
      sourceTimestamp: 1_700_000_000 + 599 * 86_400,
      status: "end_of_day",
      unit: "USD per EUR",
      seriesKind: "reference-rate",
      ...overrides,
    },
  });
}

async function main(): Promise<void> {
  const product = ECB_FX_REFERENCE_PRODUCTS_V1.eurusd;

  assertEqual(product.seriesId, "EXR.D.USD.EUR.SP00.A", "exact ECB series");
  assertEqual(product.quotation, "EUR 1 = X USD", "exact quotation");
  assertEqual(product.unit, "USD per EUR", "exact unit");
  assertEqual(product.inverted, false, "reference rate is not inverted");
  assertEqual(
    calculateMinimumTechnicalObservationCountV1(eurusdProfile),
    200,
    "current indicators require 200 observations",
  );
  assertEqual(eurusdProfile.historyLimit, 600, "600-observation runtime window");

  const series = officialSeries();
  let loadCount = 0;
  const dependencies = {
    loadCanonicalSeries: async () => {
      loadCount += 1;
      return series;
    },
    now: () => new Date("2026-09-10T12:00:00.000Z"),
  };
  const first = await getCanonicalLiveEurUsdIntelligence(dependencies);

  assertEqual(loadCount, 1, "one shared canonical-series load per computation");
  assertEqual(first.availability, "available", "production runtime available");
  assertEqual(first.calibration.productionCalibrated, true,
    "explicit Risk and Signal calibration used");
  assertEqual(first.calibration.missingExplicitCalibration.length, 0,
    "no calibration is missing");
  assertEqual(first.engineResult.technical.availability, "available",
    "Technical available with 600 observations");
  assertEqual(first.engineResult.marketData.historicalWindow?.receivedPoints, 600,
    "all 600 reference observations reach Engine V3");
  assertEqual(first.engineResult.marketData.provider, "ecb", "ECB provider retained");
  assertEqual(first.engineResult.macro.availability, "not-applicable",
    "Macro follows disabled profile");
  assertEqual(first.engineResult.crossAsset.availability, "not-applicable",
    "Cross Asset follows current relationship model");
  assertEqual(first.engineResult.positioning.availability, "not-computed",
    "Positioning follows current lifecycle semantics");
  assertEqual(first.engineResult.regime.availability, "unavailable",
    "Regime Memory follows pure runtime semantics");
  assertEqual(first.engineResult.decisionLifecycle.availability, "not-computed",
    "Decision lifecycle is not falsely marked available");
  assertEqual(first.provenance, series.metadata, "full source provenance retained");
  assertEqual(first.provenance.sourceTimestamp, series.metadata.sourceTimestamp,
    "sourceTimestamp retained");
  assertEqual(first.provenance.seriesKind, "reference-rate", "series kind retained");
  assertEqual(first.provenance.status, "end_of_day", "source status retained");
  assertEqual(
    first.engineResult.marketData.historicalWindow?.lastTimestamp,
    series.metadata.sourceTimestamp,
    "latest Engine observation is the ECB source timestamp",
  );
  assertEqual(
    first.engineResult.marketData.historicalWindow?.receivedPoints === 600 &&
      first.engineResult.technical.availability === "available",
    true,
    "600 observations are sufficient for production evaluation",
  );
  for (const candle of first.engineResult.marketData.availability === "unavailable"
    ? []
    : series.observations) {
    assertEqual("open" in candle || "high" in candle || "low" in candle, false,
      "no synthetic OHLC");
  }

  loadCount = 0;
  const second = await getCanonicalLiveEurUsdIntelligence(dependencies);
  assertEqual(loadCount, 1, "repeat computation performs one canonical load");
  assertDeepEqual(second, first, "deterministic input produces deterministic result");

  await assertRejects(
    () => getCanonicalLiveEurUsdIntelligence({
      loadCanonicalSeries: async () => {
        throw new Error("missing");
      },
    }),
    "missing canonical series fails closed",
  );
  await assertRejects(
    () => getCanonicalLiveEurUsdIntelligence({
      loadCanonicalSeries: async () => officialSeries({
        seriesId: "EXR.D.GBP.EUR.SP00.A",
      }),
    }),
    "malformed canonical identity fails closed",
  );
  await assertRejects(
    () => getCanonicalLiveEurUsdIntelligence({
      loadCanonicalSeries: async () => normalizeCanonicalObservationSeriesV1({
        observations: series.observations.slice(0, 199),
        metadata: series.metadata,
      }),
      now: dependencies.now,
    }),
    "insufficient canonical history fails closed",
  );

  assertEqual(ECB_FX_REFERENCE_CACHE_SECONDS_V1, 86_400,
    "shared ECB cache is daily");

  const runtimePath = fileURLToPath(new URL(
    "../../assets/eurusd/productionRuntime.ts",
    import.meta.url,
  ));
  const routePath = fileURLToPath(new URL(
    "../../../../app/api/markets/eurusd/intelligence/route.ts",
    import.meta.url,
  ));
  const eurUsdDirectory = fileURLToPath(new URL(
    "../../assets/eurusd/",
    import.meta.url,
  ));
  const runtimeSource = readFileSync(runtimePath, "utf8");
  const routeSource = readFileSync(routePath, "utf8");
  const resultServicePath = fileURLToPath(new URL(
    "../../services/canonicalProductResults.ts",
    import.meta.url,
  ));
  const resultServiceSource = readFileSync(resultServicePath, "utf8");
  const productionPathSource = `${runtimeSource}\n${routeSource}`.toLowerCase();
  const eurUsdFiles = readdirSync(eurUsdDirectory).sort();

  assertEqual(runtimeSource.includes("getCanonicalEcbFxReferenceSeriesV1(\"eurusd\")"),
    true, "runtime consumes the shared ECB canonical series");
  assertEqual(runtimeSource.includes("createCanonicalMarketSnapshotV1"), true,
    "runtime uses canonical snapshot path");
  assertEqual(runtimeSource.includes("runGenericAssetRuntimeV1"), true,
    "runtime uses Generic Engine V3 path");
  assertEqual(/\b(open|high|low|volume)\s*:/.test(runtimeSource), false,
    "runtime does not synthesize OHLC or volume");
  assertEqual(resultServiceSource.includes("getCanonicalLiveEurUsdIntelligence"),
    true, "canonical result owner consumes production runtime");
  assertEqual(routeSource.includes("getCanonicalProductResultV1"), true,
    "API consumes canonical result owner");
  assertEqual(routeSource.includes("getCanonicalProductResultV1(\"eurusd\")"),
    true, "API requests exact EUR/USD canonical result");
  assertEqual(routeSource.includes("unstable_cache"), false,
    "route owns no redundant final-result cache");
  assertEqual(routeSource.includes("stale: false"), false,
    "route has no hard-coded freshness claim");
  assertEqual(productionPathSource.includes("yahoo"), false,
    "no Yahoo production dependency");
  assertEqual(
    productionPathSource.includes("services/historicalmarketdata") ||
      productionPathSource.includes("services\\historicalmarketdata"),
    false,
    "no historicalMarketData production dependency",
  );
  assertDeepEqual(eurUsdFiles, ["productionRuntime.ts", "profile.ts"],
    "no separate EUR/USD ECB client or cache");

  console.log("PASS: EUR/USD official production runtime and API cutover");
}

void main();
