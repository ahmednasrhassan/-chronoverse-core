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
import type { EcbFxReferenceSeriesBundleV1 } from "../providers/ecb/fxReferenceSeries";
import { getCanonicalEcbEstrSourceV1 } from "../providers/ecb/estrSeriesCache";
import {
  CANONICAL_PRODUCT_RESULT_CACHE_VERSION_V2,
  decodeCanonicalProductResultCacheV2,
  encodeCanonicalProductResultCacheV2,
  ownCanonicalResultPassiveDataV2,
  type CanonicalResultCacheTransportV2,
} from "./canonicalProductResultQualification";
import { CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 } from "./canonicalTemporalAdmission";
import type { EcbEstrSeriesV1 } from "../providers/ecb/estrTypes";
import {
  CANONICAL_FX_PREFLIGHT_ORDER_V1,
  CanonicalFxTemporalAdmissionErrorV1,
  qualifyCanonicalFxSourceForEvaluationV1,
  resolveCanonicalFxEvaluationInstantV1,
  unavailableCanonicalFxTemporalSourceV1,
  type CanonicalFxTemporalUnavailableV1,
  type QualifiedCanonicalFxSourceV1,
} from "./canonicalMarketSnapshot";
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

export interface CanonicalFxBundleComputationDependenciesV1 {
  readonly loadSourceBundle?: () => Promise<EcbFxReferenceSeriesBundleV1>;
  readonly evaluatedAt?: string;
  readonly now?: () => Date;
  readonly runtimes?: Readonly<{
    eurusd: typeof getCanonicalLiveEurUsdIntelligence;
    eurjpy: typeof getCanonicalLiveEurJpyIntelligence;
    eurgbp: typeof getCanonicalLiveEurGbpIntelligence;
    eurchf: typeof getCanonicalLiveEurChfIntelligence;
  }>;
}

export type CanonicalFxBundleComputationResultV1 =
  | { readonly availability: "available"; readonly evaluatedAt: string;
      readonly bundle: CanonicalFxResultBundleV1 }
  | CanonicalFxTemporalUnavailableV1;

/**
 * Fresh computation boundary, not a cache retrieval guard. Acquire the full
 * bundle, sample E once, and preflight USD/JPY/GBP/CHF before invoking any runtime.
 * No rejection retries an older source or calculation. Result retrieval has its
 * own v2 guard; Free/VIP propagation remains a separate activation boundary.
 */
export async function computeCanonicalFxResultBundleV1(
  dependencies: CanonicalFxBundleComputationDependenciesV1 = {},
): Promise<CanonicalFxBundleComputationResultV1> {
  const result = await computeCanonicalFxResultWithContextV2(dependencies);
  if (result.availability === "unavailable") return result;
  return Object.freeze({ availability: "available", evaluatedAt: result.evaluatedAt,
    bundle: result.bundle });
}

async function computeCanonicalFxResultWithContextV2(
  dependencies: CanonicalFxBundleComputationDependenciesV1 = {},
): Promise<CanonicalFxTemporalUnavailableV1 | {
  readonly availability: "available";
  readonly evaluatedAt: string;
  readonly bundle: CanonicalFxResultBundleV1;
  readonly sourceContext: EcbFxReferenceSeriesBundleV1;
}> {
  // Own explicit cutoff presence/value before acquisition; only absent cutoffs
  // sample the captured clock after the complete source has been acquired.
  const suppliedCutoff = "evaluatedAt" in dependencies
    ? resolveCanonicalFxEvaluationInstantV1(dependencies)
    : undefined;
  const evaluationClock = suppliedCutoff === undefined ? dependencies.now : undefined;
  let sourceBundle: EcbFxReferenceSeriesBundleV1;
  try {
    sourceBundle = await (dependencies.loadSourceBundle ??
      getCanonicalEcbFxReferenceSeriesBundleV1)();
  } catch {
    return unavailableCanonicalFxTemporalSourceV1("eurusd", "source-unavailable");
  }
  const evaluatedAt = suppliedCutoff ??
    resolveCanonicalFxEvaluationInstantV1({}, evaluationClock);
  const sources = new Map<keyof CanonicalFxResultBundleV1, QualifiedCanonicalFxSourceV1>();
  try {
    if (sourceBundle === null || typeof sourceBundle !== "object") {
      return unavailableCanonicalFxTemporalSourceV1("eurusd", "invalid-input");
    }
    const prototype = Object.getPrototypeOf(sourceBundle);
    const keys = Reflect.ownKeys(sourceBundle);
    if ((prototype !== Object.prototype && prototype !== null) ||
      keys.some((key) => typeof key !== "string" ||
        !CANONICAL_FX_PREFLIGHT_ORDER_V1.some((productId) => productId === key))) {
      return unavailableCanonicalFxTemporalSourceV1("eurusd", "invalid-input");
    }
    for (const productId of CANONICAL_FX_PREFLIGHT_ORDER_V1) {
      const descriptor = Object.getOwnPropertyDescriptor(sourceBundle, productId);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return unavailableCanonicalFxTemporalSourceV1(productId, "invalid-input");
      }
      const outcome = qualifyCanonicalFxSourceForEvaluationV1(productId, descriptor.value, evaluatedAt);
      if (outcome.availability === "unavailable") return outcome;
      sources.set(productId, outcome);
    }
  } catch {
    return unavailableCanonicalFxTemporalSourceV1("eurusd", "invalid-input");
  }
  const runtimes = dependencies.runtimes ?? {
    eurusd: getCanonicalLiveEurUsdIntelligence,
    eurjpy: getCanonicalLiveEurJpyIntelligence,
    eurgbp: getCanonicalLiveEurGbpIntelligence,
    eurchf: getCanonicalLiveEurChfIntelligence,
  };
  const loadSeries = (productId: keyof CanonicalFxResultBundleV1) =>
    async () => sources.get(productId)!.series;
  const [eurusd, eurjpy, eurgbp, eurchf] = await Promise.all([
    runtimes.eurusd({ loadCanonicalSeries: loadSeries("eurusd"), evaluatedAt }),
    runtimes.eurjpy({ loadCanonicalSeries: loadSeries("eurjpy"), evaluatedAt }),
    runtimes.eurgbp({ loadCanonicalSeries: loadSeries("eurgbp"), evaluatedAt }),
    runtimes.eurchf({ loadCanonicalSeries: loadSeries("eurchf"), evaluatedAt }),
  ]);
  return Object.freeze({ availability: "available", evaluatedAt,
    bundle: Object.freeze({ eurusd, eurjpy, eurgbp, eurchf }),
    sourceContext: Object.freeze({ eurusd: sources.get("eurusd")!.series,
      eurjpy: sources.get("eurjpy")!.series, eurgbp: sources.get("eurgbp")!.series,
      eurchf: sources.get("eurchf")!.series }) });
}

/** Cache only JSON-safe v2 transports. The raw getters are never delivery owners. */
const getCachedCanonicalFxResultEntryV2 = unstable_cache(
  async (): Promise<CanonicalResultCacheTransportV2> => {
    const result = await computeCanonicalFxResultWithContextV2();
    if (result.availability === "unavailable") {
      throw new CanonicalFxTemporalAdmissionErrorV1(result);
    }
    return encodeCanonicalProductResultCacheV2("launch-fx", {
      schemaVersion: CANONICAL_PRODUCT_RESULT_CACHE_VERSION_V2,
      policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
      family: "launch-fx", evaluatedAt: result.evaluatedAt,
      sourceContext: result.sourceContext, result: result.bundle,
    });
  },
  ["chronoverse", "markets", "canonical-product-result-v2", "launch-fx"],
  {
    revalidate: CANONICAL_PRODUCT_RESULT_CACHE_SECONDS_V1,
    tags: ["canonical-product-result-v2:launch-fx"],
  },
);

/** €STR has an independent result cache so rate-source failures cannot affect FX. */
const getCachedCanonicalEstrResultEntryV2 = unstable_cache(
  async () => {
    // Capture the complete wrapper and E through the runtime's existing loading
    // and post-acquisition clock path. Source failures and temporal rejections
    // retain their established runtime behavior, before any cache encoding.
    let sourceContext: EcbEstrSeriesV1 | undefined;
    let evaluatedAt: string | undefined;
    const result = await getEstrProductionRuntimeV1({
      loadSource: async () => {
        const source = await getCanonicalEcbEstrSourceV1();
        try {
          sourceContext = ownCanonicalResultPassiveDataV2(source);
          return sourceContext;
        } catch {
          // Let approved runtime qualification classify the original malformed
          // source. An unowned context can never pass the cache payload guard.
          return source;
        }
      },
      now: () => {
        const now = new Date();
        evaluatedAt = Date.prototype.toISOString.call(now);
        return now;
      },
    });

    if (result.availability === "unavailable") {
      throw new UncacheableCanonicalResultErrorV1(result);
    }

    return encodeCanonicalProductResultCacheV2("estr", {
      schemaVersion: CANONICAL_PRODUCT_RESULT_CACHE_VERSION_V2,
      policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
      family: "estr", evaluatedAt, sourceContext, result,
    });
  },
  ["chronoverse", "markets", "canonical-product-result-v2", "estr"],
  {
    revalidate: CANONICAL_PRODUCT_RESULT_CACHE_SECONDS_V1,
    tags: ["canonical-product-result-v2:estr"],
  },
);

/** Guard every framework response, including retained SWR data after a failed
 * refresh. Revalidation is not a hard expiry; there is no old-namespace retry.
 * The injected reader is also the deterministic cache-state testing boundary.
 */
export async function getGuardedCanonicalFxResultBundleV2(
  loadEntry: () => Promise<unknown> = getCachedCanonicalFxResultEntryV2,
): Promise<CanonicalFxResultBundleV1> {
  return decodeCanonicalProductResultCacheV2("launch-fx", await loadEntry()).result;
}

export async function getGuardedCanonicalEstrResultV2(
  loadEntry: () => Promise<unknown> = getCachedCanonicalEstrResultEntryV2,
): Promise<EstrProductionRuntimeResultV1> {
  return decodeCanonicalProductResultCacheV2("estr", await loadEntry()).result;
}

// Preserve the private delivery-owner name used by Free/VIP composition.
// This alias always decodes the v2 entry; it cannot expose the raw cache getter.
const getCachedCanonicalFxResultBundleV1 = getGuardedCanonicalFxResultBundleV2;

async function getCanonicalEstrResultV1(): Promise<EstrProductionRuntimeResultV1> {
  try {
    return await getGuardedCanonicalEstrResultV2();
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
  eurusd: async () => (await getGuardedCanonicalFxResultBundleV2()).eurusd,
  eurjpy: async () => (await getGuardedCanonicalFxResultBundleV2()).eurjpy,
  eurgbp: async () => (await getGuardedCanonicalFxResultBundleV2()).eurgbp,
  eurchf: async () => (await getGuardedCanonicalFxResultBundleV2()).eurchf,
  estr: getCanonicalEstrResultV1,
});

export const getCanonicalProductResultV1 = canonicalProductResultOwnerV1.get;

export async function getFiveProductFreeLiteProjectionV1(
  productId: CanonicalProductIdV1,
): Promise<MarketProductFreeLiteProjectionV1> {
  await connection();
  return projectFiveProductFreeLiteV1(
    await getCanonicalProjectionInputV1(productId),
    new Date().toISOString(),
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

  const assessedAt = new Date().toISOString();
  return Object.freeze({
    eurusd: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurusd",
        canonical: fx.eurusd,
      }, assessedAt),
    eurjpy: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurjpy",
        canonical: fx.eurjpy,
      }, assessedAt),
    eurgbp: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurgbp",
        canonical: fx.eurgbp,
      }, assessedAt),
    eurchf: fx === null
      ? null
      : projectFiveProductFreeLiteV1({
        productId: "eurchf",
        canonical: fx.eurchf,
      }, assessedAt),
    estr: estr === null
      ? null
      : projectFiveProductFreeLiteV1({ productId: "estr", canonical: estr }, assessedAt),
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
