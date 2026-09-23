import "server-only";

import { unstable_cache } from "next/cache";
import { connection } from "next/server";

import {
  getEstrProductionRuntimeV1,
  type EstrProductionRuntimeResultV1,
} from "../assets/estr/runtime";
import {
  getCanonicalLiveEurChfIntelligence,
  type EurChfProductionIntelligenceV1,
} from "../assets/eurchf/productionRuntime";
import {
  getCanonicalLiveEurGbpIntelligence,
  type EurGbpProductionIntelligenceV1,
} from "../assets/eurgbp/productionRuntime";
import {
  getCanonicalLiveEurJpyIntelligence,
  type EurJpyProductionIntelligenceV1,
} from "../assets/eurjpy/productionRuntime";
import {
  getCanonicalLiveEurUsdIntelligence,
  type EurUsdProductionIntelligenceV1,
} from "../assets/eurusd/productionRuntime";
import {
  projectFiveProductFreeLiteV1,
  projectFiveProductVipDeepV1,
} from "../projections/fiveProductProjections";
import {
  getCanonicalEcbFxReferenceSeriesBundleV1,
} from "../providers/ecb/fxReferenceSeriesCache";
import {
  selectEcbFxReferenceSeriesV1,
} from "../providers/ecb/fxReferenceSeries";
import type {
  FiveProductCanonicalProjectionInputV1,
  MarketProductFreeLiteProjectionV1,
  MarketProductVipEcbPolicyEventStateV1,
  MarketProductVipDeepProjectionV1,
} from "../projections/types";
import {
  createCanonicalProductResultOwnerV1,
  type CanonicalProductIdV1,
} from "./canonicalProductResultOwnership";
import {
  getEcbMonetaryPolicyEventRuntimeV1,
  type EcbMonetaryPolicyEventRuntimeResultV1,
} from "./ecbMonetaryPolicyEventRuntime";

export const CANONICAL_PRODUCT_RESULT_CACHE_SECONDS_V1 = 24 * 60 * 60;

export interface CanonicalProductResultMapV1 {
  readonly eurusd: EurUsdProductionIntelligenceV1;
  readonly eurjpy: EurJpyProductionIntelligenceV1;
  readonly eurgbp: EurGbpProductionIntelligenceV1;
  readonly eurchf: EurChfProductionIntelligenceV1;
  readonly estr: EstrProductionRuntimeResultV1;
}

export type FiveProductFreeLiteProjectionMapV1 = Readonly<{
  [TProductId in CanonicalProductIdV1]: MarketProductFreeLiteProjectionV1 | null;
}>;

export type FiveProductVipDeepProjectionMapV1 = Readonly<{
  [TProductId in CanonicalProductIdV1]: MarketProductVipDeepProjectionV1 | null;
}>;

class UncacheableCanonicalResultErrorV1 extends Error {
  readonly result: unknown;

  constructor(result: unknown) {
    super("Unavailable canonical product results must not be cached.");
    this.name = "UncacheableCanonicalResultErrorV1";
    this.result = result;
  }
}

type CanonicalFxResultBundleV1 = Pick<
  CanonicalProductResultMapV1,
  "eurusd" | "eurjpy" | "eurgbp" | "eurchf"
>;

export interface FiveProductVipDeepSingleDependenciesV1 {
  readonly now: () => string;
  readonly loadCanonical: (
    productId: CanonicalProductIdV1,
  ) => Promise<FiveProductCanonicalProjectionInputV1>;
  readonly loadEventRuntime: (input: {
    readonly evaluatedAt: string;
  }) => Promise<EcbMonetaryPolicyEventRuntimeResultV1>;
}

export interface FiveProductVipDeepMapDependenciesV1 {
  readonly now: () => string;
  readonly loadFxBundle: () => Promise<CanonicalFxResultBundleV1>;
  readonly loadEstr: () => Promise<EstrProductionRuntimeResultV1>;
  readonly loadEventRuntime: (input: {
    readonly evaluatedAt: string;
  }) => Promise<EcbMonetaryPolicyEventRuntimeResultV1>;
}

/** One persisted FX result bundle preserves the source bundle's atomicity. */
const getCachedCanonicalFxResultBundleV1 = unstable_cache(
  async (): Promise<CanonicalFxResultBundleV1> => {
    const sourceBundle = await getCanonicalEcbFxReferenceSeriesBundleV1();
    const loadSeries = (productId: "eurusd" | "eurjpy" | "eurgbp" | "eurchf") =>
      async () => selectEcbFxReferenceSeriesV1(sourceBundle, productId);
    const [eurusd, eurjpy, eurgbp, eurchf] = await Promise.all([
      getCanonicalLiveEurUsdIntelligence({
        loadCanonicalSeries: loadSeries("eurusd"),
      }),
      getCanonicalLiveEurJpyIntelligence({
        loadCanonicalSeries: loadSeries("eurjpy"),
      }),
      getCanonicalLiveEurGbpIntelligence({
        loadCanonicalSeries: loadSeries("eurgbp"),
      }),
      getCanonicalLiveEurChfIntelligence({
        loadCanonicalSeries: loadSeries("eurchf"),
      }),
    ]);

    return Object.freeze({ eurusd, eurjpy, eurgbp, eurchf });
  },
  ["chronoverse", "markets", "canonical-product-result-v1", "launch-fx"],
  {
    revalidate: CANONICAL_PRODUCT_RESULT_CACHE_SECONDS_V1,
    tags: ["canonical-product-result-v1:launch-fx"],
  },
);

/** €STR has an independent result cache so rate-source failures cannot affect FX. */
const getCachedCanonicalEstrResultV1 = unstable_cache(
  async () => {
    const result = await getEstrProductionRuntimeV1();

    if (result.availability === "unavailable") {
      throw new UncacheableCanonicalResultErrorV1(result);
    }

    return result;
  },
  ["chronoverse", "markets", "canonical-product-result-v1", "estr"],
  {
    revalidate: CANONICAL_PRODUCT_RESULT_CACHE_SECONDS_V1,
    tags: ["canonical-product-result-v1:estr"],
  },
);

async function getCanonicalEstrResultV1(): Promise<EstrProductionRuntimeResultV1> {
  try {
    return await getCachedCanonicalEstrResultV1();
  } catch (error) {
    if (error instanceof UncacheableCanonicalResultErrorV1) {
      return error.result as EstrProductionRuntimeResultV1;
    }

    throw error;
  }
}

const canonicalProductResultOwnerV1 = createCanonicalProductResultOwnerV1<
  CanonicalProductResultMapV1
>({
  eurusd: async () => (await getCachedCanonicalFxResultBundleV1()).eurusd,
  eurjpy: async () => (await getCachedCanonicalFxResultBundleV1()).eurjpy,
  eurgbp: async () => (await getCachedCanonicalFxResultBundleV1()).eurgbp,
  eurchf: async () => (await getCachedCanonicalFxResultBundleV1()).eurchf,
  estr: getCanonicalEstrResultV1,
});

export const getCanonicalProductResultV1 = canonicalProductResultOwnerV1.get;

export async function getFiveProductFreeLiteProjectionV1(
  productId: CanonicalProductIdV1,
): Promise<MarketProductFreeLiteProjectionV1> {
  await connection();
  return projectFiveProductFreeLiteV1(
    await getCanonicalProjectionInputV1(productId),
  );
}

/**
 * Loads the public launch universe through the two existing cache owners:
 * one atomic FX bundle and one independent €STR result. An unexpected failure
 * in either source family becomes a null entry for that family so the public
 * surface can render the remaining verified projections without retry storms.
 */
export async function getFiveProductFreeLiteProjectionMapV1(): Promise<
  FiveProductFreeLiteProjectionMapV1
> {
  await connection();
  const [fxResult, estrResult] = await Promise.allSettled([
    getCachedCanonicalFxResultBundleV1(),
    getCanonicalEstrResultV1(),
  ]);
  const fx = fxResult.status === "fulfilled" ? fxResult.value : null;
  const estr = estrResult.status === "fulfilled" ? estrResult.value : null;

  return Object.freeze({
    eurusd: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurusd",
        canonical: fx.eurusd,
      }),
    eurjpy: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurjpy",
        canonical: fx.eurjpy,
      }),
    eurgbp: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurgbp",
        canonical: fx.eurgbp,
      }),
    eurchf: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurchf",
        canonical: fx.eurchf,
      }),
    estr: estr === null
      ? null
      : projectFiveProductFreeLiteV1({ productId: "estr", canonical: estr }),
  });
}

export async function getFiveProductVipDeepProjectionV1(
  productId: CanonicalProductIdV1,
): Promise<MarketProductVipDeepProjectionV1> {
  await connection();
  return assembleFiveProductVipDeepProjectionV1(productId, {
    now: () => new Date().toISOString(),
    loadCanonical: getCanonicalProjectionInputV1,
    loadEventRuntime: getEcbMonetaryPolicyEventRuntimeV1,
  });
}

export async function assembleFiveProductVipDeepProjectionV1(
  productId: CanonicalProductIdV1,
  dependencies: FiveProductVipDeepSingleDependenciesV1,
): Promise<MarketProductVipDeepProjectionV1> {
  const assessedAt = dependencies.now();
  const [canonical, event] = await Promise.all([
    dependencies.loadCanonical(productId),
    loadVipEcbPolicyEventStateV1(
      assessedAt,
      dependencies.loadEventRuntime,
    ),
  ]);

  return projectFiveProductVipDeepV1(canonical, event, assessedAt);
}

/**
 * Assembles the complete VIP launch universe from the same two shared
 * canonical cache owners used by Free: one atomic FX bundle and one €STR
 * result. Callers must authorize VIP access before invoking this function.
 */
export async function getFiveProductVipDeepProjectionMapV1(): Promise<
  FiveProductVipDeepProjectionMapV1
> {
  await connection();
  return assembleFiveProductVipDeepProjectionMapV1({
    now: () => new Date().toISOString(),
    loadFxBundle: getCachedCanonicalFxResultBundleV1,
    loadEstr: getCanonicalEstrResultV1,
    loadEventRuntime: getEcbMonetaryPolicyEventRuntimeV1,
  });
}

export async function assembleFiveProductVipDeepProjectionMapV1(
  dependencies: FiveProductVipDeepMapDependenciesV1,
): Promise<FiveProductVipDeepProjectionMapV1> {
  const assessedAt = dependencies.now();
  const [marketResults, event] = await Promise.all([
    Promise.allSettled([
      dependencies.loadFxBundle(),
      dependencies.loadEstr(),
    ]),
    loadVipEcbPolicyEventStateV1(
      assessedAt,
      dependencies.loadEventRuntime,
    ),
  ]);
  const [fxResult, estrResult] = marketResults;
  const fx = fxResult.status === "fulfilled" ? fxResult.value : null;
  const estr = estrResult.status === "fulfilled" ? estrResult.value : null;

  return Object.freeze({
    eurusd: fx === null
      ? null
      : projectFiveProductVipDeepV1({
        productId: "eurusd",
        canonical: fx.eurusd,
      }, event, assessedAt),
    eurjpy: fx === null
      ? null
      : projectFiveProductVipDeepV1({
        productId: "eurjpy",
        canonical: fx.eurjpy,
      }, event, assessedAt),
    eurgbp: fx === null
      ? null
      : projectFiveProductVipDeepV1({
        productId: "eurgbp",
        canonical: fx.eurgbp,
      }, event, assessedAt),
    eurchf: fx === null
      ? null
      : projectFiveProductVipDeepV1({
        productId: "eurchf",
        canonical: fx.eurchf,
      }, event, assessedAt),
    estr: estr === null
      ? null
      : projectFiveProductVipDeepV1(
          { productId: "estr", canonical: estr },
          event,
          assessedAt,
        ),
  });
}

export function mapEcbPolicyEventRuntimeToVipStateV1(
  result: EcbMonetaryPolicyEventRuntimeResultV1,
): MarketProductVipEcbPolicyEventStateV1 {
  switch (result.status) {
    case "available":
      return Object.freeze({
        status: result.status,
        canonicalEventId: result.canonicalEventId,
        canonicalMeetingDate: result.canonicalMeetingDate,
        currentMeetingDate: result.currentMeetingDate,
        selectedSnapshotKnownAt: result.selectedSnapshotKnownAt,
        selectionState: result.selectionState,
        intelligence: result.intelligence,
        source: Object.freeze({
          sourceUrl: result.source.sourceUrl,
          fetchedAt: result.source.fetchedAt,
        }),
      });
    case "source-unavailable":
    case "source-malformed":
      return Object.freeze({
        status: result.status,
        sourceUrl: result.sourceUrl,
        reason: result.reason,
      });
    case "no-relevant-event":
      return Object.freeze({
        status: result.status,
        sourceUrl: result.sourceUrl,
        fetchedAt: result.fetchedAt,
      });
    case "reconciliation-required":
      return Object.freeze({
        status: result.status,
        reason: result.reason,
        ...(result.canonicalEventId === undefined
          ? {} : { canonicalEventId: result.canonicalEventId }),
        ...(result.currentMeetingDate === undefined
          ? {} : { currentMeetingDate: result.currentMeetingDate }),
        ...(result.conflictingMeetingDate === undefined
          ? {} : { conflictingMeetingDate: result.conflictingMeetingDate }),
      });
    case "persistence-unavailable":
      return Object.freeze({
        status: result.status,
        owner: result.owner,
        reason: result.reason,
      });
    case "stored-state-invalid":
      return Object.freeze({ status: result.status, owner: result.owner });
    case "insufficient-as-known-state":
      return Object.freeze({
        status: result.status,
        canonicalEventId: result.canonicalEventId,
        evaluatedAt: result.evaluatedAt,
      });
  }
}

async function loadVipEcbPolicyEventStateV1(
  assessedAt: string,
  loadRuntime: FiveProductVipDeepSingleDependenciesV1["loadEventRuntime"],
): Promise<MarketProductVipEcbPolicyEventStateV1> {
  try {
    return mapEcbPolicyEventRuntimeToVipStateV1(
      await loadRuntime({ evaluatedAt: assessedAt }),
    );
  } catch {
    return Object.freeze({
      status: "runtime-unavailable",
      reason: "unexpected-runtime-error",
    });
  }
}

async function getCanonicalProjectionInputV1(
  productId: CanonicalProductIdV1,
): Promise<FiveProductCanonicalProjectionInputV1> {
  switch (productId) {
    case "eurusd":
      return { productId, canonical: await getCanonicalProductResultV1(productId) };
    case "eurjpy":
      return { productId, canonical: await getCanonicalProductResultV1(productId) };
    case "eurgbp":
      return { productId, canonical: await getCanonicalProductResultV1(productId) };
    case "eurchf":
      return { productId, canonical: await getCanonicalProductResultV1(productId) };
    case "estr":
      return { productId, canonical: await getCanonicalProductResultV1(productId) };
  }
}
