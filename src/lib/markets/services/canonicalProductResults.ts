import "server-only";

import { unstable_cache } from "next/cache";

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
  MarketProductVipDeepProjectionV1,
} from "../projections/types";
import {
  createCanonicalProductResultOwnerV1,
  type CanonicalProductIdV1,
} from "./canonicalProductResultOwnership";

export const CANONICAL_PRODUCT_RESULT_CACHE_SECONDS_V1 = 24 * 60 * 60;

export interface CanonicalProductResultMapV1 {
  readonly eurusd: EurUsdProductionIntelligenceV1;
  readonly eurjpy: EurJpyProductionIntelligenceV1;
  readonly eurgbp: EurGbpProductionIntelligenceV1;
  readonly eurchf: EurChfProductionIntelligenceV1;
  readonly estr: EstrProductionRuntimeResultV1;
}

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
  return projectFiveProductFreeLiteV1(
    await getCanonicalProjectionInputV1(productId),
  );
}

export async function getFiveProductVipDeepProjectionV1(
  productId: CanonicalProductIdV1,
): Promise<MarketProductVipDeepProjectionV1> {
  return projectFiveProductVipDeepV1(
    await getCanonicalProjectionInputV1(productId),
  );
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
