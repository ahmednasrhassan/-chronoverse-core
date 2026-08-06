import React from "react";
import Link from "next/link";
import { siteConfig } from "@/config/siteConfig";

export default function ContactPage() {

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-12">
      
      {/* Header Section */}
      <header className="text-center space-y-3 border-b border-[#27272a] pb-8">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#c87d55]/30 inline-block">
          DIRECT LINE
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5]">Get in Touch</h1>
        <p className="text-[#a1a1aa] text-lg italic">
          Connect with the ChronoVerse Research Team.
        </p>
        <p className="text-[#a1a1aa] text-sm max-w-2xl mx-auto pt-2 leading-relaxed">
          Whether you have a query about a specific <strong className="text-[#f4f4f5]">Dossier</strong>, a partnership proposal, or historical data verification, our team is ready to assist.
        </p>
      </header>

      {/* Main Grid: Form & Inquiries */}
      <div className="grid gap-8 md:grid-cols-2">
        
        {/* Left Column: Direct Inquiries & Operating Hours */}
        <div className="space-y-6">
          
          {/* General Inquiries */}
          <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2 hover:border-[#c87d55]/50 transition-all">
            <h2 className="text-lg font-bold text-[#f4f4f5] flex items-center gap-2">
              <span>📧</span> General Inquiries
            </h2>
            <p className="text-[#a1a1aa] text-xs leading-relaxed">
              For research collaborations, media requests, or general questions about our content.
            </p>
            <p className="text-xs pt-1">
              <strong className="text-[#f4f4f5]">Email: </strong>
              <a 
                href="mailto:info@chronoversecapital.com" 
                className="text-[#c87d55] font-mono hover:underline"
              >
                info@chronoversecapital.com
              </a>
            </p>
          </div>

          {/* Dossier Support */}
          <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2 hover:border-[#c87d55]/50 transition-all">
            <h2 className="text-lg font-bold text-[#f4f4f5] flex items-center gap-2">
              <span>🛠️</span> Dossier Support
            </h2>
            <p className="text-[#a1a1aa] text-xs leading-relaxed">
              Issues with a download? Need help accessing your purchased files? We respond within 24 hours.
            </p>
            <p className="text-xs pt-1">
              <strong className="text-[#f4f4f5]">Support Desk: </strong>
              <a 
                href="mailto:info@chronoversecapital.com" 
                className="text-[#c87d55] font-mono hover:underline"
              >
                info@chronoversecapital.com
              </a>
            </p>
          </div>

          {/* Operating Hours */}
          <div className="bg-[#0a0a0a] border border-[#27272a] p-6 rounded-xl space-y-2 font-mono">
            <h2 className="text-sm font-bold text-[#c87d55] tracking-wider uppercase">
              🕰️ Operating Hours
            </h2>
            <p className="text-[#f4f4f5] text-sm font-semibold">
              Monday — Friday: 09:00 AM — 06:00 PM (GMT+2)
            </p>
            <p className="text-[#a1a1aa] text-xs">
              Response SLA: Within 24 business hours.
            </p>
          </div>

          {/* Registered Mailing Address */}
          <div className="bg-[#0a0a0a] border border-[#27272a] p-6 rounded-xl space-y-2 font-mono">
            <h2 className="text-sm font-bold text-[#c87d55] tracking-wider uppercase">
              📍 Registered Mailing Address
            </h2>
            <p className="text-[#f4f4f5] text-sm leading-relaxed">
              {siteConfig.postalAddress.line1}
              <br />
              {siteConfig.postalAddress.line2}
              <br />
              {siteConfig.postalAddress.city}, {siteConfig.postalAddress.state}{" "}
              {siteConfig.postalAddress.zip}
              <br />
              {siteConfig.postalAddress.country}
            </p>
          </div>

        </div>


        {/* Right Column: Institutional Contact Form */}
        <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-4">
          <h2 className="text-xl font-bold text-[#f4f4f5]">Send Direct Message</h2>
          <form className="space-y-4">
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1 font-mono">Full Name</label>
              <input 
                type="text" 
                placeholder="John Doe" 
                className="w-full bg-[#120e0c] border border-[#27272a] text-[#f4f4f5] rounded-md px-4 py-2 text-sm focus:outline-none focus:border-[#c87d55] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1 font-mono">Corporate Email</label>
              <input 
                type="email" 
                placeholder="name@company.com" 
                className="w-full bg-[#120e0c] border border-[#27272a] text-[#f4f4f5] rounded-md px-4 py-2 text-sm focus:outline-none focus:border-[#c87d55] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1 font-mono">Message / Query</label>
              <textarea 
                rows={4} 
                placeholder="State your inquiry or research request..." 
                className="w-full bg-[#120e0c] border border-[#27272a] text-[#f4f4f5] rounded-md px-4 py-2 text-sm focus:outline-none focus:border-[#c87d55] transition-colors resize-none"
              ></textarea>
            </div>
            <button 
              type="button" 
              className="w-full bg-[#c87d55] hover:bg-[#d88d65] text-black font-bold py-2.5 rounded-md transition-colors text-sm shadow-md"
            >
              Transmit Signal →
            </button>
          </form>
        </div>

      </div>

      {/* YouTube Signals */}
      <section className="bg-[#18181b] border border-[#27272a] p-8 rounded-xl text-center space-y-4">
        <h2 className="text-xl font-bold text-[#f4f4f5]">Follow Our Signals</h2>
        <div className="flex flex-col sm:flex-row justify-center gap-4 text-sm font-semibold">
          <a 
            href="https://www.youtube.com/@hypohorizons" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5] px-6 py-3 rounded-lg border border-[#3f3f46] transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-[#c87d55]">▶</span> YouTube: Hypo Horizons ➔
          </a>
          <a 
            href="https://www.youtube.com/@Ancientdreamworld" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-[#27272a] hover:bg-[#3f3f46] text-[#f4f4f5] px-6 py-3 rounded-lg border border-[#3f3f46] transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-[#c87d55]">▶</span> YouTube: Ancient Dream ➔
          </a>
        </div>
      </section>

      {/* Administrative Compliance Hub */}
      <section className="border-t border-[#27272a] pt-8 text-center space-y-4">
        <h3 className="text-sm font-bold text-[#c87d55] tracking-wider uppercase">
          ⚖️ Administrative Compliance Hub
        </h3>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[#a1a1aa] font-medium">
          <Link href="/about" className="hover:text-[#f4f4f5] transition-colors">About Us</Link>
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
          <span>|</span>
          <Link href="/dmca" className="hover:text-[#f4f4f5] transition-colors">DMCA</Link>
        </div>
      </section>

    </div>
  );
}