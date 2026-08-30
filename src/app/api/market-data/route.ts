import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

import { getHistoricalMarketData } from "@/lib/markets/services/historicalMarketData";

const yahooFinance = new YahooFinance();

/**
 * Chronoverse Market Data Gateway
 * --------------------------------
 *
 * Central server-side gateway for market quotes
 * and historical OHLC data.
 *
 * Historical data:
 *   Shared Chronoverse historical service
 *          ↓
 *   configured premium/free adapter
 *          ↓
 *   Yahoo fallback when unavailable
 *
 * Quotes:
 *   Yahoo fallback feed for now.
 *
 * Client components never communicate directly
 * with a market-data vendor.
 */

interface MarketQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
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

/**
 * Static emergency dataset.
 *
 * Used only when all upstream quote sources
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

const SYMBOL_LABELS: Record<
  string,
  string
> = {
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  "GC=F": "Gold (Futures)",
  "SI=F": "Silver (Futures)",
  "CL=F": "Crude Oil (WTI)",
  "BZ=F": "Brent Crude",
  "^GSPC": "S&P 500",
  "^NDX": "Nasdaq 100",
  "^DJI": "Dow Jones",
  "^TNX":
    "US 10-Year Treasury Yield",
  "DX-Y.NYB": "US Dollar Index",
  "EURUSD=X": "EUR/USD",
  "GBPUSD=X": "GBP/USD",
  "USDJPY=X": "USD/JPY",
  "^VIX": "CBOE Volatility Index",
};

/**
 * Current quote fallback.
 *
 * This remains isolated behind the
 * Chronoverse API route.
 */
async function fetchFallbackQuotes(
  symbols: string[]
): Promise<MarketQuote[]> {
  try {
    const results =
      await withTimeout(
        yahooFinance.quote(
          symbols,
          {},
          {
            validateResult:
              false,
          }
        )
      );

    if (!results) {
      return [];
    }

    const arr =
      Array.isArray(results)
        ? results
        : [results];

    return arr
      .map((q) => {
        const symbol =
          q?.symbol;

        if (!symbol) {
          return null;
        }

        return {
          symbol,

          label:
            SYMBOL_LABELS[
              symbol
            ] ??
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
        (
          quote
        ): quote is MarketQuote =>
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
 * Chronoverse Market Data API
 */
export async function GET(
  request: Request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const singleSymbol =
      searchParams.get(
        "symbol"
      );

    /**
     * Historical chart mode.
     *
     * Delegates provider selection,
     * normalization and fallback handling
     * to the shared server-side service.
     */
    if (singleSymbol) {
      const range =
        searchParams.get(
          "range"
        ) ?? "3mo";

      const interval =
        searchParams.get(
          "interval"
        ) ?? "1d";

      const result =
        await getHistoricalMarketData(
          singleSymbol,
          range,
          interval
        );

      return NextResponse.json(
        {
          status: "ok",
          source: result.source,
          symbol: singleSymbol,
          candles:
            result.candles,
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
      liveQuotes.length === 0
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
     * Merge successful quotes with
     * emergency fallback values.
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

    const merged =
      symbols
        .map((symbol) =>
          bySymbol.get(
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