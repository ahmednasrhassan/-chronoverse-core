import React from "react";
import Link from "next/link";
import { Metadata } from "next";

// Prevent search engine bots from indexing this affiliate/sponsor page to preserve SEO crawl budget
export const metadata: Metadata = {
  title: "Sponsors & Strategic Partners | Chronoverse Capital",
  description: "Official strategic partners and execution platforms for Chronoverse Capital.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function SponsorsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">
      
      {/* ==================== PARTNER 1: AFRIKDP ==================== */}
      <section className="space-y-10 border-b border-[#27272a] pb-16">
        
        {/* Hero Header */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 border-b border-[#27272a] pb-8">
          {/* Partner Logo Box */}
          <div className="w-28 h-28 bg-[#18181b] border border-[#27272a] rounded-2xl flex items-center justify-center font-black text-2xl text-[#c87d55] font-extrabold shadow-inner">
            AfriKDP
          </div>

          {/* Hero Content */}
          <div className="space-y-2 text-center md:text-left">
            <span className="inline-block bg-[#00b85c]/10 border border-[#00b85c] text-[#00b85c] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              ● Strategic Partner
            </span>
            <h1 className="text-4xl font-bold text-[#f4f4f5]">AfriKDP</h1>
            <p className="text-[#a1a1aa] text-lg font-medium">
              Global Self-Publishing &amp; Freelance Marketplace 
            </p>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          
          {/* Left Column: Main Content */}
          <div className="lg:col-span-2 space-y-10">
            
            {/* About Section */}
            <section className="space-y-4">
              <h1 className="text-2xl font-bold text-[#f4f4f5] border-l-4 border-[#c87d55] pl-4">
                About AfriKDP
              </h1>
              <p className="text-[#a1a1aa] text-base leading-relaxed">
                AfriKDP is a creator-focused platform designed to empower authors, freelancers, entrepreneurs, and digital creators. Users can publish books, sell digital products, offer professional services, connect with clients, and access AI-powered solutions from a single platform. Our mission is to remove barriers to growth by providing technology, visibility, and opportunities through publishing, freelancing, strategic partnerships, and digital innovation. As our community continues to expand internationally, we remain committed to helping creators build sustainable businesses and reach a global audience.
              </p>
            </section>

            {/* What They Offer */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-[#f4f4f5] border-l-4 border-[#c87d55] pl-4">
                What They Offer
              </h2>
              <div className="space-y-3">
                {[
                  "Global Digital Self-Publishing Infrastructure",
                  "Freelance Marketplace for Digital Builders",
                  "AI-Powered Solutions & Digital Innovation",
                  "Comprehensive Digital Books and Asset Distribution",
                ].map((item, index) => (
                  <div 
                    key={index} 
                    className="bg-[#18181b] border border-[#27272a] p-4 rounded-lg text-sm font-semibold text-[#f4f4f5] flex items-center gap-3 hover:border-[#c87d55]/40 transition-all"
                  >
                    <span className="text-[#c87d55] text-lg">●</span>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            {/* Partnership Highlights */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-[#f4f4f5] border-l-4 border-[#c87d55] pl-4">
                Partnership Highlights
              </h2>
              <div className="space-y-3">
                {[
                  "Strategic Partnership",
                  "Cross Promotion & Ecosystem Growth",
                  "Financial Literacy for Creators",
                  "Educational Collaboration",
                  "Long-Term Builder Alliance",
                ].map((item, index) => (
                  <div 
                    key={index} 
                    className="bg-[#18181b] border border-[#27272a] p-4 rounded-lg text-sm font-semibold text-[#f4f4f5] flex items-center gap-3 hover:border-[#c87d55]/40 transition-all"
                  >
                    <span className="text-[#00b85c] font-bold text-base">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            {/* Why We Partnered */}
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-[#f4f4f5] border-l-4 border-[#c87d55] pl-4">
                Why We Partnered
              </h2>
              <div className="bg-[#18181b] border-l-4 border-l-[#c87d55] border border-[#27272a] p-6 rounded-r-xl italic text-[#a1a1aa] leading-relaxed text-base">
                &quot;Chronoverse Capital shares AfriKDP&apos;s vision of empowering creators and entrepreneurs. This strategic alliance bridges the gap between digital content creation and institutional-grade financial intelligence. By joining forces, we aim to provide global digital builders with both the infrastructure to scale and the macroeconomic insights needed to protect and grow their wealth.&quot;
              </div>
            </section>

          </div>

          {/* Right Column: Sidebar */}
          <div className="space-y-6 lg:sticky lg:top-6">
            
            <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-6">
              
              {/* Quick Links */}
              <div className="border-b border-[#27272a] pb-4 space-y-2">
                <span className="text-xs uppercase font-mono font-bold text-[#a1a1aa] tracking-widest block">
                  Quick Links
                </span>
                <div className="space-y-1">
                  <a href="https://afrikdp.com" target="_blank" rel="nofollow sponsored noopener" className="block text-[#c87d55] font-semibold text-sm hover:underline">
                    🌐 Official Website
                  </a>
                  <a href="https://afrikdp.com/explore.html" target="_blank" rel="nofollow sponsored noopener" className="block text-[#c87d55] font-semibold text-sm hover:underline">
                    📚 Explore Books
                  </a>
                  <a href="https://afrikdp.com/freelancers.html" target="_blank" rel="nofollow sponsored noopener" className="block text-[#c87d55] font-semibold text-sm hover:underline">
                    💼 Freelancer Marketplace
                  </a>
                  <a href="https://afrikdp.com/partners.html" target="_blank" rel="nofollow sponsored noopener" className="block text-[#c87d55] font-semibold text-sm hover:underline">
                    🤝 Trusted Partners
                  </a>
                </div>
              </div>

              {/* Partner Since */}
              <div className="border-b border-[#27272a] pb-4 space-y-1">
                <span className="text-xs uppercase font-mono font-bold text-[#a1a1aa] tracking-widest block">
                  Partner Since
                </span>
                <span className="text-sm font-semibold text-[#f4f4f5]">July 2026</span>
              </div>

              {/* Partnership Type */}
              <div className="border-b border-[#27272a] pb-4 space-y-1">
                <span className="text-xs uppercase font-mono font-bold text-[#a1a1aa] tracking-widest block">
                  Partnership Type
                </span>
                <span className="text-sm font-semibold text-[#f4f4f5] flex items-center gap-2">
                  <span className="text-[#00b85c]">●</span> Strategic Partner
                </span>
              </div>

              {/* Industry */}
              <div className="border-b border-[#27272a] pb-4 space-y-1">
                <span className="text-xs uppercase font-mono font-bold text-[#a1a1aa] tracking-widest block">
                  Industry
                </span>
                <span className="text-sm font-semibold text-[#f4f4f5]">Creator Economy &amp; Publishing Tech</span>
              </div>

              {/* Audience Tags */}
              <div className="border-b border-[#27272a] pb-4 space-y-2">
                <span className="text-xs uppercase font-mono font-bold text-[#a1a1aa] tracking-widest block">
                  Audience
                </span>
                <div className="flex flex-wrap gap-2">
                  {["Authors", "Creators", "Entrepreneurs", "Freelancers", "Publishers", "Digital Builders"].map((tag, idx) => (
                    <span key={idx} className="bg-[#27272a] text-[#f4f4f5] px-2.5 py-1 rounded-full text-xs font-semibold">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <span className="text-xs uppercase font-mono font-bold text-[#a1a1aa] tracking-widest block">
                  Status
                </span>
                <span className="text-sm font-semibold text-[#f4f4f5] flex items-center gap-2">
                  <span className="text-[#00b85c]">●</span> Active Partner
                </span>
              </div>

            </div>

            {/* CTA Box */}
            <div className="bg-[#0a0a0a] border border-[#c87d55] rounded-xl p-6 text-center space-y-4">
              <h3 className="text-xl font-bold text-[#f4f4f5]">Explore AfriKDP</h3>
              <p className="text-[#a1a1aa] text-xs leading-relaxed">
                Visit their official platform to publish, sell, or hire top digital freelancers globally.
              </p>
              <a 
                href="https://afrikdp.com" 
                target="_blank" 
                rel="nofollow sponsored noopener"
                className="block bg-[#c87d55] hover:bg-[#d88d65] text-black font-bold py-3 rounded-lg transition-colors text-sm shadow-md"
              >
                Visit Official Website →
              </a>
            </div>

          </div>

        </div>
      </section>


      {/* ==================== PARTNER 2: XM GLOBAL MARKETS ==================== */}
      <section className="space-y-8 font-mono">
        <div className="border-b border-[#27272a] pb-6 space-y-2 text-center md:text-left">
          <span className="bg-[#c87d55]/15 text-[#c87d55] px-3.5 py-1 rounded-md text-xs font-semibold border border-[#c87d55]/30 inline-block">
            EXECUTION PARTNER
          </span>
          <h2 className="text-3xl font-extrabold text-[#f4f4f5]">
            XM Global <span className="text-[#c87d55]">Markets</span>
          </h2>
          <p className="text-xs text-[#a1a1aa] font-sans">
            Primary partner platform for macro asset execution, arbitrage tracking, and order placement.
          </p>
        </div>

        <div className="bg-[#0a0a0a] border border-[#c87d55] rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-[#f4f4f5]">&gt; Primary Brokerage Infrastructure</h3>
            <p className="text-xs text-[#a1a1aa] font-sans leading-relaxed">
              Chronoverse Capital utilizes XM Global infrastructure for identifying market arbitrage gaps and executing real-time liquidity strategies.
            </p>
          </div>

          <ul className="space-y-2 text-xs text-[#a1a1aa] font-sans border-t border-b border-[#27272a] py-4">
            <li className="flex items-center gap-2">
              <span className="text-[#00cc66]">✓</span> High-speed market order execution &amp; tight spreads
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[#00cc66]">✓</span> Comprehensive multi-asset liquidity access
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[#00cc66]">✓</span> Regulated global trading environment
            </li>
          </ul>

          <div className="pt-2 text-center md:text-left">
            <a
              href="https://affs.click/mlyV5"
              target="_blank"
              rel="nofollow sponsored noopener"
              className="inline-block bg-[#c87d55] hover:bg-[#d88d65] text-black font-bold px-8 py-3.5 rounded-xl text-xs transition-colors uppercase tracking-wider shadow-md"
            >
              START EXECUTION ON XM ➔
            </a>
          </div>
        </div>

        {/* Compliance Notice */}
        <div className="bg-[#18181b] border border-[#27272a] p-5 rounded-xl text-[11px] text-[#a1a1aa] font-sans leading-relaxed space-y-1">
          <strong className="text-[#f4f4f5] block font-mono uppercase text-xs">
            ⚖️ Strategic Affiliate &amp; Risk Disclosure:
          </strong>
          <p>
            Chronoverse Capital is a research platform and does not manage client funds. Links on this page include partner links which support our analytical operations at no additional cost to your capital.
          </p>
        </div>
      </section>

      {/* Footer Return Link */}
      <footer className="border-t border-[#27272a] pt-8 text-center text-xs font-mono">
        <Link href="/products" className="text-[#a1a1aa] hover:text-[#c87d55] transition-colors underline">
          ← Return to The Arsenal
        </Link>
      </footer>

    </div>
  );
}