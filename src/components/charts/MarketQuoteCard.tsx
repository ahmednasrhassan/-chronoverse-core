"use client";

import React, { memo } from "react";

export interface MarketQuote {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
}

interface MarketQuoteCardProps {
  symbol: string;
  label?: string;
  quote?: MarketQuote | null;
}

function formatVolume(
  volume: number | null | undefined
): string {
  if (
    volume === null ||
    volume === undefined
  ) {
    return "—";
  }

  if (volume >= 1_000_000_000) {
    return `${(
      volume / 1_000_000_000
    ).toFixed(2)}B`;
  }

  if (volume >= 1_000_000) {
    return `${(
      volume / 1_000_000
    ).toFixed(2)}M`;
  }

  if (volume >= 1_000) {
    return `${(
      volume / 1_000
    ).toFixed(2)}K`;
  }

  return volume.toLocaleString();
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
    undefined,
    {
      maximumFractionDigits: 2,
    }
  );
}

function MarketQuoteCardComponent({
  symbol,
  label,
  quote,
}: MarketQuoteCardProps) {
  const displayLabel =
    quote?.label ??
    label ??
    symbol;

  const price =
    quote?.price;

  const changePercent =
    quote?.changePercent;

  const isPositive =
    (changePercent ?? 0) >= 0;

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="flex items-start justify-between px-1">
        <div className="flex flex-col min-w-0">
          <span className="text-secondary text-xs font-bold uppercase tracking-wide truncate">
            {displayLabel}
          </span>

          <span className="text-secondary text-[10px] font-mono">
            {symbol}
          </span>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <span className="text-primary text-sm font-bold font-mono">
            {formatPrice(price)}
          </span>

          <span
            className={`text-[11px] font-mono font-semibold ${
              isPositive
                ? "text-[#00cc66]"
                : "text-red-500"
            }`}
          >
            {changePercent !== null &&
            changePercent !==
              undefined
              ? `${
                  isPositive
                    ? "+"
                    : ""
                }${changePercent.toFixed(
                  2
                )}%`
              : "—"}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-3 gap-2 rounded-lg bg-black/20 border border-border/60 px-2 py-2">
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-secondary font-mono">
            24h High
          </span>

          <span className="text-[11px] font-mono font-semibold text-[#00cc66]">
            {formatPrice(
              quote?.dayHigh
            )}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1 border-x border-border/60">
          <span className="text-[9px] uppercase tracking-widest text-secondary font-mono">
            24h Low
          </span>

          <span className="text-[11px] font-mono font-semibold text-red-500">
            {formatPrice(
              quote?.dayLow
            )}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-secondary font-mono">
            Volume
          </span>

          <span className="text-[11px] font-mono font-semibold text-secondary">
            {formatVolume(
              quote?.volume
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

const MarketQuoteCard =
  memo(
    MarketQuoteCardComponent
  );

export default MarketQuoteCard;