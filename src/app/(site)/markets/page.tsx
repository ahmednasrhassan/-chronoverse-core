import type { Metadata } from "next";
import Link from "next/link";

import FreeMarketSurface from "@/components/home/FreeMarketSurface";
import { getFiveProductFreeLiteProjectionMapV1 } from "@/lib/markets/services/canonicalProductResults";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Markets",
  description:
    "Explore the public Free Lite overview for EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR.",
  pathname: "/markets",
});

export default async function MarketsPage() {
  const projections = await getFiveProductFreeLiteProjectionMapV1();
  return (
    <div className="w-full py-12 sm:py-16">
      <header className="mx-auto max-w-[88rem] px-4 pb-6 sm:px-6 lg:px-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
          Launch coverage
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
          Five markets. Free analytical context.
        </h1>
        <p className="mt-5 text-base leading-7 text-secondary">
          Free Lite presents a focused market universe with official reference
          observations, analytical context, freshness and availability limits.
        </p>
      </header>

      <FreeMarketSurface projections={projections} />

      <div className="mx-auto mt-8 flex max-w-[88rem] flex-col gap-3 px-4 sm:flex-row sm:px-6 lg:px-8">
        <Link
          href="/"
          className="rounded-md border border-border bg-card px-5 py-3 text-center text-sm font-semibold text-primary hover:border-purple-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
        >
          Explore research publication
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
