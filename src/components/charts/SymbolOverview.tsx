"use client";

import React, { memo } from "react";
import LightweightChart from "./LightweightChartLazy";

interface SymbolOverviewProps {
  /** Yahoo Finance-compatible symbol, e.g. "BTC-USD", "GC=F", "^GSPC" */
  symbol: string;
  label?: string;
}

/**
 * Proprietary "Symbol Overview" chart — replaces the previous TradingView
 * embed. Automatically rendered on article pages when a specific market
 * symbol/instrument is detected in the article's title/content (see
 * `src/lib/detectMarketSymbol.ts`), giving readers a live interactive
 * chart directly in context, fully unbranded and sourced from the
 * internal `/api/market-data` route.
 */
function SymbolOverviewComponent({ symbol, label }: SymbolOverviewProps) {
  return (
    <div className="my-10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c87d55]">
          :: LIVE MARKET DATA — {label || symbol} ::
        </h3>
      </div>
      <div className="w-full h-[420px] rounded-xl overflow-hidden border border-[#27272a] bg-[#18181b] p-2">
        <LightweightChart
          symbol={symbol}
          range="3mo"
          interval="1d"
          chartType="area"
          height={396}
          refreshMs={60000}
        />
      </div>
    </div>
  );
}

const SymbolOverview = memo(SymbolOverviewComponent);
export default SymbolOverview;
