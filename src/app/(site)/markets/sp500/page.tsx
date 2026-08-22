import type { Metadata } from "next";

import SP500Chart from "@/components/charts/SP500Chart";

export const metadata: Metadata = {
  title: "S&P 500 Market | Chronoverse Capital",
  description:
    "Live S&P 500 chart, technical indicators, and market intelligence from Chronoverse Capital.",
};

export default function SP500MarketPage() {
  return (
    <main className="min-h-screen bg-[#120e0c] px-4 py-8 md:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#c87d55]">
            Chronoverse Markets
          </p>

          <h1 className="text-2xl font-bold text-white md:text-3xl">
            S&amp;P 500
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Live S&amp;P 500 market data with Chronoverse technical
            indicators and institutional market intelligence.
          </p>
        </header>

        <SP500Chart />
      </div>
    </main>
  );
}