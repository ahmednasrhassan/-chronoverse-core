import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function TermsOfServicePage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-border pb-8 space-y-3">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#C8A7E8]/30 inline-block">
          LEGAL FRAMEWORK
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">Terms of Service</h1>
        <p className="text-[#CFC5B8] text-xs font-mono">
          Last Updated: January 2026
        </p>
      </header>

      {/* Welcome Intro */}
      <p className="text-[#CFC5B8] text-base leading-relaxed">
        Welcome to <strong className="text-[#F3EBDD]">Chronoverse Capital</strong> (accessible at ChronoverseCapital.com). By accessing this website, you agree to comply with and be bound by the following terms and conditions. If you disagree with any part of these terms, please refrain from using our platform.
      </p>

      {/* Terms Sections */}
      <div className="space-y-8 text-[#CFC5B8] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">1. Intellectual Property Rights</h2>
          <p>
            Unless otherwise stated, Chronoverse Capital owns the intellectual property rights for all original research, alternate history models, financial analyses, and custom graphics published on this site. You may access this material for personal use, but you must not:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-[#CFC5B8] pt-1">
            <li><strong className="text-[#F3EBDD]">Republish</strong> or redistribute our material without clear attribution.</li>
            <li><strong className="text-[#F3EBDD]">Sell, rent, or sub-license</strong> our content for commercial purposes.</li>
            <li><strong className="text-[#F3EBDD]">Reproduce or duplicate</strong> our proprietary historical models without written consent.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">2. Important Disclaimer (No Financial Advice)</h2>
          <div className="bg-[#050506] border-l-4 border-l-[#C8A7E8] p-4 rounded-r-lg text-xs space-y-2">
            <p>
              <strong className="text-[#F3EBDD]">Educational Purpose Only:</strong> The content on Chronoverse Capital, including analyses of DeFi, Cryptocurrency, and Economic history, is for informational and educational purposes only.
            </p>
            <p>
              <strong className="text-[#F3EBDD]">Not Financial Advice:</strong> We are research analysts and historians, not licensed financial advisors. Nothing on this website constitutes investment, legal, or tax advice.
            </p>
          </div>
        </section>

        {/* Section 3 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">3. Accuracy of Information</h2>
          <p>
            While we strive for institutional-grade accuracy in our research, Chronoverse Capital makes no warranties regarding the completeness or reliability of the information provided.
          </p>
        </section>

        {/* Section 4 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">4. Third-Party Links &amp; Affiliates</h2>
          <p>
            Our website features links to third-party strategic partners and advertisements. We have no control over the content or privacy practices of these external services. Utilizing any third-party links is at your own discretion and risk.
          </p>
        </section>

        {/* Section 5 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">5. Limitation of Liability</h2>
          <p>
            In no event shall Chronoverse Capital or its leadership team be held liable for any financial losses or damages arising out of or in connection with your use of the insights provided on this website.
          </p>
        </section>

        {/* Section 6 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">6. Digital Product Sales &amp; Subscriptions</h2>
          <p>
            All digital dossiers and Vault subscriptions are processed via our authorized merchants of record, <strong className="text-[#F3EBDD]">Lemon Squeezy</strong> and <strong className="text-[#F3EBDD]">Gumroad, Inc.</strong> By purchasing, you acknowledge that due to the intangible nature of digital downloads and exclusive intelligence access, <strong className="text-[#C8A7E8]">all sales are final and non-refundable</strong>.
          </p>
        </section>

        {/* Section 7 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">7. Governing Law</h2>
          <p>
            These terms are governed by the laws of the Arab Republic of Egypt.
          </p>
        </section>

      </div>

      {/* Strategic Inquiries Contact */}
      <div className="bg-[#050506] border border-border p-6 rounded-xl text-center space-y-1 font-mono">
        <h3 className="text-[#F3EBDD] font-bold text-sm">Strategic Inquiries</h3>
        <a 
          href={`mailto:${siteConfig.contactEmail}`}
          className="text-[#C8A7E8] text-xs hover:underline"
        >
          {siteConfig.contactEmail}
        </a>
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
          <Link href="/editorial-policy" className="hover:text-[#F3EBDD] transition-colors">Editorial Policy</Link>
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