import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function ContactPage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-12">
      
      {/* Header Section */}
      <header className="text-center space-y-3 border-b border-border pb-8">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#C8A7E8]/30 inline-block">
          DIRECT LINE
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">Get in Touch</h1>
        <p className="text-[#CFC5B8] text-lg italic">
          Connect with the Chronoverse Research Team.
        </p>
        <p className="text-[#CFC5B8] text-sm max-w-2xl mx-auto pt-2 leading-relaxed">
          Use the published contact address for research, account, billing,
          partnership, or data-source questions.
        </p>
      </header>

      {/* Main Grid: Form & Inquiries */}
      <div className="grid gap-8 md:grid-cols-2">
        
        {/* Left Column: Direct Inquiries & Operating Hours */}
        <div className="space-y-6">
          
          {/* General Inquiries */}
          <div className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2 hover:border-[#C8A7E8]/50 transition-all">
            <h2 className="text-lg font-bold text-[#F3EBDD] flex items-center gap-2">
              <span>📧</span> General Inquiries
            </h2>
            <p className="text-[#CFC5B8] text-xs leading-relaxed">
              For research collaborations, media requests, or general questions about our content.
            </p>
            <p className="text-xs pt-1">
              <strong className="text-[#F3EBDD]">Email: </strong>
              <a 
                href="mailto:info@chronoversecapital.com" 
                className="text-[#C8A7E8] font-mono hover:underline"
              >
                info@chronoversecapital.com
              </a>
            </p>
          </div>

          {/* Dossier Support */}
          <div className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2 hover:border-[#C8A7E8]/50 transition-all">
            <h2 className="text-lg font-bold text-[#F3EBDD] flex items-center gap-2">
              <span>🛠️</span> Dossier Support
            </h2>
            <p className="text-[#CFC5B8] text-xs leading-relaxed">
              For questions about a standalone research purchase, identify the
              relevant dossier without including payment-card or account
              secrets.
            </p>
            <p className="text-xs pt-1">
              <strong className="text-[#F3EBDD]">Support Desk: </strong>
              <a 
                href="mailto:info@chronoversecapital.com" 
                className="text-[#C8A7E8] font-mono hover:underline"
              >
                info@chronoversecapital.com
              </a>
            </p>
          </div>

          {/* Support boundary */}
          <div className="bg-[#050506] border border-border p-6 rounded-xl space-y-2 font-mono">
            <h2 className="text-sm font-bold text-[#C8A7E8] tracking-wider uppercase">
              Support Boundary
            </h2>
            <p className="text-[#CFC5B8] text-xs">
              Do not send passwords, authentication links, API keys, card
              numbers, or other secrets by email.
            </p>
          </div>

        </div>


        {/* Right Column: verified contact channel */}
        <div className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-4">
          <h2 className="text-xl font-bold text-[#F3EBDD]">Email the Team</h2>
          <p className="text-sm leading-6 text-[#CFC5B8]">
            The public site does not submit an unseen contact form. Use the
            address below so your email client shows exactly what will be
            sent.
          </p>
          <a
            href={`mailto:${siteConfig.contactEmail}`}
            className="inline-flex w-full items-center justify-center bg-[#C8A7E8] hover:bg-[#d88d65] text-black font-bold py-2.5 rounded-md transition-colors text-sm shadow-md"
          >
            Email {siteConfig.contactEmail}
          </a>
        </div>

      </div>

      {/* Administrative Compliance Hub */}
      <section className="border-t border-border pt-8 text-center space-y-4">
        <h3 className="text-sm font-bold text-[#C8A7E8] tracking-wider uppercase">
          ⚖️ Administrative Compliance Hub
        </h3>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[#CFC5B8] font-medium">
          <Link href="/about" className="hover:text-[#F3EBDD] transition-colors">About Us</Link>
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
          <span>|</span>
          <Link href="/dmca" className="hover:text-[#F3EBDD] transition-colors">DMCA</Link>
        </div>
      </section>

    </div>
  );
}
