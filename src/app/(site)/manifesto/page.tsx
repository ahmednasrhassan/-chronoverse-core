import React from "react";
import Link from "next/link";

export default function ManifestoPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-mono">
      
      {/* Header Badge */}
      <header className="text-center space-y-3 border-b border-border pb-8">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3.5 py-1 rounded-md text-xs font-semibold border border-[#C8A7E8]/30 inline-block">
          CORE DIRECTIVE
        </span>
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#F3EBDD] tracking-tight">
          The Chronoverse <span className="text-[#C8A7E8]">Manifesto</span>
        </h1>
        <p className="text-[#00cc66] text-xs font-bold">
          Document Clearance: Public // Status: Active
        </p>
      </header>

      {/* Manifesto Core Content */}
      <div className="bg-[#050506] border border-[#C8A7E8] p-8 md:p-12 rounded-2xl space-y-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#C8A7E8] to-transparent opacity-60"></div>

        <div className="space-y-8 text-sm md:text-base text-[#CFC5B8] leading-relaxed">
          
          <div className="space-y-2 border-b border-border/60 pb-6">
            <h2 className="text-[#C8A7E8] font-bold text-lg uppercase tracking-wider">
              01. THE FIAT ILLUSION
            </h2>
            <p className="text-[#F3EBDD]">
              We do not measure wealth in fiat currency. Fiat is not money; it is a control mechanism designed to extract purchasing power from the productive class to fund systemic debt. Relying on traditional ROI metrics while your base currency is mathematically programmed to debase is a guaranteed path to serfdom.
            </p>
          </div>

          <div className="space-y-2 border-b border-border/60 pb-6">
            <h2 className="text-[#C8A7E8] font-bold text-lg uppercase tracking-wider">
              02. SOVEREIGNTY OVER YIELD
            </h2>
            <p className="text-[#F3EBDD]">
              If you need permission to hold an asset, you do not own it. We prioritize &quot;Sovereignty&quot; (censorship resistance, self-custody, and verifiable scarcity) over paper yields. Assets with a low Sovereignty Score are merely systemic liabilities acting as exit liquidity for central planners.
            </p>
          </div>

          <div className="space-y-2 border-b border-border/60 pb-6">
            <h2 className="text-[#C8A7E8] font-bold text-lg uppercase tracking-wider">
              03. HISTORICAL REVERSE-ENGINEERING
            </h2>
            <p className="text-[#F3EBDD]">
              History is a ledger of human behavior. We do not try to predict the future. Instead, we reverse-engineer past economic collapses, liquidity traps, and sovereign rug-pulls to identify the active algorithms executing in today&apos;s markets.
            </p>
          </div>

          <div className="space-y-2 pb-2">
            <h2 className="text-[#C8A7E8] font-bold text-lg uppercase tracking-wider">
              04. THE MISSION
            </h2>
            <p className="text-[#F3EBDD]">
              Chronoverse Capital is not a news outlet. It is an Intelligence Hub. Our objective is to arm individuals with the historical context and quantitative tools necessary to survive the coming monetary reset. We build the fortresses; you hold the keys.
            </p>
          </div>

        </div>

        <div className="border-t border-border pt-8 text-center space-y-2">
          <h3 className="text-[#C8A7E8] font-extrabold text-2xl tracking-widest">&gt;_ STAY SOVEREIGN.</h3>
          <p className="text-[#CFC5B8] text-xs italic">
            {"// Chronoverse Intelligence Network | Established 2026 //"}
          </p>
        </div>
      </div>

      {/* CTA Bottom Link */}
      <div className="text-center pt-4">
        <Link 
          href="/about" 
          className="text-xs text-[#CFC5B8] hover:text-[#C8A7E8] transition-colors underline"
        >
          ← Return to About Chronoverse
        </Link>
      </div>

    </div>
  );
}