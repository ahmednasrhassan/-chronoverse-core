import YahooFinance from "yahoo-finance2";
import { unstable_cache } from "next/cache";

import type {
  AssetClass,
  CandleInterval,
  HistoricalDataRequest,
  HistoricalDataResponse,
  HistoricalDataWindow,
  MarketDataProvenance,
  MarketDataStatus,
} from "@/lib/markets/core/types";

import type {
  PremiumMarketDataProvider,
  PremiumProviderCapabilities,
} from "@/lib/markets/providers/premium/provider";

import { bootstrapPremiumMarketProvider } from "@/lib/markets/providers/premium/bootstrap";

const yahooFinance =
  new YahooFinance();

export interface HistoricalMarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  value: number;
}

export interface HistoricalMarketResult {
  source:
    | "chronoverse"
    | "fallback-live"
    | "fallback";

  provider: string | null;
  status: MarketDataStatus;

  provenance?: MarketDataProvenance;
  window?: HistoricalDataWindow;

  candles: HistoricalMarketCandle[];
}

export type HistoricalMarketDataCacheMode =
  | "shared"
  | "caller-owned";

export interface HistoricalMarketDataOptions {
  readonly assetClass?: AssetClass;
  readonly cacheMode?: HistoricalMarketDataCacheMode;
}

const FETCH_TIMEOUT_MS =
  5000;

const HISTORICAL_CACHE_SECONDS =
  15 * 60;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs =
    FETCH_TIMEOUT_MS,
): Promise<T | null> {
  try {
    return await Promise.race([
      promise,

      new Promise<null>(
        (resolve) =>
          setTimeout(
            () =>
              resolve(null),
            timeoutMs,
          ),
      ),
    ]);
  } catch {
    return null;
  }
}

const getSharedHistoricalMarketData =
  unstable_cache(
    fetchHistoricalMarketData,
    [
      "chronoverse",
      "markets",
      "historical-data",
    ],
    {
      revalidate:
        HISTORICAL_CACHE_SECONDS,

      tags: [
        "market-historical-data",
      ],
    },
  );

export function getHistoricalMarketData(
  symbol: string,
  range = "3mo",
  interval = "1d",
  options: HistoricalMarketDataOptions = {},
): Promise<HistoricalMarketResult> {
  if (options.cacheMode === "caller-owned") {
    return fetchHistoricalMarketData(
      symbol,
      range,
      interval,
      options.assetClass,
    );
  }

  if (options.assetClass === undefined) {
    return getSharedHistoricalMarketData(
      symbol,
      range,
      interval,
    );
  }

  return getSharedHistoricalMarketData(
    symbol,
    range,
    interval,
    options.assetClass,
  );
}

async function fetchHistoricalMarketData(
  symbol: string,
  range = "3mo",
  interval = "1d",
  assetClass?: AssetClass,
): Promise<HistoricalMarketResult> {
  const request =
    createHistoricalRequest(
      symbol,
      range,
      interval,
    );

  if (!request) {
    return {
      source:
        "fallback",

      provider:
        null,

      status:
        "unavailable",

      candles: [],
    };
  }

  const primary =
    await fetchChronoverseHistory(
      request,
      assetClass,
    );

  if (
    primary &&
    primary.candles.length >
      0
  ) {
    return primary;
  }

  const fallback =
    await fetchFallbackHistory(
      request,
    );

  if (
    fallback &&
    fallback.candles.length >
      0
  ) {
    return fallback;
  }

  return {
    source:
      "fallback",

    provider:
      null,

    status:
      "unavailable",

    candles: [],
  };
}

async function fetchChronoverseHistory(
  request: HistoricalDataRequest,
  assetClass?: AssetClass,
): Promise<HistoricalMarketResult | null> {
  try {
    const provider =
      bootstrapPremiumMarketProvider();

    if (!provider) {
      return null;
    }

    if (
      !isPremiumProviderEligible(
        provider,
        assetClass,
      )
    ) {
      return null;
    }

    const result =
      await provider.getHistoricalData(
        request,
      );

    if (
      !result ||
      !Array.isArray(
        result.candles,
      ) ||
      result.candles.length ===
        0
    ) {
      return null;
    }

    const candles =
      result.candles.map(
        (candle) => ({
          time:
            candle.time,

          open:
            candle.open,

          high:
            candle.high,

          low:
            candle.low,

          close:
            candle.close,

          value:
            candle.close,
        }),
      );

    const firstCandle =
      candles.at(0);

    const lastCandle =
      candles.at(-1);

    const fetchedAt =
      Math.floor(
        Date.now() /
          1000,
      );

    return {
      source:
        "chronoverse",

      provider:
        result.provider ??
        provider.id,

      status:
        result.status,

      provenance:
        result.provenance ?? {
          provider:
            result.provider ??
            provider.id,

          fetchedAt,

          sourceTimestamp:
            lastCandle?.time,
        },

      window:
        result.window ?? {
          requestedFrom:
            request.from,

          requestedTo:
            request.to,

          firstTimestamp:
            firstCandle?.time,

          lastTimestamp:
            lastCandle?.time,

          receivedPoints:
            candles.length,
        },

      candles,
    };
  } catch (error) {
    console.error(
      `[Chronoverse Markets] Primary historical-data provider failed for ${request.symbol}:`,
      error,
    );

    return null;
  }
}

function isPremiumProviderEligible(
  provider: PremiumMarketDataProvider,
  assetClass: AssetClass | undefined,
): boolean {
  if (assetClass === undefined) {
    return true;
  }

  if (
    provider.info.capabilities.historical ===
    false
  ) {
    return false;
  }

  const capability =
    resolveAssetClassCapability(
      provider.info.capabilities,
      assetClass,
    );

  return capability !== false;
}

function resolveAssetClassCapability(
  capabilities: PremiumProviderCapabilities,
  assetClass: AssetClass,
): boolean | undefined {
  switch (assetClass) {
    case "equity":
      return capabilities.stocks;

    case "index":
      return capabilities.indices;

    case "forex":
      return capabilities.forex;

    case "crypto":
      return capabilities.crypto;

    case "commodity":
      return capabilities.commodities;

    case "bond":
      return capabilities.fixedIncome;

    case "etf":
    case "fund":
    case "future":
    case "unknown":
      return undefined;
  }
}

async function fetchFallbackHistory(
  request: HistoricalDataRequest,
): Promise<HistoricalMarketResult | null> {
  try {
    const yahooInterval =
      resolveYahooInterval(
        request.interval,
      );

    if (!yahooInterval) {
      return null;
    }

    const period1 =
      new Date(
        (request.from ??
          Math.floor(
            Date.now() /
              1000,
          ) -
            90 *
              86_400) *
          1000,
      );

    const period2 =
      new Date(
        (request.to ??
          Math.floor(
            Date.now() /
              1000,
          )) *
          1000,
      );

    const result =
      await withTimeout(
        yahooFinance.chart(
          request.symbol,
          {
            period1,
            period2,
            interval:
              yahooInterval,
          },
        ),
      );

    interface RawFallbackQuote {
      date?:
        | Date
        | string
        | number;

      open?:
        | number
        | null;

      high?:
        | number
        | null;

      low?:
        | number
        | null;

      close?:
        | number
        | null;

      volume?:
        | number
        | null;
    }

    const quotes = (
      result as {
        quotes?:
          RawFallbackQuote[];
      } | null
    )?.quotes;

    if (
      !Array.isArray(
        quotes,
      )
    ) {
      return null;
    }

    const candles =
      quotes
        .map(
          (
            quote,
          ): HistoricalMarketCandle | null => {
            const close =
              quote.close;

            if (
              typeof close !==
                "number" ||
              !Number.isFinite(
                close,
              ) ||
              close <= 0 ||
              !quote.date
            ) {
              return null;
            }

            const timestamp =
              Math.floor(
                new Date(
                  quote.date,
                ).getTime() /
                  1000,
              );

            if (
              !Number.isFinite(
                timestamp,
              )
            ) {
              return null;
            }

            const open =
              toFinitePositiveNumber(
                quote.open,
              ) ??
              close;

            const high =
              toFinitePositiveNumber(
                quote.high,
              ) ??
              close;

            const low =
              toFinitePositiveNumber(
                quote.low,
              ) ??
              close;

            return {
              time:
                timestamp,

              open,
              high,
              low,
              close,

              value:
                close,
            };
          },
        )
        .filter(
          (
            candle,
          ): candle is HistoricalMarketCandle =>
            candle !==
            null,
        )
        .sort(
          (a, b) =>
            a.time -
            b.time,
        );

    if (
      candles.length ===
      0
    ) {
      return null;
    }

    const firstCandle =
      candles.at(0);

    const lastCandle =
      candles.at(-1);

    const fetchedAt =
      Math.floor(
        Date.now() /
          1000,
      );

    return {
      source:
        "fallback-live",

      provider:
        "yahoo-finance2",

      status:
        request.interval ===
        "1d"
          ? "end_of_day"
          : "delayed",

      provenance: {
        provider:
          "yahoo-finance2",

        fetchedAt,

        sourceTimestamp:
          lastCandle?.time,
      },

      window: {
        requestedFrom:
          request.from,

        requestedTo:
          request.to,

        firstTimestamp:
          firstCandle?.time,

        lastTimestamp:
          lastCandle?.time,

        receivedPoints:
          candles.length,
      },

      candles,
    };
  } catch (error) {
    console.error(
      `[Chronoverse Markets] Historical fallback failed for ${request.symbol}:`,
      error,
    );

    return null;
  }
}

function createHistoricalRequest(
  symbol: string,
  range: string,
  interval: string,
): HistoricalDataRequest | null {
  const normalizedInterval =
    resolveCandleInterval(
      interval,
    );

  if (
    !normalizedInterval
  ) {
    return null;
  }

  const now =
    Math.floor(
      Date.now() /
        1000,
    );

  return {
    symbol,
    interval:
      normalizedInterval,

    from:
      now -
      resolveRangeSeconds(
        range,
      ),

    to:
      now,
  };
}

function resolveCandleInterval(
  interval: string,
): CandleInterval | null {
  const validIntervals:
    CandleInterval[] = [
      "1m",
      "5m",
      "15m",
      "30m",
      "1h",
      "4h",
      "1d",
      "1wk",
      "1mo",
    ];

  return validIntervals.includes(
    interval as CandleInterval,
  )
    ? (interval as CandleInterval)
    : null;
}

function resolveYahooInterval(
  interval: CandleInterval,
):
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "1d"
  | "1wk"
  | "1mo"
  | null {
  switch (interval) {
    case "1m":
    case "5m":
    case "15m":
    case "30m":
    case "1h":
    case "1d":
    case "1wk":
    case "1mo":
      return interval;

    case "4h":
      return null;

    default:
      return null;
  }
}

function resolveRangeSeconds(
  range: string,
): number {
  const day =
    86_400;

  const ranges:
    Record<
      string,
      number
    > = {
      "1d":
        day,

      "5d":
        day * 5,

      "1mo":
        day * 30,

      "3mo":
        day * 90,

      "6mo":
        day * 180,

      "1y":
        day * 365,

      "2y":
        day * 730,

      "5y":
        day * 1825,

      max:
        day * 3650,
    };

  return (
    ranges[range] ??
    day * 90
  );
}

function toFinitePositiveNumber(
  value: unknown,
): number | null {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value,
    ) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}
