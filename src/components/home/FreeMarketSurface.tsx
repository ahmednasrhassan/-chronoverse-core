import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import type { MarketProductFreeLiteProjectionV1 } from
  "@/lib/markets/projections/types";
import type { FiveProductFreeLiteProjectionMapV1 } from
  "@/lib/markets/services/canonicalProductResults";

interface FreeMarketSurfaceProps {
  readonly projections: FiveProductFreeLiteProjectionMapV1;
}

type AvailableFreeProjectionV1 = Extract<
  MarketProductFreeLiteProjectionV1,
  { readonly availability: "available" }
>;

export function MarketIntelligenceBoard({
  projections,
}: FreeMarketSurfaceProps) {
  return (
    <aside
      aria-label="Free market intelligence board"
      className="relative overflow-hidden border-y border-[#6F4C91]/35 bg-[#0D0D11]/85 px-5 py-5 sm:px-6 xl:border-y-0 xl:border-l xl:px-8"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-[#C8A7E8] to-transparent opacity-80"
      />
      <div className="flex items-center justify-between gap-4 pb-4">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C8A7E8]">
            Market intelligence board
          </p>
          <p className="mt-1 text-xs text-[#91889A]">Free Lite · five-market view</p>
        </div>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#CFC5B8]">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#C8A7E8]" />
          Canonical
        </span>
      </div>

      <ol className="divide-y divide-[#6F4C91]/25">
        {LAUNCH_MARKETS_V1.map((market, index) => {
          const projection = projections[market.productId];

          return (
            <li
              key={market.productId}
              className="grid grid-cols-[1.6rem_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-3 py-3.5 first:border-t first:border-[#6F4C91]/25"
            >
              <span className="font-mono text-[10px] tabular-nums text-[#6F4C91]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-mono text-xs font-semibold tracking-[0.08em] text-[#F3EBDD]">
                {market.label}
              </span>
              {isAvailable(projection) ? (
                <span className="min-w-0 text-right">
                  <span className="block font-mono text-base font-semibold tabular-nums text-[#F3EBDD]">
                    {formatCurrentValue(projection)}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.1em] text-[#91889A]">
                    {formatBoardState(projection)}
                  </span>
                </span>
              ) : (
                <span className="text-right text-[10px] uppercase tracking-[0.12em] text-[#91889A]">
                  Unavailable
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="border-t border-[#6F4C91]/25 pt-4 text-[11px] leading-4 text-[#91889A]">
        Reference observations, not a live trading feed. Availability and
        reference dates remain source-authoritative.
      </p>
    </aside>
  );
}

export default function FreeMarketSurface({
  projections,
}: FreeMarketSurfaceProps) {
  const eurUsd = projections.eurusd;

  return (
    <>
      <section
        aria-labelledby="market-pulse-title"
        className="bg-[#0D0D11]"
      >
        <div className="mx-auto max-w-[88rem] px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
          <div className="grid gap-4 md:grid-cols-[minmax(0,0.75fr)_minmax(18rem,0.45fr)] md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C8A7E8]">
                Market pulse · Free Lite
              </p>
              <h2
                id="market-pulse-title"
                className="mt-3 text-3xl leading-tight text-[#F3EBDD] [font-family:Georgia,'Times_New_Roman',serif] sm:text-4xl"
              >
                The launch universe, at a glance.
              </h2>
            </div>
            <p className="text-sm leading-6 text-[#91889A] md:text-right">
              A compact reading of the five markets shared by Free and VIP.
              No simulated movement. No secondary product set.
            </p>
          </div>

          <ol className="mt-8 grid gap-x-8 border-y border-[#6F4C91]/30 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5 xl:gap-x-0">
            {LAUNCH_MARKETS_V1.map((market, index) => {
              const projection = projections[market.productId];
              const isFeatured = market.productId === "eurusd";

              return (
                <li
                  key={market.productId}
                  className={`relative min-w-0 py-6 lg:col-span-2 xl:col-span-1 xl:px-5 xl:[&:not(:first-child)]:border-l xl:border-[#6F4C91]/25 ${
                    index === 3 ? "lg:col-start-2 xl:col-start-auto" : ""
                  } ${isFeatured ? "xl:bg-[#15131A]/70" : ""}`}
                >
                  {isFeatured ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-px bg-[#C8A7E8]"
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-mono text-[13px] font-semibold tracking-[0.06em] text-[#F3EBDD]">
                      {market.label}
                    </h3>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[#91889A]">
                      {isFeatured ? "Featured" : "Lite"}
                    </span>
                  </div>

                  {isAvailable(projection) ? (
                    <>
                      <p className="mt-7 font-mono text-[clamp(1.6rem,2.2vw,2rem)] font-medium tabular-nums text-[#F3EBDD]">
                        {formatCurrentValue(projection)}
                      </p>
                      <p className="mt-1 truncate text-[11px] uppercase tracking-[0.1em] text-[#91889A]">
                        {projection.currentValue.unit}
                      </p>
                      <dl className="mt-6 space-y-2.5 text-xs">
                        <CompactMetric
                          label="Direction"
                          value={formatToken(projection.details.direction)}
                        />
                        <CompactMetric
                          label={projection.details.kind === "rate" ? "Regime" : "State"}
                          value={projection.details.kind === "rate"
                            ? formatToken(projection.details.levelRegime)
                            : formatToken(projection.details.marketState)}
                        />
                        <CompactMetric
                          label="Volatility"
                          value={projection.details.kind === "rate"
                            ? formatToken(projection.details.volatilityRegime)
                            : formatPercentage(projection.details.annualizedVolatility)}
                        />
                      </dl>
                      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#91889A]">
                        Ref. {projection.referenceDate}
                      </p>
                    </>
                  ) : (
                    <UnavailableMarket />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="featured-eurusd-title"
        className="relative overflow-hidden bg-[#050506]"
      >
        <div
          aria-hidden="true"
          className="absolute left-1/4 top-0 h-64 w-64 rounded-full bg-[#6F4C91]/8 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-[88rem] gap-0 px-4 py-16 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1.72fr)_minmax(20rem,0.78fr)] xl:py-24">
          <div className="bg-[#0D0D11] p-6 sm:p-10 lg:p-14">
            <div className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8A7E8]">
                  Featured intelligence canvas
                </p>
                <h2
                  id="featured-eurusd-title"
                  className="mt-3 text-4xl text-[#F3EBDD] [font-family:Georgia,'Times_New_Roman',serif] sm:text-5xl"
                >
                  EUR/USD
                </h2>
              </div>
              <span className="w-fit border border-[#6F4C91] bg-[#15131A] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8A7E8]">
                Free Lite
              </span>
            </div>

            {isAvailable(eurUsd) && eurUsd.details.kind === "fx" ? (
              <div className="pt-9">
                <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#91889A]">
                      Current reference value
                    </p>
                    <p className="mt-3 font-mono text-[clamp(3.25rem,7vw,6rem)] font-medium tracking-[-0.05em] tabular-nums text-[#F3EBDD]">
                      {formatCurrentValue(eurUsd)}
                    </p>
                    <p className="mt-3 text-xs text-[#CFC5B8]">
                      {eurUsd.currentValue.unit} · Reference {eurUsd.referenceDate}
                    </p>
                  </div>
                  <p className="border-l border-[#6F4C91]/50 pl-4 text-xs leading-5 text-[#91889A]">
                    Source date<br />
                    <span className="text-[#CFC5B8]">
                      {formatTimestamp(eurUsd.sourceTimestamp)}
                    </span>
                  </p>
                </div>

                <div
                  aria-label="EUR/USD state and signal band"
                  className="mt-12 border-y border-[#6F4C91]/40"
                >
                  <dl className="grid sm:grid-cols-2 xl:grid-cols-3">
                    <SignalCell
                      index="01"
                      label="Market state"
                      value={formatToken(eurUsd.details.marketState)}
                    />
                    <SignalCell
                      index="02"
                      label="Basic trend"
                      value={formatToken(eurUsd.details.direction)}
                    />
                    <SignalCell
                      index="03"
                      label="Annualized volatility"
                      value={formatPercentage(eurUsd.details.annualizedVolatility)}
                    />
                    <SignalCell
                      index="04"
                      label="Reference"
                      value={eurUsd.referenceDate}
                    />
                    <SignalCell
                      index="05"
                      label="Freshness"
                      value="Not assessed"
                    />
                    <SignalCell
                      index="06"
                      label="Projection status"
                      value={formatToken(eurUsd.status)}
                    />
                  </dl>
                </div>

                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.1em] text-[#91889A]">
                  <span>Availability · Verified projection</span>
                  <span>Interval · {formatToken(eurUsd.interval)}</span>
                </div>
              </div>
            ) : (
              <div className="py-16">
                <p className="text-xl text-[#F3EBDD] [font-family:Georgia,'Times_New_Roman',serif]">
                  EUR/USD projection unavailable
                </p>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#CFC5B8]">
                  No verified Free Lite result is available for this render.
                  The remaining market projections continue independently.
                </p>
              </div>
            )}
          </div>

          <aside className="bg-[#15131A] p-6 sm:p-10 xl:p-12">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[#C8A7E8]">
              Intelligence boundary
            </p>
            <h2 className="mt-4 text-3xl leading-tight text-[#F3EBDD] [font-family:Georgia,'Times_New_Roman',serif]">
              Useful now.<br />Deeper in VIP.
            </h2>
            <p className="mt-5 text-sm leading-6 text-[#CFC5B8]">
              Free establishes the observed state. VIP adds the analytical
              layers required to challenge and contextualize it.
            </p>

            <div className="relative mt-10 space-y-10 before:absolute before:bottom-2 before:left-[0.28rem] before:top-2 before:w-px before:bg-[#6F4C91]/55">
              <BoundaryList
                title="Free intelligence"
                items={[
                  "Current state",
                  "Basic trend",
                  "Volatility",
                  "Reference and freshness",
                  "Availability context",
                ]}
              />
              <BoundaryList
                title="VIP intelligence"
                items={[
                  "Macro drivers",
                  "Cross-market confirmation",
                  "Regime intelligence",
                  "Scenarios and conviction",
                  "Invalidation",
                  "Historical context",
                ]}
              />
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function isAvailable(
  projection: MarketProductFreeLiteProjectionV1 | null,
): projection is AvailableFreeProjectionV1 {
  return projection?.availability === "available";
}

function formatBoardState(projection: AvailableFreeProjectionV1): string {
  return projection.details.kind === "rate"
    ? `${formatToken(projection.details.direction)} · ${formatToken(projection.details.levelRegime)}`
    : `${formatToken(projection.details.direction)} · ${formatToken(projection.details.marketState)}`;
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[#91889A]">{label}</dt>
      <dd className="truncate text-right font-medium text-[#CFC5B8]">{value}</dd>
    </div>
  );
}

function SignalCell({
  index,
  label,
  value,
}: {
  index: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-[#6F4C91]/25 py-5 sm:odd:border-r sm:even:pl-5 xl:border-r xl:px-6 xl:first:pl-0 xl:[&:nth-child(3n)]:border-r-0">
      <dt className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#91889A]">
        <span className="text-[#6F4C91]">{index}</span>
        {label}
      </dt>
      <dd className="mt-3 text-sm font-semibold text-[#F3EBDD]">{value}</dd>
    </div>
  );
}

function UnavailableMarket() {
  return (
    <div className="mt-8 border-t border-[#6F4C91]/25 pt-4">
      <p className="text-sm font-medium text-[#CFC5B8]">Unavailable</p>
      <p className="mt-2 text-xs leading-5 text-[#91889A]">
        No verified Free Lite projection is available.
      </p>
    </div>
  );
}

function BoundaryList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <div className="relative pl-7">
      <span aria-hidden="true" className="absolute left-0 top-1 h-2.5 w-2.5 rounded-full border border-[#C8A7E8] bg-[#15131A]" />
      <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C8A7E8]">
        {title}
      </h3>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm leading-5 text-[#CFC5B8]">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span aria-hidden="true" className="text-[#6F4C91]">/</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatCurrentValue(projection: AvailableFreeProjectionV1): string {
  if (projection.currentValue.kind === "rate-percent") {
    return `${projection.currentValue.value.toFixed(3)}%`;
  }

  return projection.currentValue.value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  });
}

function formatPercentage(value: number | null): string {
  return value === null ? "Not available" : `${value.toFixed(2)}%`;
}

function formatToken(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}
