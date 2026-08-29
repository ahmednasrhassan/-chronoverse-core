import React from "react";

export default function PremiumVaultPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-12 font-mono">
      
      {/* Header */}
      <header className="text-center space-y-4 border-b border-border pb-8">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3.5 py-1 rounded-md text-xs font-semibold border border-[#C8A7E8]/30 inline-block">
          INSTITUTIONAL MEMBERSHIP
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#F3EBDD] tracking-tight">
          The Chronoverse <span className="text-[#C8A7E8]">Vault</span>
        </h1>
        <p className="text-[#CFC5B8] text-sm font-sans max-w-2xl mx-auto">
          Unlimited access to encrypted macro dossiers, priority liquidity signals, and custom financial models.
        </p>
      </header>

      {/* Feature Plan Card */}
      <div className="max-w-2xl mx-auto bg-[#050506] border border-[#C8A7E8] rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-[#C8A7E8] text-black font-bold text-[10px] uppercase px-3 py-1 rounded-bl-lg">
          ANNUAL CLEARANCE
        </div>

        <div className="space-y-2 border-b border-border pb-6">
          <h2 className="text-2xl font-bold text-[#F3EBDD]">&gt; Sovereign Pass</h2>
          <p className="text-xs text-[#CFC5B8]">All-Inclusive Institutional Intelligence Access</p>
        </div>

        <ul className="space-y-3 text-xs text-[#CFC5B8] font-sans">
          <li className="flex items-center gap-2">
            <span className="text-[#00cc66]">✓</span> Unlimited access to all past &amp; future research dossiers
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[#00cc66]">✓</span> Real-time liquidity alerts via Sender Network
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[#00cc66]">✓</span> Full access to V_INTEL Simulation &amp; Terminal models
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[#00cc66]">✓</span> Institutional priority support &amp; strategic briefings
          </li>
        </ul>

        <div className="pt-4 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <span className="text-xs text-[#CFC5B8] block">Secure Merchant Node:</span>
            <span className="text-sm font-bold text-[#F3EBDD]">Lemon Squeezy Vault</span>
          </div>
          <a
            href="https://vault.chronoversecapital.com"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#C8A7E8] hover:bg-[#d88d65] text-black font-bold px-8 py-3 rounded-lg text-xs transition-colors uppercase tracking-wider"
          >
            ENTER THE VAULT ➔
          </a>
        </div>
      </div>

      {/* Embedded Store Gateway */}
      <div className="bg-[#0D0D11] border border-border rounded-xl p-4 text-center space-y-3">
        <p className="text-xs text-[#CFC5B8]">
          Secured with banking-grade SSL via Lemon Squeezy Merchant Infrastructure.
        </p>
      </div>

    </div>
  );
}