import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function DmcaPage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-[#27272a] pb-8 space-y-3">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#c87d55]/30 inline-block">
          INTELLECTUAL PROPERTY &amp; COPYRIGHT
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5]">DMCA Policy</h1>
        <p className="text-[#a1a1aa] text-sm font-mono">
          Digital Millennium Copyright Act Compliance
        </p>
      </header>

      {/* Intro */}
      <p className="text-[#a1a1aa] text-base leading-relaxed">
        <strong className="text-[#f4f4f5]">Chronoverse Capital</strong> respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 (&quot;DMCA&quot;), we will respond expeditiously to claims of copyright infringement reported to our designated agent.
      </p>

      {/* Sections */}
      <div className="space-y-8 text-[#a1a1aa] leading-relaxed text-sm">
        
        {/* Section 1 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-3">
          <h2 className="text-xl font-bold text-[#f4f4f5]">1. Reporting Infringement</h2>
          <p>
            If you are a copyright owner and believe that any material available on our website infringes your copyright, please notify us immediately. Your notice must include:
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs text-[#a1a1aa] pt-1">
            <li>Identification of the copyrighted work claimed to have been infringed.</li>
            <li>Identification of the material on our site that is claimed to be infringing (URL required).</li>
            <li>Full contact information (Name, Address, Phone, Email).</li>
            <li>A statement of &quot;good faith belief&quot; that the use is unauthorized.</li>
            <li>A statement under penalty of perjury that the information is accurate.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">2. Counter-Notification</h2>
          <p>
            If you believe that your content was removed by mistake or misidentification, you may submit a counter-notification to our designated agent containing the proofs required by the DMCA guidelines.
          </p>
        </section>

        {/* Section 3 */}
        <section className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2">
          <h2 className="text-xl font-bold text-[#f4f4f5]">3. Intellectual Property of Chronoverse Capital</h2>
          <p>
            All content published on <strong className="text-[#f4f4f5]">ChronoverseCapital.com</strong>, including text, original historical models, analytical graphics, and logos, is the <strong className="text-[#c87d55]">exclusive property</strong> of Chronoverse Capital. Unauthorized copying, reproduction, or redistribution of this material is strictly prohibited and will result in immediate legal action.
          </p>
        </section>

      </div>

      {/* Designated Agent Contact */}
      <div className="bg-[#0a0a0a] border border-[#27272a] p-6 rounded-xl text-center space-y-2 font-mono">
        <h3 className="text-[#f4f4f5] font-bold text-sm">Designated Agent Contact</h3>
        <p className="text-[#a1a1aa] text-xs">Please send all DMCA notices to our secure relay:</p>
        <a 
          href={`mailto:${siteConfig.contactEmail}`}
          className="text-[#c87d55] text-xs font-bold hover:underline block pt-1"
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
          <Link href="/terms-of-service" className="hover:text-[#f4f4f5] transition-colors">Terms of Service</Link>
          <span>|</span>
          <Link href="/editorial-policy" className="hover:text-[#f4f4f5] transition-colors">Editorial Policy</Link>
          <span>|</span>
          <Link href="/disclaimer" className="hover:text-[#f4f4f5] transition-colors">Disclaimer</Link>
          <span>|</span>
          <Link href="/faq" className="hover:text-[#f4f4f5] transition-colors">F.A.Q</Link>
        </div>
      </section>

    </div>
  );
}