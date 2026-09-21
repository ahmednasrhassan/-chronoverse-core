import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import NewsletterForm from "@/components/NewsLetterForm";
import FreeMarketSurface, {
  MarketIntelligenceBoard,
} from "@/components/home/FreeMarketSurface";
import { siteConfig } from "@/config/siteConfig";
import {
  calculateReadTime,
  getLatestSanityArticles,
  type ContentItem,
} from "@/lib/content";
import type { FiveProductFreeLiteProjectionMapV1 } from
  "@/lib/markets/services/canonicalProductResults";
import { getFiveProductFreeLiteProjectionMapV1 } from
  "@/lib/markets/services/canonicalProductResults";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Free Market Intelligence",
  description:
    "Free Lite market intelligence for EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR.",
  pathname: "/",
});

const PRIMARY_CTA_CLASS =
  "chronoverse-primary-cta inline-flex items-center justify-center border border-[#A77BD8] px-5 py-3 text-sm font-semibold transition-colors hover:border-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]";

const SECONDARY_CTA_CLASS =
  "inline-flex items-center justify-center border border-[#6F4C91] bg-transparent px-5 py-3 text-sm font-semibold text-[#F3EBDD] transition-colors hover:border-[#C8A7E8] hover:bg-[#15131A] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]";

const EDITORIAL_HEADING_CLASS =
  "text-[#F3EBDD] [font-family:Georgia,'Times_New_Roman',serif]";

export default async function HomePage() {
  const projections = await getFiveProductFreeLiteProjectionMapV1();

  return (
    <div className="bg-[#050506] text-[#F3EBDD]">
      <FreeMarketExperience projections={projections} />

      <VipConversion />

      <Suspense fallback={<ResearchFallback />}>
        <LatestResearch />
      </Suspense>

      <MembershipAndResearch />
      <Newsletter />
      <TrustStrip />
    </div>
  );
}

function FreeMarketExperience({
  projections,
}: {
  projections: FiveProductFreeLiteProjectionMapV1;
}) {
  return (
    <>
      <Hero projections={projections} />
      <FreeMarketSurface projections={projections} />
    </>
  );
}

function Hero({
  projections,
}: {
  projections: FiveProductFreeLiteProjectionMapV1;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-[#6F4C91]/35 bg-[#050506]">
      <div
        aria-hidden="true"
        className="absolute -right-32 -top-48 h-[36rem] w-[36rem] rounded-full bg-[#6F4C91]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(111,76,145,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(111,76,145,0.1)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_right,transparent,black_70%)]"
      />

      <div className="relative mx-auto grid max-w-[88rem] gap-12 px-4 py-14 sm:px-6 sm:py-16 lg:px-8 xl:grid-cols-[minmax(0,1.48fr)_minmax(23rem,0.82fr)] xl:items-center xl:gap-0 xl:py-20">
        <div className="max-w-3xl xl:pr-16">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-px w-8 bg-[#C8A7E8]" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.26em] text-[#C8A7E8]">
              Free Market Intelligence
            </p>
          </div>
          <h1 className={`mt-7 max-w-[12ch] text-[clamp(2.85rem,5.5vw,4.75rem)] leading-[0.95] tracking-[-0.04em] ${EDITORIAL_HEADING_CLASS}`}>
            Five markets. One intelligence system.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-8 text-[#CFC5B8] sm:text-lg">
            A precise public reading of Europe&apos;s core currency complex and
            benchmark short-term rate. Free Lite establishes what is happening;
            VIP develops the deeper intelligence around it.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/markets" className={PRIMARY_CTA_CLASS}>
              Explore Markets
              <span aria-hidden="true" className="ml-3">→</span>
            </Link>
            <Link href="/pricing" className={SECONDARY_CTA_CLASS}>
              See the VIP Difference
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[10px] uppercase tracking-[0.13em] text-[#91889A]">
            <span>Five canonical products</span>
            <span>Server-assembled</span>
            <span>Source-dated</span>
          </div>
        </div>

        <MarketIntelligenceBoard projections={projections} />
      </div>
    </section>
  );
}

function VipConversion() {
  const vipCapabilities = [
    "Regime",
    "Macro",
    "Cross-market",
    "Scenarios",
    "Conviction",
    "Invalidation",
    "Historical context",
    "Proprietary intelligence",
  ] as const;

  return (
    <section className="relative overflow-hidden bg-[#15131A]">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px bg-linear-to-b from-transparent via-[#6F4C91]/50 to-transparent"
      />
      <div className="relative mx-auto grid max-w-[88rem] gap-12 px-4 py-16 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:gap-24 xl:py-24">
        <div className="self-center">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[#C8A7E8]">
            The deeper layer
          </p>
          <h2 className={`mt-5 max-w-[12ch] text-4xl leading-[1.05] sm:text-5xl ${EDITORIAL_HEADING_CLASS}`}>
            Same five markets. A deeper intelligence layer.
          </h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#CFC5B8]">
            Free tells you what is happening. VIP helps explain why, how
            strongly, what could happen next, and what breaks the thesis.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/pricing" className={PRIMARY_CTA_CLASS}>
              Explore VIP
              <span aria-hidden="true" className="ml-3">→</span>
            </Link>
            <Link href="/pricing" className={SECONDARY_CTA_CLASS}>
              Compare Free and VIP
            </Link>
          </div>
        </div>

        <div className="py-2">
          <div className="flex items-center justify-between pb-5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#91889A]">
            <span>VIP depth map</span>
            <span>Conceptual layers</span>
          </div>
          <ol className="space-y-2">
            {vipCapabilities.map((capability, index) => (
              <li
                key={capability}
                className={`flex items-center gap-4 border-l border-[#6F4C91]/60 bg-[#0D0D11]/55 px-5 py-3.5 ${
                  index % 4 === 1
                    ? "sm:ml-5"
                    : index % 4 === 2
                      ? "sm:ml-10"
                      : index % 4 === 3
                        ? "sm:ml-16"
                        : ""
                }`}
              >
                <span className="font-mono text-[10px] text-[#91889A]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium text-[#F3EBDD]">
                  {capability}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

async function LatestResearch() {
  const articles = await getLatestSanityArticles(3);
  const [featuredArticle, ...secondaryArticles] = articles;

  return (
    <section
      aria-labelledby="latest-research-title"
      className="bg-[#050506]"
    >
      <div className="mx-auto max-w-[86rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex flex-col gap-5 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[#C8A7E8]">
              Research desk
            </p>
            <h2
              id="latest-research-title"
              className={`mt-3 text-4xl sm:text-5xl ${EDITORIAL_HEADING_CLASS}`}
            >
              Latest research
            </h2>
          </div>
          <Link
            href="/reports"
            className="w-fit border-b border-[#6F4C91] pb-1 text-sm font-semibold text-[#C8A7E8] hover:border-[#C8A7E8] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            View all research →
          </Link>
        </div>

        {!featuredArticle ? (
          <div className="mt-8 border border-[#6F4C91]/35 bg-[#0D0D11] p-8 text-sm text-[#CFC5B8]">
            No published research is available right now.
          </div>
        ) : (
          <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
            <FeaturedArticle article={featuredArticle} />
            <div className="divide-y divide-[#6F4C91]/30">
              {secondaryArticles.map((article, index) => (
                <SecondaryArticle
                  key={article.slug}
                  article={article}
                  index={index + 2}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function FeaturedArticle({ article }: { article: ContentItem }) {
  return (
    <article className="group grid min-w-0 gap-0 bg-[#0D0D11] sm:grid-cols-[minmax(0,1.1fr)_minmax(17rem,0.9fr)]">
      <EditorialImage article={article} featured />
      <div className="flex flex-col justify-between p-6 sm:p-8">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#C8A7E8]">
            Featured · {article.category}
          </p>
          <h3 className={`mt-5 text-3xl leading-tight ${EDITORIAL_HEADING_CLASS}`}>
            <Link
              href={`/${article.slug}`}
              className="text-[#F3EBDD] hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
            >
              {article.title}
            </Link>
          </h3>
          {article.seoDescription ? (
            <p className="mt-5 line-clamp-4 text-sm leading-6 text-[#CFC5B8]">
              {article.seoDescription}
            </p>
          ) : null}
        </div>
        <ArticleMeta article={article} className="mt-8" />
      </div>
    </article>
  );
}

function SecondaryArticle({
  article,
  index,
}: {
  article: ContentItem;
  index: number;
}) {
  return (
    <article className="grid gap-5 py-6 first:pt-0 last:pb-0 sm:grid-cols-[7.5rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)] lg:py-8 xl:grid-cols-[8.5rem_minmax(0,1fr)]">
      <EditorialImage article={article} />
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#91889A]">
          0{index} · {article.category}
        </p>
        <h3 className={`mt-3 text-xl leading-snug ${EDITORIAL_HEADING_CLASS}`}>
          <Link
            href={`/${article.slug}`}
            className="text-[#F3EBDD] hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            {article.title}
          </Link>
        </h3>
        {article.seoDescription ? (
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#91889A]">
            {article.seoDescription}
          </p>
        ) : null}
        <ArticleMeta article={article} className="mt-4" />
      </div>
    </article>
  );
}

function EditorialImage({
  article,
  featured = false,
}: {
  article: ContentItem;
  featured?: boolean;
}) {
  const imageUrl = article.cardImageUrl || article.imageUrl;
  const imageSrc = article.cardImageUrl
    ? getResearchImageRelayUrl(article.cardImageUrl)
    : imageUrl;
  const secondaryImageSrc = !featured && article.secondaryCardImageUrl
    ? getResearchImageRelayUrl(article.secondaryCardImageUrl)
    : undefined;
  const visualClass = featured
    ? "relative aspect-[16/10] overflow-hidden sm:aspect-auto"
    : "relative aspect-[4/3] overflow-hidden bg-[#15131A]";

  return (
    <div className={`${visualClass} bg-[#15131A]`}>
      {imageSrc ? (
        <picture>
          {secondaryImageSrc ? (
            <source media="(min-width: 640px)" srcSet={secondaryImageSrc} />
          ) : null}
          <Image
            src={imageSrc}
            alt={article.imageAlt || ""}
            fill
            sizes={featured
              ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 36vw"
              : "(max-width: 639px) 100vw, 136px"}
            className="object-cover opacity-75 grayscale-[20%]"
            loading="lazy"
            decoding="async"
          />
        </picture>
      ) : (
        <div
          aria-label="Editorial image unavailable"
          className="absolute inset-0 [background-image:linear-gradient(135deg,rgba(111,76,145,0.42),rgba(13,13,17,0.35)_45%,rgba(5,5,6,0.95))]"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-[#050506]/90 via-transparent to-transparent"
      />
    </div>
  );
}

function getResearchImageRelayUrl(url: string): string {
  return `/api/research-image?url=${encodeURIComponent(url)}`;
}

function ArticleMeta({
  article,
  className,
}: {
  article: ContentItem;
  className: string;
}) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#91889A] ${className}`}>
      <time dateTime={article.date}>{article.date}</time>
      <span aria-hidden="true">·</span>
      <span>
        {calculateReadTime(article.bodyContent || article.content || "")} min read
      </span>
    </div>
  );
}

function ResearchFallback() {
  return (
    <section
      aria-label="Loading research"
      className="mx-auto max-w-[86rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#91889A]">
        Loading published research…
      </p>
    </section>
  );
}

function MembershipAndResearch() {
  return (
    <section className="bg-[#0D0D11]">
      <div className="mx-auto max-w-[84rem] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-end">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[#C8A7E8]">
              Membership &amp; Research
            </p>
            <h2 className={`mt-4 text-4xl leading-tight ${EDITORIAL_HEADING_CLASS}`}>
              Two ways to go further.
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-[#CFC5B8] lg:justify-self-end lg:text-right">
            Choose ongoing five-market intelligence or standalone research.
            Each has a distinct role and access model.
          </p>
        </div>

        <div className="mt-10 grid gap-4 xl:grid-cols-2 xl:gap-0">
          <ServiceCard
            index="01"
            eyebrow="Recurring intelligence membership"
            title="Chronoverse VIP"
            description="The Deep Intelligence layer for the same five-market universe, designed for ongoing analytical context and decision support."
            href="/pricing"
            cta="Explore VIP"
          />
          <ServiceCard
            index="02"
            eyebrow="Standalone premium research"
            title="Premium Dossiers"
            description="Focused research products for readers who need a discrete institutional brief without application membership authority."
            href={siteConfig.commerce.gumroadResearchUrl}
            cta="Browse Dossiers"
            external
          />
        </div>
      </div>
    </section>
  );
}

function ServiceCard({
  index,
  eyebrow,
  title,
  description,
  href,
  cta,
  external = false,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  external?: boolean;
}) {
  const content = (
    <>
      {cta}
      <span aria-hidden="true" className="ml-3">→</span>
    </>
  );

  return (
    <article className="relative min-h-72 bg-[#050506] p-6 sm:p-9 xl:first:mr-2 xl:last:ml-2 xl:last:bg-[#15131A]">
      <span className="font-mono text-xs text-[#91889A]">{index}</span>
      <p className="mt-8 font-mono text-[9px] uppercase tracking-[0.18em] text-[#91889A]">
        {eyebrow}
      </p>
      <h3 className={`mt-3 text-3xl ${EDITORIAL_HEADING_CLASS}`}>{title}</h3>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[#CFC5B8]">{description}</p>
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center border-b border-[#6F4C91] pb-1 text-sm font-semibold text-[#C8A7E8] hover:border-[#C8A7E8] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
        >
          {content}
        </a>
      ) : (
        <Link
          href={href}
          className="mt-8 inline-flex items-center border-b border-[#6F4C91] pb-1 text-sm font-semibold text-[#C8A7E8] hover:border-[#C8A7E8] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
        >
          {content}
        </Link>
      )}
    </article>
  );
}

function Newsletter() {
  return (
    <section
      aria-labelledby="newsletter-title"
      className="relative overflow-hidden bg-[#15131A]"
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(135deg,transparent,rgba(111,76,145,0.16))]"
      />
      <div className="relative mx-auto max-w-[80rem] px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 xl:grid-cols-[minmax(0,0.82fr)_minmax(22rem,1.18fr)] xl:items-center xl:gap-20">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[#C8A7E8]">
              Chronoverse Dispatch
            </p>
            <h2
              id="newsletter-title"
              className={`mt-4 text-4xl leading-tight sm:text-5xl ${EDITORIAL_HEADING_CLASS}`}
            >
              Published research in your inbox.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-[#CFC5B8]">
              New market research and analytical updates, delivered through
              the existing Chronoverse dispatch service.
            </p>
          </div>
          <NewsletterForm />
        </div>
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
    <section
      aria-label="Institutional disclosures"
      className="bg-[#0D0D11]"
    >
      <div className="mx-auto grid max-w-[88rem] gap-x-8 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {links.map((link, index) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-center justify-between gap-4 py-3 text-xs font-medium text-[#CFC5B8] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
          >
            <span>
              <span className="mr-3 font-mono text-[9px] text-[#91889A]">
                0{index + 1}
              </span>
              {link.label}
            </span>
            <span aria-hidden="true" className="text-[#91889A] group-hover:text-[#C8A7E8]">↗</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
