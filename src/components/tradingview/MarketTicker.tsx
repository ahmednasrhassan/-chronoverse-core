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
      disabled_features: ["show_watermark"],
    });


    containerRef.current.appendChild(script);
  }, []);

  return (
    // CLS fix: this wrapper previously had no explicit height, so before
    // TradingView's async ticker-tape script loaded and injected its
    // iframe, the container collapsed to 0px, then suddenly expanded to
    // ~40px once the widget mounted — shifting every element below it
    // down the page. Locking `h-10` here (matching the identical ticker
    // in `Header.tsx`) reserves the box up front so mount causes no shift.
    <div className="w-full h-10 border-b border-[#27272a] bg-[#0a0a0a] overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const MarketTicker = memo(MarketTickerComponent);
export default MarketTicker;
