"use client";

import React, {
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

interface Quote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
}

interface MarketQuoteCardProps {
  /**
   * Chronoverse market symbol identifier.
   *
   * Examples:
   * BTC-USD
   * GC=F
   * ^GSPC
   * CL=F
   */
  symbol: string;

  /**
   * Optional fallback label displayed until
   * market data has resolved.
   */
  label?: string;
}

/**
 * Format large volume values into compact
 * terminal-friendly notation.
 */
function formatVolume(
  volume: number | null | undefined
): string {
  if (
    volume === null ||
    volume === undefined
  ) {
    return "—";
  }

  if (volume >= 1_000_000_000) {
    return `${(
      volume / 1_000_000_000
    ).toFixed(2)}B`;
  }

  if (volume >= 1_000_000) {
    return `${(
      volume / 1_000_000
    ).toFixed(2)}M`;
  }

  if (volume >= 1_000) {
    return `${(
      volume / 1_000
    ).toFixed(2)}K`;
  }

  return volume.toLocaleString();
}

/**
 * Format market prices consistently.
 */
function formatPrice(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return value.toLocaleString(
    undefined,
    {
      maximumFractionDigits: 2,
    }
  );
}

/**
 * Chronoverse Market Quote Card
 *
 * Native first-party market-data component.
 *
 * All market information is retrieved exclusively
 * through the Chronoverse market-data gateway.
 *
 * The component has no knowledge of upstream
 * market-data vendors and renders no third-party
 * widgets, scripts, embeds, or external links.
 */
function MarketQuoteCardComponent({
  symbol,
  label,
}: MarketQuoteCardProps) {
  const [quote, setQuote] =
    useState<Quote | null>(null);

  const isMountedRef =
    useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    async function loadQuote() {
      try {
        const response = await fetch(
          `/api/market-data?symbols=${encodeURIComponent(
            symbol
          )}`,
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const data =
          await response
            .json()
            .catch(() => null);

        const found =
          Array.isArray(
            data?.quotes
          )
            ? data.quotes.find(
                (
                  candidate: Quote
                ) =>
                  candidate?.symbol ===
                  symbol
              )
            : null;

        if (
          isMountedRef.current &&
          found
        ) {
          setQuote(found);
        }
      } catch (error) {
        console.error(
          `[Chronoverse Markets] Failed to load quote for ${symbol}:`,
          error
        );
      }
    }

    loadQuote();

    /**
     * Refresh quote data every 30 seconds.
     *
     * The upstream provider remains abstracted
     * behind the Chronoverse market gateway.
     */
    const timer =
      window.setInterval(
        loadQuote,
        30_000
      );

    return () => {
      isMountedRef.current =
        false;

      window.clearInterval(
        timer
      );
    };
  }, [symbol]);

  const displayLabel =
    quote?.label ??
    label ??
    symbol;

  const price =
    quote?.price;

  const changePercent =
    quote?.changePercent;

  const isPositive =
    (changePercent ?? 0) >= 0;

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="flex items-start justify-between px-1">
        <div className="flex flex-col min-w-0">
          <span className="text-zinc-200 text-xs font-bold uppercase tracking-wide truncate">
            {displayLabel}
          </span>

          <span className="text-zinc-300 text-[10px] font-mono">
            {symbol}
          </span>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <span className="text-white text-sm font-bold font-mono">
            {formatPrice(price)}
          </span>

          <span
            className={`text-[11px] font-mono font-semibold ${
              isPositive
                ? "text-[#00cc66]"
                : "text-red-500"
            }`}
          >
            {changePercent !== null &&
            changePercent !==
              undefined
              ? `${
                  isPositive
                    ? "+"
                    : ""
                }${changePercent.toFixed(
                  2
                )}%`
              : "—"}
          </span>
        </div>
      </div>

      {/*
       * Native Chronoverse market statistics.
       *
       * No iframe.
       * No external widget.
       * No third-party branding.
       */}
      <div className="flex-1 min-h-0 grid grid-cols-3 gap-2 rounded-lg bg-black/20 border border-zinc-800/60 px-2 py-2">
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
            24h High
          </span>

          <span className="text-[11px] font-mono font-semibold text-[#00cc66]">
            {formatPrice(
              quote?.dayHigh
            )}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1 border-x border-zinc-800/60">
          <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
            24h Low
          </span>

          <span className="text-[11px] font-mono font-semibold text-red-500">
            {formatPrice(
              quote?.dayLow
            )}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
            Volume
          </span>

          <span className="text-[11px] font-mono font-semibold text-zinc-300">
            {formatVolume(
              quote?.volume
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

const MarketQuoteCard =
  memo(
    MarketQuoteCardComponent
  );

export default MarketQuoteCard;