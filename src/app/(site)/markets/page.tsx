import React from "react";
import Link from "next/link";

export default function MarketsShopPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-10 font-mono">
      
      {/* Header */}
      <header className="border-b border-[#27272a] pb-8 space-y-3 text-center">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3.5 py-1 rounded-md text-xs font-semibold border border-[#c87d55]/30 inline-block">
          MARKET DOSSIERS &amp; RESEARCH
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#f4f4f5]">
          ChronoVerse <span className="text-[#c87d55]">Shop</span>
        </h1>
        <p className="text-[#a1a1aa] text-sm font-sans max-w-2xl mx-auto">
          Tactical field reports, economic case studies, and single-purchase wealth preservation frameworks.
        </p>
      </header>

      {/* Store Banner Callout */}
      <div className="bg-[#0a0a0a] border border-[#27272a] p-8 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl">
        <div className="space-y-2 text-center md:text-left">
          <h2 className="text-2xl font-bold text-[#f4f4f5]">&gt; Individual Intelligence Dossiers</h2>
          <p className="text-xs text-[#a1a1aa] max-w-xl font-sans">
            Browse our complete catalog of specialized financial studies, historical models, and tactical asset guides processed safely through Gumroad, Inc.
          </p>
        </div>

        <a
          href="https://shop.chronoversecapital.com"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#27272a] hover:bg-[#c87d55] text-[#f4f4f5] hover:text-black font-bold px-8 py-4 rounded-xl text-xs transition-colors border border-[#3f3f46] hover:border-[#c87d55] whitespace-nowrap uppercase tracking-wider"
        >
          BROWSE SHOP CATALOG ➔
        </a>
      </div>

      {/* Info Notice */}
      <div className="border-t border-[#27272a] pt-8 text-center text-xs text-[#52525b]">
        Merchant of Record: Gumroad, Inc. // Instant Digital Delivery Upon Order
      </div>

    </div>
  );
}