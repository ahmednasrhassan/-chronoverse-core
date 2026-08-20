"use client";

import React, { memo } from "react";
import LightweightChart from "./LightweightChartLazy";

interface SymbolOverviewProps {
  /** Yahoo Finance-compatible symbol, e.g. "BTC-USD", "GC=F", "^GSPC" */
  symbol: string;
  label?: string;
}

/**
 * Proprietary "Symbol Overview" chart — replaces the previous
 * embed. Automatically rendered on article pages when a specific market
 * symbol/instrument is detected in the article's context.
 * Fully unbranded and sourced from the internal /api/market-data route.
 */
function SymbolOverviewComponent({ symbol, label }: SymbolOverviewProps) {
if (!symbol) {
    return null;
  }
  if (!symbol) {
    console.warn("SymbolOverview: No symbol provided, returning null.");
    return null;
  }
  return (
    <section 
      className="my-10 print:hidden" 

      aria-label={`Market data chart for ${label || symbol}`}
    >
      <header className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-[#c87d55]">
          :: LIVE MARKET DATA — {label || symbol} ::
        </h3>
      </header>
      
      {/* 
        Standardized Tailwind colors (zinc-800/950) to match the project theme.
        Removed the invalid 'h-105' and used padding to wrap the 396px chart height naturally.
      */}
      <div className="relative w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-lg">
        <LightweightChart
          symbol={symbol}
          range="3mo"
          interval="1d"
          chartType="area"
          height={396}
          refreshMs={60000} // Auto-refreshes every 60 seconds
        />
      </div>
    </section>
  );
}

export default memo(SymbolOverviewComponent);