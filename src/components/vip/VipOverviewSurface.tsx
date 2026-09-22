import Link from "next/link";

import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import type {
  EngineEvidenceReferenceV1,
  EngineInvalidationTriggerV1,
  EngineScenarioConditionReferenceV1,
} from "@/lib/markets/engine/contracts";
import type { MarketProductVipDeepProjectionV1 } from
  "@/lib/markets/projections/types";
import type {
  FiveProductVipDeepProjectionMapV1,
} from "@/lib/markets/services/canonicalProductResults";
import type { CanonicalProductIdV1 } from
  "@/lib/markets/services/canonicalProductResultOwnership";

interface VipOverviewSurfaceProps {
  readonly projections: FiveProductVipDeepProjectionMapV1;
  readonly selectedMarket: CanonicalProductIdV1;
}

type AvailableDeepProjection = Extract<
  MarketProductVipDeepProjectionV1,
  { readonly availability: "available" }
>;
type AvailableFxProjection = Extract<
  AvailableDeepProjection,
  { readonly productKind: "fx" }
>;
type AvailableRateProjection = Extract<
  AvailableDeepProjection,
  { readonly productKind: "rate" }
>;
type FxScenario = Extract<
  AvailableFxProjection["details"]["engine"]["scenario"],
  { readonly availability: "available" | "partial" }
>["data"];
type FxScenarioCase =
  | FxScenario["base"]
  | FxScenario["bullish"]
  | FxScenario["bearish"];

interface DecisionSection {
  readonly label: string;
  readonly values: readonly string[];
  readonly emphasis?: boolean;
}

interface GeometryMetric {
  readonly label: string;
  readonly value: number;
  readonly axis: "unit" | "signed";
}

const EYEBROW =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C8A7E8]";

export default function VipOverviewSurface({
  projections,
  selectedMarket,
}: VipOverviewSurfaceProps) {
  const selected = projections[selectedMarket];
  const selectedDefinition = LAUNCH_MARKETS_V1.find(
    (market) => market.productId === selectedMarket,
  ) ?? LAUNCH_MARKETS_V1[0];
  const freshness = selected?.availability === "available"
    ? formatLabel(selected.provenance.freshness)
    : "Unavailable";

  return (
    <div className="relative isolate overflow-hidden pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem] bg-[radial-gradient(circle_at_82%_10%,rgba(167,123,216,0.12),transparent_32%),linear-gradient(180deg,#15131A_0%,#08070A_46%,#050506_82%)]"
      />

      <section className="border-b border-[#6F4C91]/30 bg-[#0D0D11]/80">
        <div className="mx-auto grid max-w-[88rem] gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden="true" className="h-9 w-0.5 shrink-0 bg-[#A77BD8]" />
            <div className="min-w-0">
              <div className={EYEBROW}>Chronoverse VIP</div>
              <h1 className="mt-0.5 text-lg font-bold tracking-tight text-[#F3EBDD]">
                Deep Intelligence
              </h1>
            </div>
            <span className="hidden h-8 w-px bg-[#6F4C91]/30 sm:block" />
            <div className="hidden max-w-md text-xs leading-5 text-[#CFC5B8] sm:block">
              Decision intelligence across the focused European market universe.
            </div>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-[#6F4C91]/30 border-l border-[#6F4C91]/30 text-left lg:min-w-[25rem]">
            <CommandDatum label="Universe" value="05 markets" />
            <CommandDatum label="Projection" value="VIP Deep" />
            <CommandDatum label="Freshness" value={freshness} />
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-8">
        <MarketSelector
          projections={projections}
          selectedMarket={selectedMarket}
        />
        <SelectedMarketRoomAction market={selectedDefinition} />

        {selected?.availability === "available" ? (
          <AvailableMarketSurface projection={selected} />
        ) : (
          <UnavailableMarketSurface
            displayName={selected?.displayName ?? selectedMarket.toUpperCase()}
            reason={selected?.reason ?? "Canonical market result is unavailable."}
          />
        )}

        <ProvenanceAndDisclaimer projection={selected} />
      </div>
    </div>
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

function MarketSelector({ projections, selectedMarket }: {
  projections: FiveProductVipDeepProjectionMapV1;
  selectedMarket: CanonicalProductIdV1;
}) {
  return (
    <nav aria-label="VIP market selector" className="py-4">
      <div className="grid border-y border-[#6F4C91]/35 bg-[#09090C]/90 sm:grid-cols-2 lg:grid-cols-5">
        {LAUNCH_MARKETS_V1.map((market, index) => {
          const projection = projections[market.productId];
          const isSelected = market.productId === selectedMarket;

          return (
            <Link
              key={market.productId}
              href={market.productId === "eurusd"
                ? "/vip"
                : `/vip?market=${market.productId}`}
              prefetch={false}
              aria-current={isSelected ? "page" : undefined}
              className={`group relative grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#6F4C91]/20 px-3 py-2 last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8A7E8] sm:min-h-16 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:min-h-[4.5rem] lg:border-b-0 lg:border-r lg:last:border-r-0 ${
                isSelected ? "bg-[#15131A]" : "hover:bg-[#0D0D11]"
              }`}
            >
              <span className="font-mono text-[10px] tabular-nums text-[#91889A]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 truncate text-sm font-bold text-[#F3EBDD]">
                {market.label}
              </span>
              <span className="min-w-0 text-right">
                <span className="block font-mono text-xs font-semibold tabular-nums text-[#F3EBDD]">
                  {projection?.availability === "available"
                    ? formatCurrentValue(projection)
                    : "Unavailable"}
                </span>
                <span className="mt-0.5 block max-w-24 truncate text-[10px] text-[#91889A]">
                  {projection?.availability === "available"
                    ? primaryState(projection)
                    : "No verified result"}
                </span>
              </span>
              {isSelected ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2 left-0 w-0.5 bg-[#C8A7E8] lg:inset-x-3 lg:inset-y-auto lg:bottom-0 lg:h-0.5 lg:w-auto"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SelectedMarketRoomAction({
  market,
}: {
  readonly market: (typeof LAUNCH_MARKETS_V1)[number];
}) {
  return (
    <section className="mb-4 grid gap-4 border border-[#6F4C91]/35 bg-[#0D0D11]/90 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="min-w-0">
        <div className={EYEBROW}>Dedicated Market Room</div>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-[#F3EBDD]">
          Continue with {market.label}
        </h2>
        <p className="mt-1 text-xs leading-5 text-[#CFC5B8]">
          {market.roomDescription}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Link
          href="/vip/markets"
          prefetch={false}
          className="inline-flex min-h-11 items-center px-3 text-xs font-semibold text-[#CFC5B8] underline decoration-[#6F4C91] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
        >
          View all five rooms
        </Link>
        <Link
          href={`/vip/markets/${market.productId}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center border border-[#C8A7E8] bg-[#A77BD8]/15 px-4 text-xs font-bold text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090C]"
        >
          Open {market.label} Market Room
        </Link>
      </div>
    </section>
  );
}

function AvailableMarketSurface({ projection }: {
  projection: AvailableDeepProjection;
}) {
  return (
    <>
      <section className="grid overflow-hidden border-y border-[#6F4C91]/40 bg-[#0D0D11] xl:grid-cols-[minmax(0,2.15fr)_minmax(20rem,0.85fr)]">
        <div className="min-w-0 bg-[radial-gradient(circle_at_78%_8%,rgba(200,167,232,0.09),transparent_34%),linear-gradient(145deg,#0D0D11,#09090C_72%)] px-5 py-6 sm:px-7 sm:py-7 lg:px-9">
          <MarketHero projection={projection} />
          <AnalyticalGeometry projection={projection} />
        </div>
        <DecisionRail projection={projection} />
      </section>

      {projection.productKind === "fx" ? (
        <FxDeepLayers projection={projection} />
      ) : (
        <RateDeepLayers projection={projection} />
      )}

      <ProvenanceStrip projection={projection} />
    </>
  );
}

function MarketHero({ projection }: { projection: AvailableDeepProjection }) {
  const direction = projection.productKind === "fx"
    ? projection.details.signal.direction
    : projection.details.direction;
  const strength = projection.productKind === "fx"
    ? projection.details.signal.strength
    : projection.details.signalStrength;

  return (
    <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className={EYEBROW}>Selected market</div>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h2 className="text-3xl font-black tracking-[-0.045em] text-[#F3EBDD] sm:text-4xl">
            {projection.displayName}
          </h2>
          <div className="font-mono text-4xl font-semibold tracking-[-0.045em] tabular-nums text-[#C8A7E8] sm:text-6xl">
            {formatCurrentValue(projection)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#CFC5B8]">
          <span className="font-semibold text-[#F3EBDD]">{formatLabel(direction)}</span>
          <span aria-hidden="true" className="text-[#6F4C91]">/</span>
          <span>{formatLabel(strength)}</span>
          <span aria-hidden="true" className="text-[#6F4C91]">/</span>
          <span>{formatLabel(projection.details.riskLevel)} risk</span>
        </div>
        <div className="mt-5 max-w-2xl text-sm leading-6 text-[#CFC5B8]">
          {projection.productKind === "fx"
            ? projection.details.signal.reasons[0] ??
              `Signal state: ${formatLabel(projection.details.direction)}.`
            : `Rate direction ${formatLabel(projection.details.direction)}; level regime ${formatLabel(projection.details.levelRegime)}.`}
        </div>
      </div>

      <dl className="grid min-w-48 grid-cols-2 gap-x-6 gap-y-4 border-l border-[#6F4C91]/35 pl-5">
        <HeroDatum label="State" value={primaryState(projection)} />
        <HeroDatum label="Risk" value={formatLabel(projection.details.riskLevel)} />
        <HeroDatum label="Reference" value={projection.referenceDate} />
        <HeroDatum label="Cadence" value={formatLabel(projection.status)} />
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

function AnalyticalGeometry({ projection }: {
  projection: AvailableDeepProjection;
}) {
  const metrics: readonly GeometryMetric[] = projection.productKind === "fx"
    ? [
      { label: "Signal confidence", value: projection.details.signal.confidence, axis: "unit" },
      { label: "State confidence", value: projection.details.confidence, axis: "unit" },
      { label: "Analytical risk", value: projection.details.risk.score, axis: "unit" },
    ]
    : [
      { label: "Rate direction score", value: projection.details.signal.score, axis: "signed" },
      { label: "Evidence coverage", value: projection.details.signal.coverage, axis: "unit" },
      { label: "Rate instability", value: projection.details.risk.score, axis: "unit" },
    ];

  return (
    <section className="mt-8 border-t border-[#6F4C91]/30 pt-5">
      <div className="grid gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_4.5rem] sm:items-end">
        <div>
          <div className={EYEBROW}>State geometry</div>
          <h3 className="mt-1 text-base font-bold text-[#F3EBDD]">
            Calibrated readout
          </h3>
        </div>
        <div className="hidden grid-cols-5 font-mono text-[9px] tabular-nums text-[#91889A] sm:grid">
          <span>0</span>
          <span className="text-center">25</span>
          <span className="text-center">50</span>
          <span className="text-center">75</span>
          <span className="text-right">100</span>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {metrics.map((metric) => (
          <GeometryRail key={metric.label} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function GeometryRail({ metric }: { metric: GeometryMetric }) {
  const position = metric.axis === "signed"
    ? clamp01((metric.value + 1) / 2)
    : clamp01(metric.value);
  const left = metric.axis === "signed"
    ? Math.min(0.5, position)
    : 0;
  const width = metric.axis === "signed"
    ? Math.abs(position - 0.5)
    : position;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_4.5rem] sm:items-center">
      <div className="text-xs font-medium text-[#CFC5B8]">{metric.label}</div>
      <div
        role="meter"
        aria-label={metric.label}
        aria-valuemin={metric.axis === "signed" ? -1 : 0}
        aria-valuemax={1}
        aria-valuenow={metric.value}
        className="relative col-span-2 row-start-2 h-6 overflow-hidden bg-[#050506] sm:col-span-1 sm:row-start-auto"
      >
        <div aria-hidden="true" className="absolute inset-y-0 left-1/4 w-px bg-[#6F4C91]/20" />
        <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-[#6F4C91]/35" />
        <div aria-hidden="true" className="absolute inset-y-0 left-3/4 w-px bg-[#6F4C91]/20" />
        <div
          aria-hidden="true"
          className="absolute inset-y-[7px] bg-[linear-gradient(90deg,#6F4C91,#C8A7E8)]"
          style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-1 w-px bg-[#F3EBDD] shadow-[0_0_8px_rgba(200,167,232,0.45)]"
          style={{ left: `calc(${position * 100}% - 0.5px)` }}
        />
      </div>
      <div className="col-start-2 row-start-1 text-right font-mono text-sm font-semibold tabular-nums text-[#F3EBDD] sm:col-start-auto sm:row-start-auto">
        {metric.axis === "signed"
          ? formatSigned(metric.value)
          : formatPercent(metric.value)}
      </div>
    </div>
  );
}

function DecisionRail({ projection }: { projection: AvailableDeepProjection }) {
  const sections = projection.productKind === "fx"
    ? fxDecisionSections(projection)
    : rateDecisionSections(projection);

  return (
    <aside className="border-t border-[#6F4C91]/40 bg-[linear-gradient(160deg,#18151D,#100E14_72%)] px-5 py-6 sm:px-7 xl:border-l xl:border-t-0">
      <div className={EYEBROW}>Decision intelligence</div>
      <h2 className="mt-1 text-xl font-bold tracking-tight text-[#F3EBDD]">
        Executive readout
      </h2>
      <div className="mt-5">
        {sections.map((section, index) => (
          <section
            key={section.label}
            className={`border-t border-[#6F4C91]/30 py-4 ${
              index === 0 ? "bg-[#A77BD8]/[0.06] px-3" : ""
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[9px] tabular-nums text-[#91889A]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#C8A7E8]">
                {section.label}
              </h3>
            </div>
            <div className={`mt-2 space-y-1.5 text-[#CFC5B8] ${
              section.emphasis ? "text-sm" : "text-xs"
            }`}>
              {section.values.map((value) => (
                <div key={value} className="leading-5 first:font-semibold first:text-[#F3EBDD]">
                  {value}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function FxDeepLayers({ projection }: { projection: AvailableFxProjection }) {
  const { details } = projection;
  const { engine } = details;
  const scenario = "data" in engine.scenario ? engine.scenario.data : null;
  const invalidation = "data" in engine.invalidation
    ? engine.invalidation.data
    : null;
  const macro = "data" in engine.macro ? engine.macro.data : null;
  const crossAsset = "data" in engine.crossAsset ? engine.crossAsset.data : null;

  return (
    <div className="mt-10">
      <FxTechnicalBand projection={projection} />

      {scenario ? (
        <ScenarioLayer
          scenario={scenario}
          partial={engine.scenario.availability === "partial"}
        />
      ) : null}

      {invalidation ? (
        <InvalidationLayer
          invalidation={invalidation}
          partial={engine.invalidation.availability === "partial"}
        />
      ) : null}

      <FxContextLayers projection={projection} macro={macro} crossAsset={crossAsset} />
    </div>
  );
}

function FxTechnicalBand({ projection }: { projection: AvailableFxProjection }) {
  const { details } = projection;
  const metrics = [
    details.technical.rsi === null
      ? null
      : { label: "RSI", value: details.technical.rsi.toFixed(1) },
    details.technical.momentum === null
      ? null
      : { label: "Momentum", value: details.technical.momentum.toFixed(4) },
    details.technical.annualizedVolatility === null
      ? null
      : {
        label: "Annualized volatility",
        value: formatPercent(details.technical.annualizedVolatility),
      },
    {
      label: "Calibration",
      value: details.calibration.productionCalibrated ? "Production" : "Generic",
    },
  ].filter((metric): metric is { label: string; value: string } => metric !== null);

  return (
    <section className="border-y border-[#6F4C91]/30 bg-[#0D0D11]/75">
      <div className="grid lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2.2fr)]">
        <header className="px-5 py-6 sm:px-7 lg:border-r lg:border-[#6F4C91]/30">
          <div className={EYEBROW}>Technical structure</div>
          <div className="mt-3 text-2xl font-bold text-[#F3EBDD]">
            {formatLabel(details.signal.direction)}
          </div>
          <div className="mt-1 text-sm text-[#CFC5B8]">
            {formatLabel(details.signal.strength)} signal / {formatLabel(details.risk.level)} risk
          </div>
        </header>

        <div className="px-5 py-5 sm:px-7">
          <dl className="grid divide-y divide-[#6F4C91]/25 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0 px-0 py-3 first:pl-0 sm:px-4">
                <dt className="text-[11px] text-[#91889A]">{metric.label}</dt>
                <dd className="mt-1 break-words font-mono text-sm font-semibold tabular-nums text-[#F3EBDD]">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>

          {details.signal.reasons.length > 0 ? (
            <div className="mt-4 grid gap-3 border-t border-[#6F4C91]/25 pt-4 md:grid-cols-[9rem_minmax(0,1fr)]">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#91889A]">
                Signal evidence
              </div>
              <ul className="grid gap-2 text-xs leading-5 text-[#CFC5B8] md:grid-cols-2">
                {details.signal.reasons.slice(0, 4).map((reason) => (
                  <li key={reason} className="border-l border-[#6F4C91]/45 pl-3">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ScenarioLayer({ scenario, partial }: {
  scenario: FxScenario;
  partial: boolean;
}) {
  return (
    <section className="mt-12">
      <header className="grid gap-3 border-b border-[#6F4C91]/30 pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <div className={EYEBROW}>Scenario architecture</div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#F3EBDD]">
            Current path and conditional alternatives
          </h2>
        </div>
        <div className="max-w-md text-xs leading-5 text-[#91889A]">
          Evidence configurations, not forecasts or price targets.
          {partial ? " Partial evidence." : ""}
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
        <ScenarioCasePanel scenarioCase={scenario.base} variant="base" />
        <div className="divide-y divide-[#6F4C91]/30 border-y border-[#6F4C91]/30">
          <ScenarioCasePanel scenarioCase={scenario.bullish} variant="conditional" />
          <ScenarioCasePanel scenarioCase={scenario.bearish} variant="conditional" />
        </div>
      </div>
    </section>
  );
}

function ScenarioCasePanel({ scenarioCase, variant }: {
  scenarioCase: FxScenarioCase;
  variant: "base" | "conditional";
}) {
  const conditions = scenarioCase.strengtheningConditions.slice(0, 3);

  return (
    <article className={variant === "base"
      ? "border-l-2 border-[#A77BD8] bg-[linear-gradient(135deg,#15131A,#0D0D11)] px-5 py-6 sm:px-7"
      : "px-4 py-5"
    }>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-[#F3EBDD]">
            {scenarioCase.id === "base"
              ? "Base / Current configuration"
              : `${formatLabel(scenarioCase.id)} case`}
          </div>
          <div className="mt-1 text-xs text-[#91889A]">
            Direction {formatLabel(scenarioCase.targetStance)}
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#C8A7E8]">
          {formatLabel(scenarioCase.relationToDecision)}
        </span>
      </div>

      <dl className={`mt-5 grid grid-cols-2 gap-4 ${variant === "base" ? "max-w-md" : ""}`}>
        <MiniDatum label="Scenario support" value={String(scenarioCase.supportingEvidence.length)} />
        <MiniDatum label="Scenario opposition" value={String(scenarioCase.opposingEvidence.length)} />
      </dl>

      {conditions.length > 0 ? (
        <div className="mt-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.09em] text-[#91889A]">
            Current condition status
          </div>
          <ul className="mt-2 space-y-2 text-xs leading-5 text-[#CFC5B8]">
            {conditions.map((condition, index) => (
              <li
                key={`${scenarioCase.id}-${condition.code}-${scenarioReferenceLabel(condition.reference)}-${index}`}
                className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
              >
                <span>
                  {scenarioReferenceLabel(condition.reference)} / {formatLabel(condition.code)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#C8A7E8]">
                  {formatLabel(condition.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function InvalidationLayer({ invalidation, partial }: {
  invalidation: Extract<
    AvailableFxProjection["details"]["engine"]["invalidation"],
    { readonly availability: "available" | "partial" }
  >["data"];
  partial: boolean;
}) {
  const groups = [
    {
      label: "Invalidates",
      values: invalidation.invalidatesWhen,
    },
    {
      label: "Weakens",
      values: invalidation.weakensWhen,
    },
    {
      label: "Assessment unavailable",
      values: invalidation.assessmentFailsWhen,
    },
  ].filter((group) => group.values.length > 0);

  return (
    <section className="mt-12 border-y border-[#6F4C91]/35 bg-[linear-gradient(90deg,rgba(111,76,145,0.13),transparent_42%)] py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,2.3fr)]">
        <header className="border-l-2 border-[#A77BD8] pl-4">
          <div className={EYEBROW}>Interpretation boundary</div>
          <h2 className="mt-1 text-xl font-bold text-[#F3EBDD]">
            What changes the thesis
          </h2>
          <div className="mt-2 text-xs leading-5 text-[#91889A]">
            Conditional triggers for the {formatLabel(invalidation.thesis.stance)} decision stance.
            {partial ? " Partial evidence." : ""}
          </div>
        </header>

        <div className="grid gap-5 md:grid-cols-3">
          {groups.map((group) => (
            <div key={group.label} className="min-w-0 md:border-l md:border-[#6F4C91]/25 md:pl-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#C8A7E8]">
                {group.label}
              </h3>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-[#CFC5B8]">
                {group.values.slice(0, 4).map((trigger, index) => (
                  <li key={`${trigger.code}-${index}`}>
                    <span className="text-[#F3EBDD]">{formatLabel(trigger.code)}</span>
                    <span className="block text-[11px] text-[#91889A]">
                      {invalidationPredicateLabel(trigger)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FxContextLayers({ projection, macro, crossAsset }: {
  projection: AvailableFxProjection;
  macro: Extract<
    AvailableFxProjection["details"]["engine"]["macro"],
    { readonly data: unknown }
  >["data"] | null;
  crossAsset: Extract<
    AvailableFxProjection["details"]["engine"]["crossAsset"],
    { readonly data: unknown }
  >["data"] | null;
}) {
  const regime = projection.details.engine.regime;
  const hasRegime = regime.availability === "available" ||
    regime.availability === "partial";

  if (!hasRegime && macro === null && crossAsset === null) {
    return null;
  }

  return (
    <section className="mt-12 border-t border-[#6F4C91]/30 pt-6">
      <div className={EYEBROW}>Context layers</div>
      <div className="mt-5 grid gap-8 lg:grid-cols-3 lg:divide-x lg:divide-[#6F4C91]/25">
        {hasRegime ? <RegimeContext projection={projection} /> : null}
        {macro ? (
          <ContextSection
            title="Macro drivers"
            score={macro.score}
            coverage={macro.coverage}
            partial={projection.details.engine.macro.availability === "partial"}
            rows={macro.drivers.map((driver) => ({
              label: driver.id,
              value: driver.available
                ? formatSigned(driver.weightedContribution)
                : formatLabel(driver.reason ?? "unavailable"),
            }))}
          />
        ) : null}
        {crossAsset ? (
          <ContextSection
            title="Cross-market confirmation"
            score={crossAsset.score}
            coverage={crossAsset.coverage}
            partial={projection.details.engine.crossAsset.availability === "partial"}
            rows={crossAsset.relationships.map((relationship) => ({
              label: relationship.id,
              value: relationship.availability === "available"
                ? formatSigned(relationship.weightedContribution)
                : formatLabel(relationship.availability),
            }))}
          />
        ) : null}
      </div>
    </section>
  );
}

function RegimeContext({ projection }: { projection: AvailableFxProjection }) {
  const regime = projection.details.engine.regime;
  const snapshot = regime.availability === "available"
    ? regime.memory.current
    : regime.availability === "partial"
      ? regime.current
      : null;

  if (snapshot === null) {
    return null;
  }

  return (
    <section className="min-w-0 lg:pr-7">
      <h2 className="text-lg font-bold text-[#F3EBDD]">
        {regime.availability === "available"
          ? "Historical regime context"
          : "Current regime context"}
      </h2>
      <dl className="mt-4 space-y-3">
        <ContextDatum label="State" value={formatLabel(snapshot.state)} />
        <ContextDatum label="Signal" value={formatLabel(snapshot.signalDirection)} />
        <ContextDatum label="Risk" value={formatLabel(snapshot.riskLevel)} />
        <ContextDatum label="Observed" value={formatTimestamp(snapshot.timestamp)} />
      </dl>
      {regime.availability === "partial" ? (
        <div className="mt-3 text-[11px] text-[#91889A]">Partial regime evidence.</div>
      ) : null}
    </section>
  );
}

function ContextSection({ title, score, coverage, partial, rows }: {
  title: string;
  score: number;
  coverage: number;
  partial: boolean;
  rows: readonly { readonly label: string; readonly value: string }[];
}) {
  return (
    <section className="min-w-0 lg:px-7 lg:last:pr-0">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-bold text-[#F3EBDD]">{title}</h2>
        <div className="font-mono text-[10px] tabular-nums text-[#91889A]">
          {formatSigned(score)} / {formatPercent(coverage)} coverage
        </div>
      </div>
      {partial ? (
        <div className="mt-2 text-[11px] text-[#91889A]">Partial evidence.</div>
      ) : null}
      <dl className="mt-4 divide-y divide-[#6F4C91]/20 border-y border-[#6F4C91]/20">
        {rows.map((row) => (
          <div key={row.label} className="grid min-w-0 gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
            <dt className="min-w-0 break-words text-xs text-[#CFC5B8]">
              {formatLabel(row.label)}
            </dt>
            <dd className="break-words font-mono text-[10px] text-[#F3EBDD]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RateDeepLayers({ projection }: { projection: AvailableRateProjection }) {
  const { details } = projection;
  const momentum10 = details.rateFeatures.momentum.find(
    (feature) => feature.horizonObservations === 10,
  );
  const rateMetrics = [
    {
      label: "Daily change",
      value: formatBasisPoints(details.rateFeatures.dailyChangeBp),
    },
    {
      label: "10-observation move",
      value: formatBasisPoints(momentum10?.momentumBp ?? null),
    },
    {
      label: "Daily bp volatility",
      value: formatBasisPoints(details.rateFeatures.dailyBpVolatility),
    },
  ];

  return (
    <div className="mt-10">
      <section className="border-y border-[#6F4C91]/30 bg-[linear-gradient(105deg,#15131A,#0D0D11_62%)]">
        <div className="grid lg:grid-cols-[minmax(14rem,0.75fr)_minmax(0,2.25fr)]">
          <header className="px-5 py-6 sm:px-7 lg:border-r lg:border-[#6F4C91]/30">
            <div className={EYEBROW}>Rate regime</div>
            <h2 className="mt-2 text-2xl font-bold text-[#F3EBDD]">
              €STR structure
            </h2>
            <div className="mt-4 space-y-2 text-sm text-[#CFC5B8]">
              <div><span className="text-[#91889A]">Direction / </span>{formatLabel(details.marketState.direction)}</div>
              <div><span className="text-[#91889A]">Level / </span>{formatLabel(details.marketState.levelRegime)}</div>
              <div><span className="text-[#91889A]">Volatility / </span>{formatLabel(details.marketState.volatilityRegime)}</div>
            </div>
          </header>

          <dl className="grid px-5 py-4 sm:grid-cols-3 sm:px-7">
            {rateMetrics.map((metric) => (
              <div key={metric.label} className="border-b border-[#6F4C91]/25 py-4 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0">
                <dt className="text-[11px] text-[#91889A]">{metric.label}</dt>
                <dd className="mt-2 font-mono text-lg font-semibold tabular-nums text-[#F3EBDD]">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mt-12 border-t border-[#6F4C91]/30 pt-6">
        <header className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <div className={EYEBROW}>Rate evidence</div>
            <h2 className="mt-1 text-2xl font-bold text-[#F3EBDD]">
              Signal and instability composition
            </h2>
          </div>
          <div className="text-xs leading-5 text-[#91889A]">
            Normalized component scores; basis-point measures are shown above.
          </div>
        </header>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:divide-x lg:divide-[#6F4C91]/30">
          <RateEvidenceSection
            title="Directional evidence"
            scoreLabel="Signal score"
            score={formatSigned(details.signal.score)}
            coverage={details.signal.coverage}
            values={details.signal.components}
            signed
          />
          <RateEvidenceSection
            title="Instability evidence"
            scoreLabel="Risk score"
            score={formatPercent(details.risk.score)}
            coverage={details.risk.coverage}
            values={details.risk.components}
          />
        </div>
      </section>
    </div>
  );
}

function RateEvidenceSection<TValues extends object>({
  title,
  scoreLabel,
  score,
  coverage,
  values,
  signed = false,
}: {
  title: string;
  scoreLabel: string;
  score: string;
  coverage: number;
  values: TValues;
  signed?: boolean;
}) {
  const entries = Object.entries(values) as readonly (readonly [string, number])[];

  return (
    <section className="min-w-0 lg:px-7 lg:first:pl-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-lg font-bold text-[#F3EBDD]">{title}</h3>
        <dl className="flex gap-5">
          <MiniDatum label={scoreLabel} value={score} />
          <MiniDatum label="Coverage" value={formatPercent(coverage)} />
        </dl>
      </div>
      <dl className="mt-5 divide-y divide-[#6F4C91]/20 border-y border-[#6F4C91]/20">
        {entries.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2.5">
            <dt className="min-w-0 break-words text-xs text-[#CFC5B8]">
              {rateComponentLabel(label)}
            </dt>
            <dd className="font-mono text-xs tabular-nums text-[#F3EBDD]">
              {signed ? formatSigned(value) : formatPercent(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProvenanceStrip({ projection }: { projection: AvailableDeepProjection }) {
  return (
    <section className="mt-12 border-t border-[#6F4C91]/30 pt-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <div className={EYEBROW}>Provenance</div>
          <h2 className="mt-1 text-base font-bold text-[#F3EBDD]">
            Source and projection audit
          </h2>
        </div>
        <div className="text-[11px] leading-5 text-[#91889A]">
          {projection.productKind === "fx"
            ? "Current normalized projection measures; not a historical price series."
            : "Current normalized rate measures; not an observation-history chart."}
        </div>
      </div>

      <dl className="mt-4 grid border-y border-[#6F4C91]/20 sm:grid-cols-2 lg:grid-cols-6 lg:divide-x lg:divide-[#6F4C91]/20">
        <ProvenanceDatum label="Provider" value={projection.provenance.provider} />
        <ProvenanceDatum label="Source" value={projection.provenance.source} />
        <ProvenanceDatum label="Series" value={projection.provenance.seriesId} />
        <ProvenanceDatum label="Reference date" value={projection.referenceDate} />
        <ProvenanceDatum label="Freshness" value={formatLabel(projection.provenance.freshness)} />
        <ProvenanceDatum label="Projection" value={`${projection.tier} / ${projection.version}`} />
      </dl>
      <div className="mt-3 max-w-4xl text-[11px] leading-5 text-[#91889A]">
        Underlying source observations are transformed independently by
        Chronoverse Capital. Provider identification does not imply endorsement,
        warranty, or authorship of Chronoverse analysis.
      </div>
    </section>
  );
}

function ProvenanceDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-0 py-3 sm:px-3 lg:px-4 lg:first:pl-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.09em] text-[#91889A]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-xs font-semibold text-[#CFC5B8]">
        {value}
      </dd>
    </div>
  );
}

function ProvenanceAndDisclaimer({ projection }: {
  projection: MarketProductVipDeepProjectionV1 | null;
}) {
  return (
    <section className={`border-b border-[#6F4C91]/25 py-5 text-xs leading-6 text-[#91889A] sm:flex sm:items-center sm:justify-between sm:gap-8 ${
      projection?.availability === "available" ? "mt-5" : "mt-8 border-t"
    }`}>
      <div className="max-w-3xl">
        Chronoverse output is informational and analytical, not personalized
        financial advice, a trade order, or a guarantee. Market data may be
        delayed, incomplete, revised, or unavailable.
      </div>
      <Link
        href="/disclaimer"
        className="mt-2 inline-flex min-h-11 shrink-0 items-center font-mono text-[10px] font-semibold uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] sm:mt-0"
      >
        Full disclaimer <span aria-hidden="true" className="ml-2">&#8599;</span>
      </Link>
    </section>
  );
}

function UnavailableMarketSurface({ displayName, reason }: {
  displayName: string;
  reason: string;
}) {
  return (
    <section className="border-y border-[#6F4C91]/35 bg-[#0D0D11] px-5 py-10 sm:px-8">
      <div className={EYEBROW}>Canonical result unavailable</div>
      <h2 className="mt-3 text-3xl font-black text-[#F3EBDD]">{displayName}</h2>
      <div className="mt-4 max-w-2xl text-sm leading-7 text-[#CFC5B8]">{reason}</div>
      <div className="mt-5 text-xs text-[#91889A]">
        No analytical values have been inferred or substituted.
      </div>
    </section>
  );
}

function fxDecisionSections(projection: AvailableFxProjection): DecisionSection[] {
  const { details } = projection;
  const { engine } = details;
  const sections: DecisionSection[] = [];
  const recommendation = "data" in engine.recommendation
    ? engine.recommendation.data
    : null;
  const decision = "data" in engine.decision ? engine.decision.data : null;
  const matters: string[] = [];

  if (recommendation) {
    matters.push(
      `Analytical posture / ${formatLabel(recommendation.posture)}${
        engine.recommendation.availability === "partial"
          ? " · partial evidence"
          : ""
      }`,
      `${formatLabel(recommendation.stance)} stance · ${formatLabel(recommendation.strength.band)} conviction`,
    );
    const reason = recommendation.restraintReasons[0] ??
      recommendation.supportingReasons[0] ??
      recommendation.opposingReasons[0];
    if (reason) {
      matters.push(`${formatLabel(reason.code)} / ${formatLabel(reason.source)}`);
    }
  } else if (decision) {
    matters.push(
      `Decision stance / ${formatLabel(decision.stance)}`,
      `Decision score ${formatSigned(decision.score)}`,
    );
  } else {
    matters.push(
      details.signal.reasons[0] ?? `Signal / ${formatLabel(details.signal.direction)}`,
    );
  }

  if ("data" in engine.contradiction) {
    matters.push(`Evidence tension ${formatPercent(engine.contradiction.data.score)}`);
  }

  sections.push({ label: "What matters now?", values: matters, emphasis: true });

  if ("data" in engine.invalidation) {
    sections.push({
      label: "What breaks the interpretation?",
      values: engine.invalidation.data.invalidatesWhen.slice(0, 2).map(
        (trigger) => `${formatLabel(trigger.code)} / ${invalidationPredicateLabel(trigger)}`,
      ),
    });
  }

  const confidence: string[] = [
    `State confidence ${formatPercent(details.confidence)}`,
  ];
  if ("data" in engine.confidence) {
    if ("data" in engine.confidence.data.conviction) {
      confidence.push(
        `Market conviction ${formatPercent(engine.confidence.data.conviction.data.score)}${
          engine.confidence.data.conviction.availability === "partial"
            ? " · partial evidence"
            : ""
        }`,
      );
    }
    if ("data" in engine.confidence.data.data) {
      confidence.push(
        `Data confidence ${formatPercent(engine.confidence.data.data.data.score)}${
          engine.confidence.data.data.availability === "partial"
            ? " · partial evidence"
            : ""
        }`,
      );
    }
  }
  sections.push({ label: "Confidence", values: confidence });

  const lifecycle = engine.decisionLifecycle;
  if ("data" in lifecycle && lifecycle.data.comparison === "compared") {
    sections.push({
      label: "What changed?",
      values: [
        `${formatLabel(lifecycle.data.transition.kind)} / ${formatLabel(lifecycle.data.convictionChange)}`,
        `Decision delta ${formatSigned(lifecycle.data.decisionScoreDelta)}`,
      ],
    });
  }

  return sections;
}

function rateDecisionSections(
  projection: AvailableRateProjection,
): DecisionSection[] {
  const { details } = projection;
  const sections: DecisionSection[] = [
    {
      label: "What matters now?",
      values: [
        `Rate direction / ${formatLabel(details.marketState.direction)}`,
        `Level regime / ${formatLabel(details.marketState.levelRegime)}`,
        `Signal strength / ${formatLabel(details.signal.strength)}`,
      ],
      emphasis: true,
    },
    {
      label: "Risk state",
      values: [
        `${formatLabel(details.marketState.volatilityRegime)} volatility regime`,
        `${formatLabel(details.risk.level)} rate-instability risk`,
        `Risk score ${formatPercent(details.risk.score)}`,
      ],
    },
    {
      label: "Evidence coverage",
      values: [
        `Signal coverage ${formatPercent(details.signal.coverage)}`,
        `Risk coverage ${formatPercent(details.risk.coverage)}`,
      ],
    },
  ];

  if (details.rateFeatures.dailyChangeBp !== null) {
    sections.push({
      label: "Latest observed change",
      values: [formatBasisPoints(details.rateFeatures.dailyChangeBp)],
    });
  }

  return sections;
}

function MiniDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-[#91889A]">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#F3EBDD]">
        {value}
      </dd>
    </div>
  );
}

function ContextDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 text-xs">
      <dt className="text-[#91889A]">{label}</dt>
      <dd className="break-words font-medium text-[#F3EBDD]">{value}</dd>
    </div>
  );
}

function scenarioReferenceLabel(
  reference: EngineScenarioConditionReferenceV1,
): string {
  switch (reference.kind) {
    case "channel":
      return formatLabel(reference.channel);
    case "driver":
    case "relationship":
      return `${formatLabel(reference.channel)} / ${formatLabel(reference.id)}`;
    case "risk":
      return "Risk";
    case "dataQuality":
      return "Data confidence";
    case "marketData":
      return "Market data";
  }
}

function evidenceReferenceLabel(reference: EngineEvidenceReferenceV1): string {
  return reference.kind === "channel"
    ? formatLabel(reference.channel)
    : `${formatLabel(reference.channel)} / ${formatLabel(reference.id)}`;
}

function invalidationPredicateLabel(trigger: EngineInvalidationTriggerV1): string {
  const predicate = trigger.predicate;

  switch (predicate.kind) {
    case "decision-stance-not-equal":
      return `Decision stance no longer ${formatLabel(predicate.stance)}`;
    case "decision-availability-equal":
      return "Decision becomes unavailable";
    case "evidence-relation-not-equal":
      return `${evidenceReferenceLabel(predicate.reference)} no longer supports`;
    case "evidence-relation-equal":
      return `${evidenceReferenceLabel(predicate.reference)} opposes`;
    case "evidence-availability-equal":
      return `${evidenceReferenceLabel(predicate.reference)} becomes unavailable`;
    case "risk-level-equal":
      return `Risk reaches ${formatLabel(predicate.level)}`;
    case "data-confidence-availability-equal":
      return `Data confidence becomes ${formatLabel(predicate.availability)}`;
    case "market-data-freshness-equal":
      return `Market data becomes ${formatLabel(predicate.freshness)}`;
  }
}

function rateComponentLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    ema: "EMA alignment",
    rsi14: "RSI 14",
    macdHistogramBp: "MACD histogram",
    momentum10Bp: "10-observation momentum",
    dailyBpVolatility: "Daily-change volatility",
    rsiStretch: "RSI stretch",
    ema50DistanceBp: "EMA 50 distance",
    ema200DistanceBp: "EMA 200 distance",
  };

  return `${labels[value] ?? formatLabel(value)} / normalized`;
}

function formatCurrentValue(projection: AvailableDeepProjection): string {
  if (projection.productKind === "rate") {
    return `${projection.currentValue.value.toFixed(3)}%`;
  }

  const precision = projection.productId === "eurjpy" ? 3 : 5;
  return projection.currentValue.value.toFixed(precision);
}

function primaryState(projection: AvailableDeepProjection): string {
  return projection.productKind === "rate"
    ? formatLabel(projection.details.direction)
    : formatLabel(projection.details.marketState);
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (character) => character.toUpperCase());
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "Unavailable"
    : `${(value * 100).toFixed(1)}%`;
}

function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(3)}`;
}

function formatBasisPoints(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)} bp`;
}

function formatTimestamp(value: string): string {
  return Number.isNaN(Date.parse(value)) ? value : value.slice(0, 10);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
