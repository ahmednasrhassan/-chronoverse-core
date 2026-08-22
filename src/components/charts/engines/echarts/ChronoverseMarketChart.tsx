"use client";

import { useEffect, useMemo, useState } from "react";

import ChronoverseCandlestickChart from "./ChronoverseCandlestickChart";
import type { MarketCandle } from "@/lib/markets/core/types";

export interface ChronoverseMarketChartProps {
  symbol: string;
  range?: string;
  interval?: string;
  height?: number;
  className?: string;
  refreshMs?: number;
}

interface MarketDataApiResponse {
  symbol?: string;
  data?: Array<{
    date?: string | number;
    timestamp?: number;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
  }>;
  candles?: Array<{
    time?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number | null;
  }>;
  error?: string;
}

/**
 * Chronoverse Market Chart
 *
 * Fetches historical market data through the internal
 * Chronoverse API and normalizes it before rendering.
 *
 * The chart component itself remains provider-agnostic.
 */
export default function ChronoverseMarketChart({
  symbol,
  range = "6mo",
  interval = "1d",
  height = 520,
  className = "",
  refreshMs = 60_000,
}: ChronoverseMarketChartProps) {
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({
      symbol,
      range,
      interval,
    });

    return `/api/market-data?${params.toString()}`;
  }, [symbol, range, interval]);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      try {
        setError(null);

        const response = await fetch(endpoint, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `Market data request failed with status ${response.status}.`
          );
        }

        const payload =
          (await response.json()) as MarketDataApiResponse;

        if (payload.error) {
          throw new Error(payload.error);
        }

        const normalized = normalizeMarketCandles(payload);

        if (!cancelled) {
          setCandles(normalized);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load market data."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    loadMarketData();

    if (refreshMs <= 0) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setInterval(
      loadMarketData,
      refreshMs
    );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [endpoint, refreshMs]);

  if (error && candles.length === 0) {
    return (
      <div
        className={[
         "flex min-h-80 items-center justify-center rounded-xl",
          "border border-zinc-800 bg-[#0a0a0a] px-6 text-center",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ height }}
      >
        <div>
          <p className="font-mono text-sm text-zinc-300">
            Market data unavailable
          </p>

          <p className="mt-2 max-w-md text-xs text-zinc-500">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ChronoverseCandlestickChart
      symbol={symbol}
      candles={candles}
      height={height}
      loading={loading}
      className={className}
    />
  );
}

function normalizeMarketCandles(
  payload: MarketDataApiResponse
): MarketCandle[] {
  if (Array.isArray(payload.candles)) {
    return payload.candles
      .filter(
        (item) =>
          typeof item.time === "number" &&
          typeof item.open === "number" &&
          typeof item.high === "number" &&
          typeof item.low === "number" &&
          typeof item.close === "number"
      )
      .map((item) => ({
        time: item.time!,
        open: item.open!,
        high: item.high!,
        low: item.low!,
        close: item.close!,
        volume: item.volume ?? null,
      }))
      .sort((a, b) => a.time - b.time);
  }

  if (!Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .map((item): MarketCandle | null => {
      const open = item.open;
      const high = item.high;
      const low = item.low;
      const close = item.close;

      if (
        typeof open !== "number" ||
        typeof high !== "number" ||
        typeof low !== "number" ||
        typeof close !== "number"
      ) {
        return null;
      }

      const time = resolveTimestamp(
        item.timestamp,
        item.date
      );

      if (time === null) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        volume: item.volume ?? null,
      };
    })
    .filter(
      (item): item is MarketCandle => item !== null
    )
    .sort((a, b) => a.time - b.time);
}

function resolveTimestamp(
  timestamp?: number,
  date?: string | number
): number | null {
  if (
    typeof timestamp === "number" &&
    Number.isFinite(timestamp)
  ) {
    return timestamp > 10_000_000_000
      ? Math.floor(timestamp / 1000)
      : Math.floor(timestamp);
  }

  if (date === undefined || date === null) {
    return null;
  }

  const milliseconds =
    typeof date === "number"
      ? date
      : Date.parse(date);

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return milliseconds > 10_000_000_000
    ? Math.floor(milliseconds / 1000)
    : Math.floor(milliseconds);
}