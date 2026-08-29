import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function PrivacyPolicyPage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-border pb-8 space-y-3">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#C8A7E8]/30 inline-block">
          DATA PROTECTION &amp; TRANSPARENCY
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">Privacy Policy</h1>
        <p className="text-[#CFC5B8] text-xs font-mono">
          Last Updated: January 2026
        </p>
      </header>

      {/* Intro */}
      <p className="text-[#CFC5B8] text-base leading-relaxed">
        At <strong className="text-[#F3EBDD]">Chronoverse Capital</strong> (accessible from chronoversecapital.com), the privacy of our visitors is one of our top priorities. This document outlines the types of information we collect and how we utilize it to enhance your experience.
      </p>

      {/* Sections */}
      <div className="space-y-8 text-[#CFC5B8] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">1. Consent</h2>
          <p>
            By using our website, you hereby consent to our Privacy Policy and agree to its terms and conditions.
          </p>
        </section>

        {/* Section 2 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">2. Information We Collect</h2>
          <p>
            When you visit Chronoverse Capital, we may collect information in the following ways:
          </p>
          <ul className="list-disc list-inside space-y-2 text-xs text-[#CFC5B8] pt-1">
            <li>
              <strong className="text-[#F3EBDD]">Log Files:</strong> We follow standard procedures of using log files. These files log visitors when they visit websites. The data includes IP addresses, browser types, Internet Service Providers (ISP), date/time stamps, and referring/exit pages.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Cookies and Web Beacons:</strong> We use cookies to store information about visitors&apos; preferences and the pages accessed. This data is used to optimize the user experience by customizing web content based on browser type.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">3. Advertising Partners (Google AdSense)</h2>
          <p>
            Google is one of the third-party vendors on our site. It uses cookies, known as DART cookies, to serve ads based on your visit to our site and others on the internet. You may choose to decline the use of DART cookies by visiting the Google ad and content network Privacy Policy at:
          </p>
          <a 
            href="https://policies.google.com/technologies/ads" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[#C8A7E8] text-xs font-mono hover:underline block pt-1"
          >
            https://policies.google.com/technologies/ads
          </a>
        </section>

        {/* Section 4 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">4. Third-Party Privacy Policies</h2>
          <p>
            Chronoverse Capital&apos;s Privacy Policy does not apply to other advertisers or websites. We advise you to consult the respective Privacy Policies of these third-party ad servers for more detailed information.
          </p>
        </section>

        {/* Section 5 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">5. Your Data Protection Rights (GDPR/CCPA)</h2>
          <p>
            We want to ensure you are fully aware of your data protection rights. Every user is entitled to:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-[#CFC5B8] pt-1">
            <li>The right to access, rectify, or erase your personal data.</li>
            <li>The right to restrict or object to the processing of your data.</li>
            <li>The right to data portability.</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">6. Children&apos;s Information</h2>
          <p>
            We do not knowingly collect any Personal Identifiable Information from children under the age of 13. If you think your child provided this kind of information on our website, please contact us immediately.
          </p>
        </section>

        {/* Section 7 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">7. Financial Transactions &amp; Digital Products</h2>
          <p>
            Please note that Chronoverse Capital does not process payments directly. All digital asset sales and subscriptions are securely processed through our authorized merchants of record:
          </p>
          <ul className="list-disc list-inside space-y-2 text-xs text-[#CFC5B8] pt-1">
            <li>
              <strong className="text-[#F3EBDD]">Lemon Squeezy (The Vault):</strong> Handles our premium annual subscriptions.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Gumroad, Inc. (The Shop):</strong> Handles individual dossier sales.
            </li>
          </ul>
        </section>

        {/* Section 8 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">8. Strategic Partners &amp; Affiliates</h2>
          <p>
            To maintain our operational infrastructure, Chronoverse Capital partners with select global entities. Some links provided may be affiliate links, meaning we may earn a commission at no additional cost to you.
          </p>
          <ul className="list-disc list-inside space-y-2 text-xs text-[#CFC5B8] pt-1">
            <li>
              <strong className="text-[#F3EBDD]">XM Trading:</strong> Global broker for executing macro-financial strategies.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Agility Writer:</strong> AI infrastructure utilized within our research ecosystem.
            </li>
          </ul>
        </section>

        {/* Section 9 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">9. Intelligence Communications &amp; Newsletters</h2>
          <p>
            When you subscribe to our intelligence briefs via <strong className="text-[#C8A7E8]">intel.chronoversecapital.com</strong>, we collect your email address solely for delivering our macro-financial reports and updates. We do not sell or share your contact information with unauthorized external parties, and you may opt-out at any time.
          </p>
        </section>

      </div>

      {/* Contact Section */}
      <div className="bg-[#050506] border border-border p-6 rounded-xl text-center space-y-1 font-mono">
        <h3 className="text-[#F3EBDD] font-bold text-sm">10. Contact Information</h3>
        <p className="text-[#CFC5B8] text-xs">If you have questions regarding our Privacy Policy, contact our editorial team:</p>
        <a 
          href={`mailto:${siteConfig.contactEmail}`}
          className="text-[#C8A7E8] text-xs font-bold hover:underline block pt-1"
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
          <Link href="/terms-of-service" className="hover:text-[#F3EBDD] transition-colors">Terms of Service</Link>
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