import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getEstrProductionRuntimeV1,
  type EstrProductionRuntimeResultV1,
} from "../../assets/estr/runtime";
import {
  ECB_ESTR_DATAFLOW_V1,
  ECB_ESTR_SERIES_ID_V1,
  ECB_ESTR_SERIES_KEY_V1,
} from "../../providers/ecb/estrContract";
import type {
  EcbEstrObservationMetadataV1,
  EcbEstrSeriesV1,
} from "../../providers/ecb/estrTypes";
import {
  projectFiveProductFreeLiteV1,
  projectFiveProductVipDeepV1,
} from "../../projections/fiveProductProjections";
import {
  createCanonicalProductResultOwnerV1,
  type CanonicalProductIdV1,
} from "../../services/canonicalProductResultOwnership";
import {
  normalizeCanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";

const FX_PRODUCT_IDS = Object.freeze([
  "eurusd",
  "eurjpy",
  "eurgbp",
  "eurchf",
] as const satisfies readonly CanonicalProductIdV1[]);

const PRODUCT_IDS = Object.freeze([
  ...FX_PRODUCT_IDS,
  "estr",
] as const satisfies readonly CanonicalProductIdV1[]);

interface SelectionResultV1 {
  readonly selectedProductId: CanonicalProductIdV1;
}

type SelectionResultMapV1 = {
  readonly [TProductId in CanonicalProductIdV1]: SelectionResultV1 & {
    readonly selectedProductId: TProductId;
  };
};

interface EstrOwnershipResultMapV1 {
  readonly eurusd: SelectionResultMapV1["eurusd"];
  readonly eurjpy: SelectionResultMapV1["eurjpy"];
  readonly eurgbp: SelectionResultMapV1["eurgbp"];
  readonly eurchf: SelectionResultMapV1["eurchf"];
  readonly estr: EstrProductionRuntimeResultV1;
}

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

function memoizeResult<TResult>(
  load: () => Promise<TResult>,
): () => Promise<TResult> {
  let entry: Promise<TResult> | undefined;

  return () => {
    entry ??= load();
    return entry;
  };
}

function officialEstrSource(): EcbEstrSeriesV1 {
  const observations = Array.from({ length: 220 }, (_, index) => ({
    timestamp: Date.UTC(2025, 0, 1 + index) / 1_000,
    value: 2 + index * 0.0005 + Math.sin(index / 7) * 0.01,
  }));
  const observationMetadata: readonly EcbEstrObservationMetadataV1[] =
    observations.map((observation) => Object.freeze({
      referenceDate: new Date(observation.timestamp * 1_000)
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
      fetchedAt: 1_757_491_200,
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

async function verifyRuntimeSelectionAndCacheOwnership(): Promise<void> {
  const runtimeCalls = Object.fromEntries(
    PRODUCT_IDS.map((productId) => [productId, 0]),
  ) as Record<CanonicalProductIdV1, number>;
  const cacheScopes = Object.freeze(["launch-fx", "estr"] as const);
  const getFxBundle = memoizeResult(async () => {
    const result = <TProductId extends typeof FX_PRODUCT_IDS[number]>(
      productId: TProductId,
    ) => {
      runtimeCalls[productId] += 1;
      return Object.freeze({ selectedProductId: productId });
    };

    return Object.freeze({
      eurusd: result("eurusd"),
      eurjpy: result("eurjpy"),
      eurgbp: result("eurgbp"),
      eurchf: result("eurchf"),
    });
  });
  const getEstr = memoizeResult(async () => {
    runtimeCalls.estr += 1;
    return Object.freeze({ selectedProductId: "estr" as const });
  });
  const owner = createCanonicalProductResultOwnerV1<SelectionResultMapV1>(
    {
      eurusd: async () => (await getFxBundle()).eurusd,
      eurjpy: async () => (await getFxBundle()).eurjpy,
      eurgbp: async () => (await getFxBundle()).eurgbp,
      eurchf: async () => (await getFxBundle()).eurchf,
      estr: getEstr,
    },
  );

  assertDeepEqual(cacheScopes, ["launch-fx", "estr"],
    "FX and rate result cache scopes do not collide");

  for (const productId of PRODUCT_IDS) {
    const first = await owner.get(productId);
    const second = await owner.get(productId);

    assertEqual(first.selectedProductId, productId,
      `${productId} selects its exact runtime`);
    assertEqual(second, first, `${productId} repeated retrieval reuses result`);
    assertEqual(runtimeCalls[productId], 1,
      `${productId} canonical computation executes once`);
  }
}

async function verifyProjectionDeliveryOwnership(): Promise<void> {
  let estrRuntimeCalls = 0;
  let estrSourceCalls = 0;
  const sentinel = <TProductId extends Exclude<CanonicalProductIdV1, "estr">>(
    selectedProductId: TProductId,
  ) => async () => Object.freeze({ selectedProductId });
  const owner = createCanonicalProductResultOwnerV1<EstrOwnershipResultMapV1>({
    eurusd: sentinel("eurusd"),
    eurjpy: sentinel("eurjpy"),
    eurgbp: sentinel("eurgbp"),
    eurchf: sentinel("eurchf"),
    estr: memoizeResult(async () => {
      estrRuntimeCalls += 1;
      return getEstrProductionRuntimeV1({
        loadSource: async () => {
          estrSourceCalls += 1;
          return officialEstrSource();
        },
      });
    }),
  });
  const freeCanonical = await owner.get("estr");
  const vipCanonical = await owner.get("estr");
  const free = projectFiveProductFreeLiteV1({
    productId: "estr",
    canonical: freeCanonical,
  });
  const vip = projectFiveProductVipDeepV1({
    productId: "estr",
    canonical: vipCanonical,
  });

  assertEqual(vipCanonical, freeCanonical,
    "Free and VIP consume the same cached canonical result");
  assertEqual(estrRuntimeCalls, 1, "Free and VIP do not execute separate runtimes");
  assertEqual(estrSourceCalls, 1, "Free and VIP do not execute separate source loads");
  assertEqual(free.availability, "available", "Free projection available");
  assertEqual(vip.availability, "available", "VIP projection available");
  if (free.availability !== "available" || vip.availability !== "available" ||
    freeCanonical.availability !== "available") {
    throw new Error("Expected available \u20acSTR ownership fixtures.");
  }

  assertEqual(free.details.kind, "rate", "Free remains rate-specific");
  assertEqual(vip.details.kind, "rate", "VIP remains rate-specific");
  if (free.details.kind !== "rate" || vip.details.kind !== "rate") {
    throw new Error("Expected rate-specific projection details.");
  }
  assertEqual(free.details.currentRatePercent,
    freeCanonical.data.currentRatePercent, "Free uses canonical current rate");
  assertEqual(vip.details.signal, freeCanonical.data.signal.data,
    "VIP uses exact canonical Signal");
  assertEqual(vip.details.risk, freeCanonical.data.risk.data,
    "VIP uses exact canonical Risk");

  const publicRatePayload = `${JSON.stringify(free)}\n${JSON.stringify(vip)}`
    .toLowerCase();
  for (const forbidden of ["bullish", "bearish", '"price"']) {
    assertEqual(publicRatePayload.includes(forbidden), false,
      `\u20acSTR projections exclude ${forbidden}`);
  }
}

async function verifyUnavailableRemainsUnavailable(): Promise<void> {
  let runtimeCalls = 0;
  const unavailable = Object.freeze({
    availability: "unavailable",
    reason: "Official ECB \u20acSTR source is unavailable.",
    missing: Object.freeze(["source"] as const),
  }) satisfies EstrProductionRuntimeResultV1;
  const sentinel = <TProductId extends Exclude<CanonicalProductIdV1, "estr">>(
    selectedProductId: TProductId,
  ) => async () => Object.freeze({ selectedProductId });
  const owner = createCanonicalProductResultOwnerV1<EstrOwnershipResultMapV1>({
    eurusd: sentinel("eurusd"),
    eurjpy: sentinel("eurjpy"),
    eurgbp: sentinel("eurgbp"),
    eurchf: sentinel("eurchf"),
    estr: memoizeResult(async () => {
      runtimeCalls += 1;
      return unavailable;
    }),
  });
  const canonical = await owner.get("estr");
  const free = projectFiveProductFreeLiteV1({ productId: "estr", canonical });
  const vip = projectFiveProductVipDeepV1({
    productId: "estr",
    canonical: await owner.get("estr"),
  });

  assertEqual(runtimeCalls, 1, "unavailable result still has one shared execution");
  assertEqual(free.availability, "unavailable", "Free remains unavailable");
  assertEqual(vip.availability, "unavailable", "VIP remains unavailable");
  assertEqual("currentValue" in free, false, "Free fabricates no neutral value");
  assertEqual("currentValue" in vip, false, "VIP fabricates no neutral value");
}

function auditProductionOwnership(): void {
  const marketsDirectory = fileURLToPath(new URL("../../", import.meta.url));
  const appDirectory = fileURLToPath(new URL("../../../../app/", import.meta.url));
  const serviceSource = readFileSync(
    `${marketsDirectory}services/canonicalProductResults.ts`,
    "utf8",
  );
  const ownershipSource = readFileSync(
    `${marketsDirectory}services/canonicalProductResultOwnership.ts`,
    "utf8",
  );
  const fxSourceCache = readFileSync(
    `${marketsDirectory}providers/ecb/fxReferenceSeriesCache.ts`,
    "utf8",
  );
  const estrSourceCache = readFileSync(
    `${marketsDirectory}providers/ecb/estrSeriesCache.ts`,
    "utf8",
  );
  const estrRouteSource = readFileSync(
    `${appDirectory}api/markets/estr/intelligence/route.ts`,
    "utf8",
  );

  assertEqual(serviceSource.includes('import "server-only"'), true,
    "production canonical result owner is server-only");
  assertEqual(serviceSource.includes("24 * 60 * 60"), true,
    "canonical result cadence is daily");
  assertEqual(serviceSource.match(/= unstable_cache\(/g)?.length, 2,
    "exactly one FX bundle and one \u20acSTR result cache are configured");
  assertEqual(serviceSource.includes("UncacheableCanonicalResultErrorV1"), true,
    "unavailable canonical results bypass persistent caching");
  assertEqual(serviceSource.includes("fetch("), false,
    "canonical result owner performs no direct provider fetch");
  assertEqual(serviceSource.toLowerCase().includes("yahoo"), false,
    "canonical result owner has no fallback provider");
  assertEqual(serviceSource.includes("getFiveProductFreeLiteProjectionV1"), true,
    "server Free projection delivery is exported");
  assertEqual(serviceSource.includes("getFiveProductVipDeepProjectionV1"), true,
    "server VIP projection delivery is exported");
  assertEqual(serviceSource.includes("canonical-product-result-v1:launch-fx"),
    true, "atomic FX result bundle has a dedicated cache key and tag");
  assertEqual(serviceSource.includes("canonical-product-result-v1:estr"),
    true, "\u20acSTR result has a dedicated cache key and tag");
  assertEqual(serviceSource.includes("stale: false"), false,
    "canonical result owner has no hard-coded freshness claim");
  assertEqual(ownershipSource.includes("fetch("), false,
    "ownership factory performs no provider fetch");
  assertEqual(fxSourceCache.match(/= unstable_cache\(/g)?.length, 1,
    "one atomic FX source-bundle cache remains");
  assertEqual(estrSourceCache.match(/= unstable_cache\(/g)?.length, 1,
    "one \u20acSTR full-history source cache remains");
  assertEqual(estrRouteSource.includes("getCanonicalProductResultV1"), false,
    "\u20acSTR route cannot read canonical data before authorization");
  assertEqual(estrRouteSource.includes(
    "getFiveProductVipDeepResponseV1(\"estr\")",
  ), true, "\u20acSTR API requests exact protected VIP product");

  const runtimeSelections = {
    eurusd: "getCanonicalLiveEurUsdIntelligence",
    eurjpy: "getCanonicalLiveEurJpyIntelligence",
    eurgbp: "getCanonicalLiveEurGbpIntelligence",
    eurchf: "getCanonicalLiveEurChfIntelligence",
    estr: "getEstrProductionRuntimeV1",
  } as const;

  for (const productId of PRODUCT_IDS) {
    assertEqual(serviceSource.includes(runtimeSelections[productId]), true,
      `${productId} production runtime is wired into canonical ownership`);

    const routeSource = readFileSync(
      `${appDirectory}api/markets/${productId}/intelligence/route.ts`,
      "utf8",
    );
    assertEqual(routeSource.includes("unstable_cache"), false,
      `${productId} route owns no result cache`);
    assertEqual(routeSource.includes("stale: false"), false,
      `${productId} route has no hard-coded non-stale claim`);
    assertEqual(routeSource.toLowerCase().includes("yahoo"), false,
      `${productId} route has no fallback provider`);
  }
}

async function main(): Promise<void> {
  await verifyRuntimeSelectionAndCacheOwnership();
  await verifyProjectionDeliveryOwnership();
  await verifyUnavailableRemainsUnavailable();
  auditProductionOwnership();

  console.log("PASS: five-product canonical result ownership and delivery");
}

void main();
