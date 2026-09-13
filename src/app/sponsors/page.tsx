import React from "react";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sponsorship & Partnerships | Chronoverse Capital",
  description:
    "Contact Chronoverse Capital about research sponsorship and partnership inquiries.",
};

export default function SponsorsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16 space-y-20">

      {/* ==================== HERO SECTION ==================== */}
      <section className="text-center space-y-6 border-b border-border pb-14">
        <span className="inline-block bg-mauve/10 border border-purple-border/40 text-mauve text-xs font-mono uppercase px-3 py-1 rounded-full">
          Sponsorship Program
        </span>
        <h1 className="text-4xl md:text-5xl font-bold text-[#f4f4f5] leading-tight max-w-3xl mx-auto">
          Partner with Chronoverse Capital
        </h1>
        <p className="text-muted text-lg max-w-2xl mx-auto leading-relaxed">
          Discuss a research sponsorship or partnership proposal with
          Chronoverse Capital.
        </p>
        <div className="pt-4">
          <a
            href="mailto:info@chronoversecapital.com"
            className="inline-block bg-white text-black hover:bg-gray-200 font-bold px-8 py-3 rounded-md transition-colors shadow-lg"
          >
            Start an Inquiry →
          </a>
        </div>
      </section>

      {/* ==================== VALUE CARDS ==================== */}
      <section className="bg-card space-y-8 py-12 rounded-2xl">
        <h2 className="text-2xl md:text-3xl font-bold text-mauve text-center">
          Why Partner With Us
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1: Research context */}
          <div className="bg-card border border-purple-border/40 rounded-xl p-7 space-y-4 hover:border-purple-brand transition-all">
            <div className="w-12 h-12 rounded-lg bg-card border border-purple-border/40 flex items-center justify-center text-mauve text-2xl">
              🎯
            </div>
            <h3 className="text-lg font-bold text-mauve">Research Context</h3>
            <p className="text-mauve text-sm leading-relaxed">
              Discuss placements alongside published research for readers
              interested in macroeconomics and market structure.
            </p>
          </div>

          {/* Card 2: Published research */}
          <div className="bg-card border border-purple-border/40 rounded-xl p-7 space-y-4 hover:border-purple-brand transition-all">
            <div className="w-12 h-12 rounded-lg bg-card border border-purple-border/40 flex items-center justify-center text-mauve text-2xl">
              📊
            </div>
            <h3 className="text-lg font-bold text-mauve">Published Research</h3>
            <p className="text-mauve text-sm leading-relaxed">
              Sponsorship discussions remain separate from editorial findings,
              Free Lite, and VIP Deep product access.
            </p>
          </div>

          {/* Card 3: Placement details */}
          <div className="bg-card border border-purple-border/40 rounded-xl p-7 space-y-4 hover:border-purple-brand transition-all">
            <div className="w-12 h-12 rounded-lg bg-card border border-purple-border/40 flex items-center justify-center text-mauve text-2xl">
              ⚡
            </div>
            <h3 className="text-lg font-bold text-mauve">Placement Details</h3>
            <p className="text-mauve text-sm leading-relaxed">
              Placement availability, format, scope, and commercial terms are
              discussed before any agreement is made.
            </p>
          </div>

        </div>
      </section>

      {/* ==================== SPONSORSHIP CTA / FORM SECTION ==================== */}
      <section className="bg-page border border-purple-border/40 rounded-2xl p-8 md:p-12 text-center space-y-6">
        <h2 className="text-2xl md:text-3xl font-bold text-mauve">
          Start a Sponsorship Inquiry
        </h2>
        <p className="text-muted text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
          Tell us about your organization and proposed sponsorship scope. Do
          not include passwords, payment-card details, or other secrets.
        </p>
        
        <div className="bg-raised border border-border rounded-xl p-6 max-w-md mx-auto space-y-2">
          <span className="text-xs uppercase font-mono font-bold text-muted tracking-widest block">
            Sponsorship Inquiries
          </span>
          <a
            href="mailto:info@chronoversecapital.com"
            className="text-mauve font-mono text-lg font-semibold hover:underline block break-all"
          >
            info@chronoversecapital.com
          </a>
        </div>

        <a
          href="mailto:info@chronoversecapital.com"
          className="inline-block bg-white text-black hover:bg-gray-200 font-bold px-8 py-3 rounded-md transition-colors shadow-lg"
        >
          Email Our Partnerships Team →
        </a>
      </section>

      {/* Footer Return Link */}
      <footer className="border-t border-border pt-8 text-center text-xs font-mono">
        <Link href="/" className="text-muted hover:text-mauve transition-colors underline">
          ← Return to Home
        </Link>
      </footer>

    </div>
  );
}
