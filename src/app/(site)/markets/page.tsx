import React from "react";

export default function MarketsShopPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-10 font-mono">
      
      {/* Header */}
      <header className="border-b border-border pb-8 space-y-3 text-center">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3.5 py-1 rounded-md text-xs font-semibold border border-[#C8A7E8]/30 inline-block">
          MARKET DOSSIERS &amp; RESEARCH
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#F3EBDD]">
          Chronoverse <span className="text-[#C8A7E8]">Shop</span>
        </h1>
        <p className="text-[#CFC5B8] text-sm font-sans max-w-2xl mx-auto">
          Tactical field reports, economic case studies, and single-purchase wealth preservation frameworks.
        </p>
      </header>

      {/* Store Banner Callout */}
      <div className="bg-[#050506] border border-border p-8 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl">
        <div className="space-y-2 text-center md:text-left">
          <h2 className="text-2xl font-bold text-[#F3EBDD]">&gt; Individual Intelligence Dossiers</h2>
          <p className="text-xs text-[#CFC5B8] max-w-xl font-sans">
            Browse our complete catalog of specialized financial studies, historical models, and tactical asset guides processed safely through Gumroad, Inc.
          </p>
        </div>

        <a
          href="https://shop.chronoversecapital.com"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-raised hover:bg-[#C8A7E8] text-[#F3EBDD] hover:text-black font-bold px-8 py-4 rounded-xl text-xs transition-colors border border-purple-border hover:border-[#C8A7E8] whitespace-nowrap uppercase tracking-wider"
        >
          BROWSE SHOP CATALOG ➔
        </a>
      </div>

      {/* Info Notice */}
      <div className="border-t border-border pt-8 text-center text-xs text-muted">
        Merchant of Record: Gumroad, Inc. // Instant Digital Delivery Upon Order
      </div>

    </div>
  );
}