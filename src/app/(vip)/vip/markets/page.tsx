import type { Metadata } from "next";

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

const marketPanels = [
  {
    title: "Global Equities",
    description:
      "Monitor major equity benchmarks, risk appetite, breadth, momentum, and regime transitions.",
    status: "Preview",
  },
  {
    title: "Precious Metals",
    description:
      "Institutional monitoring for gold, silver, macro hedging demand, and monetary stress signals.",
    status: "Preview",
  },
  {
    title: "Energy Complex",
    description:
      "Track crude oil, refined products, volatility, macro demand, and geopolitical risk transmission.",
    status: "Preview",
  },
  {
    title: "Digital Assets",
    description:
      "Private monitoring of Bitcoin, crypto liquidity, momentum structure, and cross-market positioning.",
    status: "Preview",
  },
];

export default function VipMarketsPage() {
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
          Cross-asset market intelligence, institutional monitoring, and
          private analytical infrastructure across major global asset classes.
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
              Cross-Asset Intelligence
            </p>

            <h2 className="mt-2 text-xl font-bold text-[#F3EBDD]">
              Market Modules
            </h2>
          </div>

          <span className="text-[9px] uppercase tracking-[0.18em] text-[#91889A]">
            Private Preview
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {marketPanels.map((panel) => (
            <article
              key={panel.title}
              className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5 transition-all hover:border-[#6F4C91]/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
                    Market Module
                  </p>

                  <h3 className="mt-3 text-base font-bold text-[#F3EBDD]">
                    {panel.title}
                  </h3>
                </div>

                <span className="rounded-md border border-[#6F4C91]/40 bg-[#6F4C91]/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#C8A7E8]">
                  {panel.status}
                </span>
              </div>

              <p className="mt-4 text-xs leading-6 text-[#CFC5B8]">
                {panel.description}
              </p>

              <div className="mt-5 border-t border-[#211F29] pt-4">
                <span className="text-[9px] uppercase tracking-[0.18em] text-[#91889A]">
                  Chart & analytics layer pending
                </span>
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