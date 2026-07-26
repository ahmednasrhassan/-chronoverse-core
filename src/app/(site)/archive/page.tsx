import React from "react";
import Link from "next/link";

export default function ArchiveIndexPage() {
  const archiveData = [
    {
      category: "MACRO RESEARCH",
      posts: [
        {
          title: "Global Liquidity Cycles & Central Bank Balance Sheets 2026",
          date: "2026-07-20",
          slug: "/reports/macro-liquidity-cycles-2026",
        },
        {
          title: "Gold vs Tech Rotation: Hard Asset Accumulation Regimes",
          date: "2026-06-15",
          slug: "/reports/gold-vs-tech-rotation-report",
        },
      ],
    },
    {
      category: "CRYPTO INTELLIGENCE",
      posts: [
        {
          title: "Bitcoin Halving Fractals & Post-Supply Squeeze Analysis",
          date: "2026-05-10",
          slug: "/reports/bitcoin-halving-fractal-analysis",
        },
      ],
    },
    {
      category: "HISTORICAL TIMELINE",
      posts: [
        {
          title: "Key Monetary Policy Pivots & Liquidity Milestones",
          date: "2026-07-26",
          slug: "/timeline",
        },
      ],
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10 font-mono">
      
      {/* Header */}
      <header className="border-b border-[#27272a] pb-8 space-y-2">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-semibold border border-[#c87d55]/30 inline-block">
          SYSTEM DIRECTORY
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5]">
          Intelligence <span className="text-[#c87d55]">Archive Index</span>
        </h1>
        <p className="text-[#a1a1aa] text-sm font-sans">
          Full directory of all strategic dossiers, proprietary research assets, and historical intelligence.
        </p>
      </header>

      {/* Directory Sections */}
      <div className="space-y-10">
        {archiveData.map((sec, idx) => (
          <section key={idx} className="space-y-4">
            <h2 className="text-sm font-bold text-[#c87d55] tracking-wider uppercase flex items-center gap-2 border-b border-[#27272a] pb-2">
              <span>[PATH]</span> {sec.category}
            </h2>

            <ul className="divide-y divide-[#27272a]/60">
              {sec.posts.map((post, pIdx) => (
                <li 
                  key={pIdx} 
                  className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-[#18181b] px-3 rounded-lg transition-colors group cursor-pointer"
                >
                  <Link 
                    href={post.slug} 
                    className="text-[#f4f4f5] text-sm font-medium group-hover:text-[#c87d55] transition-colors leading-snug"
                  >
                    {post.title}
                  </Link>
                  <time className="text-xs text-[#a1a1aa] font-mono whitespace-nowrap">
                    [{post.date}]
                  </time>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Footer Info */}
      <footer className="border-t border-[#27272a] pt-8 text-center text-xs text-[#52525b]">
        // ChronoVerse Intelligence Ledger | Automated Directory Node //
      </footer>

    </div>
  );
}