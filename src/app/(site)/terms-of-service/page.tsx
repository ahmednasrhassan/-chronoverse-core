import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function TermsOfServicePage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-[#27272a] pb-8 space-y-3">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#c87d55]/30 inline-block">
          LEGAL FRAMEWORK
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5]">Terms of Service</h1>
        <p className="text-[#a1a1aa] text-xs font-mono">
          Last Updated: January 2026
        </p>
      </header>

      {/* Welcome Intro */}
      <p className="text-[#a1a1aa] text-base leading-relaxed">
        Welcome to <strong className="text-[#f4f4f5]">Chronoverse Capital</strong> (accessible at ChronoverseCapital.com). By accessing this website, you agree to comply with and be bound by the following terms and conditions. If you disagree with any part of these terms, please refrain from using our platform.
      </p>

      {/* Terms Sections */}
      <div className="space-y-8 text-[#a1a1aa] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#f4f4f5]">1. Intellectual Property Rights</h2>
          <p>
            Unless otherwise stated, Chronoverse Capital owns the intellectual property rights for all original research, alternate history models, financial analyses, and custom graphics published on this site. You may access this material for personal use, but you must not:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-[#a1a1aa] pt-1">
            <li><strong className="text-[#f4f4f5]">Republish</strong> or redistribute our material without clear attribution.</li>
            <li><strong className="text-[#f4f4f5]">Sell, rent, or sub-license</strong> our content for commercial purposes.</li>
            <li><strong className="text-[#f4f4f5]">Reproduce or duplicate</strong> our proprietary historical models without written consent.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#f4f4f5]">2. Important Disclaimer (No Financial Advice)</h2>
          <div className="bg-[#0a0a0a] border-l-4 border-l-[#c87d55] p-4 rounded-r-lg text-xs space-y-2">
            <p>
              <strong className="text-[#f4f4f5]">Educational Purpose Only:</strong> The content on Chronoverse Capital, including analyses of DeFi, Cryptocurrency, and Economic history, is for informational and educational purposes only.
            </p>
            <p>
              <strong className="text-[#f4f4f5]">Not Financial Advice:</strong> We are research analysts and historians, not licensed financial advisors. Nothing on this website constitutes investment, legal, or tax advice.
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">3. Accuracy of Information</h2>
          <p>
            While we strive for institutional-grade accuracy in our research, Chronoverse Capital makes no warranties regarding the completeness or reliability of the information provided.
          </p>
        </section>

        {/* Section 4 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">4. Third-Party Links &amp; Affiliates</h2>
          <p>
            Our website features links to third-party strategic partners and advertisements. We have no control over the content or privacy practices of these external services. Utilizing any third-party links is at your own discretion and risk.
          </p>
        </section>

        {/* Section 5 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">5. Limitation of Liability</h2>
          <p>
            In no event shall Chronoverse Capital or its leadership team be held liable for any financial losses or damages arising out of or in connection with your use of the insights provided on this website.
          </p>
        </section>

        {/* Section 6 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">6. Digital Product Sales &amp; Subscriptions</h2>
          <p>
            All digital dossiers and Vault subscriptions are processed via our authorized merchants of record, <strong className="text-[#f4f4f5]">Lemon Squeezy</strong> and <strong className="text-[#f4f4f5]">Gumroad, Inc.</strong> By purchasing, you acknowledge that due to the intangible nature of digital downloads and exclusive intelligence access, <strong className="text-[#c87d55]">all sales are final and non-refundable</strong>.
          </p>
        </section>

        {/* Section 7 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">7. Governing Law</h2>
          <p>
            These terms are governed by the laws of the Arab Republic of Egypt.
          </p>
        </section>

      </div>

      {/* Strategic Inquiries Contact */}
      <div className="bg-[#0a0a0a] border border-[#27272a] p-6 rounded-xl text-center space-y-1 font-mono">
        <h3 className="text-[#f4f4f5] font-bold text-sm">Strategic Inquiries</h3>
        <a 
          href={`mailto:${siteConfig.contactEmail}`}
          className="text-[#c87d55] text-xs hover:underline"
        >
          {siteConfig.contactEmail}
        </a>
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
          <Link href="/editorial-policy" className="hover:text-[#f4f4f5] transition-colors">Editorial Policy</Link>
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