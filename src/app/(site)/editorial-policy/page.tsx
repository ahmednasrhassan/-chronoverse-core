import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editorial Policy",
  description:
    "Chronoverse Capital's standards for sourcing, editorial independence, assisted tools, and corrections.",
};

export default function EditorialPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-border pb-8 space-y-3">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#C8A7E8]/30 inline-block">
          GOVERNANCE &amp; STANDARDS
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">Editorial Policy</h1>
        <p className="text-[#CFC5B8] text-lg italic">
          Standards for Published Research and Analysis
        </p>
      </header>

      {/* Intro */}
      <p className="text-[#CFC5B8] text-base leading-relaxed">
        This policy describes the sourcing, disclosure, and correction
        standards applied to Chronoverse Capital&apos;s published research and
        analytical content.
      </p>

      {/* Sections */}
      <div className="space-y-8 text-[#CFC5B8] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">1. Accuracy and Fact-Checking</h2>
          <p>
            Published work should distinguish sourced facts, analytical
            interpretation, and hypothetical scenarios. Dates, figures, and
            attributed claims should be checked against the cited or identified
            source available to the editor at publication time.
          </p>
        </section>

        {/* Section 2 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">2. Assisted Tools</h2>
          <p>
            Editorial and analytical tools may assist with drafting,
            summarization, formatting, or visual production.
          </p>
          <div className="bg-[#050506] border-l-4 border-l-[#C8A7E8] p-4 rounded-r-lg text-xs space-y-1">
            <strong className="text-[#F3EBDD] uppercase font-mono block">Our Stance:</strong>
            <p className="text-[#CFC5B8]">
              Assisted output is not evidence by itself. The identified author
              or editor remains responsible for the material selected for
              publication, and unsupported generated claims should not be
              presented as verified facts.
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">3. Independence and Objectivity</h2>
          <p>
            Sponsorship, affiliate, or commercial relationships should be
            disclosed where relevant and kept separate from editorial
            conclusions. A commercial relationship does not add a market to the
            five-product launch universe or determine an analytical result.
          </p>
        </section>

        {/* Section 4 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">4. Visual Content Integrity</h2>
          <p>
            Article images are illustrative unless the accompanying context
            identifies them as documentary source material. Captions,
            alternative text, and metadata should not invent provenance or
            describe an image more specifically than the available source
            supports.
          </p>
        </section>

        {/* Section 5 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">5. Corrections Policy</h2>
          <p>
            Readers can report a possible error through the{" "}
            <Link href="/contact" className="text-[#C8A7E8] hover:underline">
              Contact Us
            </Link>{" "}
            page. Confirmed corrections should preserve the distinction between
            the original source, editorial interpretation, and revised text.
          </p>
        </section>

      </div>

      {/* Editorial Board Sign-off */}
      <div className="text-center pt-4 border-t border-border space-y-1">
        <p className="text-[#F3EBDD] font-bold text-base">Chronoverse Capital Editorial Board</p>
        <p className="text-[#CFC5B8] text-xs font-mono">Last Updated: September 2026</p>
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
          <Link href="/disclaimer" className="hover:text-[#F3EBDD] transition-colors">Disclaimer</Link>
          <span>|</span>
          <Link href="/faq" className="hover:text-[#F3EBDD] transition-colors">F.A.Q</Link>
          <span>|</span>
          <Link href="/dmca" className="hover:text-[#F3EBDD] transition-colors">DMCA</Link>
        </div>
      </section>

    </div>
  );
}
