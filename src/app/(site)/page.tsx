import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import NewsletterForm from "@/components/NewsLetterForm";
import FreeMarketSurface from "@/components/home/FreeMarketSurface";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import { siteConfig } from "@/config/siteConfig";
import { calculateReadTime, getLatestSanityArticles } from "@/lib/content";
import { getFiveProductFreeLiteProjectionMapV1 } from
  "@/lib/markets/services/canonicalProductResults";

export const metadata: Metadata = {
  title: "Free Market Intelligence",
  description:
    "Free Lite market intelligence for EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR.",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <div className="bg-page text-primary">
      <Hero />

      <Suspense fallback={<MarketSurfaceFallback />}>
        <FreeMarketIntelligence />
      </Suspense>

      <VipConversion />

      <Suspense fallback={<ResearchFallback />}>
        <LatestResearch />
      </Suspense>

      <ResearchAndMembership />
      <Newsletter />
      <TrustStrip />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 hidden w-1/2 bg-[linear-gradient(135deg,transparent_0%,rgba(111,76,145,0.08)_100%)] lg:block"
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] lg:px-8 lg:py-32">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-mauve">
            Free Market Intelligence
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-primary sm:text-5xl lg:text-6xl">
            Five markets. One intelligence system.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-secondary sm:text-lg">
            Follow the complete Chronoverse launch universe through clear Free
            Lite projections. VIP examines the same five markets with deeper
            regime, macro, scenario, and conviction intelligence.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/markets"
              className="rounded-md border border-mauve bg-mauve px-5 py-3 text-center text-sm font-semibold text-page hover:border-purple-brand hover:bg-purple-brand hover:text-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              Explore Markets
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-border bg-card px-5 py-3 text-center text-sm font-semibold text-primary hover:border-purple-border hover:text-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              See VIP Difference
            </Link>
          </div>
        </div>

        <aside className="self-end border-l border-purple-border pl-6 sm:pl-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            Shared product universe
          </p>
          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-secondary">
            {LAUNCH_MARKETS_V1.map((market) => (
              <li key={market.productId}>{market.label}</li>
            ))}
          </ul>
          <div className="mt-7 grid grid-cols-2 gap-4 border-t border-border pt-5 text-xs">
            <p>
              <span className="block font-semibold text-primary">Free</span>
              <span className="mt-1 block text-muted">Lite projection</span>
            </p>
            <p>
              <span className="block font-semibold text-primary">VIP</span>
              <span className="mt-1 block text-muted">Deep projection</span>
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

async function FreeMarketIntelligence() {
  const projections = await getFiveProductFreeLiteProjectionMapV1();

  return <FreeMarketSurface projections={projections} />;
}

function MarketSurfaceFallback() {
  return (
    <section className="border-y border-border bg-card/40" aria-label="Loading Free market intelligence">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="text-sm text-secondary">Loading verified Free Lite projections…</p>
      </div>
    </section>
  );
}

function VipConversion() {
  const vipCapabilities = [
    "Deeper regime analysis",
    "Macro drivers",
    "Cross-market confirmation",
    "Scenarios and conviction",
    "Invalidation",
    "Historical context",
    "Proprietary intelligence",
  ] as const;

  return (
    <section className="border-y border-border bg-raised">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-8 lg:py-24">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
            Chronoverse VIP
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
            Same markets. A deeper view.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-secondary">
            Move from a concise public reading to the deeper analytical context
            available to verified VIP members—without changing the market
            universe.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/vip"
              className="rounded-md border border-mauve bg-mauve px-5 py-3 text-center text-sm font-semibold text-page hover:bg-purple-brand hover:text-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
            >
              Explore VIP
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-border px-5 py-3 text-center text-sm font-semibold text-primary hover:border-mauve hover:text-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
            >
              Compare Free and VIP
            </Link>
          </div>
        </div>

        <ul className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {vipCapabilities.map((capability) => (
            <li key={capability} className="bg-card px-5 py-4 text-sm text-secondary">
              {capability}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function LatestResearch() {
  const articles = await getLatestSanityArticles(3);

  return (
    <section aria-labelledby="latest-research-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
            Editorial authority
          </p>
          <h2 id="latest-research-title" className="mt-3 text-3xl font-semibold text-primary">
            Latest research
          </h2>
        </div>
        <Link
          href="/reports"
          className="w-fit rounded-sm text-sm font-semibold text-mauve hover:text-purple-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
        >
          View all research →
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-8 text-sm text-secondary">
          No published research is available right now.
        </div>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {articles.map((article) => (
            <article key={article.slug} className="border-t border-purple-border pt-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>{article.category}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={article.date}>{article.date}</time>
                <span aria-hidden="true">·</span>
                <span>
                  {calculateReadTime(article.bodyContent || article.content || "")} min read
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold leading-7 text-primary">
                <Link
                  href={`/${article.slug}`}
                  className="rounded-sm text-primary hover:text-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
                >
                  {article.title}
                </Link>
              </h3>
              {article.seoDescription ? (
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-secondary">
                  {article.seoDescription}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ResearchFallback() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24" aria-label="Loading research">
      <p className="text-sm text-secondary">Loading published research…</p>
    </section>
  );
}

function ResearchAndMembership() {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
            Research &amp; Membership
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-primary">
            Choose the format that fits the work.
          </h2>
        </div>

        <div className="mt-9 grid gap-5 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Lemon Squeezy · Membership role
            </p>
            <h3 className="mt-4 text-xl font-semibold text-primary">
              Chronoverse VIP Membership
            </h3>
            <p className="mt-3 text-sm leading-6 text-secondary">
              Ongoing access to the deeper view of the same five-market
              intelligence system. Secure authenticated checkout is not yet
              initiated from this page.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-block rounded-sm text-sm font-semibold text-mauve hover:text-purple-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
            >
              Review membership access →
            </Link>
          </article>

          <article className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Gumroad · Standalone research role
            </p>
            <h3 className="mt-4 text-xl font-semibold text-primary">
              Premium Research Dossiers
            </h3>
            <p className="mt-3 text-sm leading-6 text-secondary">
              One-off research products remain separate from recurring VIP
              membership and do not grant application access.
            </p>
            <a
              href={siteConfig.commerce.gumroadResearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-sm text-sm font-semibold text-mauve hover:text-purple-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
            >
              Browse standalone research →
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}

function Newsletter() {
  return (
    <section aria-labelledby="newsletter-title" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <div className="grid gap-8 rounded-2xl border border-border bg-card p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)] lg:items-center">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
            Chronoverse Dispatch
          </p>
          <h2 id="newsletter-title" className="mt-3 text-3xl font-semibold text-primary">
            Stay ahead of the next move.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-secondary">
            Receive new market research and analytical updates through the
            existing Chronoverse newsletter service.
          </p>
        </div>
        <NewsletterForm />
      </div>
    </section>
  );
}

function TrustStrip() {
  const links = [
    { label: "Independent methodology", href: "/methodology" },
    { label: "Identified data sources", href: "/data-sources" },
    { label: "Transparent freshness", href: "/freshness" },
    { label: "Information, not advice", href: "/disclaimer" },
  ] as const;

  return (
    <section aria-label="Institutional disclosures" className="border-t border-border bg-raised">
      <div className="mx-auto grid max-w-7xl gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-raised px-5 py-5 text-sm font-medium text-secondary hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mauve"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
