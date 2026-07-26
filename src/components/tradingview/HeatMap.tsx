"use client";
import React, { useEffect, useRef, memo } from "react";

function HeatMapComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      symbolUrl: "",
      colorTheme: "dark",
      hasTopBar: false,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isTransparent: true,
      width: "100%",
      height: "100%",
    });

    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className="w-full h-[500px] rounded-xl border border-[#27272a] bg-[#18181b] p-2 overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const HeatMap = memo(HeatMapComponent);
export default HeatMap;