import { NextResponse } from "next/server";

/**
 * Live Terminal Market Data Feed
 * --------------------------------
 * Server-side aggregator for the Intelligence Terminal's live market strip.
 * Pulls free, public, key-less endpoints (CoinGecko for crypto, Yahoo
 * Finance's public quote endpoint for equities/FX/gold) and normalizes
 * them into a single safe payload.
 *
 * Resilience guarantees:
 *   - Each upstream fetch is wrapped in its own try/catch with a short
 *     timeout, so one slow/down provider never blocks or fails the others.
 *   - If ALL upstream providers fail, a static `FALLBACK_DATASET` is
 *     returned with `source: "fallback"` — the response is still HTTP 200,
 *     so the terminal UI never has to treat this as an error / render a
 *     "MODULE OFFLINE" state.
 *   - Runs at request time (`dynamic = "force-dynamic"`) but is cheap and
 *     narrow in scope (a handful of quotes).
 */
export const dynamic = "force-dynamic";

interface MarketQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

const FETCH_TIMEOUT_MS = 4000;

/** Fetch with an abort-based timeout so a hung upstream never blocks the route. */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ChronoverseCapital-Terminal/1.0" },
      cache: "no-store",
    });
    return res?.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Static, always-available dataset used when live providers are unreachable. */
const FALLBACK_DATASET: MarketQuote[] = [
  { symbol: "BTC-USD", label: "Bitcoin", price: 64250.12, changePercent: 1.8 },
  { symbol: "ETH-USD", label: "Ethereum", price: 3120.55, changePercent: 0.9 },
  { symbol: "GC=F", label: "Gold (Futures)", price: 2412.3, changePercent: 0.3 },
  { symbol: "^GSPC", label: "S&P 500", price: 5480.6, changePercent: -0.2 },
  { symbol: "DX-Y.NYB", label: "US Dollar Index", price: 104.8, changePercent: 0.1 },
];

async function fetchCoinGecko(): Promise<MarketQuote[]> {
  try {
    const res = await fetchWithTimeout(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true"
    );
    if (!res) return [];

    const data = await res.json().catch(() => null);
    if (!data) return [];

    const results: MarketQuote[] = [];

    if (data?.bitcoin?.usd !== undefined) {
      results.push({
        symbol: "BTC-USD",
        label: "Bitcoin",
        price: data.bitcoin?.usd ?? null,
        changePercent: data.bitcoin?.usd_24h_change ?? null,
      });
    }

    if (data?.ethereum?.usd !== undefined) {
      results.push({
        symbol: "ETH-USD",
        label: "Ethereum",
        price: data.ethereum?.usd ?? null,
        changePercent: data.ethereum?.usd_24h_change ?? null,
      });
    }

    return results;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/market-data] CoinGecko fetch failed:", err);
    return [];
  }
}

async function fetchYahooFinance(): Promise<MarketQuote[]> {
  const symbols = ["GC=F", "^GSPC", "DX-Y.NYB"];
  const labels: Record<string, string> = {
    "GC=F": "Gold (Futures)",
    "^GSPC": "S&P 500",
    "DX-Y.NYB": "US Dollar Index",
  };

  try {
    const res = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols
        .map(encodeURIComponent)
        .join(",")}`
    );
    if (!res) return [];

    const data = await res.json().catch(() => null);
    const quoteResults = data?.quoteResponse?.result;
    if (!Array.isArray(quoteResults)) return [];

    return quoteResults
      .map((q: { symbol?: string; regularMarketPrice?: number; regularMarketChangePercent?: number }) => {
        const symbol = q?.symbol;
        if (!symbol) return null;
        return {
          symbol,
          label: labels[symbol] ?? symbol,
          price: q?.regularMarketPrice ?? null,
          changePercent: q?.regularMarketChangePercent ?? null,
        } as MarketQuote;
      })
      .filter((q: MarketQuote | null): q is MarketQuote => q !== null);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/market-data] Yahoo Finance fetch failed:", err);
    return [];
  }
}

export async function GET() {
  try {
    const [cryptoQuotes, financeQuotes] = await Promise.all([
      fetchCoinGecko(),
      fetchYahooFinance(),
    ]);

    const liveQuotes = [...(cryptoQuotes ?? []), ...(financeQuotes ?? [])];

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

    return NextResponse.json(
      {
        status: "ok",
        source: liveQuotes.length === FALLBACK_DATASET.length ? "live" : "partial",
        quotes: Array.from(bySymbol.values()),
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[api/market-data] Unexpected failure, returning safe fallback:", error);

    // Absolute last resort: never let this route 500 — the terminal must
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
