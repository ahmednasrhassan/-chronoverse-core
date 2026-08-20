"use client";

import React, { useEffect, useRef, memo, useState } from "react";

interface TickerQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

const DEFAULT_SYMBOLS = ["^GSPC", "GC=F", "CL=F", "BTC-USD", "EURUSD=X", "DX-Y.NYB"];

/**
 * Proprietary, fully unbranded market ticker strip — replaces the
 * previous "ticker tape" widget. Sourced entirely from the
 * internal `/api/market-data` route (yahoo-finance2), styled natively to
 * match Chronoverse Capital's dark aesthetic. Scrolls continuously via a
 * pure CSS animation — no third-party script, iframe, or attribution.
 */
function MarketTickerComponent() {
  const [quotes, setQuotes] = useState<TickerQuote[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    async function loadQuotes() {
      try {
        const res = await fetch(
          `/api/market-data?symbols=${DEFAULT_SYMBOLS.map(encodeURIComponent).join(",")}`,
          { cache: "no-store" }
        );
        if (!res?.ok) return;
        const data = await res.json().catch(() => null);
        const list = data?.quotes;
        if (isMountedRef.current && Array.isArray(list)) {
          setQuotes(list);
        }
      } catch (err) {
         
        console.error("[MarketTicker] Failed to load quotes:", err);
      }
    }

    loadQuotes();
    const timer = setInterval(loadQuotes, 30000);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, []);

  const renderItems = (keyPrefix: string) =>
    quotes.map((q, idx) => {
      const isPositive = (q.changePercent ?? 0) >= 0;
      return (
        <span
          key={`${keyPrefix}-${q.symbol}-${idx}`}
          className="inline-flex items-center gap-2 px-4 whitespace-nowrap text-xs font-mono"
        >
          <span className="text-zinc-300">{q.label}</span>
          <span className="text-zinc-100 font-bold">
            {q.price !== null && q.price !== undefined
              ? q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : "—"}
          </span>
          <span className={isPositive ? "text-[#00cc66]" : "text-red-500"}>
            {q.changePercent !== null && q.changePercent !== undefined
              ? `${isPositive ? "+" : ""}${q.changePercent.toFixed(2)}%`
              : "—"}
          </span>
        </span>
      );
    });

  return (
    <div className="w-full h-10 border-b border-[#27272a] bg-[#0a0a0a] overflow-hidden flex items-center">
      <div className="w-full h-full overflow-hidden relative flex items-center">
        <div className="flex items-center animate-[ticker-scroll_40s_linear_infinite] whitespace-nowrap">
          {renderItems("a")}
          {renderItems("b")}
        </div>
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

const MarketTicker = memo(MarketTickerComponent);
export default MarketTicker;
