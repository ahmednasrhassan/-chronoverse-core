"use client";

import React, { useEffect, useRef, memo, useState } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export interface ChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  value: number;
}

interface LightweightChartProps {
  /** Yahoo Finance-compatible symbol, e.g. "BTC-USD", "GC=F", "^GSPC" */
  symbol: string;
  /** Historical range to request from /api/market-data */
  range?: "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "max";
  /** Candle interval */
  interval?: "1m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk" | "1mo";
  /** "area" renders a filled line series; "candlestick" renders OHLC bars */
  chartType?: "area" | "candlestick" | "line";
  height?: number;
  className?: string;
  /** Poll for fresh data on this interval (ms). 0 disables polling. */
  refreshMs?: number;
}

/**
 * Fully proprietary, unbranded dark-themed chart component built on
 * `lightweight-charts`, sourcing all data from the internal
 * `/api/market-data` route (itself powered by `yahoo-finance2`).
 *
 * Zero third-party branding: no TradingView, no Yahoo Finance logos,
 * watermarks, or attribution text are ever rendered — only the raw
 * price series styled to match Chronoverse Capital's dark aesthetic.
 */
function LightweightChartComponent({
  symbol,
  range = "3mo",
  interval = "1d",
  chartType = "area",
  height = 400,
  className = "",
  refreshMs = 60000,
}: LightweightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Initialize chart once
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;

    (async () => {
      const container = containerRef.current;
      if (!container) return;

      const { createChart, AreaSeries, CandlestickSeries, LineSeries, ColorType } = await import(
        "lightweight-charts"
      );

      if (disposed || !container) return;

      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "#0a0a0a" },
          textColor: "#a1a1aa",
          fontFamily: "monospace",
        },
        grid: {
          vertLines: { color: "#18181b" },
          horzLines: { color: "#18181b" },
        },
        rightPriceScale: {
          borderColor: "#27272a",
        },
        timeScale: {
          borderColor: "#27272a",
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          vertLine: { color: "#c87d55", labelBackgroundColor: "#c87d55" },
          horzLine: { color: "#c87d55", labelBackgroundColor: "#c87d55" },
        },
        width: container.clientWidth,
        height,
      });

      let series: ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;

      if (chartType === "candlestick") {
        series = chart.addSeries(CandlestickSeries, {
          upColor: "#00cc66",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#00cc66",
          wickDownColor: "#ef4444",
        });
      } else if (chartType === "line") {
        series = chart.addSeries(LineSeries, {
          color: "#c87d55",
          lineWidth: 2,
        });
      } else {
        series = chart.addSeries(AreaSeries, {
          lineColor: "#c87d55",
          topColor: "rgba(200, 125, 85, 0.35)",
          bottomColor: "rgba(200, 125, 85, 0.02)",
          lineWidth: 2,
        });
      }

      chartRef.current = chart;
      seriesRef.current = series;

      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      ro.observe(container);
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
     
  }, [chartType, height]);

  // Fetch + refresh data
  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function loadData() {
      try {
        const res = await fetch(
          `/api/market-data?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`,
          { cache: "no-store" }
        );
        if (!res?.ok) throw new Error("Failed to fetch chart data");

        const data = await res.json().catch(() => null);
        const candles: ChartCandle[] = Array.isArray(data?.candles) ? data.candles : [];

        if (!isMounted || !seriesRef.current) return;

        if (candles.length === 0) {
          setHasError(true);
          setIsLoading(false);
          return;
        }

        if (chartType === "candlestick") {
          (seriesRef.current as ISeriesApi<"Candlestick">).setData(
            candles.map((c) => ({
              time: c.time as unknown as Time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          );
        } else {
          (seriesRef.current as ISeriesApi<"Area"> | ISeriesApi<"Line">).setData(
            candles.map((c) => ({ time: c.time as unknown as Time, value: c.value }))
          );
        }

        chartRef.current?.timeScale().fitContent();
        setHasError(false);
        setIsLoading(false);
      } catch (err) {
         
        console.error(`[LightweightChart] Failed to load data for ${symbol}:`, err);
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    }

    loadData();

    if (refreshMs > 0) {
      timer = setInterval(loadData, refreshMs);
    }

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [symbol, range, interval, chartType, refreshMs]);

  return (
    <div className={`relative w-full ${className}`} style={{ height }}>
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '550px' }} />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 text-[#a1a1aa] text-xs font-mono">
          LOADING CHART DATA...
        </div>
      )}
      {hasError && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 text-[#a1a1aa] text-xs font-mono">
          DATA UNAVAILABLE
        </div>
      )}
    </div>
  );
}

const LightweightChart = memo(LightweightChartComponent);
export default LightweightChart;
