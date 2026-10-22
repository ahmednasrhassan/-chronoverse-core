import Link from "next/link";
import MarketCurrentUse from "@/components/markets/MarketCurrentUse";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import type { FiveProductFreeLiteProjectionMapV1 } from "@/lib/markets/services/canonicalProductResults";

const DESCRIPTIONS = {
  eurusd: "Euro versus US dollar market reference.",
  eurjpy: "Euro versus Japanese yen market reference.",
  eurgbp: "Euro versus British pound market reference.",
  eurchf: "Euro versus Swiss franc market reference.",
  estr: "Euro short-term reference interest rate.",
} as const;

export default function HomeMarketTools({ projections }: {
  projections: FiveProductFreeLiteProjectionMapV1;
}) {
  return (
    <section aria-labelledby="free-market-tools-title" className="border-y border-[#6F4C91]/30 bg-[#0D0D11]">
      <div className="mx-auto max-w-[88rem] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#C8A7E8]">The reference desk</p>
            <h2 id="free-market-tools-title" className="mt-3 text-3xl text-[#F3EBDD] [font-family:Georgia,'Times_New_Roman',serif] sm:text-4xl">
              Five free market tools
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#CFC5B8]">
              Official ECB reference observations, with source dates and clear availability limits.
              Open each Free Lite tool for its full analytical context.
            </p>
          </div>
          <Link href="/markets" className="w-fit shrink-0 border-b border-[#6F4C91] pb-1 text-sm font-semibold text-[#C8A7E8] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]">
            Explore all tools <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {LAUNCH_MARKETS_V1.map((market) => {
            const projection = projections[market.productId];
            return (
              <li key={market.productId} data-market={market.productId} className="flex min-w-0 flex-col border border-[#6F4C91]/30 bg-[#050506] p-5">
                <h3 className="font-mono text-sm font-semibold text-[#F3EBDD]">
                  <Link href={`/markets#${market.productId}`} className="hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]">
                    {market.label} <span aria-hidden="true" className="float-right text-[#C8A7E8]">↗</span>
                  </Link>
                </h3>
                <p className="mt-3 min-h-16 text-xs leading-5 text-[#CFC5B8]">{DESCRIPTIONS[market.productId]}</p>
                {projection?.availability === "available" ? (
                  <>
                    <p className="mt-4 font-mono text-2xl tabular-nums text-[#F3EBDD]">
                      {projection.currentValue.kind === "rate-percent"
                        ? `${projection.currentValue.value.toFixed(3)}%`
                        : projection.currentValue.value.toLocaleString("en-US", { maximumFractionDigits: 5, minimumFractionDigits: 2 })}
                    </p>
                    <p className="mt-1 text-[11px] text-[#91889A]">{projection.currentValue.unit}</p>
                    <p className="mt-3 text-[11px] text-[#CFC5B8]">Reference <time dateTime={projection.referenceDate}>{projection.referenceDate}</time></p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-[#CFC5B8]">Reference unavailable</p>
                )}
                <div className="mt-auto pt-2">
                  <MarketCurrentUse projection={projection} productKind={market.kind} />
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-xs leading-6 text-[#91889A]">
          Source: European Central Bank. Reference observations, not a live trading feed.
          Read the <Link href="/data-sources" className="text-[#C8A7E8] underline underline-offset-4">data sources</Link> and{" "}
          <Link href="/freshness" className="text-[#C8A7E8] underline underline-offset-4">freshness and availability disclosures</Link> alongside every result.
        </p>
      </div>
    </section>
  );
}
