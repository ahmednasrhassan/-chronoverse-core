import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chronoverse VIP | Institutional Intelligence",
  description:
    "Private institutional market intelligence, advanced analytics, signals, portfolio tools, and executive research from Chronoverse Capital.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function VipOverviewPage() {
  return (
    <section className="space-y-8">
      {/* =========================================================
          PAGE INTRO
         ========================================================= */}
      <div className="border-b border-[#211F29] pb-8">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#C8A7E8]">
          Private Intelligence Environment
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#F3EBDD] md:text-4xl">
          Executive Overview
        </h1>

        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#CFC5B8]">
          Institutional market intelligence, portfolio analytics, private
          research, and advanced decision-support infrastructure within the
          Chronoverse private network.
        </p>
      </div>

      {/* =========================================================
          OVERVIEW GRID
         ========================================================= */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Market Intelligence */}
        <article className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5 transition-all hover:border-[#6F4C91]/70">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
            Market Intelligence
          </p>

          <h2 className="mt-3 text-base font-bold text-[#F3EBDD]">
            Cross-Asset Signals
          </h2>

          <p className="mt-3 text-xs leading-6 text-[#CFC5B8]">
            Private market structure, momentum, liquidity, and macro regime
            intelligence across major asset classes.
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-[#211F29] pt-4">
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#91889A]">
              Engine
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Online
            </span>
          </div>
        </article>

        {/* Portfolio Intelligence */}
        <article className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5 transition-all hover:border-[#6F4C91]/70">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
            Portfolio Intelligence
          </p>

          <h2 className="mt-3 text-base font-bold text-[#F3EBDD]">
            Allocation Framework
          </h2>

          <p className="mt-3 text-xs leading-6 text-[#CFC5B8]">
            Portfolio diagnostics, exposure monitoring, allocation context,
            and institutional risk intelligence.
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-[#211F29] pt-4">
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#91889A]">
              Access
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#C8A7E8]">
              Preview
            </span>
          </div>
        </article>

        {/* Research Network */}
        <article className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-5 transition-all hover:border-[#6F4C91]/70">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
            Research Network
          </p>

          <h2 className="mt-3 text-base font-bold text-[#F3EBDD]">
            Executive Intelligence
          </h2>

          <p className="mt-3 text-xs leading-6 text-[#CFC5B8]">
            High-conviction research, strategic macro interpretation, and
            private institutional decision support.
          </p>

          <div className="mt-5 flex items-center justify-between border-t border-[#211F29] pt-4">
            <span className="text-[9px] uppercase tracking-[0.18em] text-[#91889A]">
              Network
            </span>

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#C8A7E8]">
              Preview
            </span>
          </div>
        </article>
      </div>

      {/* =========================================================
          COMMAND STRIP
         ========================================================= */}
      <div className="rounded-2xl border border-[#211F29] bg-[#09090C] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#C8A7E8]">
              Chronoverse Intelligence Layer
            </p>

            <p className="mt-2 text-sm font-semibold text-[#F3EBDD]">
              Private analytical infrastructure is active.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]" />

            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#CFC5B8]">
              System Operational
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
