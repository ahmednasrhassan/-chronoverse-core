"use client";

import { useMemo } from "react";
import type { EChartsCoreOption } from "echarts/core";

import EChartsEngine from
  "@/components/charts/engines/echarts/EChartsEngine";
import type { HistoricalPointV1 } from
  "@/lib/markets/services/historicalChartSeries";

interface HistoricalReferenceLineChartProps {
  readonly displayName: string;
  readonly rangeLabel: string;
  readonly valueKind: "fx-reference-rate" | "interest-rate-percent";
  readonly unit: string;
  readonly points: readonly HistoricalPointV1[];
  readonly observedFrom: number;
  readonly observedTo: number;
}

export default function HistoricalReferenceLineChart({
  displayName,
  rangeLabel,
  valueKind,
  unit,
  points,
  observedFrom,
  observedTo,
}: HistoricalReferenceLineChartProps) {
  const option = useMemo<EChartsCoreOption>(() => ({
    animation: false,
    backgroundColor: "transparent",
    grid: {
      left: 12,
      right: 18,
      top: 22,
      bottom: 42,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#15131A",
      borderColor: "#6F4C91",
      borderWidth: 1,
      textStyle: { color: "#F3EBDD", fontSize: 12 },
      valueFormatter: (value: unknown) =>
        formatChartValue(value, valueKind, unit),
      axisPointer: {
        type: "line",
        lineStyle: { color: "#91889A", width: 1, type: "dashed" },
      },
    },
    xAxis: {
      type: "time",
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#6F4C91" } },
      axisTick: { show: false },
      axisLabel: {
        color: "#91889A",
        hideOverlap: true,
        fontSize: 10,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#91889A",
        fontSize: 10,
        formatter: valueKind === "interest-rate-percent"
          ? "{value}%"
          : undefined,
      },
      splitLine: {
        lineStyle: { color: "rgba(111,76,145,0.20)", type: "dashed" },
      },
    },
    series: [{
      name: `${displayName} ECB daily reference rate`,
      type: "line",
      data: points.map((point) => [point.timestamp * 1_000, point.value]),
      showSymbol: false,
      connectNulls: false,
      lineStyle: { color: "#C8A7E8", width: 2 },
      itemStyle: { color: "#C8A7E8" },
      areaStyle: { color: "rgba(167,123,216,0.08)" },
      emphasis: {
        focus: "series",
        lineStyle: { width: 2 },
      },
    }],
  }), [displayName, points, unit, valueKind]);
  const coverage = `${formatReferenceDate(observedFrom)} to ${formatReferenceDate(observedTo)}`;

  return (
    <div
      role="img"
      aria-label={`${displayName} ECB daily reference-rate line chart for ${rangeLabel}, covering ${coverage}, in ${unit}.`}
      className="min-w-0 bg-[linear-gradient(180deg,rgba(21,19,26,0.62),rgba(5,5,6,0.34))]"
    >
      <EChartsEngine
        option={option}
        height="clamp(20rem, 43vw, 35rem)"
        className="min-w-0"
        setOptionOptions={{ notMerge: true }}
      />
    </div>
  );
}

function formatChartValue(
  value: unknown,
  valueKind: "fx-reference-rate" | "interest-rate-percent",
  unit: string,
): string {
  const candidate = Array.isArray(value) ? value.at(-1) : value;
  const numeric = typeof candidate === "number"
    ? candidate
    : Number(candidate);

  if (!Number.isFinite(numeric)) {
    return String(candidate);
  }

  return valueKind === "interest-rate-percent"
    ? `${numeric.toFixed(3)}%`
    : `${numeric} ${unit}`;
}

function formatReferenceDate(timestamp: number): string {
  return new Date(timestamp * 1_000).toISOString().slice(0, 10);
}
