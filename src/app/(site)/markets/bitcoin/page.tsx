import type { Metadata } from "next";

import BitcoinChart from "@/components/charts/BitcoinChart";

export const metadata: Metadata = {
  title: "Bitcoin Market | Chronoverse Capital",
  description:
    "Live Bitcoin market chart, technical indicators, and market intelligence from Chronoverse Capital.",
};

export default function BitcoinMarketPage() {
  return (
    <main className="min-h-screen bg-[#120e0c] px-4 py-8 md:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#c87d55]">
            Chronoverse Markets
          </p>

          <h1 className="text-2xl font-bold text-white md:text-3xl">
            Bitcoin
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Live Bitcoin market data with Chronoverse technical indicators
            and institutional market intelligence.
          </p>
        </header>

        <BitcoinChart />
      </div>
    </main>
  );
}