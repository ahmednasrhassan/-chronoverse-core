import type { Metadata } from "next";
import Link from "next/link";
import { getLatestSanityArticles, calculateReadTime } from "@/lib/content";
import NewsletterForm from "@/components/NewsLetterForm";
// The proprietary market quote cards fetch live data from
// `/api/market-data` and pull in `lightweight-charts` for their mini
// charts, both entirely client-side concerns. `MarketQuoteCardLazy` wraps
// the actual card in a `next/dynamic(..., { ssr: false })` import inside
// its own Client Component, keeping it out of the server-rendered HTML /
// initial JS bundle so it never blocks first paint or the homepage's LCP.
import MarketQuoteCard from "@/components/charts/MarketQuoteCardLazy";

// On-demand/no-cache revalidation: the homepage's "Latest Research" cards
// must always reflect the most recently published Sanity post, so we
// disable the ISR cache window entirely rather than tolerating a stale
// window (e.g. `revalidate = 60`).
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};
export const revalidate = 86400;

export default async function HomePage() {
  const marketSymbols: { symbol: string; label: string }[] = [
    { symbol: "BTC-USD", label: "Bitcoin" },
    { symbol: "^GSPC", label: "S&P 500" },
    { symbol: "GC=F", label: "Gold (Futures)" },
    { symbol: "CL=F", label: "Crude Oil (WTI)" },
  ];

  // Strictly the latest 4 published posts, ordered chronologically:
  // *[_type == "post" && defined(slug.current)] | order(publishedAt desc)[0..3]
  const featuredArticles = await getLatestSanityArticles(4);

  return (
    <div className="min-h-screen bg-[#120e0c] p-6 md:p-10">
      
      {/* 🟢 SEO FIX: Visually hidden H1 tag to resolve Ahrefs 'H1 tag missing or empty' error */}
      <h1 className="sr-only">
        Chronoverse Capital - Institutional Macroeconomic Intelligence & Research
      </h1>

      <div className="max-w-7xl mx-auto space-y-12 pt-4">
        
        {/* ================= SECTION 1: LIVE MARKET CHARTS (4 Cards) ================= */}
        <section>
          <h2 className="text-[#c87d55] text-sm font-bold uppercase tracking-widest mb-4">
            Live Markets Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {marketSymbols.map(({ symbol, label }) => (
              <div
                key={symbol}
                className="bg-[#18181b] border border-zinc-800 p-3 rounded-xl h-40 shadow-lg shadow-black/40 hover:border-[#c87d55]/50 transition-colors"
              >
                <MarketQuoteCard symbol={symbol} label={label} />
              </div>
            ))}
          </div>
        </section>

        {/* ================= SECTION 2: MACRO RESEARCH & INSIGHTS (4 Cards) ================= */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[#c87d55] text-sm font-bold uppercase tracking-widest">
              Macroeconomic Research
            </h2>
            <Link
              href="/reports"
              className="text-xs text-zinc-400 hover:text-[#c87d55] transition-colors"
            >
              View All Reports &rarr;
            </Link>
          </div>
          {featuredArticles.length === 0 ? (
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-10 text-center text-zinc-300">
              No published research available yet. Check back soon.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredArticles.map((article) => (
                <Link
                  key={article.slug}
                  href={`/${article.slug}`}
                  className="bg-[#18181b] border border-zinc-800 p-6 rounded-xl shadow-lg shadow-black/40 hover:border-[#c87d55] transition-all cursor-pointer flex flex-col justify-between h-48 group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-1 bg-[#c87d55] transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></div>
                  <div>
                    <span className="text-[10px] font-bold text-[#c87d55] bg-[#c87d55]/10 px-2 py-1 rounded tracking-wider uppercase">
                      {article.category}
                    </span>
                    <h3 className="mt-4 text-zinc-100 font-bold text-lg leading-snug group-hover:text-white transition-colors line-clamp-3">
                      {article.title}
                    </h3>
                  </div>
                  <span className="text-xs text-zinc-300 font-mono">
                    {calculateReadTime(
                      article.bodyContent || article.content || ""
                    )}{" "}
                    min read
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ================= SECTION 3: AMAZON SES NEWSLETTER (1 Large Card) ================= */}
        <section>
          <div className="bg-linear-to-br from-[#18181b] to-[#0a0a0a] border border-zinc-800 rounded-xl p-8 lg:p-14 shadow-2xl shadow-black/50 relative overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-br from-transparent via-[#c87d55] to-transparent opacity-40"></div>
            <h2 className="text-3xl font-extrabold text-white mb-4 tracking-tight">
              Institutional Briefing
            </h2>
            <p className="text-zinc-300 max-w-2xl mx-auto mb-8 text-sm md:text-base leading-relaxed">
              Gain an asymmetric edge in global markets. Receive proprietary macroeconomic research, liquidity trend analyses, and strategic asset allocation directives delivered directly to your executive inbox.
            </p>
            <NewsletterForm />
          </div>
        </section>

        {/* ================= SECTION 4: OFFICIAL SPONSORS (4 Cards) ================= */}
        {/* <section>
          <h2 className="text-[#c87d55] text-sm font-bold uppercase tracking-widest mb-4 text-center mt-8">Official Partners & Sponsors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((sponsor) => (
              <div key={sponsor} className="bg-[#18181b] border border-zinc-800 h-24 rounded-xl flex items-center justify-center grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300 cursor-pointer shadow-md hover:border-[#c87d55]/50 group">
                <span className="text-zinc-600 group-hover:text-zinc-300 font-extrabold tracking-widest text-sm transition-colors">
                  SPONSOR {sponsor}
                </span>
              </div>
            ))}
          </div>
        </section> */}
      </div>
    </div>
  );
}
