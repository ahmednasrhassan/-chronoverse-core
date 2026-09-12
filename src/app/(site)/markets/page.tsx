import type { Metadata } from "next";
import Link from "next/link";

import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";

export const metadata: Metadata = {
  title: "Markets",
  description: "The five-market Chronoverse launch coverage universe.",
};

export default function MarketsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="max-w-3xl border-b border-border pb-10">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
          Launch coverage
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
          Five markets. Two analytical depths.
        </h1>
        <p className="mt-5 text-base leading-7 text-secondary">
          Free and VIP use the same focused market universe. Free presents the
          Lite projection; verified VIP access presents the Deep projection.
        </p>
      </header>

      <section className="mt-10" aria-labelledby="market-coverage-title">
        <h2 id="market-coverage-title" className="text-lg font-semibold text-primary">
          Market coverage
        </h2>
        <ul className="mt-5 divide-y divide-border rounded-xl border border-border bg-card">
          {LAUNCH_MARKETS_V1.map((market) => (
            <li
              key={market.productId}
              className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
            >
              <span className="font-medium text-primary">{market.label}</span>
              <span className="text-xs uppercase tracking-[0.16em] text-muted">
                {market.kind === "rate" ? "Reference rate" : "FX reference"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="rounded-md border border-border bg-card px-5 py-3 text-center text-sm font-semibold text-primary hover:border-purple-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
        >
          View Free
        </Link>
        <Link
          href="/vip"
          className="rounded-md border border-purple-border bg-raised px-5 py-3 text-center text-sm font-semibold text-primary hover:border-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
        >
          Enter VIP
        </Link>
        <Link
          href="/methodology"
          className="rounded-md px-5 py-3 text-center text-sm font-medium text-mauve hover:text-purple-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
        >
          Review methodology
        </Link>
      </div>
    </div>
  );
}
