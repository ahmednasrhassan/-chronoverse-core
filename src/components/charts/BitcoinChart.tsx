"use client";

import {
  useEffect,
  useState,
} from "react";

import type { MarketCandle } from "@/lib/markets/core/types";

import ChronoverseCandlestickChart from "./engines/echarts/ChronoverseCandlestickChart";

interface MarketDataResponse {
  candles?: MarketCandle[];
}

export default function BitcoinChart() {
  const [candles, setCandles] =
    useState<MarketCandle[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          "/api/market-data?symbol=BTC-USD&range=3mo&interval=1d",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Bitcoin market data request failed with HTTP ${response.status}`
          );
        }

        const payload =
          (await response.json()) as MarketDataResponse;

        const nextCandles =
          Array.isArray(payload.candles)
            ? payload.candles
            : [];

        if (!cancelled) {
          setCandles(nextCandles);

          if (
            nextCandles.length === 0
          ) {
            setError(
              "Bitcoin market data is temporarily unavailable."
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load Bitcoin market data."
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
        15 * 60 * 1000
      );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (
    error &&
    candles.length === 0
  ) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-xl border border-zinc-800 bg-black/20 px-6 text-center">
        <p className="font-mono text-sm text-zinc-400">
          {error}
        </p>
      </div>
    );
  }

  return (
    <ChronoverseCandlestickChart
      candles={candles}
      symbol="Bitcoin"
      loading={loading}
      className="w-full"
    />
  );
}