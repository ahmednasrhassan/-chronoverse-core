import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function DmcaPage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-border pb-8 space-y-3">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#C8A7E8]/30 inline-block">
          INTELLECTUAL PROPERTY &amp; COPYRIGHT
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">DMCA Policy</h1>
        <p className="text-[#CFC5B8] text-sm font-mono">
          Digital Millennium Copyright Act Compliance
        </p>
      </header>

      {/* Intro */}
      <p className="text-[#CFC5B8] text-base leading-relaxed">
        <strong className="text-[#F3EBDD]">Chronoverse Capital</strong> respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 (&quot;DMCA&quot;), we will respond expeditiously to claims of copyright infringement reported to our designated agent.
      </p>

      {/* Sections */}
      <div className="space-y-8 text-[#CFC5B8] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#F3EBDD]">1. Reporting Infringement</h2>
          <p>
            If you are a copyright owner and believe that any material available on our website infringes your copyright, please notify us immediately. Your notice must include:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-[#CFC5B8] pt-1">
            <li>Identification of the copyrighted work claimed to have been infringed.</li>
            <li>Identification of the material on our site that is claimed to be infringing (URL required).</li>
            <li>Full contact information (Name, Address, Phone, Email).</li>
            <li>A statement of &quot;good faith belief&quot; that the use is unauthorized.</li>
            <li>A statement under penalty of perjury that the information is accurate.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">2. Counter-Notification</h2>
          <p>
            If you believe that your content was removed by mistake or misidentification, you may submit a counter-notification to our designated agent containing the proofs required by the DMCA guidelines.
          </p>
        </section>

        {/* Section 3 */}
        <section className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#F3EBDD]">3. Intellectual Property of Chronoverse Capital</h2>
          <p>
            All content published on <strong className="text-[#F3EBDD]">ChronoverseCapital.com</strong>, including text, original historical models, analytical graphics, and logos, is the <strong className="text-[#C8A7E8]">exclusive property</strong> of Chronoverse Capital. Unauthorized copying, reproduction, or redistribution of this material is strictly prohibited and will result in immediate legal action.
          </p>
        </section>

      </div>

      {/* Designated Agent Contact */}
      <div className="bg-[#050506] border border-border p-6 rounded-xl text-center space-y-2 font-mono">
        <h3 className="text-[#F3EBDD] font-bold text-sm">Designated Agent Contact</h3>
        <p className="text-[#CFC5B8] text-xs">Please send all DMCA notices to our secure relay:</p>
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
          <Link href="/privacy-policy" className="hover:text-[#F3EBDD] transition-colors">Privacy Policy</Link>
          <span>|</span>
          <Link href="/terms-of-service" className="hover:text-[#F3EBDD] transition-colors">Terms of Service</Link>
          <span>|</span>
          <Link href="/editorial-policy" className="hover:text-[#F3EBDD] transition-colors">Editorial Policy</Link>
          <span>|</span>
          <Link href="/disclaimer" className="hover:text-[#F3EBDD] transition-colors">Disclaimer</Link>
          <span>|</span>
          <Link href="/faq" className="hover:text-[#F3EBDD] transition-colors">F.A.Q</Link>
        </div>
      </section>

    </div>
  );
}