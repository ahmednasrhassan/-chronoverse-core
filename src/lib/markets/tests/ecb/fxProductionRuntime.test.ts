import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { MarketAssetProfile } from "../../core/assetProfile";
import { assetRegistry, type MarketAssetId } from "../../core/assets";
import { marketAssetProfiles } from "../../core/assetProfiles";
import type { EcbFxProductionRuntimeDependenciesV1 } from
  "../../assets/ecbFxProductionRuntime";
import {
  getCanonicalLiveEurChfIntelligence,
} from "../../assets/eurchf/productionRuntime";
import { eurchfProfile } from "../../assets/eurchf/profile";
import {
  getCanonicalLiveEurGbpIntelligence,
} from "../../assets/eurgbp/productionRuntime";
import { eurgbpProfile } from "../../assets/eurgbp/profile";
import {
  getCanonicalLiveEurJpyIntelligence,
} from "../../assets/eurjpy/productionRuntime";
import { eurjpyProfile } from "../../assets/eurjpy/profile";
import {
  calculateMinimumTechnicalObservationCountV1,
} from "../../engine/preparedAssetEvaluation";
import {
  ECB_FX_REFERENCE_PRODUCTS_V1,
} from "../../providers/ecb/fxReferenceSeries";
import {
  ECB_FX_REFERENCE_CACHE_SECONDS_V1,
} from "../../providers/ecb/fxReferenceSeriesCache";
import type { EcbFxReferenceProductIdV1 } from "../../providers/ecb/types";
import {
  normalizeCanonicalObservationSeriesV1,
  type CanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";

type LaunchProductId = Exclude<EcbFxReferenceProductIdV1, "eurusd">;
type LaunchRuntime = (
  dependencies?: EcbFxProductionRuntimeDependenciesV1,
) => Promise<{
  readonly availability: "available";
  readonly calibration: {
    readonly productionCalibrated: boolean;
    readonly missingExplicitCalibration: readonly string[];
  };
  readonly engineResult: {
    readonly asset: string;
    readonly technical: { readonly availability: string };
    readonly marketData: {
      readonly provider: string | null;
      readonly historicalWindow?: {
        readonly receivedPoints: number;
        readonly lastTimestamp?: number;
      };
    };
    readonly macro: { readonly availability: string };
    readonly crossAsset: { readonly availability: string };
    readonly positioning: { readonly availability: string };
    readonly regime: { readonly availability: string };
    readonly decisionLifecycle: { readonly availability: string };
  };
  readonly provenance: CanonicalObservationSeriesV1["metadata"];
}>;

interface LaunchConfiguration {
  readonly productId: LaunchProductId;
  readonly profile: MarketAssetProfile;
  readonly run: LaunchRuntime;
  readonly baseValue: number;
  readonly signalEvidence: readonly number[];
  readonly riskEvidence: readonly number[];
  readonly runtimeExport: string;
}

const configurations: readonly LaunchConfiguration[] = Object.freeze([
  Object.freeze({
    productId: "eurjpy",
    profile: eurjpyProfile,
    run: getCanonicalLiveEurJpyIntelligence,
    baseValue: 160,
    signalEvidence: Object.freeze([
      0.8, -0.8, 0.3, 0.0002, 0.0035, 1.2, 3.2, 0.6, 0.85,
    ]),
    riskEvidence: Object.freeze([
      0.2, 0.25, 0.5, 12.5, 18.5, 41, 61, 2.1, 4.1, 0.4325,
      2.2, 4.4, 5.1, 9.5,
    ]),
    runtimeExport: "getCanonicalLiveEurJpyIntelligence",
  }),
  Object.freeze({
    productId: "eurgbp",
    profile: eurgbpProfile,
    run: getCanonicalLiveEurGbpIntelligence,
    baseValue: 0.85,
    signalEvidence: Object.freeze([
      0.8, -0.8, 0.3, 0.0001, 0.0001, 0.8, 2.1, 0.6, 0.85,
    ]),
    riskEvidence: Object.freeze([
      0.2, 0.25, 0.5, 8.5, 12, 40, 60, 1.5, 2.7, 0.0015,
      1.5, 2.9, 3.1, 6.1,
    ]),
    runtimeExport: "getCanonicalLiveEurGbpIntelligence",
  }),
  Object.freeze({
    productId: "eurchf",
    profile: eurchfProfile,
    run: getCanonicalLiveEurChfIntelligence,
    baseValue: 0.94,
    signalEvidence: Object.freeze([
      0.75, -0.8, 0.3, 0.0001, 0.0001, 0.4, 1.2, 0.55, 0.85,
    ]),
    riskEvidence: Object.freeze([
      0.2, 0.25, 0.45, 5, 10, 40, 59, 0.8, 1.8, 0.002,
      0.8, 2, 1.8, 4.4,
    ]),
    runtimeExport: "getCanonicalLiveEurChfIntelligence",
  }),
]);

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
  productId: LaunchProductId,
  baseValue: number,
  count = 600,
  overrides: Partial<CanonicalObservationSeriesV1["metadata"]> = {},
): CanonicalObservationSeriesV1 {
  const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];

  return normalizeCanonicalObservationSeriesV1({
    observations: Array.from({ length: count }, (_, index) => ({
      timestamp: 1_700_000_000 + index * 86_400,
      value: baseValue * (1 + index * 0.00001 + Math.sin(index / 9) * 0.002),
    })),
    metadata: {
      provider: "ecb",
      source: "European Central Bank",
      seriesId: product.seriesId,
      requestedProductId: productId,
      canonicalProductId: productId,
      interval: "1d",
      fetchedAt: 1_751_000_000,
      sourceTimestamp: 1_700_000_000 + (count - 1) * 86_400,
      status: "end_of_day",
      unit: product.unit,
      seriesKind: "reference-rate",
      ...overrides,
    },
  });
}

function calibrationEvidence(profile: MarketAssetProfile) {
  const signal = profile.signal.calibration!;
  const risk = profile.risk.calibration!;

  return {
    signal: [
      profile.signal.bullishThreshold,
      profile.signal.bearishThreshold,
      profile.signal.neutralThreshold,
      signal.ema.toleranceRatio,
      signal.macd.epsilon,
      signal.roc.directionalThreshold,
      signal.roc.strongThreshold,
      signal.strength.moderateThreshold,
      signal.strength.strongThreshold,
    ],
    risk: [
      profile.risk.low,
      profile.risk.moderate,
      profile.risk.high,
      risk.volatility.moderateThreshold,
      risk.volatility.highThreshold,
      risk.rsi.stretchedLow,
      risk.rsi.stretchedHigh,
      risk.roc.moderateThreshold,
      risk.roc.highThreshold,
      risk.macd.highThreshold,
      risk.emaMedium.moderateThreshold,
      risk.emaMedium.highThreshold,
      risk.emaSlow.moderateThreshold,
      risk.emaSlow.highThreshold,
    ],
  };
}

async function verifyProduct(configuration: LaunchConfiguration): Promise<void> {
  const { productId, profile, run, baseValue } = configuration;
  const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
  const expectedSeries = {
    eurjpy: ["EXR.D.JPY.EUR.SP00.A", "EUR 1 = X JPY", "JPY per EUR"],
    eurgbp: ["EXR.D.GBP.EUR.SP00.A", "EUR 1 = X GBP", "GBP per EUR"],
    eurchf: ["EXR.D.CHF.EUR.SP00.A", "EUR 1 = X CHF", "CHF per EUR"],
  }[productId];

  assertDeepEqual(
    [product.seriesId, product.quotation, product.unit],
    expectedSeries,
    `${productId} exact ECB identity`,
  );
  assertEqual(product.inverted, false, `${productId} is not inverted`);
  assertEqual(profile.id, productId as MarketAssetId, `${productId} profile identity`);
  assertEqual(profile.assetClass, "forex", `${productId} FX asset class`);
  assertEqual(profile.defaultInterval, "1d", `${productId} daily interval`);
  assertEqual(profile.historyLimit, 600, `${productId} history limit`);
  assertDeepEqual(profile.technical, {
    ema: { fast: 20, medium: 50, slow: 200 },
    rsi: {
      period: 14,
      oversold: 30,
      neutralLow: 45,
      neutralHigh: 55,
      overbought: 70,
    },
    macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    momentum: { period: 10 },
    volatility: { period: 20, annualizationFactor: 252 },
  }, `${productId} common Technical profile`);
  assertDeepEqual(calibrationEvidence(profile), {
    signal: configuration.signalEvidence,
    risk: configuration.riskEvidence,
  }, `${productId} exact frozen calibration`);
  assertDeepEqual(profile.signal.calibration!.weights,
    { ema: 0.25, rsi: 0.25, macd: 0.25, roc: 0.25 },
  `${productId} Signal weights`);
  assertDeepEqual([
    profile.signal.calibration!.ema.minimumTolerance,
    profile.signal.calibration!.ema.allAveragesMultiplier,
    profile.signal.calibration!.ema.moderateBiasMultiplier,
    profile.signal.calibration!.rsi.extremeMultiplier,
    profile.signal.calibration!.macd.zeroBiasMultiplier,
    profile.signal.calibration!.roc.strongMultiplier,
    profile.signal.calibration!.roc.directionalMultiplier,
    profile.signal.calibration!.roc.mildMultiplier,
    profile.signal.calibration!.confidence.base,
    profile.signal.calibration!.confidence.directional,
    profile.signal.calibration!.confidence.riskPenalty,
  ], [0.000001, 0.55, 0.25, 0.75, 0.6, 1, 0.75, 0.35, 0.4, 0.6, 0.35],
  `${productId} common Signal calibration`);
  assertDeepEqual(profile.risk.calibration!.weights, {
    volatility: 0.2,
    rsi: 0.15,
    roc: 0.2,
    macd: 0.15,
    emaMedium: 0.15,
    emaSlow: 0.15,
  }, `${productId} Risk weights`);
  assertDeepEqual([
    profile.risk.calibration!.volatility.severity,
    profile.risk.calibration!.rsi.severity,
    profile.risk.calibration!.roc.severity,
    profile.risk.calibration!.emaMedium.severity,
    profile.risk.calibration!.emaSlow.severity,
  ], Array.from({ length: 5 }, () => ({ low: 0.2, moderate: 0.6, high: 1 })),
  `${productId} common Risk severities`);
  assertDeepEqual([
    profile.risk.calibration!.macd.lowSeverity,
    profile.risk.calibration!.macd.highSeverity,
  ], [0.2, 1], `${productId} MACD Risk severities`);
  assertEqual(profile.macro.enabled, false, `${productId} Macro disabled`);
  assertEqual(profile.regimeMemory.enabled, false,
    `${productId} Regime Memory disabled`);
  assertEqual(calculateMinimumTechnicalObservationCountV1(profile), 200,
    `${productId} minimum Technical history`);
  assertEqual(marketAssetProfiles[productId], profile,
    `${productId} registered production profile`);
  assertDeepEqual(assetRegistry[productId].providerSymbols, {},
    `${productId} has no Yahoo registry dependency`);

  const series = officialSeries(productId, baseValue);
  let loadCount = 0;
  const dependencies = {
    loadCanonicalSeries: async () => {
      loadCount += 1;
      return series;
    },
    now: () => new Date("2026-09-10T12:00:00.000Z"),
  };
  const first = await run(dependencies);

  assertEqual(loadCount, 1, `${productId} one canonical load per computation`);
  assertEqual(first.availability, "available", `${productId} runtime available`);
  assertEqual(first.calibration.productionCalibrated, true,
    `${productId} production calibrated`);
  assertEqual(first.calibration.missingExplicitCalibration.length, 0,
    `${productId} explicit calibration complete`);
  assertEqual(first.engineResult.asset, productId, `${productId} Engine target`);
  assertEqual(first.engineResult.technical.availability, "available",
    `${productId} Technical available`);
  assertEqual(first.engineResult.marketData.historicalWindow?.receivedPoints, 600,
    `${productId} all 600 observations reach Engine V3`);
  assertEqual(first.engineResult.marketData.provider, "ecb",
    `${productId} Engine provider`);
  assertEqual(first.engineResult.macro.availability, "not-applicable",
    `${productId} Macro not applicable`);
  assertEqual(first.engineResult.crossAsset.availability, "not-applicable",
    `${productId} Cross Asset not applicable`);
  assertEqual(first.engineResult.positioning.availability, "not-computed",
    `${productId} Positioning not computed`);
  assertEqual(first.engineResult.regime.availability, "unavailable",
    `${productId} Regime Memory unavailable`);
  assertEqual(first.engineResult.decisionLifecycle.availability, "not-computed",
    `${productId} Decision lifecycle not computed`);
  assertEqual(first.provenance, series.metadata, `${productId} provenance retained`);
  assertEqual(first.provenance.seriesKind, "reference-rate",
    `${productId} reference-rate provenance retained`);
  assertEqual(first.provenance.status, "end_of_day",
    `${productId} end-of-day provenance retained`);
  assertEqual(first.provenance.sourceTimestamp, series.metadata.sourceTimestamp,
    `${productId} sourceTimestamp retained`);
  assertEqual(first.engineResult.marketData.historicalWindow?.lastTimestamp,
    series.metadata.sourceTimestamp, `${productId} latest timestamp retained`);

  loadCount = 0;
  const second = await run(dependencies);
  assertEqual(loadCount, 1, `${productId} repeat uses one canonical load`);
  assertDeepEqual(second, first, `${productId} deterministic Engine result`);

  await assertRejects(() => run({
    loadCanonicalSeries: async () => {
      throw new Error("missing");
    },
  }), `${productId} missing series fails closed`);
  await assertRejects(() => run({
    loadCanonicalSeries: async () => officialSeries(productId, baseValue, 600, {
      requestedProductId: "eurusd",
    }),
  }), `${productId} wrong series fails closed`);
  await assertRejects(() => run({
    loadCanonicalSeries: async () => officialSeries(productId, baseValue, 199),
    now: dependencies.now,
  }), `${productId} insufficient history fails closed`);
}

function auditProductionSources(): void {
  const testsDirectory = fileURLToPath(new URL("../", import.meta.url));
  const marketsDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const appDirectory = fileURLToPath(new URL("../../../../app/", import.meta.url));
  const providerDirectory = `${marketsDirectory}providers/ecb/`;
  const sharedRuntime = readFileSync(
    `${marketsDirectory}assets/ecbFxProductionRuntime.ts`,
    "utf8",
  );
  const eurUsdRuntime = readFileSync(
    `${marketsDirectory}assets/eurusd/productionRuntime.ts`,
    "utf8",
  );
  const cacheSource = readFileSync(
    `${providerDirectory}fxReferenceSeriesCache.ts`,
    "utf8",
  );
  const resultServiceSource = readFileSync(
    `${marketsDirectory}services/canonicalProductResults.ts`,
    "utf8",
  );

  assertEqual(testsDirectory.endsWith("tests\\") ||
    testsDirectory.endsWith("tests/"), true, "test path resolved");
  assertEqual(sharedRuntime.includes("getCanonicalEcbFxReferenceSeriesV1(productId)"),
    true, "launch runtimes consume shared canonical ECB bundle");
  assertEqual(sharedRuntime.includes("createCanonicalMarketSnapshotV1"), true,
    "launch runtimes use canonical snapshot path");
  assertEqual(sharedRuntime.includes("runGenericAssetRuntimeV1"), true,
    "launch runtimes use Generic Engine V3 path");
  assertEqual(cacheSource.match(/= unstable_cache\(/g)?.length, 1,
    "exactly one shared ECB bundle cache");
  assertEqual(cacheSource.includes("24 * 60 * 60"), true,
    "shared ECB bundle cache is daily");
  assertEqual(eurUsdRuntime.includes("getCanonicalEcbFxReferenceSeriesV1(\"eurusd\")"),
    true, "EUR/USD uses same shared ECB acquisition/cache path");

  for (const configuration of configurations) {
    const { productId, runtimeExport } = configuration;
    const assetDirectory = `${marketsDirectory}assets/${productId}/`;
    const runtimeSource = readFileSync(`${assetDirectory}productionRuntime.ts`, "utf8");
    const routeSource = readFileSync(
      `${appDirectory}api/markets/${productId}/intelligence/route.ts`,
      "utf8",
    );
    const productionPath = `${sharedRuntime}\n${runtimeSource}\n${routeSource}`
      .toLowerCase();

    assertDeepEqual(readdirSync(assetDirectory).sort(),
      ["productionRuntime.ts", "profile.ts"],
    `${productId} has no pair-specific ECB client/cache`);
    assertEqual(runtimeSource.includes(`\"${productId}\"`), true,
      `${productId} runtime selects exact product`);
    assertEqual(resultServiceSource.includes(runtimeExport), true,
      `${productId} canonical owner selects correct production runtime`);
    assertEqual(routeSource.includes("getCanonicalProductResultV1"), false,
      `${productId} route cannot read canonical data before authorization`);
    assertEqual(routeSource.includes(
      `getFiveProductVipDeepResponseV1(\"${productId}\")`,
    ), true, `${productId} route requests exact protected VIP product`);
    assertEqual(routeSource.includes("unstable_cache"), false,
      `${productId} route owns no redundant final-result cache`);
    assertEqual(routeSource.includes("stale: false"), false,
      `${productId} route has no hard-coded freshness claim`);
    assertEqual(routeSource.includes("\"use client\""), false,
      `${productId} API is server-only`);
    assertEqual(productionPath.includes("yahoo"), false,
      `${productId} has no Yahoo dependency`);
    assertEqual(
      productionPath.includes("services/historicalmarketdata") ||
        productionPath.includes("services\\historicalmarketdata"),
      false,
      `${productId} has no historicalMarketData dependency`,
    );
    assertEqual(/\b(open|high|low|volume)\s*:/.test(sharedRuntime), false,
      `${productId} runtime does not synthesize OHLC or volume`);
    assertEqual(productionPath.includes("static fallback") ||
      productionPath.includes("commercial"), false,
    `${productId} has no static/commercial fallback`);
  }
}

async function main(): Promise<void> {
  for (const configuration of configurations) {
    await verifyProduct(configuration);
  }

  assertEqual(ECB_FX_REFERENCE_CACHE_SECONDS_V1, 86_400,
    "shared FX source cache cadence is 24 hours");
  auditProductionSources();

  console.log(
    "PASS: EUR/JPY, EUR/GBP, and EUR/CHF production runtimes and APIs",
  );
}

void main();
