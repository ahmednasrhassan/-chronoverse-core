import React from "react";
import Link from "next/link";

export default function AuthorCard({ authorName }: { authorName?: string }) {
  return (
    <section className="my-10 p-5 bg-zinc-950 border border-zinc-800/80 rounded-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-4">
        {/* Initials Avatar */}
        <div className="w-12 h-12 rounded border border-amber-500/30 bg-zinc-900 flex items-center justify-center font-mono text-amber-500 font-bold shrink-0">
          [AH]
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link 
              href="/about" 
              className="text-sm font-bold text-zinc-100 hover:text-amber-400 transition font-mono"
            >
              Ahmed Nasr Hassan
            </Link>
            <span className="text-[10px] bg-zinc-900 border border-amber-500/30 text-amber-500/90 px-1.5 py-0.5 rounded uppercase font-mono tracking-wider">
              Lead Macro Strategist
            </span>
          </div>

          <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-xl">
            Responsible for macro-strategy, asset correlation modeling, systemic risk dynamics, and institutional capital flows analysis.
          </p>
        </div>
      </div>

      {/* Verified Professional Channels */}
      <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/60 w-full sm:w-auto justify-end">
        <a
          href="https://www.linkedin.com/in/ahmed-n-hassan-09b739238"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-white text-[11px] transition font-mono flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1.5 rounded border border-zinc-800"
        >
          LinkedIn ↗
        </a>
        <a
          href="https://x.com/ChronoVerseCap"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-white text-[11px] transition font-mono flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1.5 rounded border border-zinc-800"
        >
          X ↗
        </a>
        <a
          href="https://www.reddit.com/u/Prestigious_Mine_321"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-400 hover:text-white text-[11px] transition font-mono flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1.5 rounded border border-zinc-800"
        >
          Reddit ↗
        </a>
      </div>
    </section>
  );
}ح