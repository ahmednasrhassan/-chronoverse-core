import "server-only";

import type {
  FxProjectionProductIdV1,
  FxVipDeepProjectionV1,
  MarketProductUnavailableProjectionV1,
  MarketProductVipDeepProjectionV1,
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

  const productId = productCandidate;
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
