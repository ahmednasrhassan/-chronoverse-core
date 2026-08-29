import type { Metadata } from "next";

import OilChart from "@/components/charts/OilChart";

export const metadata: Metadata = {
  title: "Crude Oil Market | Chronoverse Capital",
  description:
    "Live WTI crude oil chart, technical indicators, and market intelligence from Chronoverse Capital.",
};

export default function OilMarketPage() {
  return (
    <main className="min-h-screen bg-page px-4 py-8 md:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-mauve">
            Chronoverse Markets
          </p>

          <h1 className="text-2xl font-bold text-mauve md:text-3xl">
            Crude Oil WTI
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Live WTI crude oil market data with Chronoverse technical
            indicators and institutional market intelligence.
          </p>
        </header>

        <OilChart />
      </div>
    </main>
  );
}