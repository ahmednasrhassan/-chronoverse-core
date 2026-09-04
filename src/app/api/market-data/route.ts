import { NextResponse } from "next/server";

import { getHistoricalMarketData } from "@/lib/markets/services/historicalMarketData";
import { getMarketQuotes } from "@/lib/markets/services/marketQuotes";
import type { MarketQuote } from "@/lib/markets/services/marketQuotes";
/**
 * Chronoverse Market Data Gateway
 * --------------------------------
 *
 * Central server-side gateway for market quotes
 * and historical OHLC data.
 *
 * Historical data:
 *   Shared Chronoverse historical service
 *
 * Quotes:
 *   Shared Chronoverse quote service
 *
 * Provider selection and vendor-specific logic
 * remain outside the API surface.
 *
 * Client components never communicate directly
 * with a market-data vendor.
 */

/**
 * Protect the free Vercel deployment from
 * oversized quote requests.
 *
 * 12 also matches the planned Chronoverse
 * VIP V1 asset universe.
 */
const MAX_QUOTE_SYMBOLS =
  12;

const DEFAULT_QUOTE_SYMBOLS = [
  "^GSPC",
  "GC=F",
  "CL=F",
  "BTC-USD",
  "EURUSD=X",
  "DX-Y.NYB",
] as const;

/**
 * Chronoverse Market Data API
 */
export async function GET(
  request: Request,
) {
  try {
    const {
      searchParams,
    } =
      new URL(
        request.url,
      );

    const singleSymbol =
      normalizeSymbol(
        searchParams.get(
          "symbol",
        ),
      );

    /**
     * Historical chart mode.
     *
     * Provider selection,
     * normalization, fallback,
     * provenance and data-window
     * information live in the
     * shared market-data service.
     */
    if (singleSymbol) {
      const range =
        searchParams.get(
          "range",
        ) ?? "3mo";

      const interval =
        searchParams.get(
          "interval",
        ) ?? "1d";

      const result =
        await getHistoricalMarketData(
          singleSymbol,
          range,
          interval,
        );

      if (
        result.status ===
          "unavailable" ||
        result.candles.length ===
          0
      ) {
        return NextResponse.json(
          {
            status:
              "unavailable",

            source:
              result.source,

            provider:
              result.provider,

            symbol:
              singleSymbol,

            provenance:
              result.provenance,

            window:
              result.window,

            candles: [],
          },
          {
            status: 503,
          },
        );
      }

      return NextResponse.json(
        {
          status:
            result.status,

          source:
            result.source,

          provider:
            result.provider,

          symbol:
            singleSymbol,

          provenance:
            result.provenance,

          window:
            result.window,

          candles:
            result.candles,
        },
        {
          status: 200,
        },
      );
    }

    /**
     * Quote-card / ticker mode.
     */
    const symbols =
      resolveQuoteSymbols(
        searchParams.get(
          "symbols",
        ),
      );

    const quoteResult =
      await getMarketQuotes(
        symbols,
      );

    const liveQuotes =
      quoteResult.quotes;

    if (
      liveQuotes.length ===
      0
    ) {
      return NextResponse.json(
        {
          status:
            "unavailable",

          source:
            quoteResult.provider,

          quotes: [],

          fetchedAt:
            quoteResult.fetchedAt,
        },
        {
          status: 503,
        },
      );
    }

    const quoteMap =
      new Map<
        string,
        MarketQuote
      >();

    for (
      const quote of
      liveQuotes
    ) {
      quoteMap.set(
        quote.symbol,
        quote,
      );
    }

    /**
     * Preserve requested symbol order.
     *
     * Missing symbols are omitted rather
     * than replaced with fabricated data.
     */
    const quotes =
      symbols
        .map(
          (symbol) =>
            quoteMap.get(
              symbol,
            ),
        )
        .filter(
          (
            quote,
          ): quote is MarketQuote =>
            quote !==
            undefined,
        );

    const complete =
      quotes.length ===
      symbols.length;

    return NextResponse.json(
      {
        status:
          complete
            ? "delayed"
            : "partial",

        source:
          quoteResult.provider,

        requested:
          symbols.length,

        received:
          quotes.length,

        quotes,

        fetchedAt:
          quoteResult.fetchedAt,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[Chronoverse Markets] Market gateway failure:",
      error,
    );

    /**
     * Never disguise infrastructure
     * failure as successful market data.
     */
    return NextResponse.json(
      {
        status:
          "unavailable",

        source:
          null,

        quotes: [],

        fetchedAt:
          new Date()
            .toISOString(),
      },
      {
        status: 503,
      },
    );
  }
}

function resolveQuoteSymbols(
  symbolsParam:
    string | null,
): string[] {
  const rawSymbols =
    symbolsParam
      ? symbolsParam.split(
          ",",
        )
      : [
          ...DEFAULT_QUOTE_SYMBOLS,
        ];

  const uniqueSymbols =
    new Set<string>();

  for (
    const rawSymbol of
    rawSymbols
  ) {
    const symbol =
      normalizeSymbol(
        rawSymbol,
      );

    if (!symbol) {
      continue;
    }

    uniqueSymbols.add(
      symbol,
    );

    if (
      uniqueSymbols.size >=
      MAX_QUOTE_SYMBOLS
    ) {
      break;
    }
  }

  if (
    uniqueSymbols.size ===
    0
  ) {
    return [
      ...DEFAULT_QUOTE_SYMBOLS,
    ];
  }

  return Array.from(
    uniqueSymbols,
  );
}

function normalizeSymbol(
  value:
    string | null,
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  return normalized.length >
    0
    ? normalized
    : null;
}