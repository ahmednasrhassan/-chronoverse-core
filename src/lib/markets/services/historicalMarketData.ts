import YahooFinance from "yahoo-finance2";

import { bootstrapPremiumMarketProvider } from "@/lib/markets/providers/premium/bootstrap";
import type { HistoricalDataRequest } from "@/lib/markets/providers/premium/provider";

const yahooFinance = new YahooFinance();

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

  candles:
    HistoricalMarketCandle[];
}

const FETCH_TIMEOUT_MS = 5000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) =>
        setTimeout(
          () => resolve(null),
          timeoutMs
        )
      ),
    ]);
  } catch {
    return null;
  }
}

export async function getHistoricalMarketData(
  symbol: string,
  range = "3mo",
  interval = "1d"
): Promise<HistoricalMarketResult> {
  const primaryCandles =
    await fetchChronoverseHistory(
      symbol,
      range,
      interval
    );

  if (primaryCandles.length > 0) {
    return {
      source: "chronoverse",
      candles: primaryCandles,
    };
  }

  const fallbackCandles =
    await fetchFallbackHistory(
      symbol,
      range,
      interval
    );

  if (fallbackCandles.length > 0) {
    return {
      source: "fallback-live",
      candles: fallbackCandles,
    };
  }

  return {
    source: "fallback",
    candles: [],
  };
}

async function fetchChronoverseHistory(
  symbol: string,
  range: string,
  interval: string
): Promise<HistoricalMarketCandle[]> {
  try {
    const provider =
      bootstrapPremiumMarketProvider();

    if (!provider) {
      return [];
    }

    const now =
      Math.floor(Date.now() / 1000);

    const from =
      now -
      resolveRangeSeconds(range);

    const request = {
      symbol,
      interval,
      from,
      to: now,
    } as HistoricalDataRequest;

    const result =
      await provider.getHistoricalData(
        request
      );

    if (
      !result ||
      !Array.isArray(
        result.candles
      )
    ) {
      return [];
    }

    return result.candles.map(
      (candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        value: candle.close,
      })
    );
  } catch (error) {
    console.error(
      `[Chronoverse Markets] Primary historical-data provider failed for ${symbol}:`,
      error
    );

    return [];
  }
}

async function fetchFallbackHistory(
  symbol: string,
  range: string,
  interval: string
): Promise<HistoricalMarketCandle[]> {
  try {
    const period2 =
      new Date();

    const period1 =
      new Date();

    const rangeDaysMap: Record<
      string,
      number
    > = {
      "1d": 1,
      "5d": 5,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
      "2y": 730,
      "5y": 1825,
      max: 3650,
    };

    const days =
      rangeDaysMap[range] ??
      90;

    period1.setDate(
      period1.getDate() -
        days
    );

    const validIntervals = [
      "1m",
      "2m",
      "5m",
      "15m",
      "30m",
      "60m",
      "90m",
      "1h",
      "1d",
      "5d",
      "1wk",
      "1mo",
      "3mo",
    ] as const;

    const safeInterval = (
      validIntervals as readonly string[]
    ).includes(interval)
      ? (interval as
          (typeof validIntervals)[number])
      : "1d";

    const result =
      await withTimeout(
        yahooFinance.chart(
          symbol,
          {
            period1,
            period2,
            interval:
              safeInterval,
          }
        )
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
    }

    const quotes = (
      result as {
        quotes?:
          RawFallbackQuote[];
      } | null
    )?.quotes;

    if (
      !Array.isArray(quotes)
    ) {
      return [];
    }

    return quotes
      .filter(
        (quote) =>
          quote?.date &&
          quote?.close !==
            null &&
          quote?.close !==
            undefined
      )
      .map((quote) => {
        const close =
          quote.close ??
          0;

        return {
          time: Math.floor(
            new Date(
              quote.date as Date
            ).getTime() /
              1000
          ),

          open:
            quote.open ??
            close,

          high:
            quote.high ??
            close,

          low:
            quote.low ??
            close,

          close,

          value: close,
        };
      });
  } catch (error) {
    console.error(
      `[Chronoverse Markets] Historical fallback failed for ${symbol}:`,
      error
    );

    return [];
  }
}

function resolveRangeSeconds(
  range: string
): number {
  const day = 86_400;

  const ranges: Record<
    string,
    number
  > = {
    "1d": day,
    "5d": day * 5,
    "1mo": day * 30,
    "3mo": day * 90,
    "6mo": day * 180,
    "1y": day * 365,
    "2y": day * 730,
    "5y": day * 1825,
    max: day * 3650,
  };

  return (
    ranges[range] ??
    day * 90
  );
}