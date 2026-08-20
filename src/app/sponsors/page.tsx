import React from "react";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sponsorship & Partnerships | Chronoverse Capital",
  description:
    "Partner with Chronoverse Capital to reach an institutional, macroeconomic, and investment-focused global audience through premium research sponsorship.",
};

export default function SponsorsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16 space-y-20">

      {/* ==================== HERO SECTION ==================== */}
      <section className="text-center space-y-6 border-b border-[#27272a] pb-14">
        <span className="inline-block bg-[#c87d55]/10 border border-[#c87d55]/40 text-[#c87d55] text-xs font-mono uppercase px-3 py-1 rounded-full">
          Sponsorship Program
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-[#f4f4f5] leading-tight max-w-3xl mx-auto">
          Partner with Chronoverse Capital
        </h1>
        <p className="text-[#a1a1aa] text-lg max-w-2xl mx-auto leading-relaxed">
          Reach an institutional-grade audience of macroeconomic strategists, portfolio managers, 
          and sophisticated individual investors who rely on Chronoverse Capital for decision-critical financial intelligence.
        </p>
        <div className="pt-4">
          <a
            href="mailto:info@chronoversecapital.com"
            className="inline-block bg-white text-black hover:bg-gray-200 font-bold px-8 py-3 rounded-md transition-colors shadow-lg"
          >
            Become a Sponsor →
          </a>
        </div>
      </section>

      {/* ==================== VALUE CARDS ==================== */}
      <section className="bg-[#000000] space-y-8 py-12 rounded-2xl">
        <h2 className="text-2xl md:text-3xl font-bold text-[#c87d55] text-center">
          Why Partner With Us
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1: Targeted Investors */}
          <div className="bg-[#000000] border border-[#c87d55]/40 rounded-xl p-7 space-y-4 hover:border-[#c87d55] transition-all">
            <div className="w-12 h-12 rounded-lg bg-[#000000] border border-[#c87d55]/40 flex items-center justify-center text-[#c87d55] text-2xl">
              🎯
            </div>
            <h3 className="text-lg font-bold text-[#c87d55]">Targeted Investors</h3>
            <p className="text-[#c87d55] text-sm leading-relaxed">
              Connect directly with an engaged readership of institutional allocators, macro
              traders, and high-net-worth individuals actively seeking asset allocation and
              market-structure insight.
            </p>
          </div>

          {/* Card 2: Premium Analysis */}
          <div className="bg-[#000000] border border-[#c87d55]/40 rounded-xl p-7 space-y-4 hover:border-[#c87d55] transition-all">
            <div className="w-12 h-12 rounded-lg bg-[#000000] border border-[#c87d55]/40 flex items-center justify-center text-[#c87d55] text-2xl">
              📊
            </div>
            <h3 className="text-lg font-bold text-[#c87d55]">Premium Analysis</h3>
            <p className="text-[#c87d55] text-sm leading-relaxed">
              Your brand is positioned alongside rigorous, historically-grounded macroeconomic
              research — reinforcing credibility and trust with a discerning financial audience.
            </p>
          </div>

          {/* Card 3: High-Performance Platform */}
          <div className="bg-[#000000] border border-[#c87d55]/40 rounded-xl p-7 space-y-4 hover:border-[#c87d55] transition-all">
            <div className="w-12 h-12 rounded-lg bg-[#000000] border border-[#c87d55]/40 flex items-center justify-center text-[#c87d55] text-2xl">
              ⚡
            </div>
            <h3 className="text-lg font-bold text-[#c87d55]">High-Performance Platform</h3>
            <p className="text-[#c87d55] text-sm leading-relaxed">
              Built on a modern, fast, SEO-optimized publishing stack with strong organic reach —
              ensuring maximum visibility and durability for every sponsorship placement.
            </p>
          </div>

        </div>
      </section>

      {/* ==================== SPONSORSHIP CTA / FORM SECTION ==================== */}
      <section className="bg-[#0a0a0a] border border-[#c87d55]/40 rounded-2xl p-8 md:p-12 text-center space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#c87d55]">
          Start a Sponsorship Inquiry
        </h2>
        <p className="text-[#a1a1aa] text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
          Tell us about your organization and sponsorship goals. Our team will follow up with 
          available placements, audience metrics, and pricing tailored to your objectives.
        </p>
        
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 max-w-md mx-auto space-y-2">
          <span className="text-xs uppercase font-mono font-bold text-[#a1a1aa] tracking-widest block">
            Sponsorship Inquiries
          </span>
          <a
            href="mailto:info@chronoversecapital.com"
            className="text-[#c87d55] font-mono text-lg font-semibold hover:underline block break-all"
          >
            info@chronoversecapital.com
          </a>
        </div>

        <a
          href="mailto:info@chronoversecapital.com"
          className="inline-block bg-white text-black hover:bg-gray-200 font-bold px-8 py-3 rounded-md transition-colors shadow-lg"
        >
          Email Our Partnerships Team →
        </a>
      </section>

      {/* Footer Return Link */}
      <footer className="border-t border-[#27272a] pt-8 text-center text-xs font-mono">
        <Link href="/" className="text-[#a1a1aa] hover:text-[#c87d55] transition-colors underline">
          ← Return to Home
        </Link>
      </footer>

    </div>
  );
}