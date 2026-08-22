"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
} from "react";

import * as echarts from "echarts/core";
import type {
  EChartsCoreOption,
  EChartsType,
  SetOptionOpts,
} from "echarts/core";

import {
  CanvasRenderer,
} from "echarts/renderers";

import {
  CandlestickChart,
  LineChart,
  BarChart,
} from "echarts/charts";

import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  DatasetComponent,
  AxisPointerComponent,
  LegendComponent,
  TitleComponent,
} from "echarts/components";

/**
 * Register only the modules Chronoverse currently needs.
 *
 * This keeps the client bundle smaller than importing
 * the full ECharts package.
 */
echarts.use([
  CanvasRenderer,

  CandlestickChart,
  LineChart,
  BarChart,

  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  DatasetComponent,
  AxisPointerComponent,
  LegendComponent,
  TitleComponent,
]);

export interface EChartsEngineProps {
  option: EChartsCoreOption;

  height?: number | string;

  className?: string;

  style?: CSSProperties;

  loading?: boolean;

  setOptionOptions?: SetOptionOpts;
}

/**
 * Chronoverse ECharts Engine
 *
 * Low-level renderer responsible only for:
 *
 * - creating the ECharts instance
 * - applying chart options
 * - responsive resizing
 * - loading state
 * - disposing the instance safely
 *
 * Financial chart logic belongs in higher-level
 * Chronoverse components.
 */
export default function EChartsEngine({
  option,
  height = 480,
  className = "",
  style,
  loading = false,
  setOptionOptions,
}: EChartsEngineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  /**
   * Initialize chart once.
   */
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart = echarts.init(
      container,
      undefined,
      {
        renderer: "canvas",
      }
    );

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();

      chart.dispose();

      chartRef.current = null;
    };
  }, []);

  /**
   * Update chart options.
   */
  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    chart.setOption(
      option,
      setOptionOptions
    );
  }, [option, setOptionOptions]);

  /**
   * Control loading overlay.
   */
  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    if (loading) {
      chart.showLoading("default", {
        text: "Loading market data...",
        color: "#c87d55",
        textColor: "#a1a1aa",
        maskColor: "rgba(10, 10, 10, 0.75)",
      });
    } else {
      chart.hideLoading();
    }
  }, [loading]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: "100%",
        height,
        minHeight: 320,
        ...style,
      }}
    />
  );
}