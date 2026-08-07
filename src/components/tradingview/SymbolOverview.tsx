"use client";

import React, { useEffect, useRef, memo } from "react";

interface SymbolOverviewProps {
  symbol: string;
  label?: string;
}

/**
 * Fallback TradingView "Symbol Overview" widget embed — automatically
 * rendered on article pages when a specific market symbol/instrument is
 * detected in the article's title/content (see
 * `src/lib/detectMarketSymbol.ts`), giving readers a live interactive
 * chart directly in context without requiring manual embedding by editors.
 */
function SymbolOverviewComponent({ symbol, label }: SymbolOverviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [[label || symbol, `${symbol}|1D`]],
      chartOnly: false,
      width: "100%",
      height: "100%",
      locale: "en",
      colorTheme: "dark",
      autosize: true,
      showVolume: false,
      showMA: false,
      hideDateRanges: false,
      hideMarketStatus: false,
      hideSymbolLogo: false,
      scalePosition: "right",
      scaleMode: "Normal",
      fontFamily: "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
      fontSize: "10",
      noTimeScale: false,
      valuesTracking: "1",
      changeMode: "price-and-percent",
      chartType: "area",
      isTransparent: true,
      disabled_features: ["show_watermark"],
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol, label]);

  return (
    <div className="my-10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c87d55]">
          :: LIVE MARKET DATA — {label || symbol} ::
        </h3>
      </div>
      <div
        className="tradingview-widget-container w-full h-[420px] rounded-xl overflow-hidden border border-[#27272a] bg-[#18181b]"
        ref={containerRef}
      />
    </div>
  );
}

const SymbolOverview = memo(SymbolOverviewComponent);
export default SymbolOverview;
