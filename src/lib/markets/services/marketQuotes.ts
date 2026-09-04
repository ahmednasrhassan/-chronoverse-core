import YahooFinance from "yahoo-finance2";

const yahooFinance =
  new YahooFinance();

const FETCH_TIMEOUT_MS =
  5000;

const SYMBOL_LABELS:
  Record<string, string> = {
    "BTC-USD":
      "Bitcoin",

    "ETH-USD":
      "Ethereum",

    "GC=F":
      "Gold (Futures)",

    "SI=F":
      "Silver (Futures)",

    "CL=F":
      "Crude Oil (WTI)",

    "BZ=F":
      "Brent Crude",

    "^GSPC":
      "S&P 500",

    "^NDX":
      "Nasdaq 100",

    "^DJI":
      "Dow Jones",

    "^TNX":
      "US 10-Year Treasury Yield",

    "DX-Y.NYB":
      "US Dollar Index",

    "EURUSD=X":
      "EUR/USD",

    "GBPUSD=X":
      "GBP/USD",

    "USDJPY=X":
      "USD/JPY",

    "^VIX":
      "CBOE Volatility Index",
  };

export interface MarketQuote {
  symbol: string;
  label: string;

  price: number | null;
  changePercent: number | null;

  dayHigh: number | null;
  dayLow: number | null;

  volume: number | null;
}

export interface MarketQuoteResult {
  provider: string | null;

  quotes: MarketQuote[];

  fetchedAt: string;
}

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

/**
 * Chronoverse quote service.
 *
 * Yahoo is currently the temporary
 * server-side quote provider.
 *
 * Consumers must use this service rather
 * than communicate with Yahoo directly.
 *
 * No static or fabricated market values
 * are permitted as fallback.
 */
export async function getMarketQuotes(
  symbols: string[],
): Promise<MarketQuoteResult> {
  try {
    const results =
      await withTimeout(
        yahooFinance.quote(
          symbols,
          {},
          {
            validateResult:
              false,
          },
        ),
      );

    if (!results) {
      return {
        provider:
          "yahoo-finance2",

        quotes: [],

        fetchedAt:
          new Date()
            .toISOString(),
      };
    }

    const arr =
      Array.isArray(results)
        ? results
        : [results];

    const quotes =
      arr
        .map(
          (
            quote,
          ): MarketQuote | null => {
            const symbol =
              quote?.symbol;

            if (!symbol) {
              return null;
            }

            return {
              symbol,

              label:
                SYMBOL_LABELS[
                  symbol
                ] ??
                quote?.shortName ??
                symbol,

              price:
                toFiniteNumber(
                  quote
                    ?.regularMarketPrice,
                ),

              changePercent:
                toFiniteNumber(
                  quote
                    ?.regularMarketChangePercent,
                ),

              dayHigh:
                toFiniteNumber(
                  quote
                    ?.regularMarketDayHigh,
                ),

              dayLow:
                toFiniteNumber(
                  quote
                    ?.regularMarketDayLow,
                ),

              volume:
                toFiniteNumber(
                  quote
                    ?.regularMarketVolume,
                ),
            };
          },
        )
        .filter(
          (
            quote,
          ): quote is MarketQuote =>
            quote !== null,
        );

    return {
      provider:
        "yahoo-finance2",

      quotes,

      fetchedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    console.error(
      "[Chronoverse Markets] Quote provider failed:",
      error,
    );

    return {
      provider:
        "yahoo-finance2",

      quotes: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  }
}

function toFiniteNumber(
  value: unknown,
): number | null {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value,
    )
  ) {
    return null;
  }

  return value;
}