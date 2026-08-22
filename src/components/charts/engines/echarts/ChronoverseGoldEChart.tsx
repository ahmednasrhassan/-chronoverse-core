"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type { MarketCandle } from "@/lib/markets/core/types";

import ChronoverseCandlestickChart from "./ChronoverseCandlestickChart";

interface MarketDataResponse {
  status?: string;
  source?: string;
  symbol?: string;
  candles?: MarketCandle[];
}

function formatPrice(
  value: number | null | undefined
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return value.toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );
}

export default function ChronoverseGoldEChart() {
  const [candles, setCandles] =
    useState<MarketCandle[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [source, setSource] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          "/api/market-data?symbol=GC%3DF&range=3mo&interval=1d",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Market data request failed with HTTP ${response.status}`
          );
        }

        const payload =
          (await response.json()) as MarketDataResponse;

        const nextCandles =
          Array.isArray(payload.candles)
            ? payload.candles
            : [];

        if (cancelled) {
          return;
        }

        setCandles(nextCandles);
        setSource(
          payload.source ?? null
        );

        if (
          nextCandles.length === 0
        ) {
          setError(
            "Market data is temporarily unavailable."
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load market data."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    const timer =
      window.setInterval(
        () => {
          void loadData();
        },
        60_000
      );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const marketStats =
    useMemo(() => {
      if (
        candles.length === 0
      ) {
        return {
          lastPrice: null,
          change: null,
          changePercent: null,
          high: null,
          low: null,
        };
      }

      const latest =
        candles[
          candles.length - 1
        ];

      const previous =
        candles.length > 1
          ? candles[
              candles.length - 2
            ]
          : null;

      const lastPrice =
        latest.close;

      const change =
        previous
          ? latest.close -
            previous.close
          : null;

      const changePercent =
        previous &&
        previous.close !== 0
          ? ((latest.close -
              previous.close) /
              previous.close) *
            100
          : null;

      const high =
        Math.max(
          ...candles.map(
            (candle) =>
              candle.high
          )
        );

      const low =
        Math.min(
          ...candles.map(
            (candle) =>
              candle.low
          )
        );

      return {
        lastPrice,
        change,
        changePercent,
        high,
        low,
      };
    }, [candles]);

  if (
    error &&
    candles.length === 0
  ) {
    return (
      <div className="flex min-h-105 items-center justify-center rounded-xl border border-zinc-800 bg-black/20 px-6 text-center">
        <p className="font-mono text-sm text-zinc-400">
          {error}
        </p>
      </div>
    );
  }

  const isPositive =
    (
      marketStats.changePercent ??
      0
    ) >= 0;

  return (
    <section className="w-full overflow-hidden rounded-xl border border-zinc-800 bg-black/20">
      <div className="flex flex-col gap-4 border-b border-zinc-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold uppercase tracking-wide text-white">
              Gold Futures
            </h2>

            <span className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 font-mono text-[10px] text-zinc-400">
              GC=F
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-2xl font-semibold text-white">
              {formatPrice(
                marketStats.lastPrice
              )}
            </span>

            <span
              className={`font-mono text-sm font-semibold ${
                isPositive
                  ? "text-emerald-400"
                  : "text-red-500"
              }`}
            >
              {marketStats.change !==
              null
                ? `${
                    marketStats.change >=
                    0
                      ? "+"
                      : ""
                  }${marketStats.change.toFixed(
                    2
                  )}`
                : "—"}
            </span>

            <span
              className={`font-mono text-sm font-semibold ${
                isPositive
                  ? "text-emerald-400"
                  : "text-red-500"
              }`}
            >
              {marketStats.changePercent !==
              null
                ? `${
                    marketStats.changePercent >=
                    0
                      ? "+"
                      : ""
                  }${marketStats.changePercent.toFixed(
                    2
                  )}%`
                : "—"}
            </span>
          </div>

          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Chronoverse Market Data
            {source
              ? ` · ${source}`
              : ""}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              3M High
            </div>

            <div className="mt-1 font-mono text-sm font-semibold text-emerald-400">
              {formatPrice(
                marketStats.high
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              3M Low
            </div>

            <div className="mt-1 font-mono text-sm font-semibold text-red-500">
              {formatPrice(
                marketStats.low
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Range
            </div>

            <div className="mt-1 font-mono text-sm font-semibold text-zinc-200">
              3M
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
              Interval
            </div>

            <div className="mt-1 font-mono text-sm font-semibold text-zinc-200">
              1D
            </div>
          </div>
        </div>
      </div>

      <ChronoverseCandlestickChart
        candles={candles}
        height={520}
        symbol="Gold Futures"
        loading={loading}
        className="w-full"
      />
    </section>
  );
}