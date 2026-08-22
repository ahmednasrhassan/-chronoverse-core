import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

import { bootstrapPremiumMarketProvider } from "@/lib/markets/providers/premium/bootstrap";
import type { HistoricalDataRequest } from "@/lib/markets/providers/premium/provider";

const yahooFinance = new YahooFinance();

/**
 * Chronoverse Market Data Gateway
 * --------------------------------
 *
 * Central server-side gateway for market quotes and historical OHLC data.
 *
 * Architecture:
 *
 * Historical data:
 *   Chronoverse provider layer
 *          ↓
 *   configured premium/free adapter
 *          ↓
 *   Yahoo fallback when unavailable
 *
 * Quotes:
 *   Yahoo fallback feed for now.
 *
 * Client components never communicate directly with a market-data vendor.
 */
export const revalidate = 300;

interface MarketQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
}

interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  value: number;
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
        setTimeout(() => resolve(null), timeoutMs)
      ),
    ]);
  } catch {
    return null;
  }
}

/**
 * Static emergency dataset.
 *
 * This is used only when all upstream quote sources
 * are unavailable.
 */
const FALLBACK_DATASET: MarketQuote[] = [
  {
    symbol: "BTC-USD",
    label: "Bitcoin",
    price: 64250.12,
    changePercent: 1.8,
    dayHigh: 64980.5,
    dayLow: 63102.75,
    volume: 28450000000,
  },
  {
    symbol: "ETH-USD",
    label: "Ethereum",
    price: 3120.55,
    changePercent: 0.9,
    dayHigh: 3168.2,
    dayLow: 3078.4,
    volume: 12980000000,
  },
  {
    symbol: "GC=F",
    label: "Gold (Futures)",
    price: 2412.3,
    changePercent: 0.3,
    dayHigh: 2421.8,
    dayLow: 2401.1,
    volume: 185000,
  },
  {
    symbol: "CL=F",
    label: "Crude Oil (WTI)",
    price: 78.4,
    changePercent: -0.4,
    dayHigh: 79.15,
    dayLow: 77.85,
    volume: 342000,
  },
  {
    symbol: "^GSPC",
    label: "S&P 500",
    price: 5480.6,
    changePercent: -0.2,
    dayHigh: 5502.3,
    dayLow: 5468.9,
    volume: 2450000000,
  },
  {
    symbol: "DX-Y.NYB",
    label: "US Dollar Index",
    price: 104.8,
    changePercent: 0.1,
    dayHigh: 105.05,
    dayLow: 104.55,
    volume: null,
  },
];

const SYMBOL_LABELS: Record<string, string> = {
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  "GC=F": "Gold (Futures)",
  "SI=F": "Silver (Futures)",
  "CL=F": "Crude Oil (WTI)",
  "BZ=F": "Brent Crude",
  "^GSPC": "S&P 500",
  "^NDX": "Nasdaq 100",
  "^DJI": "Dow Jones",
  "^TNX": "US 10-Year Treasury Yield",
  "DX-Y.NYB": "US Dollar Index",
  "EURUSD=X": "EUR/USD",
  "GBPUSD=X": "GBP/USD",
  "USDJPY=X": "USD/JPY",
  "^VIX": "CBOE Volatility Index",
};

/**
 * Current quote fallback.
 *
 * This remains isolated behind the Chronoverse API route.
 * No client-side component communicates with the vendor directly.
 */
async function fetchFallbackQuotes(
  symbols: string[]
): Promise<MarketQuote[]> {
  try {
    const results = await withTimeout(
      yahooFinance.quote(
        symbols,
        {},
        { validateResult: false }
      )
    );

    if (!results) {
      return [];
    }

    const arr = Array.isArray(results)
      ? results
      : [results];

    return arr
      .map((q) => {
        const symbol = q?.symbol;

        if (!symbol) {
          return null;
        }

        return {
          symbol,
          label:
            SYMBOL_LABELS[symbol] ??
            q?.shortName ??
            symbol,

          price:
            q?.regularMarketPrice ??
            null,

          changePercent:
            q?.regularMarketChangePercent ??
            null,

          dayHigh:
            q?.regularMarketDayHigh ??
            null,

          dayLow:
            q?.regularMarketDayLow ??
            null,

          volume:
            q?.regularMarketVolume ??
            null,
        } as MarketQuote;
      })
      .filter(
        (quote): quote is MarketQuote =>
          quote !== null
      );
  } catch (error) {
    console.error(
      "[Chronoverse Markets] Quote fallback failed:",
      error
    );

    return [];
  }
}

/**
 * Try the configured Chronoverse provider first.
 *
 * Returns an empty array when premium markets are disabled
 * or when the configured provider cannot satisfy the request.
 */
async function fetchChronoverseHistory(
  symbol: string,
  range: string,
  interval: string
): Promise<ChartCandle[]> {
  try {
    const provider =
      bootstrapPremiumMarketProvider();

    if (!provider) {
      return [];
    }

    const now = Math.floor(
      Date.now() / 1000
    );

    const from =
      now - resolveRangeSeconds(range);

    const request = {
      symbol,
      interval,
      from,
      to: now,
    } as HistoricalDataRequest;

    const result =
      await provider.getHistoricalData(request);

    if (
      !result ||
      !Array.isArray(result.candles)
    ) {
      return [];
    }

    return result.candles.map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      value: candle.close,
    }));
  } catch (error) {
    console.error(
      `[Chronoverse Markets] Primary historical-data provider failed for ${symbol}:`,
      error
    );

    return [];
  }
}

/**
 * Historical fallback provider.
 *
 * Used when the configured Chronoverse provider is disabled
 * or cannot return data for the requested market.
 */
async function fetchFallbackHistory(
  symbol: string,
  range: string,
  interval: string
): Promise<ChartCandle[]> {
  try {
    const period2 = new Date();
    const period1 = new Date();

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
      period1.getDate() - days
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

    const result = await withTimeout(
      yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: safeInterval,
      })
    );

    interface RawFallbackQuote {
      date?: Date | string | number;
      open?: number | null;
      high?: number | null;
      low?: number | null;
      close?: number | null;
    }

    const quotes = (
      result as {
        quotes?: RawFallbackQuote[];
      } | null
    )?.quotes;

    if (!Array.isArray(quotes)) {
      return [];
    }

    return quotes
      .filter(
        (quote) =>
          quote?.date &&
          quote?.close !== null &&
          quote?.close !== undefined
      )
      .map((quote) => {
        const close =
          quote.close ??
          0;

        return {
          time: Math.floor(
            new Date(
              quote.date as Date
            ).getTime() / 1000
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

/**
 * Chronoverse Market Data API
 */
export async function GET(
  request: Request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const singleSymbol =
      searchParams.get("symbol");

    /**
     * Historical chart mode.
     */
    if (singleSymbol) {
      const range =
        searchParams.get("range") ??
        "3mo";

      const interval =
        searchParams.get("interval") ??
        "1d";

      /**
       * First attempt:
       * Chronoverse provider infrastructure.
       */
      const primaryCandles =
        await fetchChronoverseHistory(
          singleSymbol,
          range,
          interval
        );

      if (
        primaryCandles.length >
        0
      ) {
        return NextResponse.json(
          {
            status: "ok",
            source: "chronoverse",
            symbol: singleSymbol,
            candles:
              primaryCandles,
          },
          { status: 200 }
        );
      }

      /**
       * Second attempt:
       * isolated fallback provider.
       */
      const fallbackCandles =
        await fetchFallbackHistory(
          singleSymbol,
          range,
          interval
        );

      if (
        fallbackCandles.length >
        0
      ) {
        return NextResponse.json(
          {
            status: "ok",
            source: "fallback-live",
            symbol: singleSymbol,
            candles:
              fallbackCandles,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          status: "ok",
          source: "fallback",
          symbol:
            singleSymbol,
          candles: [],
        },
        { status: 200 }
      );
    }

    /**
     * Quote-card / ticker mode.
     */
    const symbolsParam =
      searchParams.get(
        "symbols"
      );

    const symbols =
      symbolsParam
        ? symbolsParam
            .split(",")
            .map((symbol) =>
              symbol.trim()
            )
            .filter(Boolean)
        : FALLBACK_DATASET.map(
            (quote) =>
              quote.symbol
          );

    const liveQuotes =
      await fetchFallbackQuotes(
        symbols
      );

    if (
      liveQuotes.length ===
      0
    ) {
      const selectedFallback =
        symbols
          .map((symbol) =>
            FALLBACK_DATASET.find(
              (quote) =>
                quote.symbol ===
                symbol
            )
          )
          .filter(
            (
              quote
            ): quote is MarketQuote =>
              quote !==
              undefined
          );

      return NextResponse.json(
        {
          status: "ok",
          source: "fallback",
          quotes:
            selectedFallback.length >
            0
              ? selectedFallback
              : FALLBACK_DATASET,

          fetchedAt:
            new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    /**
     * Merge successful quotes with emergency fallback values.
     */
    const bySymbol =
      new Map<
        string,
        MarketQuote
      >();

    for (
      const quote of
      FALLBACK_DATASET
    ) {
      bySymbol.set(
        quote.symbol,
        quote
      );
    }

    for (
      const quote of
      liveQuotes
    ) {
      if (quote.symbol) {
        bySymbol.set(
          quote.symbol,
          quote
        );
      }
    }

    const merged = symbols
      .map((symbol) =>
        bySymbol.get(symbol)
      )
      .filter(
        (
          quote
        ): quote is MarketQuote =>
          quote !== undefined
      );

    return NextResponse.json(
      {
        status: "ok",

        source:
          liveQuotes.length >=
          symbols.length
            ? "live"
            : "partial",

        quotes:
          merged.length > 0
            ? merged
            : Array.from(
                bySymbol.values()
              ),

        fetchedAt:
          new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[Chronoverse Markets] Market gateway failure:",
      error
    );

    /**
     * Absolute last-resort response.
     *
     * Never allow the terminal UI to fail because an
     * upstream data service is unavailable.
     */
    return NextResponse.json(
      {
        status: "ok",
        source: "fallback",
        quotes:
          FALLBACK_DATASET,
        fetchedAt:
          new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}