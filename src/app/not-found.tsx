import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 — Signal Lost",
  description:
    "The intelligence dossier or page you requested could not be located in the Chronoverse Capital archive.",
};

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-20">
      <div className="max-w-2xl w-full text-center space-y-8 font-mono">
        
        {/* Glitch-style 404 Header */}
        <div className="space-y-3">
          <span className="bg-red-500/15 text-red-400 px-3 py-1 rounded-md text-xs font-semibold border border-red-500/30 inline-block tracking-widest uppercase">
            SIGNAL LOST // 404
          </span>
          <h1 className="text-7xl md:text-9xl font-extrabold text-[#f4f4f5] tracking-tighter leading-none">
            4<span className="text-[#c87d55]">0</span>4
          </h1>
          <p className="text-[#a1a1aa] text-sm md:text-base font-sans max-w-md mx-auto leading-relaxed">
            The dossier, report, or intelligence node you are attempting to access has been
            archived, relocated, or never existed within this timeline.
          </p>
        </div>

        {/* Terminal-style Diagnostic Box */}
        <div className="bg-[#0a0a0a] border border-[#27272a] rounded-xl p-5 text-left text-xs text-[#71717a] space-y-1.5 shadow-xl max-w-md mx-auto">
          <p>&gt; QUERYING ARCHIVE NODE...</p>
          <p>&gt; STATUS: <span className="text-red-500 font-bold">RESOURCE NOT FOUND</span></p>
          <p>&gt; RECOMMENDATION: RETURN TO SECURE TERMINAL</p>
        </div>

        {/* Navigation Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto bg-[#c87d55] hover:bg-[#d88d65] text-black font-bold px-8 py-3 rounded-lg text-xs uppercase tracking-wider transition-colors shadow-md"
          >
            ← Return to Home Terminal
          </Link>
          <Link
            href="/reports"
            className="w-full sm:w-auto bg-[#18181b] hover:bg-[#27272a] text-[#f4f4f5] border border-[#27272a] hover:border-[#c87d55]/50 font-bold px-8 py-3 rounded-lg text-xs uppercase tracking-wider transition-colors"
          >
            Browse Dossiers →
          </Link>
        </div>

      </div>
    </div>
  );
}
