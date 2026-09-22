import Link from "next/link";

import type { EstrVipDeepProjectionV1 } from
  "@/lib/markets/projections/types";
import type { VipEstrMarketRoomV1 } from
  "@/lib/markets/services/vipMarketRoomDelivery";
import VipEstrHistoricalPanel from "./VipEstrHistoricalPanel";
import VipMarketRoomNavigation from "./VipMarketRoomNavigation";

interface VipEstrMarketRoomProps {
  readonly room: VipEstrMarketRoomV1;
}

const EYEBROW =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]";

export default function VipEstrMarketRoom({ room }: VipEstrMarketRoomProps) {
  const deep = room.deep?.availability === "available" ? room.deep : null;

  return (
    <div className="relative isolate overflow-hidden pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[52rem] bg-[radial-gradient(circle_at_72%_10%,rgba(167,123,216,0.14),transparent_31%),linear-gradient(180deg,#15131A_0%,#08070A_52%,#050506_88%)]"
      />

      <RateRoomCommandBar room={room} />

      <div className="mx-auto max-w-[96rem] px-4 sm:px-6 lg:px-8">
        <VipMarketRoomNavigation selectedMarket="estr" />

        <section className="overflow-hidden border-y border-[#6F4C91]/40 bg-[#0D0D11]">
          <RateIdentityHeader deep={deep} />

          <div className="grid min-w-0 xl:grid-cols-[minmax(0,2.35fr)_minmax(19rem,0.65fr)]">
            <div className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
              <VipEstrHistoricalPanel
                maximum={room.history.maximum}
                fiveDay={room.history.fiveDay}
              />
            </div>
            <RateExecutiveRail
              deep={deep}
              unavailableReason={deepUnavailableReason(room)}
            />
          </div>
        </section>

        {deep === null ? (
          <RateIntelligenceUnavailableBand
            reason={deepUnavailableReason(room)}
          />
        ) : (
          <RateIntelligence deep={deep} />
        )}

        <ReferenceDateReconciliation room={room} deep={deep} />
        <DeepProvenance deep={deep} />
        <RoomDisclaimer />
      </div>
    </div>
  );
}

function RateRoomCommandBar({ room }: { room: VipEstrMarketRoomV1 }) {
  const historyState = room.history.maximum?.availability === "available" ||
      room.history.fiveDay?.availability === "available"
    ? "Available"
    : "Unavailable";
  const deepState = room.deep?.availability === "available"
    ? "Available"
    : "Unavailable";

  return (
    <section className="border-b border-[#6F4C91]/30 bg-[#0D0D11]/80">
      <div className="mx-auto grid max-w-[96rem] gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="h-9 w-0.5 shrink-0 bg-[#A77BD8]" />
          <div className="min-w-0">
            <div className={EYEBROW}>Chronoverse VIP / Official rates</div>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-[#F3EBDD]">
              €STR Market Room
            </h1>
          </div>
          <span className="hidden h-8 w-px bg-[#6F4C91]/30 sm:block" />
          <div className="hidden text-xs text-[#CFC5B8] sm:block">
            Official rate history with canonical rate intelligence.
          </div>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-[#6F4C91]/30 border-l border-[#6F4C91]/30">
          <CommandDatum label="Universe" value="05 products" />
          <CommandDatum label="History" value={historyState} />
          <CommandDatum label="Deep" value={deepState} />
        </dl>
      </div>
    </section>
  );
}

function CommandDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-1.5 sm:px-4">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[11px] font-semibold text-[#CFC5B8]">
        {value}
      </dd>
    </div>
  );
}

function RateIdentityHeader({
  deep,
}: {
  readonly deep: EstrVipDeepProjectionV1 | null;
}) {
  return (
    <header className="grid gap-6 border-b border-[#6F4C91]/35 bg-[radial-gradient(circle_at_76%_5%,rgba(200,167,232,0.08),transparent_34%),linear-gradient(145deg,#15131A,#0D0D11_72%)] px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:px-9">
      <div className="min-w-0">
        <div className={EYEBROW}>Selected official rate</div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h2 className="text-3xl font-black tracking-[-0.045em] text-[#F3EBDD] sm:text-5xl">
            €STR
          </h2>
          <div className="font-mono text-4xl font-semibold tracking-[-0.045em] tabular-nums text-[#C8A7E8] sm:text-6xl">
            {deep === null
              ? "Unavailable"
              : formatRatePercent(deep.currentValue.value)}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#91889A]">
          {deep === null
            ? "Canonical current official rate unavailable; history is not used as a substitute."
            : `Official rate / percentage points / ${deep.referenceDate}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-7 gap-y-4 border-l border-[#6F4C91]/35 pl-5 sm:min-w-80">
        <HeroDatum
          label="Rate direction"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.direction)}
        />
        <HeroDatum
          label="Level regime"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.levelRegime)}
        />
        <HeroDatum
          label="Volatility regime"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.volatilityRegime)}
        />
        <HeroDatum
          label="Risk state"
          value={deep === null ? "Unavailable" : formatLabel(deep.details.riskLevel)}
        />
      </dl>
    </header>
  );
}

function HeroDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-semibold text-[#F3EBDD]">
        {value}
      </dd>
    </div>
  );
}

function RateExecutiveRail({
  deep,
  unavailableReason,
}: {
  readonly deep: EstrVipDeepProjectionV1 | null;
  readonly unavailableReason: string;
}) {
  if (deep === null) {
    return (
      <aside className="border-t border-[#6F4C91]/40 bg-[linear-gradient(160deg,#18151D,#100E14_72%)] px-5 py-7 sm:px-7 xl:border-l xl:border-t-0">
        <div className={EYEBROW}>Rate intelligence</div>
        <h2 className="mt-1 text-xl font-bold text-[#F3EBDD]">
          Analytical readout unavailable
        </h2>
        <p className="mt-4 text-sm leading-6 text-[#CFC5B8]">
          {unavailableReason}
        </p>
        <p className="mt-3 text-xs leading-5 text-[#91889A]">
          Official historical observations remain independent and do not
          generate a rate interpretation.
        </p>
      </aside>
    );
  }

  const { signal, risk, marketState } = deep.details;
  const rows = [
    ["Rate direction", formatLabel(marketState.direction)],
    ["Signal strength", formatLabel(signal.strength)],
    ["Signed signal score", formatSignedScore(signal.score)],
    ["Signal evidence coverage", formatCoverage(signal.coverage)],
    ["Risk state", formatLabel(risk.level)],
    ["Risk score", formatNormalizedScore(risk.score)],
    ["Risk evidence coverage", formatCoverage(risk.coverage)],
  ] as const;

  return (
    <aside className="border-t border-[#6F4C91]/40 bg-[linear-gradient(160deg,#18151D,#100E14_72%)] px-5 py-7 sm:px-7 xl:border-l xl:border-t-0">
      <div className={EYEBROW}>Rate intelligence</div>
      <h2 className="mt-1 text-xl font-bold tracking-tight text-[#F3EBDD]">
        Executive rate readout
      </h2>
      <dl className="mt-5 divide-y divide-[#6F4C91]/30 border-y border-[#6F4C91]/30">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 text-xs">
            <dt className="text-[#91889A]">{label}</dt>
            <dd className="text-right font-semibold text-[#F3EBDD]">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] leading-5 text-[#91889A]">
        Evidence coverage reports model input coverage. It is not relabeled as
        confidence.
      </p>
    </aside>
  );
}

function RateIntelligenceUnavailableBand({ reason }: { reason: string }) {
  return (
    <section className="mt-10 border-y border-[#6F4C91]/30 bg-[#0D0D11]/75 px-5 py-7 sm:px-7">
      <div className={EYEBROW}>Analytical state</div>
      <h2 className="mt-1 text-xl font-bold text-[#F3EBDD]">
        Rate intelligence unavailable
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#CFC5B8]">{reason}</p>
      <p className="mt-2 text-xs text-[#91889A]">
        No direction, regime, signal, or risk state has been inferred from the
        client chart.
      </p>
    </section>
  );
}

function RateIntelligence({ deep }: { deep: EstrVipDeepProjectionV1 }) {
  return (
    <div className="mt-10 space-y-12">
      <RateMechanics deep={deep} />
      <EvidenceArchitecture deep={deep} />
    </div>
  );
}

function RateMechanics({ deep }: { deep: EstrVipDeepProjectionV1 }) {
  const features = deep.details.rateFeatures;
  const momentum10 = features.momentum.find(
    ({ horizonObservations }) => horizonObservations === 10,
  )?.momentumBp ?? null;
  const ema50Distance = features.ema.find(
    ({ period }) => period === 50,
  )?.emaDistanceBp ?? null;
  const metrics = [
    {
      label: "Latest daily change",
      value: formatBasisPointsV1(features.dailyChangeBp),
    },
    {
      label: "10-observation momentum",
      value: formatBasisPointsV1(momentum10),
    },
    {
      label: "Daily volatility",
      value: formatBasisPointsV1(features.dailyBpVolatility, false),
    },
    {
      label: "MACD histogram",
      value: formatBasisPointsV1(features.macd.histogramBp),
    },
    {
      label: "EMA50 distance",
      value: formatBasisPointsV1(ema50Distance),
    },
    {
      label: "RSI 14",
      value: formatNumber(features.rsi, 1),
    },
  ];

  return (
    <section className="border-y border-[#6F4C91]/30 bg-[#0D0D11]/75">
      <div className="grid lg:grid-cols-[minmax(15rem,0.72fr)_minmax(0,2.28fr)]">
        <header className="px-5 py-6 sm:px-7 lg:border-r lg:border-[#6F4C91]/30">
          <div className={EYEBROW}>Official rate mechanics</div>
          <h2 className="mt-2 text-2xl font-bold text-[#F3EBDD]">
            Basis-point evidence
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#91889A]">
            Raw rate changes remain in bp; the current level remains in percent.
          </p>
        </header>

        <dl className="grid min-w-0 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-0 border-b border-[#6F4C91]/25 px-5 py-4 sm:border-l">
              <dt className="text-[11px] text-[#91889A]">{metric.label}</dt>
              <dd className="mt-1 break-words font-mono text-sm font-semibold tabular-nums text-[#F3EBDD]">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function EvidenceArchitecture({ deep }: { deep: EstrVipDeepProjectionV1 }) {
  const { signal, risk, marketState } = deep.details;
  const signalComponents = [
    ["EMA aggregate", signal.components.ema],
    ["RSI component", signal.components.rsi14],
    ["MACD component", signal.components.macdHistogramBp],
    ["Momentum component", signal.components.momentum10Bp],
  ] as const;
  const riskComponents = [
    ["Daily volatility severity", risk.components.dailyBpVolatility],
    ["RSI stretch severity", risk.components.rsiStretch],
    ["Momentum severity", risk.components.momentum10Bp],
    ["Long-rate distance severity", risk.components.ema200DistanceBp],
  ] as const;

  return (
    <section>
      <header className="grid gap-3 border-b border-[#6F4C91]/30 pb-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <div className={EYEBROW}>Signal and risk evidence</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#F3EBDD]">
            Rate-state evidence architecture
          </h2>
        </div>
        <p className="max-w-md text-xs leading-5 text-[#91889A]">
          Signed direction and instability measures remain normalized model
          scores, separate from raw basis-point features.
        </p>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <EvidenceCard
          eyebrow="Direction model"
          title={formatLabel(signal.direction)}
          summary={`Score ${formatSignedScore(signal.score)} / ${formatCoverage(signal.coverage)} evidence coverage`}
          values={signalComponents.map(([label, value]) => [
            label,
            formatSignedScore(value),
          ])}
        />
        <EvidenceCard
          eyebrow="Instability model"
          title={`${formatLabel(risk.level)} risk`}
          summary={`Score ${formatNormalizedScore(risk.score)} / ${formatCoverage(risk.coverage)} evidence coverage`}
          values={riskComponents.map(([label, value]) => [
            label,
            formatNormalizedScore(value),
          ])}
        />
        <EvidenceCard
          eyebrow="Rate regimes"
          title={`${formatLabel(marketState.levelRegime)} level`}
          summary={`${formatLabel(marketState.volatilityRegime)} volatility regime`}
          values={[
            ["Rate direction", formatLabel(marketState.direction)],
            ["Signal strength", formatLabel(marketState.signalStrength)],
            ["Risk state", formatLabel(marketState.riskLevel)],
          ]}
        />
      </div>
    </section>
  );
}

function EvidenceCard({
  eyebrow,
  title,
  summary,
  values,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly values: readonly (readonly [string, string])[];
}) {
  return (
    <article className="min-w-0 border-y border-[#6F4C91]/35 bg-[#0D0D11]/75 px-5 py-6">
      <div className={EYEBROW}>{eyebrow}</div>
      <h3 className="mt-2 text-xl font-bold text-[#F3EBDD]">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-[#CFC5B8]">{summary}</p>
      <dl className="mt-5 divide-y divide-[#6F4C91]/25 border-t border-[#6F4C91]/25">
        {values.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5 text-[11px]">
            <dt className="text-[#91889A]">{label}</dt>
            <dd className="font-mono tabular-nums text-[#F3EBDD]">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function ReferenceDateReconciliation({
  room,
  deep,
}: {
  readonly room: VipEstrMarketRoomV1;
  readonly deep: EstrVipDeepProjectionV1 | null;
}) {
  const historical = room.history.maximum?.availability === "available"
    ? room.history.maximum
    : room.history.fiveDay?.availability === "available"
      ? room.history.fiveDay
      : null;
  const historicalDate = historical === null
    ? null
    : formatReferenceDate(historical.resolved.observedTo);
  const reconciled = deep !== null && historicalDate === deep.referenceDate;

  return (
    <section className="mt-12 border-t border-[#6F4C91]/30 pt-5">
      <div className={EYEBROW}>Reference-date reconciliation</div>
      <h2 className="mt-1 text-base font-bold text-[#F3EBDD]">
        Current official rate and observed history
      </h2>
      <div className="mt-4 grid gap-4 text-xs leading-5 text-[#CFC5B8] sm:grid-cols-3">
        <ReferenceDatum
          label="Deep reference"
          value={deep?.referenceDate ?? "Unavailable"}
        />
        <ReferenceDatum
          label="Historical observed to"
          value={historicalDate ?? "Unavailable"}
        />
        <ReferenceDatum
          label="Assessment"
          value={deep === null || historicalDate === null
            ? "Independent source unavailable"
            : reconciled
              ? "Reference dates aligned"
              : "Bounded official-date discrepancy"}
        />
      </div>
      {deep !== null && historicalDate !== null && !reconciled ? (
        <p className="mt-3 max-w-4xl text-[11px] leading-5 text-[#91889A]">
          History was anchored to the Deep source timestamp, but its latest
          included official observation is {historicalDate}, while Deep is
          referenced to {deep.referenceDate}. No synthetic observation was
          inserted to force alignment.
        </p>
      ) : null}
    </section>
  );
}

function ReferenceDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-[#6F4C91]/35 pl-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.09em] text-[#91889A]">
        {label}
      </div>
      <div className="mt-1 font-semibold text-[#F3EBDD]">{value}</div>
    </div>
  );
}

function DeepProvenance({
  deep,
}: {
  readonly deep: EstrVipDeepProjectionV1 | null;
}) {
  if (deep === null) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-[#6F4C91]/30 pt-5">
      <div className={EYEBROW}>Rate intelligence provenance</div>
      <dl className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-6">
        <ProvenanceDatum label="Provider" value={deep.provenance.provider} />
        <ProvenanceDatum label="Source" value={deep.provenance.source} />
        <ProvenanceDatum label="Series" value={deep.provenance.seriesId} />
        <ProvenanceDatum label="Unit" value={deep.provenance.unit} />
        <ProvenanceDatum label="Reference" value={deep.referenceDate} />
        <ProvenanceDatum label="Freshness" value={formatLabel(deep.provenance.freshness)} />
      </dl>
    </section>
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

function RoomDisclaimer() {
  return (
    <section className="mt-5 border-y border-[#6F4C91]/25 py-5 text-xs leading-6 text-[#91889A] sm:flex sm:items-center sm:justify-between sm:gap-8">
      <p className="max-w-4xl">
        ECB observations are normalized by Chronoverse Capital for analytical
        presentation. Provider identification does not imply endorsement.
        Chronoverse output is informational and is not personalized financial
        advice or a guarantee.
      </p>
      <Link
        href="/disclaimer"
        className="mt-2 inline-flex min-h-11 shrink-0 items-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] sm:mt-0"
      >
        Full disclaimer <span aria-hidden="true" className="ml-2">&#8599;</span>
      </Link>
    </section>
  );
}

function deepUnavailableReason(room: VipEstrMarketRoomV1): string {
  return room.deep?.availability === "unavailable"
    ? room.deep.reason
    : "The canonical €STR Deep projection read did not complete.";
}

export function formatBasisPointsV1(
  value: number | null,
  signed = true,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }

  const prefix = signed && value > 0 ? "+" : "";
  const precision = Math.abs(value) < 0.1 ? 3 : Math.abs(value) < 10 ? 2 : 1;

  return `${prefix}${value.toFixed(precision)} bp`;
}

function formatRatePercent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(3)}%` : "Unavailable";
}

function formatCoverage(value: number): string {
  return Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "Unavailable";
}

function formatSignedScore(value: number): string {
  return Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toFixed(3)}`
    : "Unavailable";
}

function formatNormalizedScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "Unavailable";
}

function formatNumber(value: number | null, precision: number): string {
  return value === null || !Number.isFinite(value)
    ? "Unavailable"
    : value.toFixed(precision);
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
