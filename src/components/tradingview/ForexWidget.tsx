"use client";
import React, { useEffect, useRef, memo } from "react";

function ForexWidgetComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-forex-cross-rates.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      width: "100%",
      height: "100%",
      currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD"],
      isTransparent: true,
      colorTheme: "dark",
      locale: "en",
      disabled_features: ["show_watermark"],
    });


    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className="w-full h-[400px] rounded-xl border border-[#27272a] bg-[#18181b] p-2 overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const ForexWidget = memo(ForexWidgetComponent);
export default ForexWidget;