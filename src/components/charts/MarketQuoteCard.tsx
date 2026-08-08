"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import MiniChart from "./MiniChartLazy";

interface Quote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

interface MarketQuoteCardProps {
  /** Yahoo Finance-compatible symbol, e.g. "BTC-USD", "GC=F", "^GSPC", "CL=F" */
  symbol: string;
  /** Optional fallback label used until the live quote resolves */
  label?: string;
}

/**
 * Proprietary "Market Quote" card — fully replaces the previous empty
 * TradingView widget containers. Combines a live price/percentage-change
 * header (sourced from `/api/market-data`, powered by `yahoo-finance2`)
 * with a compact, unbranded `lightweight-charts` mini area chart below it.
 *
 * Zero third-party branding: no TradingView or Yahoo Finance logos,
 * watermarks, or attribution are ever rendered.
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

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="flex items-start justify-between px-1">
        <div className="flex flex-col min-w-0">
          <span className="text-zinc-200 text-xs font-bold uppercase tracking-wide truncate">
            {displayLabel}
          </span>
          <span className="text-zinc-500 text-[10px] font-mono">{symbol}</span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-white text-sm font-bold font-mono">
            {price !== null && price !== undefined
              ? price.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : "—"}
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
      <div className="flex-1 min-h-0">
        <MiniChart symbol={symbol} />
      </div>
    </div>
  );
}

const MarketQuoteCard = memo(MarketQuoteCardComponent);
export default MarketQuoteCard;
