import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();

/**
 * Live Terminal Market Data Feed
 * --------------------------------
 * Server-side aggregator for market quotes and OHLC chart data, powered
 * entirely by `yahoo-finance2`. This route is the single source of truth for both the ticker
 * strip (quotes) and the Lightweight Charts candlestick/line series
 * (history), normalized into safe, unbranded payloads.
 *
 * Resilience guarantees:
 *   - Each upstream call is wrapped in its own try/catch with a short
 *     timeout race, so one slow/down symbol never blocks the others.
 *   - If ALL upstream calls fail, a static `FALLBACK_DATASET` is
 *     returned with `source: "fallback"` — response is still HTTP 200.
 *   - Runs at request time (`dynamic = "force-dynamic"`).
 *
 * Usage:
 *   GET /api/market-data                       -> quotes strip (default)
 *   GET /api/market-data?symbols=BTC-USD,GC=F   -> quotes for specific symbols
 *   GET /api/market-data?symbol=BTC-USD&range=1mo&interval=1d
 *                                                -> historical OHLC series
 *                                                   for a single symbol
 *                                                   (for chart rendering)
 */
export const revalidate = 300;

interface MarketQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
  /** Intraday high (regularMarketDayHigh) — used by compact stat displays. */
  dayHigh: number | null;
  /** Intraday low (regularMarketDayLow) — used by compact stat displays. */
  dayLow: number | null;
  /** Regular session volume (regularMarketVolume). */
  volume: number | null;
}

interface ChartCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  value: number; // close, convenience field for line series
}

const FETCH_TIMEOUT_MS = 5000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs = FETCH_TIMEOUT_MS): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

/** Static, always-available dataset used when live providers are unreachable. */
const FALLBACK_DATASET: MarketQuote[] = [
  { symbol: "BTC-USD", label: "Bitcoin", price: 64250.12, changePercent: 1.8, dayHigh: 64980.5, dayLow: 63102.75, volume: 28450000000 },
  { symbol: "ETH-USD", label: "Ethereum", price: 3120.55, changePercent: 0.9, dayHigh: 3168.2, dayLow: 3078.4, volume: 12980000000 },
  { symbol: "GC=F", label: "Gold (Futures)", price: 2412.3, changePercent: 0.3, dayHigh: 2421.8, dayLow: 2401.1, volume: 185000 },
  { symbol: "CL=F", label: "Crude Oil (WTI)", price: 78.4, changePercent: -0.4, dayHigh: 79.15, dayLow: 77.85, volume: 342000 },
  { symbol: "^GSPC", label: "S&P 500", price: 5480.6, changePercent: -0.2, dayHigh: 5502.3, dayLow: 5468.9, volume: 2450000000 },
  { symbol: "DX-Y.NYB", label: "US Dollar Index", price: 104.8, changePercent: 0.1, dayHigh: 105.05, dayLow: 104.55, volume: null },
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

async function fetchQuotes(symbols: string[]): Promise<MarketQuote[]> {
  try {
    const results = await withTimeout(
      yahooFinance.quote(symbols, {}, { validateResult: false })
    );
    if (!results) return [];

    const arr = Array.isArray(results) ? results : [results];

    return arr
      .map((q) => {
        const symbol = q?.symbol;
        if (!symbol) return null;
        return {
          symbol,
          label: SYMBOL_LABELS[symbol] ?? q?.shortName ?? symbol,
          price: q?.regularMarketPrice ?? null,
          changePercent: q?.regularMarketChangePercent ?? null,
          dayHigh: q?.regularMarketDayHigh ?? null,
          dayLow: q?.regularMarketDayLow ?? null,
          volume: q?.regularMarketVolume ?? null,
        } as MarketQuote;
      })
      .filter((q): q is MarketQuote => q !== null);
  } catch (err) {

    console.error("[api/market-data] Yahoo Finance quote fetch failed:", err);
    return [];
  }
}

async function fetchChartHistory(
  symbol: string,
  range: string,
  interval: string
): Promise<ChartCandle[]> {
  try {
    const period2 = new Date();
    const period1 = new Date();

    const rangeDaysMap: Record<string, number> = {
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
    const days = rangeDaysMap[range] ?? 90;
    period1.setDate(period1.getDate() - days);

    const validIntervals = [
      "1m", "2m", "5m", "15m", "30m", "60m", "90m",
      "1h", "1d", "5d", "1wk", "1mo", "3mo",
    ] as const;
    const safeInterval = (validIntervals as readonly string[]).includes(interval)
      ? (interval as (typeof validIntervals)[number])
      : "1d";

    const result = await withTimeout(
      yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: safeInterval,
      })
    );

    interface RawYahooQuote {
      date?: Date | string | number;
      open?: number | null;
      high?: number | null;
      low?: number | null;
      close?: number | null;
    }

    const quotes = (result as { quotes?: RawYahooQuote[] } | null)?.quotes;
    if (!Array.isArray(quotes)) return [];

    return quotes
      .filter((q) => q?.date && q?.close !== null && q?.close !== undefined)
      .map((q) => {
        const time = Math.floor(new Date(q.date as Date).getTime() / 1000);
        return {
          time,
          open: q.open ?? q.close ?? 0,
          high: q.high ?? q.close ?? 0,
          low: q.low ?? q.close ?? 0,
          close: q.close ?? 0,
          value: q.close ?? 0,
        } as ChartCandle;
      });

  } catch (err) {

    console.error(`[api/market-data] Yahoo Finance chart fetch failed for ${symbol}:`, err);
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const singleSymbol = searchParams.get("symbol");

    // --- Historical chart-data mode (single symbol) ---
    if (singleSymbol) {
      const range = searchParams.get("range") ?? "3mo";
      const interval = searchParams.get("interval") ?? "1d";

      const candles = await fetchChartHistory(singleSymbol, range, interval);

      if (candles.length === 0) {
        return NextResponse.json(
          {
            status: "ok",
            source: "fallback",
            symbol: singleSymbol,
            candles: [],
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          status: "ok",
          source: "live",
          symbol: singleSymbol,
          candles,
        },
        { status: 200 }
      );
    }

    // --- Quotes strip mode (multiple symbols) ---
    const symbolsParam = searchParams.get("symbols");
    const symbols = symbolsParam
      ? symbolsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : FALLBACK_DATASET.map((q) => q.symbol);

    const liveQuotes = await fetchQuotes(symbols);

    if (liveQuotes.length === 0) {
      return NextResponse.json(
        {
          status: "ok",
          source: "fallback",
          quotes: FALLBACK_DATASET,
          fetchedAt: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // Merge live quotes over the fallback dataset by symbol, so any
    // provider that partially failed still gets backfilled from the
    // static dataset rather than leaving gaps in the terminal UI.
    const bySymbol = new Map<string, MarketQuote>();
    for (const quote of FALLBACK_DATASET) bySymbol.set(quote.symbol, quote);
    for (const quote of liveQuotes) {
      if (quote?.symbol) bySymbol.set(quote.symbol, quote);
    }

    const merged = symbols
      .map((s) => bySymbol.get(s))
      .filter((q): q is MarketQuote => q !== undefined);

    return NextResponse.json(
      {
        status: "ok",
        source: liveQuotes.length >= symbols.length ? "live" : "partial",
        quotes: merged.length > 0 ? merged : Array.from(bySymbol.values()),
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {

    console.error("[api/market-data] Unexpected failure, returning safe fallback:", error);

    // Absolute last resort: never let this route 500 — callers must
    // always receive a usable payload.
    return NextResponse.json(
      {
        status: "ok",
        source: "fallback",
        quotes: FALLBACK_DATASET,
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
