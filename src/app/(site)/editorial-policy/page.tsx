import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editorial Policy",
  description:
    "Chronoverse Capital's editorial standards for accuracy, independence, and the use of AI-assisted research and visual content.",
};

export default function EditorialPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-[#27272a] pb-8 space-y-3">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#c87d55]/30 inline-block">
          GOVERNANCE &amp; STANDARDS
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5]">Editorial Policy</h1>
        <p className="text-[#a1a1aa] text-lg italic">
          Standardizing Excellence in Financial &amp; Historical Research
        </p>
      </header>

      {/* Intro */}
      <p className="text-[#a1a1aa] text-base leading-relaxed">
        At <strong className="text-[#f4f4f5]">Chronoverse Capital</strong>, our commitment to our readers is built on accuracy, integrity, and analytical depth. This Editorial Policy outlines the standards we follow to ensure that every piece of content—from historical deep dives to modern economic modeling—meets the highest quality benchmarks.
      </p>

      {/* Sections */}
      <div className="space-y-8 text-[#a1a1aa] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">1. Accuracy and Fact-Checking</h2>
          <p>
            Every article published on our platform undergoes a rigorous multi-stage verification process. We rely on primary historical sources, academic papers, and official financial archives to ensure that our data is accurate. Our team, led by <strong className="text-[#c87d55]">Ahmed Abdel Fattah</strong> and <strong className="text-[#c87d55]">Heba Sayed</strong>, meticulously reviews all historical dates, financial figures, and economic theories before publication.
          </p>
        </section>

        {/* Section 2 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#f4f4f5]">2. Use of Advanced Technology &amp; AI</h2>
          <p>
            In line with the digital evolution, Chronoverse Capital utilizes advanced technological tools, including AI-assisted language models and data analysis software.
          </p>
          <div className="bg-[#0a0a0a] border-l-4 border-l-[#c87d55] p-4 rounded-r-lg text-xs space-y-1">
            <strong className="text-[#f4f4f5] uppercase font-mono block">Our Stance:</strong>
            <p className="text-[#a1a1aa]">
              We use these technologies to enhance linguistic precision, summarize vast historical datasets, and generate high-fidelity visual representations. However, <strong className="text-[#c87d55]">all final content is human-curated, edited, and verified</strong>. The core insights, financial analysis, and strategic conclusions are exclusively the product of our human researchers&apos; expertise.
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">3. Independence and Objectivity</h2>
          <p>
            Our analysis is independent and unbiased. Chronoverse Capital does not accept payments to promote specific financial assets or distort historical facts. Our goal is to provide a neutral &quot;what-if&quot; lens that helps our readers understand the mechanics of wealth and power through time.
          </p>
        </section>

        {/* Section 4 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">4. Visual Content Integrity</h2>
          <p>
            The imagery on our site is designed to provide a cinematic and educational experience. We utilize AI-generation tools to create unique, high-resolution visuals that represent historical scenarios where no actual photography exists. Each image is audited to ensure it aligns with the historical and financial context of the article.
          </p>
        </section>

        {/* Section 5 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">5. Corrections Policy</h2>
          <p>
            We strive for perfection but acknowledge that history and finance are complex fields. If an error is identified, we are committed to correcting it promptly and transparently. Readers can report any inaccuracies directly to our editorial team via our{" "}
            <Link href="/contact" className="text-[#c87d55] hover:underline">
              Contact Us
            </Link>{" "}
            page.
          </p>
        </section>

      </div>

      {/* Editorial Board Sign-off */}
      <div className="text-center pt-4 border-t border-[#27272a] space-y-1">
        <p className="text-[#f4f4f5] font-bold text-base">Chronoverse Capital Editorial Board</p>
        <p className="text-[#a1a1aa] text-xs font-mono">Last Updated: January 2026</p>
      </div>

      {/* Compliance Hub Nav */}
      <section className="border-t border-[#27272a] pt-8 text-center space-y-4">
        <h3 className="text-xs font-mono font-bold text-[#c87d55] tracking-wider uppercase">
          ⚖️ Administrative Compliance Hub
        </h3>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[#a1a1aa] font-medium">
          <Link href="/about" className="hover:text-[#f4f4f5] transition-colors">About Us</Link>
          <span>|</span>
          <Link href="/contact" className="hover:text-[#f4f4f5] transition-colors">Contact Us</Link>
          <span>|</span>
          <Link href="/privacy-policy" className="hover:text-[#f4f4f5] transition-colors">Privacy Policy</Link>
          <span>|</span>
          <Link href="/terms-of-service" className="hover:text-[#f4f4f5] transition-colors">Terms of Service</Link>
          <span>|</span>
          <Link href="/disclaimer" className="hover:text-[#f4f4f5] transition-colors">Disclaimer</Link>
          <span>|</span>
          <Link href="/faq" className="hover:text-[#f4f4f5] transition-colors">F.A.Q</Link>
          <span>|</span>
          <Link href="/dmca" className="hover:text-[#f4f4f5] transition-colors">DMCA</Link>
        </div>
      </section>

    </div>
  );
}
