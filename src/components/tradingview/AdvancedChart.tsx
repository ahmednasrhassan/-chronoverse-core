"use client";
import React, { useEffect, useRef, memo } from "react";

interface AdvancedChartProps {
  symbol?: string;
  theme?: "dark" | "light";
}

function AdvancedChartComponent({ symbol = "BINANCE:BTCUSDT", theme = "dark" }: AdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (typeof window !== "undefined" && (window as any).TradingView) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: "D",
          timezone: "Etc/UTC",
          theme: theme,
          style: "1",
          locale: "en",
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: containerRef.current?.id,
        });
      }
    };

    containerRef.current.appendChild(script);
  }, [symbol, theme]);

  return (
    <div className="w-full h-[600px] rounded-xl overflow-hidden border border-[#27272a] bg-[#18181b]">
      <div id={`tv-advanced-chart-${symbol.replace(/[^a-zA-Z0-9]/g, "")}`} ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const AdvancedChart = memo(AdvancedChartComponent);
export default AdvancedChart;