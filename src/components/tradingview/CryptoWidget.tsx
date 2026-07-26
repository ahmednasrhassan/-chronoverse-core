"use client";
import React, { useEffect, useRef, memo } from "react";

function CryptoWidgetComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-screener.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      width: "100%",
      height: "100%",
      defaultColumn: "overview",
      screener_type: "crypto_mkt",
      displayCurrency: "USD",
      colorTheme: "dark",
      locale: "en",
      isTransparent: true,
    });

    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className="w-full h-[500px] rounded-xl border border-[#27272a] bg-[#18181b] p-2 overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const CryptoWidget = memo(CryptoWidgetComponent);
export default CryptoWidget;