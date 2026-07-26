"use client";
import React, { useEffect, useRef, memo } from "react";

function MarketTickerComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
        { proName: "FOREXCOM:NSXUSD", title: "US 100" },
        { proName: "FX_IDC:EURUSD", title: "EUR/USD" },
        { proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
        { proName: "BITSTAMP:ETHUSD", title: "Ethereum" },
        { proName: "TVC:GOLD", title: "Gold" },
      ],
      showSymbolLogo: true,
      colorTheme: "dark",
      isTransparent: true,
      displayMode: "adaptive",
      locale: "en",
    });

    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className="w-full border-b border-[#27272a] bg-[#0a0a0a]">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}

const MarketTicker = memo(MarketTickerComponent);
export default MarketTicker;