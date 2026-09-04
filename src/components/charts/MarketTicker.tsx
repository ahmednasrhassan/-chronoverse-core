"use client";

import React, {
  memo,
  useEffect,
  useRef,
  useState,
} from "react";

interface TickerQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

const DEFAULT_SYMBOLS = [
  "^GSPC",
  "GC=F",
  "CL=F",
  "BTC-USD",
  "EURUSD=X",
  "DX-Y.NYB",
];

const REFRESH_MS = 15 * 60 * 1000;

/**
 * Proprietary, fully unbranded market ticker strip — replaces the
 * previous "ticker tape" widget. Sourced entirely from the
 * internal "/api/market-data" gateway, styled natively to
 * match Chronoverse Capital's dark aesthetic. Scrolls continuously via a
 * pure CSS animation — no third-party script, iframe, or attribution.
 *
 * Market data refresh policy:
 * - loads once when mounted
 * - refreshes at most every 15 minutes
 * - skips refreshes while the browser tab is hidden
 * - refreshes on return only when the existing data is stale
 */
function MarketTickerComponent() {
  const [quotes, setQuotes] =
    useState<TickerQuote[]>([]);

  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const lastFetchedAtRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    async function loadQuotes() {
      if (isLoadingRef.current) {
        return;
      }

      isLoadingRef.current = true;

      try {
        const symbols = DEFAULT_SYMBOLS
          .map(encodeURIComponent)
          .join(",");

        const res = await fetch(
          `/api/market-data?symbols=${symbols}`,
          {
            cache: "no-store",
          },
        );

        if (!res.ok) {
          return;
        }

        const data = await res
          .json()
          .catch(() => null);

        const list = data?.quotes;

        if (
          isMountedRef.current &&
          Array.isArray(list)
        ) {
          setQuotes(list);
          lastFetchedAtRef.current =
            Date.now();
        }
      } catch (err) {
        console.error(
          "[MarketTicker] Failed to load quotes:",
          err,
        );
      } finally {
        isLoadingRef.current = false;
      }
    }

    function refreshIfNeeded() {
      if (
        document.visibilityState !==
        "visible"
      ) {
        return;
      }

      const elapsed =
        Date.now() -
        lastFetchedAtRef.current;

      if (elapsed >= REFRESH_MS) {
        void loadQuotes();
      }
    }

    void loadQuotes();

    const timer =
      window.setInterval(
        refreshIfNeeded,
        REFRESH_MS,
      );

    document.addEventListener(
      "visibilitychange",
      refreshIfNeeded,
    );

    return () => {
      isMountedRef.current = false;

      window.clearInterval(timer);

      document.removeEventListener(
        "visibilitychange",
        refreshIfNeeded,
      );
    };
  }, []);

  const renderItems = (
    keyPrefix: string,
  ) =>
    quotes.map((q, idx) => {
      const isPositive =
        (q.changePercent ?? 0) >= 0;

      return (
        <span
          key={`${keyPrefix}-${q.symbol}-${idx}`}
          className="inline-flex items-center gap-2 px-4 whitespace-nowrap text-xs font-mono"
        >
          <span className="text-secondary">
            {q.label}
          </span>

          <span className="text-primary font-bold">
            {q.price !== null &&
            q.price !== undefined
              ? q.price.toLocaleString(
                  undefined,
                  {
                    maximumFractionDigits: 2,
                  },
                )
              : "—"}
          </span>

          <span
            className={
              isPositive
                ? "text-[#00cc66]"
                : "text-red-500"
            }
          >
            {q.changePercent !== null &&
            q.changePercent !== undefined
              ? `${
                  isPositive ? "+" : ""
                }${q.changePercent.toFixed(
                  2,
                )}%`
              : "—"}
          </span>
        </span>
      );
    });

  return (
    <div className="w-full h-10 border-b border-border bg-[#050506] overflow-hidden flex items-center">
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

const MarketTicker = memo(
  MarketTickerComponent,
);

export default MarketTicker;