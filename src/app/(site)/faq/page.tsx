import React from "react";
import Link from "next/link";

export default function FaqPage() {
  const faqCategories = [
    {
      category: "🛒 Payments & Security",
      questions: [
        {
          q: "Is it safe to enter my payment details?",
          a: "Absolutely. We do not process or store any payment data ourselves. All individual dossier sales are handled by Gumroad, and all Vault subscriptions are managed via Lemon Squeezy. Both platforms utilize banking-grade SSL encryption to ensure your sovereignty over your data.",
        },
      ],
    },
    {
      category: "🔐 The Vault & Intel",
      questions: [
        {
          q: "What is the difference between a \"Dossier\" and \"The Vault\"?",
          a: "A Dossier is a one-time purchase of a specific historical or financial report. The Vault is our premium annual membership that grants you unlimited access to all dossiers, real-time macro-financial alerts, and exclusive research blueprints not available to the public.",
        },
        {
          q: "How do I receive real-time intelligence alerts?",
          a: "Priority alerts are dispatched via our Sender Network. Once you subscribe through intel.chronoversecapital.com, you will be integrated into our secure communication relay.",
        },
      ],
    },
    {
      category: "📂 Delivery & Refunds",
      questions: [
        {
          q: "How do I receive my research materials after purchase?",
          a: "Instantly. Immediately after payment, you will be redirected to your secure download area. A permanent access link will also be dispatched to your registered email address.",
        },
        {
          q: "Do you offer refunds?",
          a: "No. Due to the digital and intellectual nature of our dossiers and Vault access, all sales are final. We encourage you to review our manifestos and free briefings before committing capital.",
        },
      ],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-10 font-sans">
      
      {/* Header */}
      <header className="border-b border-[#27272a] pb-8 space-y-3">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-mono font-semibold border border-[#c87d55]/30 inline-block">
          KNOWLEDGE BASE
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5]">Frequently Asked Questions</h1>
        <p className="text-[#a1a1aa] text-sm font-mono">
          Everything you need to know about our dossiers, subscriptions &amp; research.
        </p>
      </header>

      {/* FAQ Categories */}
      <div className="space-y-8">
        {faqCategories.map((cat, idx) => (
          <div key={idx} className="space-y-4">
            <h2 className="text-lg font-bold text-[#c87d55] font-mono border-b border-[#27272a] pb-2">
              {cat.category}
            </h2>
            <div className="space-y-4">
              {cat.questions.map((item, qIdx) => (
                <div key={qIdx} className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl space-y-2 hover:border-[#c87d55]/40 transition-colors">
                  <h3 className="text-base font-bold text-[#f4f4f5]">
                    Q: {item.q}
                  </h3>
                  <p className="text-sm text-[#a1a1aa] leading-relaxed">
                    <strong className="text-[#c87d55]">A:</strong> {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Unresolved Inquiries Contact Box */}
      <div className="bg-[#0a0a0a] border border-[#27272a] p-6 rounded-xl text-center space-y-3 font-mono">
        <h3 className="text-[#f4f4f5] font-bold text-base">Still Have Unresolved Inquiries?</h3>
        <p className="text-[#a1a1aa] text-xs">Our strategic support team is standing by.</p>
        <Link 
          href="/contact" 
          className="inline-block bg-[#c87d55] hover:bg-[#d88d65] text-black font-bold px-6 py-2 rounded-md text-xs transition-colors"
        >
          ➔ Submit Inquiry
        </Link>
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
          <Link href="/dmca" className="hover:text-[#f4f4f5] transition-colors">DMCA</Link>
        </div>
      </section>

    </div>
  );
}
