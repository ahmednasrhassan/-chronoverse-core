"use client";

import {
  HISTORICAL_RANGES_V1,
  getHistoricalRangeSupportV1,
  type HistoricalProductIdV1,
  type HistoricalRangeV1,
} from "@/lib/markets/services/historicalRange";

const RANGE_LABELS_V1 = Object.freeze({
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
  "2y": "2Y",
  "5y": "5Y",
  max: "MAX",
} as const satisfies Record<HistoricalRangeV1, string>);

interface HistoricalRangeSelectorProps {
  readonly productId: HistoricalProductIdV1;
  readonly selectedRange: HistoricalRangeV1;
  readonly fiveDayAvailable: boolean;
  readonly fiveDayUnavailableReason: string | null;
  readonly onSelect: (range: HistoricalRangeV1) => void;
}

export default function HistoricalRangeSelector({
  productId,
  selectedRange,
  fiveDayAvailable,
  fiveDayUnavailableReason,
  onSelect,
}: HistoricalRangeSelectorProps) {
  return (
    <div>
      <div
        role="group"
        aria-label="Historical reference-rate range"
        className="flex max-w-full flex-wrap gap-1.5"
      >
        {HISTORICAL_RANGES_V1.map((range) => {
          const support = getHistoricalRangeSupportV1(productId, range);
          const disabled = support === "unsupported" ||
            (support === "conditional" && !fiveDayAvailable);
          const isSelected = range === selectedRange;
          const disabledReason = support === "unsupported"
            ? `${RANGE_LABELS_V1[range]} is unavailable for ${
              productId === "estr"
                ? "€STR official-rate history"
                : "FX reference-rate history"
            }.`
            : fiveDayUnavailableReason ??
              "5D requires at least two official observations.";

          return (
            <button
              key={range}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={disabled
                ? `${RANGE_LABELS_V1[range]} unavailable`
                : `Show ${RANGE_LABELS_V1[range]} history`}
              title={disabled ? disabledReason : undefined}
              onClick={() => onSelect(range)}
              className={`min-h-11 min-w-12 border px-3 font-mono text-[10px] font-semibold tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] ${
                disabled
                  ? "cursor-not-allowed border-[#292432] bg-[#09090C] text-[#5F5963]"
                  : isSelected
                    ? "border-[#C8A7E8] bg-[#A77BD8]/20 text-[#F3EBDD]"
                    : "border-[#6F4C91]/45 bg-[#0D0D11] text-[#CFC5B8] hover:border-[#A77BD8] hover:text-[#F3EBDD]"
              }`}
            >
              {RANGE_LABELS_V1[range]}
            </button>
          );
        })}
      </div>

      {!fiveDayAvailable ? (
        <p className="mt-2 text-[11px] leading-5 text-[#91889A]">
          5D unavailable: {fiveDayUnavailableReason ??
            "the C4-B result did not contain two official observations"}.
        </p>
      ) : null}
    </div>
  );
}
