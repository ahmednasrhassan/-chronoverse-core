"use client";

import React, { memo, useEffect, useRef, useState } from "react";

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
  /** Yahoo Finance-compatible symbol, e.g. "BTC-USD", "GC=F", "^GSPC", "CL=F" */
  symbol: string;
  /** Optional fallback label used until the live quote resolves */
  label?: string;
}

/** Formats large volume numbers into a compact "1.2B" / "340M" style string. */
function formatVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined) return "—";
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
  return volume.toLocaleString();
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Proprietary "Market Quote" card. Combines a live price/percentage-change
 * header with a compact, fully native stats strip (24h High / 24h Low /
 * Volume) — all sourced directly from `/api/market-data` (powered by
 * `yahoo-finance2`). No third-party widgets, iframes, or embeds of any
 * kind are ever rendered here. Clicking the card opens the symbol's
 * Yahoo Finance quote page.
 */
function MarketQuoteCardComponent({ symbol, label }: MarketQuoteCardProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    async function loadQuote() {
      try {
        const res = await fetch(
          `/api/market-data?symbols=${encodeURIComponent(symbol)}`,
          { cache: "no-store" }
        );
        if (!res?.ok) return;
        const data = await res.json().catch(() => null);
        const found = Array.isArray(data?.quotes)
          ? data.quotes.find((q: Quote) => q?.symbol === symbol)
          : null;
        if (isMountedRef.current && found) {
          setQuote(found);
        }
      } catch (err) {
         
        console.error(`[MarketQuoteCard] Failed to load quote for ${symbol}:`, err);
      }
    }

    loadQuote();
    const timer = setInterval(loadQuote, 30000);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [symbol]);

  const displayLabel = quote?.label ?? label ?? symbol;
  const price = quote?.price;
  const changePercent = quote?.changePercent;
  const isPositive = (changePercent ?? 0) >= 0;

  const yahooFinanceUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;

  const handleClick = () => {
    window.open(yahooFinanceUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="w-full h-full flex flex-col gap-2 cursor-pointer"
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex items-start justify-between px-1">
        <div className="flex flex-col min-w-0">
          <span className="text-zinc-200 text-xs font-bold uppercase tracking-wide truncate">
            {displayLabel}
          </span>
          <span className="text-zinc-300 text-[10px] font-mono">{symbol}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-white text-sm font-bold font-mono">
            {formatPrice(price)}
          </span>
          <span
            className={`text-[11px] font-mono font-semibold ${
              isPositive ? "text-[#00cc66]" : "text-red-500"
            }`}
          >
            {changePercent !== null && changePercent !== undefined
              ? `${isPositive ? "+" : ""}${changePercent.toFixed(2)}%`
              : "—"}
          </span>
        </div>
      </div>

      {/* Native, fully unbranded stats strip — replaces the previous
          embedded chart widget. No iframes, no third-party scripts. */}
      <div className="flex-1 min-h-0 grid grid-cols-3 gap-2 rounded-lg bg-black/20 border border-zinc-800/60 px-2 py-2">
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
            24h High
          </span>
          <span className="text-[11px] font-mono font-semibold text-[#00cc66]">
            {formatPrice(quote?.dayHigh)}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 border-x border-zinc-800/60">
          <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
            24h Low
          </span>
          <span className="text-[11px] font-mono font-semibold text-red-500">
            {formatPrice(quote?.dayLow)}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-zinc-300 font-mono">
            Volume
          </span>
          <span className="text-[11px] font-mono font-semibold text-zinc-300">
            {formatVolume(quote?.volume)}
          </span>
        </div>
      </div>
    </div>
  );
}

const MarketQuoteCard = memo(MarketQuoteCardComponent);
export default MarketQuoteCard;
