import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import type {
  FiveProductFreeLiteProjectionMapV1,
} from "@/lib/markets/services/canonicalProductResults";
import type {
  MarketProductFreeLiteProjectionV1,
} from "@/lib/markets/projections/types";

interface FreeMarketSurfaceProps {
  readonly projections: FiveProductFreeLiteProjectionMapV1;
}

type AvailableFreeProjectionV1 = Extract<
  MarketProductFreeLiteProjectionV1,
  { readonly availability: "available" }
>;

export default function FreeMarketSurface({
  projections,
}: FreeMarketSurfaceProps) {
  const eurUsd = projections.eurusd;

  return (
    <>
      <section
        aria-labelledby="free-markets-title"
        className="border-y border-border bg-card/40"
      >
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
                Free Lite projections
              </p>
              <h2
                id="free-markets-title"
                className="mt-2 text-2xl font-semibold text-primary"
              >
                The complete launch universe
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted">
              Five public snapshots, assembled from the same canonical market
              results used by the deeper VIP tier.
            </p>
          </div>

          <ul className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {LAUNCH_MARKETS_V1.map((market) => {
              const projection = projections[market.productId];

              return (
                <li
                  key={market.productId}
                  className="min-w-0 rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-primary">{market.label}</h3>
                    <span className="rounded border border-border bg-raised px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                      Lite
                    </span>
                  </div>
                  {isAvailable(projection) ? (
                    <>
                      <p className="mt-5 text-2xl font-semibold tabular-nums text-primary">
                        {formatCurrentValue(projection)}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {projection.currentValue.unit}
                      </p>
                      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-xs">
                        <CompactMetric
                          label="Direction"
                          value={formatToken(projection.details.direction)}
                        />
                        <CompactMetric
                          label={projection.details.kind === "rate"
                            ? "Level"
                            : "State"}
                          value={projection.details.kind === "rate"
                            ? formatToken(projection.details.levelRegime)
                            : formatToken(projection.details.marketState)}
                        />
                        <CompactMetric
                          label="Volatility"
                          value={projection.details.kind === "rate"
                            ? formatToken(projection.details.volatilityRegime)
                            : formatPercentage(
                              projection.details.annualizedVolatility,
                            )}
                        />
                      </dl>
                      <p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-muted">
                        Reference {projection.referenceDate}
                      </p>
                    </>
                  ) : (
                    <UnavailableMarket />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="featured-eurusd-title"
        className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)] lg:px-8 lg:py-24"
      >
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
                Featured Free market
              </p>
              <h2
                id="featured-eurusd-title"
                className="mt-3 text-3xl font-semibold text-primary"
              >
                EUR/USD
              </h2>
            </div>
            <span className="w-fit rounded-md border border-purple-border bg-raised px-3 py-2 text-xs font-semibold text-mauve">
              Free Lite
            </span>
          </div>

          {isAvailable(eurUsd) && eurUsd.details.kind === "fx" ? (
            <div className="pt-9">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">
                Current reference value
              </p>
              <p className="mt-3 text-5xl font-semibold tracking-tight tabular-nums text-primary sm:text-6xl">
                {formatCurrentValue(eurUsd)}
              </p>
              <p className="mt-3 text-sm text-secondary">
                {eurUsd.currentValue.unit} · Reference {eurUsd.referenceDate}
              </p>

              <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                <FeaturedMetric
                  label="Market state"
                  value={formatToken(eurUsd.details.marketState)}
                />
                <FeaturedMetric
                  label="Basic trend"
                  value={formatToken(eurUsd.details.direction)}
                />
                <FeaturedMetric
                  label="Annualized volatility"
                  value={formatPercentage(eurUsd.details.annualizedVolatility)}
                />
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
                <span>{formatToken(eurUsd.status)}</span>
                <span>Freshness not assessed</span>
                <span>Source time {formatTimestamp(eurUsd.sourceTimestamp)}</span>
              </div>
            </div>
          ) : (
            <div className="py-14">
              <p className="text-lg font-medium text-primary">
                EUR/USD projection unavailable
              </p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-secondary">
                No verified Free Lite result is available for this render.
                Other market projections remain independently visible.
              </p>
            </div>
          )}
        </div>

        <aside className="self-start rounded-2xl border border-border bg-raised p-6 sm:p-8">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
            Intelligence boundary
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-primary">
            Useful now. Deeper in VIP.
          </h2>
          <div className="mt-7 space-y-7">
            <BoundaryList
              title="Free"
              items={[
                "Current state",
                "Basic trend",
                "Volatility",
                "Reference date",
                "Availability context",
              ]}
            />
            <BoundaryList
              title="VIP"
              items={[
                "Macro drivers",
                "Cross-market confirmation",
                "Regime intelligence",
                "Scenarios and conviction",
                "Invalidation and historical context",
              ]}
            />
          </div>
        </aside>
      </section>
    </>
  );
}

function isAvailable(
  projection: MarketProductFreeLiteProjectionV1 | null,
): projection is AvailableFreeProjectionV1 {
  return projection?.availability === "available";
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-secondary">{value}</dd>
    </div>
  );
}

function FeaturedMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4 sm:p-5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-2 text-sm font-semibold text-primary">{value}</dd>
    </div>
  );
}

function UnavailableMarket() {
  return (
    <div className="mt-8 border-t border-border pt-4">
      <p className="text-sm font-medium text-secondary">Unavailable</p>
      <p className="mt-2 text-xs leading-5 text-muted">
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
    <div>
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-5 text-secondary">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-mauve">—</span>
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
