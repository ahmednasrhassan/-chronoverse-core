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

function calculateEMA(
  values: number[],
  period: number
): Array<number | null> {
  const result: Array<number | null> =
    new Array(values.length).fill(null);

  if (
    values.length === 0 ||
    period <= 0 ||
    values.length < period
  ) {
    return result;
  }

  const multiplier =
    2 / (period + 1);

  const initialSMA =
    values
      .slice(0, period)
      .reduce(
        (sum, value) =>
          sum + value,
        0
      ) / period;

  result[period - 1] =
    initialSMA;

  let previousEMA =
    initialSMA;

  for (
    let index = period;
    index < values.length;
    index += 1
  ) {
    const currentEMA =
      (values[index] -
        previousEMA) *
        multiplier +
      previousEMA;

    result[index] =
      currentEMA;

    previousEMA =
      currentEMA;
  }

  return result;
}

function calculateRSI(
  values: number[],
  period = 14
): Array<number | null> {
  const result: Array<number | null> =
    new Array(values.length).fill(null);

  if (
    values.length <= period ||
    period <= 0
  ) {
    return result;
  }

  let gains = 0;
  let losses = 0;

  for (
    let index = 1;
    index <= period;
    index += 1
  ) {
    const change =
      values[index] -
      values[index - 1];

    if (change >= 0) {
      gains += change;
    } else {
      losses +=
        Math.abs(change);
    }
  }

  let averageGain =
    gains / period;

  let averageLoss =
    losses / period;

  if (averageLoss === 0) {
    result[period] = 100;
  } else {
    const rs =
      averageGain /
      averageLoss;

    result[period] =
      100 -
      100 / (1 + rs);
  }

  for (
    let index = period + 1;
    index < values.length;
    index += 1
  ) {
    const change =
      values[index] -
      values[index - 1];

    const gain =
      change > 0
        ? change
        : 0;

    const loss =
      change < 0
        ? Math.abs(change)
        : 0;

    averageGain =
      (averageGain *
        (period - 1) +
        gain) /
      period;

    averageLoss =
      (averageLoss *
        (period - 1) +
        loss) /
      period;

    if (averageLoss === 0) {
      result[index] = 100;
    } else {
      const rs =
        averageGain /
        averageLoss;

      result[index] =
        100 -
        100 / (1 + rs);
    }
  }

  return result;
}

interface MACDResult {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}

function calculateMACD(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const fastEMA =
    calculateEMA(
      values,
      fastPeriod
    );

  const slowEMA =
    calculateEMA(
      values,
      slowPeriod
    );

  const macd: Array<number | null> =
    values.map(
      (_, index) => {
        const fast =
          fastEMA[index];

        const slow =
          slowEMA[index];

        if (
          fast === null ||
          slow === null
        ) {
          return null;
        }

        return fast - slow;
      }
    );

  const validMacdValues:
    number[] = [];

  const validIndexes:
    number[] = [];

  macd.forEach(
    (value, index) => {
      if (value !== null) {
        validMacdValues.push(
          value
        );

        validIndexes.push(
          index
        );
      }
    }
  );

  const compactSignal =
    calculateEMA(
      validMacdValues,
      signalPeriod
    );

  const signal:
    Array<number | null> =
      new Array(
        values.length
      ).fill(null);

  compactSignal.forEach(
    (value, index) => {
      const originalIndex =
        validIndexes[index];

      if (
        originalIndex !==
        undefined
      ) {
        signal[
          originalIndex
        ] = value;
      }
    }
  );

  const histogram =
    macd.map(
      (value, index) => {
        const signalValue =
          signal[index];

        if (
          value === null ||
          signalValue === null
        ) {
          return null;
        }

        return (
          value -
          signalValue
        );
      }
    );

  return {
    macd,
    signal,
    histogram,
  };
}

export default function ChronoverseCandlestickChart({
  candles,
  height = 920,
  symbol = "MARKET",
  loading = false,
  className = "",
}: ChronoverseCandlestickChartProps) {
  const option =
    useMemo<EChartsCoreOption>(() => {
      const categories =
        candles.map(
          (candle) =>
            new Date(
              candle.time *
                1000
            ).toLocaleDateString()
        );

      const candleData =
        candles.map(
          (candle) => [
            candle.open,
            candle.close,
            candle.low,
            candle.high,
          ]
        );

      const closePrices =
        candles.map(
          (candle) =>
            candle.close
        );

      const ema20 =
        calculateEMA(
          closePrices,
          20
        );

      const ema50 =
        calculateEMA(
          closePrices,
          50
        );

      const rsi14 =
        calculateRSI(
          closePrices,
          14
        );

      const {
        macd,
        signal,
        histogram,
      } = calculateMACD(
        closePrices,
        12,
        26,
        9
      );

      const volumeData =
        candles.map(
          (candle) => ({
            value:
              candle.volume ??
              0,

            itemStyle: {
              color:
                candle.close >=
                candle.open
                  ? "rgba(34, 197, 94, 0.45)"
                  : "rgba(239, 68, 68, 0.45)",
            },
          })
        );

      const histogramData =
        histogram.map(
          (value) => ({
            value,

            itemStyle: {
              color:
                value !== null &&
                value >= 0
                  ? "rgba(34, 197, 94, 0.65)"
                  : "rgba(239, 68, 68, 0.65)",
            },
          })
        );

      return {
        backgroundColor:
          "#0a0a0a",

        animation: false,

        title: {
          text: symbol,
          left: 16,
          top: 12,

          textStyle: {
            color:
              "#f4f4f5",
            fontSize: 14,
            fontFamily:
              "monospace",
            fontWeight: 600,
          },
        },

        legend: {
          top: 14,
          right: 24,

          data: [
            "EMA 20",
            "EMA 50",
            "RSI 14",
            "MACD",
            "Signal",
          ],

          textStyle: {
            color:
              "#a1a1aa",
            fontFamily:
              "monospace",
            fontSize: 10,
          },

          itemWidth: 18,
          itemHeight: 2,
        },

        tooltip: {
          trigger: "axis",

          axisPointer: {
            type: "cross",

            lineStyle: {
              color:
                "#c87d55",
            },
          },

          backgroundColor:
            "#111113",

          borderColor:
            "#27272a",

          textStyle: {
            color:
              "#f4f4f5",
            fontFamily:
              "monospace",
          },
        },

        axisPointer: {
          link: [
            {
              xAxisIndex:
                "all",
            },
          ],
        },

        grid: [
          {
            left: 64,
            right: 24,
            top: 60,
            height: "35%",
          },

          {
            left: 64,
            right: 24,
            top: "46%",
            height: "8%",
          },

          {
            left: 64,
            right: 24,
            top: "58%",
            height: "12%",
          },

          {
            left: 64,
            right: 24,
            top: "74%",
            height: "13%",
          },
        ],

        xAxis: [
          {
            type:
              "category",

            data:
              categories,

            boundaryGap:
              true,

            axisLine: {
              lineStyle: {
                color:
                  "#27272a",
              },
            },

            axisTick: {
              show:
                false,
            },

            axisLabel: {
              color:
                "#71717a",
              fontFamily:
                "monospace",
              fontSize: 10,
            },

            splitLine: {
              show:
                false,
            },

            min:
              "dataMin",
            max:
              "dataMax",
          },

          {
            type:
              "category",

            gridIndex: 1,

            data:
              categories,

            boundaryGap:
              true,

            axisLine: {
              lineStyle: {
                color:
                  "#27272a",
              },
            },

            axisTick: {
              show:
                false,
            },

            axisLabel: {
              show:
                false,
            },

            splitLine: {
              show:
                false,
            },

            min:
              "dataMin",
            max:
              "dataMax",
          },

          {
            type:
              "category",

            gridIndex: 2,

            data:
              categories,

            boundaryGap:
              true,

            axisLine: {
              lineStyle: {
                color:
                  "#27272a",
              },
            },

            axisTick: {
              show:
                false,
            },

            axisLabel: {
              show:
                false,
            },

            splitLine: {
              show:
                false,
            },

            min:
              "dataMin",
            max:
              "dataMax",
          },

          {
            type:
              "category",

            gridIndex: 3,

            data:
              categories,

            boundaryGap:
              true,

            axisLine: {
              lineStyle: {
                color:
                  "#27272a",
              },
            },

            axisTick: {
              show:
                false,
            },

            axisLabel: {
              show:
                false,
            },

            splitLine: {
              show:
                false,
            },

            min:
              "dataMin",
            max:
              "dataMax",
          },
        ],

        yAxis: [
          {
            scale: true,

            position:
              "right",

            axisLine: {
              show: true,

              lineStyle: {
                color:
                  "#27272a",
              },
            },

            axisLabel: {
              color:
                "#a1a1aa",
              fontFamily:
                "monospace",
            },

            splitLine: {
              lineStyle: {
                color:
                  "#18181b",
              },
            },
          },

          {
            scale: true,

            gridIndex: 1,

            position:
              "right",

            axisLine: {
              show:
                false,
            },

            axisLabel: {
              show:
                false,
            },

            splitLine: {
              show:
                false,
            },
          },

          {
            type:
              "value",

            gridIndex: 2,

            min: 0,
            max: 100,

            position:
              "right",

            axisLine: {
              show:
                false,
            },

            axisTick: {
              show:
                false,
            },

            axisLabel: {
              color:
                "#71717a",
              fontFamily:
                "monospace",
              fontSize: 10,
            },

            splitLine: {
              lineStyle: {
                color:
                  "#18181b",
              },
            },
          },

          {
            scale: true,

            gridIndex: 3,

            position:
              "right",

            axisLine: {
              show:
                false,
            },

            axisTick: {
              show:
                false,
            },

            axisLabel: {
              color:
                "#71717a",
              fontFamily:
                "monospace",
              fontSize: 10,
            },

            splitLine: {
              lineStyle: {
                color:
                  "#18181b",
              },
            },
          },
        ],

        dataZoom: [
          {
            type:
              "inside",

            xAxisIndex: [
              0,
              1,
              2,
              3,
            ],

            start: 60,
            end: 100,
          },

          {
            type:
              "slider",

            xAxisIndex: [
              0,
              1,
              2,
              3,
            ],

            bottom: 8,

            start: 60,
            end: 100,

            height: 18,

            borderColor:
              "#27272a",

            backgroundColor:
              "#111113",

            fillerColor:
              "rgba(200, 125, 85, 0.15)",

            handleStyle: {
              color:
                "#c87d55",
            },

            textStyle: {
              color:
                "#71717a",
            },
          },
        ],

        series: [
          {
            name:
              symbol,

            type:
              "candlestick",

            data:
              candleData,

            itemStyle: {
              color:
                "#22c55e",

              color0:
                "#ef4444",

              borderColor:
                "#22c55e",

              borderColor0:
                "#ef4444",
            },

            emphasis: {
              itemStyle: {
                borderWidth:
                  1,
              },
            },
          },

          {
            name:
              "EMA 20",

            type:
              "line",

            data:
              ema20,

            showSymbol:
              false,

            smooth:
              false,

            connectNulls:
              false,

            lineStyle: {
              width: 2,
              color:
                "#f59e0b",
            },

            emphasis: {
              disabled:
                true,
            },

            z: 5,
          },

          {
            name:
              "EMA 50",

            type:
              "line",

            data:
              ema50,

            showSymbol:
              false,

            smooth:
              false,

            connectNulls:
              false,

            lineStyle: {
              width: 2,
              color:
                "#38bdf8",
            },

            emphasis: {
              disabled:
                true,
            },

            z: 5,
          },

          {
            name:
              "Volume",

            type:
              "bar",

            xAxisIndex: 1,
            yAxisIndex: 1,

            data:
              volumeData,

            barWidth:
              "60%",
          },

          {
            name:
              "RSI 14",

            type:
              "line",

            xAxisIndex: 2,
            yAxisIndex: 2,

            data:
              rsi14,

            showSymbol:
              false,

            smooth:
              false,

            connectNulls:
              false,

            lineStyle: {
              width: 1.8,
              color:
                "#a78bfa",
            },

            markLine: {
              silent: true,

              symbol: [
                "none",
                "none",
              ],

              label: {
                show: true,

                position:
                  "insideEndTop",

                color:
                  "#71717a",

                fontFamily:
                  "monospace",

                fontSize: 9,
              },

              lineStyle: {
                type:
                  "dashed",

                width: 1,

                color:
                  "#3f3f46",
              },

              data: [
                {
                  yAxis: 70,

                  name:
                    "Overbought",
                },

                {
                  yAxis: 30,

                  name:
                    "Oversold",
                },
              ],
            },

            z: 5,
          },

          {
            name:
              "MACD Histogram",

            type:
              "bar",

            xAxisIndex: 3,
            yAxisIndex: 3,

            data:
              histogramData,

            barWidth:
              "60%",
          },

          {
            name:
              "MACD",

            type:
              "line",

            xAxisIndex: 3,
            yAxisIndex: 3,

            data:
              macd,

            showSymbol:
              false,

            smooth:
              false,

            connectNulls:
              false,

            lineStyle: {
              width: 1.8,
              color:
                "#38bdf8",
            },

            z: 5,
          },

          {
            name:
              "Signal",

            type:
              "line",

            xAxisIndex: 3,
            yAxisIndex: 3,

            data:
              signal,

            showSymbol:
              false,

            smooth:
              false,

            connectNulls:
              false,

            lineStyle: {
              width: 1.5,
              color:
                "#f59e0b",
            },

            z: 6,
          },
        ],
      };
    }, [
      candles,
      symbol,
    ]);

  return (
    <EChartsEngine
      option={option}
      height={height}
      loading={loading}
      className={className}
    />
  );
}