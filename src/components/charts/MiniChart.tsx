"use client";

import React, { memo } from "react";
import LightweightChart from "./LightweightChartLazy";

interface MiniChartProps {
  /** Yahoo Finance-compatible symbol, e.g. "BTC-USD", "GC=F", "^GSPC" */
  symbol: string;
}

/**
 * Compact proprietary market snapshot chart — replaces the previous
 * TradingView "mini symbol overview" widget. Renders a small unbranded
 * area chart sourced from `/api/market-data` (yahoo-finance2).
 */
function MiniChartComponent({ symbol }: MiniChartProps) {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-[#0a0a0a]">
      <LightweightChart
        symbol={symbol}
        range="1mo"
        interval="1d"
        chartType="area"
        height={128}
        refreshMs={60000}
      />
    </div>
  );
}

const MiniChart = memo(MiniChartComponent);
export default MiniChart;
