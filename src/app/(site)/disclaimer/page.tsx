import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function DisclaimerPage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-border pb-8 space-y-3">
        <span className="bg-red-500/15 text-red-400 px-3 py-1 rounded-md text-xs font-mono font-semibold border border-red-500/30 inline-block">
          CRITICAL RISK NOTICE
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">Legal Disclaimer &amp; Risk Disclosure</h1>
        <p className="text-[#CFC5B8] text-xs font-mono">
          Effective Date: January 2026
        </p>
      </header>

      {/* Critical Notice Callout */}
      <div className="bg-red-950/20 border-l-4 border-l-red-500 border border-red-500/30 p-6 rounded-r-xl space-y-2">
        <h2 className="text-red-400 font-bold font-mono text-sm tracking-wider uppercase">
          ⚠️ CRITICAL NOTICE: NOT FINANCIAL ADVICE
        </h2>
        <p className="text-[#CFC5B8] text-sm leading-relaxed">
          Chronoverse Capital is an educational and research-oriented platform. We are <strong className="text-[#F3EBDD]">NOT</strong> registered investment advisors, brokers, or fiduciaries. The content provided herein is for informational and historical analysis purposes only.
        </p>
      </div>

      {/* Main Sections */}
      <div className="space-y-8 text-[#CFC5B8] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">1. General Liability Waiver</h2>
          <p>
            By accessing this website and its associated reports (Dossiers), you acknowledge that <strong className="text-[#F3EBDD]">Chronoverse Capital</strong> assumes no responsibility for any financial losses or damages resulting from the use of our content. Markets are inherently risky. You agree that any investment decisions you make are your sole responsibility.
          </p>
        </section>

        {/* Section 2 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">2. The &quot;Narrative Modeling&quot; Protocol</h2>
          <p>
            A significant portion of our content involves <strong className="text-[#F3EBDD]">Theoretical Economic Modeling</strong> and Alternate History scenarios.
          </p>
          <div className="bg-[#050506] border-l-4 border-l-[#C8A7E8] p-4 rounded-r-lg text-xs font-mono space-y-1">
            <strong className="text-[#C8A7E8] block">⚖️ SIMULATION CLAUSE:</strong>
            <p className="text-[#CFC5B8]">
              Charts, data visualizations, and outcomes labeled as &quot;Simulation&quot; or &quot;Hypothetical&quot; are analytical representations for research purposes. They do not reflect guaranteed future performance.
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">3. Digital Infrastructure Disclosure</h2>
          <p>
            All products and intelligence communications are dispatched through our authorized secure nodes:
          </p>
          <div className="bg-[#050506] border border-border p-4 rounded-lg text-xs space-y-2">
            <p className="text-[#F3EBDD] font-mono font-semibold">🔗 Authorized Access Points:</p>
            <p className="text-[#CFC5B8]">
              Main nodes include <strong className="text-[#C8A7E8]">shop.chronoversecapital.com</strong>, <strong className="text-[#C8A7E8]">vault.chronoversecapital.com</strong>, and <strong className="text-[#C8A7E8]">intel.chronoversecapital.com</strong>.
            </p>
            <p className="text-[#CFC5B8] border-t border-border pt-2">
              <strong className="text-[#F3EBDD]">Refund Policy:</strong> Due to the immediate delivery and intangible nature of digital research dossiers, all sales are final.
            </p>
          </div>
        </section>

        {/* Section 4 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">4. Affiliate Disclosure (FTC Compliance)</h2>
          <p>
            In compliance with FTC guidelines, Chronoverse Capital utilizes select partner links (e.g., <strong className="text-[#F3EBDD]">Agility Writer, XM Global</strong>). Clicking these links may result in a commission that supports our infrastructure at <strong className="text-[#C8A7E8]">no additional cost to you</strong>.
          </p>
        </section>

      </div>


      {/* Confirmation & Terminal Access Box */}
      <div className="bg-[#050506] border border-[#C8A7E8] p-6 rounded-xl text-center space-y-3 font-mono">
        <span className="text-xs text-[#C8A7E8] font-bold tracking-widest block">&gt; SECURITY CLEARANCE REQUIRED</span>
        <p className="text-[#CFC5B8] text-[11px] max-w-lg mx-auto">
          BY PROCEEDING, YOU ACKNOWLEDGE AND ACCEPT THE SYSTEMIC RISKS DISCLOSED ABOVE.
        </p>
        <div className="pt-2">
          <Link
            href="/intelligence"
            className="inline-block bg-[#C8A7E8] hover:bg-[#d88d65] text-black font-bold px-6 py-2.5 rounded-md text-xs transition-colors shadow-md"
          >
            [ CONFIRM &amp; ACCESS TERMINAL ] ➔
          </Link>
        </div>
      </div>

      {/* Compliance Hub Nav */}
      <section className="border-t border-border pt-8 text-center space-y-4">
        <h3 className="text-xs font-mono font-bold text-[#C8A7E8] tracking-wider uppercase">
          ⚖️ Administrative Compliance Hub
        </h3>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[#CFC5B8] font-medium">
          <Link href="/about" className="hover:text-[#F3EBDD] transition-colors">About Us</Link>
          <span>|</span>
          <Link href="/contact" className="hover:text-[#F3EBDD] transition-colors">Contact Us</Link>
          <span>|</span>
          <Link href="/privacy-policy" className="hover:text-[#F3EBDD] transition-colors">Privacy Policy</Link>
          <span>|</span>
          <Link href="/terms-of-service" className="hover:text-[#F3EBDD] transition-colors">Terms of Service</Link>
          <span>|</span>
          <Link href="/editorial-policy" className="hover:text-[#F3EBDD] transition-colors">Editorial Policy</Link>
          <span>|</span>
          <Link href="/faq" className="hover:text-[#F3EBDD] transition-colors">F.A.Q</Link>
          <span>|</span>
          <Link href="/dmca" className="hover:text-[#F3EBDD] transition-colors">DMCA</Link>
        </div>
      </section>

    </div>
  );
}