"use client";

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import EChartsEngine from "./EChartsEngine";
import type { MarketCandle } from "@/lib/markets/core/types";

export interface ChronoverseCandlestickChartProps {
  candles: MarketCandle[];

  height?: number;

  symbol?: string;

  loading?: boolean;

  className?: string;
}

/**
 * Chronoverse Candlestick Chart
 *
 * High-level financial chart built on top of EChartsEngine.
 *
 * This component is intentionally provider-agnostic:
 * it only accepts normalized Chronoverse MarketCandle data.
 */
export default function ChronoverseCandlestickChart({
  candles,
  height = 520,
  symbol = "MARKET",
  loading = false,
  className = "",
}: ChronoverseCandlestickChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const categories = candles.map((candle) =>
      new Date(candle.time * 1000).toLocaleDateString()
    );

    const candleData = candles.map((candle) => [
      candle.open,
      candle.close,
      candle.low,
      candle.high,
    ]);

    const volumeData = candles.map((candle, index) => ({
      value: candle.volume ?? 0,

      itemStyle: {
        color:
          candle.close >= candle.open
            ? "rgba(34, 197, 94, 0.45)"
            : "rgba(239, 68, 68, 0.45)",
      },

      xAxisIndex: 1,
      yAxisIndex: 1,

      index,
    }));

    return {
      backgroundColor: "#0a0a0a",

      animation: false,

      title: {
        text: symbol,
        left: 16,
        top: 12,

        textStyle: {
          color: "#f4f4f5",
          fontSize: 14,
          fontFamily: "monospace",
          fontWeight: 600,
        },
      },

      tooltip: {
        trigger: "axis",

        axisPointer: {
          type: "cross",

          lineStyle: {
            color: "#c87d55",
          },
        },

        backgroundColor: "#111113",

        borderColor: "#27272a",

        textStyle: {
          color: "#f4f4f5",
          fontFamily: "monospace",
        },
      },

      axisPointer: {
        link: [
          {
            xAxisIndex: "all",
          },
        ],
      },

      grid: [
        {
          left: 64,
          right: 24,
          top: 60,
          height: "62%",
        },

        {
          left: 64,
          right: 24,
          top: "78%",
          height: "14%",
        },
      ],

      xAxis: [
        {
          type: "category",

          data: categories,

          boundaryGap: true,

          axisLine: {
            lineStyle: {
              color: "#27272a",
            },
          },

          axisTick: {
            show: false,
          },

          axisLabel: {
            color: "#71717a",
            fontFamily: "monospace",
            fontSize: 10,
          },

          splitLine: {
            show: false,
          },

          min: "dataMin",
          max: "dataMax",
        },

        {
          type: "category",

          gridIndex: 1,

          data: categories,

          boundaryGap: true,

          axisLine: {
            lineStyle: {
              color: "#27272a",
            },
          },

          axisTick: {
            show: false,
          },

          axisLabel: {
            show: false,
          },

          splitLine: {
            show: false,
          },

          min: "dataMin",
          max: "dataMax",
        },
      ],

      yAxis: [
        {
          scale: true,

          position: "right",

          axisLine: {
            show: true,

            lineStyle: {
              color: "#27272a",
            },
          },

          axisLabel: {
            color: "#a1a1aa",
            fontFamily: "monospace",
          },

          splitLine: {
            lineStyle: {
              color: "#18181b",
            },
          },
        },

        {
          scale: true,

          gridIndex: 1,

          position: "right",

          axisLine: {
            show: false,
          },

          axisLabel: {
            show: false,
          },

          splitLine: {
            show: false,
          },
        },
      ],

      dataZoom: [
        {
          type: "inside",
          xAxisIndex: [0, 1],
          start: 60,
          end: 100,
        },

        {
          type: "slider",
          xAxisIndex: [0, 1],
          bottom: 8,
          start: 60,
          end: 100,

          height: 18,

          borderColor: "#27272a",

          backgroundColor: "#111113",

          fillerColor: "rgba(200, 125, 85, 0.15)",

          handleStyle: {
            color: "#c87d55",
          },

          textStyle: {
            color: "#71717a",
          },
        },
      ],

      series: [
        {
          name: symbol,

          type: "candlestick",

          data: candleData,

          itemStyle: {
            color: "#22c55e",
            color0: "#ef4444",

            borderColor: "#22c55e",
            borderColor0: "#ef4444",
          },

          emphasis: {
            itemStyle: {
              borderWidth: 1,
            },
          },
        },

        {
          name: "Volume",

          type: "bar",

          xAxisIndex: 1,
          yAxisIndex: 1,

          data: volumeData,

          barWidth: "60%",
        },
      ],
    };
  }, [candles, symbol]);

  return (
    <EChartsEngine
      option={option}
      height={height}
      loading={loading}
      className={className}
    />
  );
}