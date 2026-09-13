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
          Last Updated: September 2026
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
            Using the site acknowledges this notice. Optional analytics consent
            is requested separately through the cookie controls, and account or
            newsletter data is processed when you submit the relevant form.
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
              <strong className="text-[#F3EBDD]">Request Logs:</strong> Hosting
              and security infrastructure may process standard request
              metadata such as IP address, user agent, timestamp, and requested
              path for delivery, reliability, and security.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Local Storage and Optional Analytics:</strong>
              {" "}The site stores your consent choice locally. Analytics is
              loaded only after analytics consent is granted.
            </li>
            <li>
              <strong className="text-[#F3EBDD]">Account and Newsletter Email:</strong> We process the email address you provide when requesting a sign-in link or submitting the newsletter form for those stated purposes.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">3. Optional Analytics</h2>
          <p>
            When analytics consent is granted, Google Analytics may process
            usage information to help us understand how visitors interact with
            the site. Analytics storage remains denied unless the visitor
            permits it through the cookie controls. Google&apos;s privacy policy is
            available at:
          </p>
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C8A7E8] text-xs font-mono hover:underline block pt-1"
          >
            https://policies.google.com/privacy
          </a>
        </section>

        {/* Section 4 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">4. Third-Party Privacy Policies</h2>
          <p>
            This Privacy Policy does not govern third-party authentication,
            analytics, email, research-storefront, or linked website services.
            Review the applicable provider&apos;s privacy terms before using those
            services.
          </p>
        </section>

        {/* Section 5 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">5. Data Protection Rights</h2>
          <p>
            Depending on applicable law and your location, you may have rights
            to request:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-[#CFC5B8] pt-1">
            <li>The right to access, rectify, or erase your personal data.</li>
            <li>The right to restrict or object to the processing of your data.</li>
            <li>The right to data portability.</li>
          </ul>
          <p>
            These rights may be subject to legal exceptions. Use the contact
            address below for a request.
          </p>
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
            Chronoverse Capital does not request card details through the
            public application. Standalone research is offered separately
            through the external research storefront at
            shop.chronoversecapital.com. Public self-service VIP checkout and
            billing-portal controls are not currently available.
          </p>
        </section>

        {/* Section 8 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">8. Strategic Partners &amp; Affiliates</h2>
          <p>
            Editorial or legacy material may identify a partner or include an
            affiliate disclosure. Such a disclosure does not make a broker,
            execution service, or other third-party product part of the
            Chronoverse five-product launch or VIP membership.
          </p>
        </section>

        {/* Section 9 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">9. Intelligence Communications &amp; Newsletters</h2>
          <p>
            When you submit the newsletter form on the main site or at <strong className="text-[#C8A7E8]">newsletter.chronoversecapital.com</strong>, we process your email address for subscription and dispatch operations. We do not sell the submitted address, and newsletter delivery may depend on the availability of our server-owned content and email services.
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
