"use client";

import { useMemo, useState } from "react";

import type { HistoricalChartSeriesV1 } from
  "@/lib/markets/services/historicalChartSeries";
import {
  getHistoricalRangeSupportV1,
  projectHistoricalRangeV1,
  resolveHistoricalRangeRequestV1,
  type HistoricalRangeV1,
} from "@/lib/markets/services/historicalRange";
import type { VipFxMarketRoomIdV1 } from
  "@/lib/markets/services/vipMarketRoomDelivery";
import HistoricalRangeSelector from "./HistoricalRangeSelector";
import HistoricalReferenceLineChart from "./HistoricalReferenceLineChart";

type AvailableHistoricalSeriesV1 = Extract<
  HistoricalChartSeriesV1,
  { readonly availability: "available" }
>;

const RANGE_LABELS_V1 = Object.freeze({
  "1d": "1 day",
  "5d": "5 days",
  "1mo": "1 month",
  "3mo": "3 months",
  "6mo": "6 months",
  "1y": "1 year",
  "2y": "2 years",
  "5y": "5 years",
  max: "maximum available history",
} as const satisfies Record<HistoricalRangeV1, string>);

interface VipFxHistoricalPanelProps {
  readonly productId: VipFxMarketRoomIdV1;
  readonly displayName: string;
  readonly twoYear: HistoricalChartSeriesV1 | null;
  readonly fiveDay: HistoricalChartSeriesV1 | null;
}

export default function VipFxHistoricalPanel({
  productId,
  displayName,
  twoYear,
  fiveDay,
}: VipFxHistoricalPanelProps) {
  const [selectedRange, setSelectedRange] = useState<HistoricalRangeV1>("1y");
  const view = useMemo(
    () => deriveFxHistoricalRangeViewV1(
      productId,
      selectedRange,
      twoYear,
      fiveDay,
    ),
    [fiveDay, productId, selectedRange, twoYear],
  );
  const fiveDayAvailable = fiveDay?.availability === "available";
  const fiveDayReason = fiveDayAvailable
    ? null
    : historicalUnavailableMessage(fiveDay);

  return (
    <section aria-labelledby="historical-reference-heading" className="min-w-0">
      <header className="grid gap-4 border-b border-[#6F4C91]/30 pb-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]">
            Historical reference-rate record
          </div>
          <h2
            id="historical-reference-heading"
            className="mt-1 text-xl font-bold tracking-tight text-[#F3EBDD] sm:text-2xl"
          >
            ECB daily reference rate
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[#91889A]">
            Official daily observations only. This is not an intraday traded
            close, and missing publication dates are not synthesized.
          </p>
        </div>

        <HistoricalRangeSelector
          productId={productId}
          selectedRange={selectedRange}
          fiveDayAvailable={fiveDayAvailable}
          fiveDayUnavailableReason={fiveDayReason}
          onSelect={setSelectedRange}
        />
      </header>

      {view?.availability === "available" ? (
        <div className="mt-4 min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#91889A]">
            <span>
              Requested {RANGE_LABELS_V1[selectedRange]} / {view.points.length} official observations
            </span>
            <span className="font-mono tabular-nums text-[#CFC5B8]">
              Observed {formatReferenceDate(view.resolved.observedFrom)} — {formatReferenceDate(view.resolved.observedTo)}
            </span>
          </div>
          <HistoricalReferenceLineChart
            displayName={displayName}
            rangeLabel={RANGE_LABELS_V1[selectedRange]}
            unit={view.unit}
            points={view.points}
            observedFrom={view.resolved.observedFrom}
            observedTo={view.resolved.observedTo}
          />
          <HistoricalProvenance series={view} />
        </div>
      ) : (
        <div className="mt-4 flex min-h-80 items-center border-y border-[#6F4C91]/30 bg-[#09090C]/80 px-5 py-10 sm:px-7">
          <div className="max-w-xl">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]">
              Historical series unavailable
            </div>
            <p className="mt-3 text-sm leading-6 text-[#CFC5B8]">
              {historicalUnavailableMessage(view)}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#91889A]">
              No point, date, or alternate range has been substituted.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function deriveFxHistoricalRangeViewV1(
  productId: VipFxMarketRoomIdV1,
  range: HistoricalRangeV1,
  twoYear: HistoricalChartSeriesV1 | null,
  fiveDay: HistoricalChartSeriesV1 | null,
): HistoricalChartSeriesV1 | null {
  if (range === "5d") {
    return fiveDay?.productId === productId ? fiveDay : null;
  }

  if (twoYear === null || twoYear.productId !== productId) {
    return null;
  }

  if (range === "2y") {
    return twoYear;
  }

  const anchor = twoYear.requested.to;
  const requested = resolveHistoricalRangeRequestV1(
    range,
    anchor,
    twoYear.availability === "available"
      ? twoYear.points[0]?.timestamp ?? 0
      : 0,
  );

  if (getHistoricalRangeSupportV1(productId, range) === "unsupported") {
    return Object.freeze({
      version: twoYear.version,
      availability: "unavailable",
      productId,
      requested,
      reason: "range-unsupported",
    });
  }

  if (twoYear.availability === "unavailable") {
    return Object.freeze({
      ...twoYear,
      requested,
    });
  }

  const projection = projectHistoricalRangeV1(
    range,
    anchor,
    twoYear.points,
  );

  if (projection.points.length < 2) {
    return Object.freeze({
      version: twoYear.version,
      availability: "unavailable",
      productId,
      requested: projection.requested,
      reason: "insufficient-observations",
      lastKnownProvenance: twoYear.provenance,
    });
  }

  const observedFrom = projection.points[0]!.timestamp;
  const observedTo = projection.points.at(-1)!.timestamp;

  return Object.freeze({
    ...twoYear,
    requested: projection.requested,
    resolved: Object.freeze({
      interval: "1d",
      observedFrom,
      observedTo,
      completeness: projection.completeness,
    }),
    points: projection.points,
    provenance: Object.freeze({
      ...twoYear.provenance,
      sourceTimestamp: observedTo,
    }),
  });
}

function HistoricalProvenance({
  series,
}: {
  readonly series: AvailableHistoricalSeriesV1;
}) {
  return (
    <div className="mt-4 border-y border-[#6F4C91]/25 py-3">
      <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProvenanceDatum
          label="Provider / series"
          value={`${series.provenance.sourceLabel} / ${series.provenance.sourceSeriesId}`}
        />
        <ProvenanceDatum
          label="Semantics"
          value={`${formatLabel(series.provenance.status)} / daily reference rate`}
        />
        <ProvenanceDatum
          label="Coverage"
          value={`${formatReferenceDate(series.resolved.observedFrom)} — ${formatReferenceDate(series.resolved.observedTo)}`}
        />
        <ProvenanceDatum
          label="Range / completeness"
          value={`${series.requested.range} / ${formatLabel(series.resolved.completeness)}`}
        />
        <ProvenanceDatum
          label="Freshness"
          value={formatLabel(series.provenance.freshness)}
        />
        <ProvenanceDatum
          label="Normalization"
          value={`Chronoverse / ${series.provenance.normalization}`}
        />
      </dl>
    </div>
  );
}

function ProvenanceDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.09em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-[11px] leading-5 text-[#CFC5B8]">
        {value}
      </dd>
    </div>
  );
}

function historicalUnavailableMessage(
  result: HistoricalChartSeriesV1 | null,
): string {
  if (result === null) {
    return "The protected historical service read did not complete";
  }

  if (result.availability === "available") {
    return "Available";
  }

  switch (result.reason) {
    case "range-unsupported":
      return "This range is unsupported for FX reference-rate history";
    case "source-unavailable":
      return "The canonical ECB historical source is temporarily unavailable";
    case "invalid-series":
      return "The canonical historical series did not pass identity or value validation";
    case "insufficient-observations":
      return "Fewer than two official observations exist in the requested range";
  }
}

function formatReferenceDate(timestamp: number): string {
  return new Date(timestamp * 1_000).toISOString().slice(0, 10);
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (character) => character.toUpperCase());
}
