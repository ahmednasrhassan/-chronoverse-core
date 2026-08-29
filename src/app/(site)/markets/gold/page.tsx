import type { Metadata } from "next";

import GoldChart from "@/components/charts/GoldChart";
import GoldIntelligencePanel from "@/components/markets/gold/GoldIntelligencePanel";

export const metadata: Metadata = {
  title:
    "Gold Market | Chronoverse Capital",

  description:
    "Live gold futures chart, market data, technical analysis, risk and macro intelligence from Chronoverse Capital.",
};

export default function GoldMarketPage() {
  return (
    <main className="min-h-screen bg-page px-4 py-8 md:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-mauve">
            Chronoverse Markets
          </p>

          <h1 className="text-2xl font-bold text-mauve md:text-3xl">
            Gold Futures
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Live gold futures market data with
            Chronoverse technical indicators,
            macroeconomic regime analysis and
            institutional market intelligence.
          </p>
        </header>

        <GoldIntelligencePanel />

        <GoldChart />
      </div>
    </main>
  );
}