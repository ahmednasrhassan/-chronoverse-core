"use client";
import React, { useEffect, useRef, memo } from "react";

function CalendarWidgetComponent() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      width: "100%",
      height: "100%",
      colorTheme: "dark",
      isTransparent: true,
      locale: "en",
      importanceFilter: "-1,0,1",
      currencyFilter: "USD,EUR,GBP,JPY",
    });

    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className="w-full h-[450px] rounded-xl border border-[#27272a] bg-[#18181b] p-2 overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const CalendarWidget = memo(CalendarWidgetComponent);
export default CalendarWidget;