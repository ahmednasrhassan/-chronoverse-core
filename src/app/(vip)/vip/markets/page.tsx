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
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#93A4F5]">
          Institutional Market Environment
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#F2EEF8] md:text-4xl">
          Markets Command Center
        </h1>

        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#AAB2CC]">
          Cross-asset market intelligence, institutional monitoring, and
          private analytical infrastructure across major global asset classes.
        </p>
      </div>

      {/* =========================================================
          MARKET STATUS STRIP
         ========================================================= */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#93A4F5]">
            Market Engine
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#F2EEF8]">
              Cross-Asset Feed
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Online
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#93A4F5]">
            Signal Layer
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#F2EEF8]">
              Technical Engine
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#B8C4FF]">
              Preview
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#93A4F5]">
            Research Layer
          </p>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-[#F2EEF8]">
              Macro Overlay
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#B8C4FF]">
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
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#8992B8]">
              Cross-Asset Intelligence
            </p>

            <h2 className="mt-2 text-xl font-bold text-[#F2EEF8]">
              Market Modules
            </h2>
          </div>

          <span className="text-[9px] uppercase tracking-[0.18em] text-[#8992B8]">
            Private Preview
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {marketPanels.map((panel) => (
            <article
              key={panel.title}
              className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5 transition-all hover:border-[#596BAF]/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#93A4F5]">
                    Market Module
                  </p>

                  <h3 className="mt-3 text-base font-bold text-[#F2EEF8]">
                    {panel.title}
                  </h3>
                </div>

                <span className="rounded-md border border-[#596BAF]/40 bg-[#596BAF]/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#B8C4FF]">
                  {panel.status}
                </span>
              </div>

              <p className="mt-4 text-xs leading-6 text-[#AAB2CC]">
                {panel.description}
              </p>

              <div className="mt-5 border-t border-[#211F29] pt-4">
                <span className="text-[9px] uppercase tracking-[0.18em] text-[#8992B8]">
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
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#93A4F5]">
              Chronoverse Analytics Workspace
            </p>

            <h2 className="mt-2 text-lg font-bold text-[#F2EEF8]">
              Technical Intelligence Layer
            </h2>

            <p className="mt-3 max-w-2xl text-xs leading-6 text-[#AAB2CC]">
              This workspace will host private charting, EMA, RSI, MACD,
              volatility analysis, regime detection, and Chronoverse signal
              generation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]" />

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#AAB2CC]">
              Infrastructure Ready
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}