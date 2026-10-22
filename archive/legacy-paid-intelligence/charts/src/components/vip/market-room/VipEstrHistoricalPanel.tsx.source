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
  max: "official history since series inception",
} as const satisfies Record<HistoricalRangeV1, string>);

interface VipEstrHistoricalPanelProps {
  readonly maximum: HistoricalChartSeriesV1 | null;
  readonly fiveDay: HistoricalChartSeriesV1 | null;
}

export default function VipEstrHistoricalPanel({
  maximum,
  fiveDay,
}: VipEstrHistoricalPanelProps) {
  const [selectedRange, setSelectedRange] = useState<HistoricalRangeV1>("1y");
  const view = useMemo(
    () => deriveEstrHistoricalRangeViewV1(selectedRange, maximum, fiveDay),
    [fiveDay, maximum, selectedRange],
  );
  const fiveDayAvailable = fiveDay?.availability === "available";
  const fiveDayReason = fiveDayAvailable
    ? null
    : historicalUnavailableMessage(fiveDay);

  return (
    <section aria-labelledby="estr-historical-heading" className="min-w-0">
      <header className="grid gap-4 border-b border-[#6F4C91]/30 pb-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]">
            Official overnight rate record
          </div>
          <h2
            id="estr-historical-heading"
            className="mt-1 text-xl font-bold tracking-tight text-[#F3EBDD] sm:text-2xl"
          >
            €STR official rate history
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[#91889A]">
            ECB daily observations in percentage points. Negative, zero, and
            positive rates remain unaltered, and non-publication dates are not
            synthesized.
          </p>
        </div>

        <HistoricalRangeSelector
          productId="estr"
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
            displayName="€STR"
            rangeLabel={RANGE_LABELS_V1[selectedRange]}
            valueKind={view.valueKind}
            unit={view.unit}
            points={view.points}
            observedFrom={view.resolved.observedFrom}
            observedTo={view.resolved.observedTo}
          />
          {selectedRange === "max" ? (
            <p className="mt-3 text-[11px] leading-5 text-[#91889A]">
              MAX begins at the first official observation supplied for this
              ECB series; no earlier history is implied.
            </p>
          ) : null}
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
              No observation, date, or alternate range has been substituted.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function deriveEstrHistoricalRangeViewV1(
  range: HistoricalRangeV1,
  maximum: HistoricalChartSeriesV1 | null,
  fiveDay: HistoricalChartSeriesV1 | null,
): HistoricalChartSeriesV1 | null {
  if (range === "5d") {
    return fiveDay?.productId === "estr" ? fiveDay : null;
  }

  if (maximum === null || maximum.productId !== "estr") {
    return null;
  }

  if (range === "max") {
    return maximum;
  }

  const anchor = maximum.requested.to;
  const sourceStart = maximum.availability === "available"
    ? maximum.points[0]?.timestamp ?? 0
    : 0;
  const requested = resolveHistoricalRangeRequestV1(
    range,
    anchor,
    sourceStart,
  );

  if (getHistoricalRangeSupportV1("estr", range) === "unsupported") {
    return Object.freeze({
      version: maximum.version,
      availability: "unavailable",
      productId: "estr",
      requested,
      reason: "range-unsupported",
    });
  }

  if (maximum.availability === "unavailable") {
    return Object.freeze({
      ...maximum,
      requested,
    });
  }

  const projection = projectHistoricalRangeV1(
    range,
    anchor,
    maximum.points,
  );

  if (projection.points.length < 2) {
    return Object.freeze({
      version: maximum.version,
      availability: "unavailable",
      productId: "estr",
      requested: projection.requested,
      reason: "insufficient-observations",
      lastKnownProvenance: maximum.provenance,
    });
  }

  const observedFrom = projection.points[0]!.timestamp;
  const observedTo = projection.points.at(-1)!.timestamp;

  return Object.freeze({
    ...maximum,
    requested: projection.requested,
    resolved: Object.freeze({
      interval: "1d",
      observedFrom,
      observedTo,
      completeness: projection.completeness,
    }),
    points: projection.points,
    provenance: Object.freeze({
      ...maximum.provenance,
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
          label="Semantics / unit"
          value={`${formatLabel(series.provenance.status)} / official rate / ${series.unit}`}
        />
        <ProvenanceDatum
          label="Observed coverage"
          value={`${formatReferenceDate(series.resolved.observedFrom)} — ${formatReferenceDate(series.resolved.observedTo)}`}
        />
        <ProvenanceDatum
          label="Requested / completeness"
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
      return "This range is unsupported for €STR official-rate history";
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
