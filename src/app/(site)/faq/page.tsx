import React from "react";
import Link from "next/link";

export default function FaqPage() {
  const faqCategories = [
    {
      category: "Market Coverage",
      questions: [
        {
          q: "Which markets are included at launch?",
          a: "Chronoverse V1 covers exactly five products: EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR.",
        },
        {
          q: "Is €STR treated like a currency pair?",
          a: "No. €STR is a benchmark rate and uses rate-specific direction, level-regime, and volatility-regime language.",
        },
      ],
    },
    {
      category: "Free & VIP",
      questions: [
        {
          q: "What is the difference between Free and VIP?",
          a: "Both use the same five products and canonical market truth. Free presents the Lite projection; verified VIP access presents the Deep projection.",
        },
        {
          q: "Can I purchase VIP through this site now?",
          a: "No. Public self-service VIP checkout and billing-portal controls are not currently available. The Account page establishes identity and shows the access state trusted by the server.",
        },
      ],
    },
    {
      category: "Research & Support",
      questions: [
        {
          q: "Are standalone research products part of VIP membership?",
          a: "No. Standalone research at shop.chronoversecapital.com and Chronoverse VIP membership are separate offerings with separate access models.",
        },
        {
          q: "Where can I ask an account or billing question?",
          a: "Use the Contact page. Do not include card numbers, passwords, authentication links, or other secrets in your message.",
        },
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-border pb-8 space-y-3">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#C8A7E8]/30 inline-block">
          KNOWLEDGE BASE
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">Frequently Asked Questions</h1>
        <p className="text-[#CFC5B8] text-sm font-mono">
          Launch coverage, access, research, and support boundaries.
        </p>
      </header>

      {/* FAQ Categories */}
      <div className="space-y-8">
        {faqCategories.map((cat, idx) => (
          <div key={idx} className="space-y-4">
            <h2 className="text-lg font-bold text-[#C8A7E8] font-mono border-b border-border pb-2">
              {cat.category}
            </h2>
            <div className="space-y-4">
              {cat.questions.map((item, qIdx) => (
                <div key={qIdx} className="bg-[#0D0D11] border border-border p-6 rounded-xl space-y-2 hover:border-[#C8A7E8]/40 transition-colors">
                  <h3 className="text-base font-bold text-[#F3EBDD]">
                    Q: {item.q}
                  </h3>
                  <p className="text-sm text-[#CFC5B8] leading-relaxed">
                    <strong className="text-[#C8A7E8]">A:</strong> {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Unresolved Inquiries Contact Box */}
      <div className="bg-[#050506] border border-border p-6 rounded-xl text-center space-y-3 font-mono">
        <h3 className="text-[#F3EBDD] font-bold text-base">Still Have Unresolved Inquiries?</h3>
        <p className="text-[#CFC5B8] text-xs">Additional questions can be sent through Contact.</p>
        <Link 
          href="/contact" 
          className="inline-block bg-[#C8A7E8] hover:bg-[#d88d65] text-black font-bold px-6 py-2 rounded-md text-xs transition-colors"
        >
          Open Contact
        </Link>
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
          <Link href="/dmca" className="hover:text-[#F3EBDD] transition-colors">DMCA</Link>
        </div>
      </section>

    </div>
  );
}
