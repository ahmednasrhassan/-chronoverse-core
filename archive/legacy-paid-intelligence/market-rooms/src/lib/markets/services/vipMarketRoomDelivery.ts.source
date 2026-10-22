import "server-only";

import type {
  EstrVipDeepProjectionV1,
  FxProjectionProductIdV1,
  FxVipDeepProjectionV1,
  MarketProductUnavailableProjectionV1,
  MarketProductVipDeepProjectionV1,
  MarketProjectionProductIdV1,
} from "../projections/types";
import type {
  HistoricalChartSeriesOptionsV1,
  HistoricalChartSeriesV1,
} from "./historicalChartSeries";
import type { HistoricalRangeV1 } from "./historicalRange";

export const VIP_FX_MARKET_ROOM_IDS_V1 = Object.freeze([
  "eurusd",
  "eurjpy",
  "eurgbp",
  "eurchf",
] as const satisfies readonly FxProjectionProductIdV1[]);

export type VipFxMarketRoomIdV1 =
  (typeof VIP_FX_MARKET_ROOM_IDS_V1)[number];

export type VipFxMarketRoomDeepV1 =
  | FxVipDeepProjectionV1
  | MarketProductUnavailableProjectionV1
  | null;

export interface VipFxMarketRoomHistoryV1 {
  /** Selected-pair envelope used for local 1M through 2Y projection. */
  readonly twoYear: HistoricalChartSeriesV1 | null;
  /** Exact conditional C4-B result controls whether 5D is actionable. */
  readonly fiveDay: HistoricalChartSeriesV1 | null;
}

export interface VipFxMarketRoomV1 {
  readonly productId: VipFxMarketRoomIdV1;
  readonly deep: VipFxMarketRoomDeepV1;
  readonly history: VipFxMarketRoomHistoryV1;
}

export type VipEstrMarketRoomDeepV1 =
  | EstrVipDeepProjectionV1
  | MarketProductUnavailableProjectionV1
  | null;

export interface VipEstrMarketRoomHistoryV1 {
  /** Official selected-product history from €STR series inception. */
  readonly maximum: HistoricalChartSeriesV1 | null;
  /** Exact conditional C4-B result controls whether 5D is actionable. */
  readonly fiveDay: HistoricalChartSeriesV1 | null;
}

export interface VipEstrMarketRoomV1 {
  readonly productId: "estr";
  readonly deep: VipEstrMarketRoomDeepV1;
  readonly history: VipEstrMarketRoomHistoryV1;
}

export type VipMarketRoomV1 = VipFxMarketRoomV1 | VipEstrMarketRoomV1;

export interface VipFxMarketRoomDeliveryDependenciesV1 {
  readonly authorize: () => PromiseLike<unknown>;
  readonly loadDeep: (
    productId: VipFxMarketRoomIdV1,
  ) => PromiseLike<MarketProductVipDeepProjectionV1>;
  readonly loadHistorical: (
    productId: VipFxMarketRoomIdV1,
    range: HistoricalRangeV1,
    options: HistoricalChartSeriesOptionsV1,
  ) => PromiseLike<HistoricalChartSeriesV1>;
}

export interface VipMarketRoomDeliveryDependenciesV1 {
  readonly authorize: () => PromiseLike<unknown>;
  readonly loadDeep: (
    productId: MarketProjectionProductIdV1,
  ) => PromiseLike<MarketProductVipDeepProjectionV1>;
  readonly loadHistorical: (
    productId: MarketProjectionProductIdV1,
    range: HistoricalRangeV1,
    options: HistoricalChartSeriesOptionsV1,
  ) => PromiseLike<HistoricalChartSeriesV1>;
}

/** Authorizes once before validating and dispatching any protected room. */
export async function assembleAuthorizedVipMarketRoomV1(
  productCandidate: unknown,
  dependencies: VipMarketRoomDeliveryDependenciesV1,
): Promise<VipMarketRoomV1 | null> {
  await dependencies.authorize();

  if (isVipFxMarketRoomIdV1(productCandidate)) {
    return assembleVipFxMarketRoomV1(productCandidate, dependencies);
  }

  if (productCandidate === "estr") {
    return assembleVipEstrMarketRoomV1(dependencies);
  }

  return null;
}

/**
 * Authorizes before interpreting the requested product or reading protected
 * market data. Deep and history retain separate degraded-state boundaries.
 */
export async function assembleAuthorizedVipFxMarketRoomV1(
  productCandidate: unknown,
  dependencies: VipFxMarketRoomDeliveryDependenciesV1,
): Promise<VipFxMarketRoomV1 | null> {
  await dependencies.authorize();

  if (!isVipFxMarketRoomIdV1(productCandidate)) {
    return null;
  }

  return assembleVipFxMarketRoomV1(productCandidate, dependencies);
}

async function assembleVipFxMarketRoomV1(
  productId: VipFxMarketRoomIdV1,
  dependencies: Pick<
    VipFxMarketRoomDeliveryDependenciesV1,
    "loadDeep" | "loadHistorical"
  >,
): Promise<VipFxMarketRoomV1> {
  const [deepResult] = await Promise.allSettled([
    Promise.resolve().then(() => dependencies.loadDeep(productId)),
  ]);
  const deep = deepResult.status === "fulfilled"
    ? selectRoomDeepProjectionV1(productId, deepResult.value)
    : null;
  const sourceTimestamp = deep?.availability === "available"
    ? deep.provenance.sourceTimestamp
    : undefined;
  const options: HistoricalChartSeriesOptionsV1 = sourceTimestamp === undefined
    ? {}
    : { sourceTimestamp };
  const [twoYearResult, fiveDayResult] = await Promise.allSettled([
    Promise.resolve().then(() =>
      dependencies.loadHistorical(productId, "2y", options)
    ),
    Promise.resolve().then(() =>
      dependencies.loadHistorical(productId, "5d", options)
    ),
  ]);

  return Object.freeze({
    productId,
    deep,
    history: Object.freeze({
      twoYear: twoYearResult.status === "fulfilled"
        ? selectRoomHistoryV1(productId, twoYearResult.value)
        : null,
      fiveDay: fiveDayResult.status === "fulfilled"
        ? selectRoomHistoryV1(productId, fiveDayResult.value)
        : null,
    }),
  });
}

async function assembleVipEstrMarketRoomV1(
  dependencies: Pick<
    VipMarketRoomDeliveryDependenciesV1,
    "loadDeep" | "loadHistorical"
  >,
): Promise<VipEstrMarketRoomV1> {
  const productId = "estr" as const;
  const [deepResult] = await Promise.allSettled([
    Promise.resolve().then(() => dependencies.loadDeep(productId)),
  ]);
  const deep = deepResult.status === "fulfilled"
    ? selectEstrRoomDeepProjectionV1(deepResult.value)
    : null;
  const sourceTimestamp = deep?.availability === "available"
    ? deep.provenance.sourceTimestamp
    : undefined;
  const options: HistoricalChartSeriesOptionsV1 = sourceTimestamp === undefined
    ? {}
    : { sourceTimestamp };
  const [maximumResult, fiveDayResult] = await Promise.allSettled([
    Promise.resolve().then(() =>
      dependencies.loadHistorical(productId, "max", options)
    ),
    Promise.resolve().then(() =>
      dependencies.loadHistorical(productId, "5d", options)
    ),
  ]);

  return Object.freeze({
    productId,
    deep,
    history: Object.freeze({
      maximum: maximumResult.status === "fulfilled"
        ? selectEstrRoomHistoryV1(maximumResult.value)
        : null,
      fiveDay: fiveDayResult.status === "fulfilled"
        ? selectEstrRoomHistoryV1(fiveDayResult.value)
        : null,
    }),
  });
}

export function isVipFxMarketRoomIdV1(
  value: unknown,
): value is VipFxMarketRoomIdV1 {
  return VIP_FX_MARKET_ROOM_IDS_V1.includes(value as VipFxMarketRoomIdV1);
}

function selectRoomDeepProjectionV1(
  productId: VipFxMarketRoomIdV1,
  projection: MarketProductVipDeepProjectionV1,
): VipFxMarketRoomDeepV1 {
  if (
    projection.tier !== "vip-deep" ||
    projection.productId !== productId ||
    projection.productKind !== "fx"
  ) {
    return null;
  }

  return projection;
}

function selectRoomHistoryV1(
  productId: VipFxMarketRoomIdV1,
  history: HistoricalChartSeriesV1,
): HistoricalChartSeriesV1 | null {
  return history.productId === productId ? history : null;
}

function selectEstrRoomDeepProjectionV1(
  projection: MarketProductVipDeepProjectionV1,
): VipEstrMarketRoomDeepV1 {
  if (
    projection.tier !== "vip-deep" ||
    projection.productId !== "estr" ||
    projection.productKind !== "rate"
  ) {
    return null;
  }

  return projection;
}

function selectEstrRoomHistoryV1(
  history: HistoricalChartSeriesV1,
): HistoricalChartSeriesV1 | null {
  if (history.productId !== "estr") {
    return null;
  }

  if (
    history.availability === "available" &&
    (history.valueKind !== "interest-rate-percent" || history.unit !== "percent")
  ) {
    return null;
  }

  return history;
}
