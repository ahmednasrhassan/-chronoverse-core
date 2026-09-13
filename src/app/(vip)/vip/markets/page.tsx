import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import { requireVipV1 } from "@/lib/auth/guards";
import { enforceVipPageAccessV1 } from "@/lib/auth/vipPageAccess";

export const metadata: Metadata = {
  title: "VIP Markets | Chronoverse Capital",
  description:
    "Institutional cross-asset market intelligence, private analytics, and advanced market monitoring within Chronoverse VIP.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function VipMarketsPage() {
  await enforceVipPageAccessV1(requireVipV1, redirect);

  return (
    <section className="space-y-8">
      {/* =========================================================
          PAGE INTRO
         ========================================================= */}
      <div className="border-b border-[#211F29] pb-8">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#C8A7E8]">
          Institutional Market Environment
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#F3EBDD] md:text-4xl">
          Markets Command Center
        </h1>

        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#CFC5B8]">
          Deep projections for the same five-market universe available on the
          Free surface, reserved for verified VIP access.
        </p>
      </div>

      {/* =========================================================
          MARKET STATUS STRIP
         ========================================================= */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
            Market Engine
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#F3EBDD]">
              Cross-Asset Feed
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Online
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
            Signal Layer
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#F3EBDD]">
              Technical Engine
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#C8A7E8]">
              Preview
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
            Research Layer
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#F3EBDD]">
              Macro Overlay
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#C8A7E8]">
              Preview
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================
          MARKET INTELLIGENCE GRID
         ========================================================= */}
      <div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#91889A]">
              Launch Market Intelligence
            </p>

            <h2 className="mt-2 text-xl font-bold text-[#F3EBDD]">
              Five-market deep coverage
            </h2>
          </div>

          <span className="text-[9px] uppercase tracking-[0.18em] text-[#91889A]">
            Private Preview
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {LAUNCH_MARKETS_V1.map((market) => (
            <article
              key={market.productId}
              className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5 transition-all hover:border-[#6F4C91]/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
                    Market Module
                  </p>

                  <h3 className="mt-3 text-base font-bold text-[#F3EBDD]">
                    {market.label}
                  </h3>
                </div>

                <span className="rounded-md border border-[#6F4C91]/40 bg-[#6F4C91]/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#C8A7E8]">
                  Deep projection
                </span>
              </div>

              <p className="mt-4 text-xs leading-6 text-[#CFC5B8]">
                {market.kind === "rate"
                  ? "Rate-specific analytical semantics for the €STR reference rate."
                  : "Deep foreign-exchange projection for verified VIP access."}
              </p>

              <div className="mt-5 border-t border-[#211F29] pt-4">
                <Link
                  href={`/vip/markets/${market.productId}`}
                  className="inline-flex min-h-11 items-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
                >
                  {market.kind === "fx"
                    ? "Open FX Market Room"
                    : "Open €STR Market Room"}
                  <span aria-hidden="true" className="ml-2">&#8594;</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* =========================================================
          ANALYTICS WORKSPACE
         ========================================================= */}
      <div className="rounded-2xl border border-[#211F29] bg-[#09090C] p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
              Chronoverse Analytics Workspace
            </p>

            <h2 className="mt-2 text-lg font-bold text-[#F3EBDD]">
              Technical Intelligence Layer
            </h2>

            <p className="mt-3 max-w-2xl text-xs leading-6 text-[#CFC5B8]">
              This workspace will host private charting, EMA, RSI, MACD,
              volatility analysis, regime detection, and Chronoverse signal
              generation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]" />

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#CFC5B8]">
              Infrastructure Ready
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
