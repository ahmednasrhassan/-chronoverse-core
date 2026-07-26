import React from "react";
import MiniChart from "@/components/tradingview/MiniChart";
import Link from "next/link";

export default function HomePage() {
  const marketSymbols = [
    "FOREXCOM:SPXUSD",
    "TVC:GOLD",
    "TVC:USOIL",
    "BINANCE:BTCUSDT",
  ];

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto space-y-10">
      
      {/* Header Title */}
      <div className="mb-10 border-b border-[#27272a] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-[#f4f4f5]">
            ChronoVerse <span className="text-[#c87d55]">Capital</span>
          </h1>
          <p className="text-[#a1a1aa] mt-2 text-lg">
            Real-time macroeconomic data, exclusive insights, and institutional analytics.
          </p>
        </div>
        <Link 
          href="/reports" 
          className="bg-[#c87d55] hover:bg-[#d88d65] text-black px-6 py-2.5 rounded-md font-bold transition-colors text-center shadow-sm"
        >
          View Reports
        </Link>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* ================= SECTION 1: TradingView Live Widgets ================= */}
        {marketSymbols.map((symbol, i) => (
          <div key={i} className="bg-[#18181b] border border-[#27272a] p-2 rounded-xl hover:border-[#c87d55]/50 transition-colors overflow-hidden h-36">
            <MiniChart symbol={symbol} />
          </div>
        ))}

        {/* ================= SECTION 2: Terminal & Newsletter ================= */}
        
        {/* Exclusive Recommendations Terminal */}
        <div className="bg-[#0a0a0a] border border-[#27272a] p-6 rounded-xl lg:col-span-2 shadow-inner font-mono relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#c87d55] to-transparent opacity-50"></div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-[#a1a1aa] text-xs ml-2">sys_terminal_v2.1</span>
          </div>
          <h2 className="text-[#c87d55] text-lg font-bold mb-3">{">"} EXCLUSIVE_SIGNALS</h2>
          <ul className="space-y-2 text-sm text-[#f4f4f5]">
            <li><span className="text-[#a1a1aa]">[10:42 AM]</span> ALERT: FED Policy Shift Detected.</li>
            <li><span className="text-[#a1a1aa]">[09:15 AM]</span> BUY: Physical Gold Accumulation Zone.</li>
            <li><span className="text-[#a1a1aa]">[Yesterday]</span> HOLD: US Treasuries short duration.</li>
          </ul>
          <div className="mt-4 animate-pulse text-[#c87d55]">_</div>
        </div>

        {/* Amazon Newsletter */}
        <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl lg:col-span-2 flex flex-col justify-center">
          <h2 className="text-xl font-bold text-[#f4f4f5] mb-2">Institutional Briefing</h2>
          <p className="text-[#a1a1aa] text-sm mb-5">
            Subscribe to our Amazon-powered SES newsletter for direct macroeconomic reports.
          </p>
          <div className="flex gap-3">
            <input 
              type="email" 
              placeholder="Enter your corporate email..." 
              className="w-full bg-[#120e0c] border border-[#27272a] text-[#f4f4f5] rounded-md px-4 py-2 focus:outline-none focus:border-[#c87d55] transition-colors"
            />
            <button className="bg-[#c87d55] hover:bg-[#d88d65] text-black px-6 py-2 rounded-md font-bold transition-colors whitespace-nowrap shadow-sm">
              Subscribe
            </button>
          </div>
        </div>

        {/* ================= SECTION 3: Articles ================= */}
        
        {/* Recent Articles */}
        <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl lg:col-span-2">
          <h2 className="text-lg font-bold text-[#f4f4f5] mb-4 flex justify-between items-center">
            Recent Intelligence
            <Link href="/reports" className="text-sm text-[#c87d55] font-normal hover:underline">View All</Link>
          </h2>
          <ul className="space-y-4">
            <li className="flex gap-4 items-center group cursor-pointer">
              <div className="w-16 h-16 bg-[#27272a] rounded-md flex-shrink-0 group-hover:bg-[#c87d55]/20 transition-colors"></div>
              <div>
                <h3 className="text-[#f4f4f5] font-medium group-hover:text-[#c87d55] transition-colors">Global Liquidity Cycles</h3>
                <span className="text-xs text-[#a1a1aa]">Macro Research • 8 min read</span>
              </div>
            </li>
            <li className="flex gap-4 items-center group cursor-pointer">
              <div className="w-16 h-16 bg-[#27272a] rounded-md flex-shrink-0 group-hover:bg-[#c87d55]/20 transition-colors"></div>
              <div>
                <h3 className="text-[#f4f4f5] font-medium group-hover:text-[#c87d55] transition-colors">Bitcoin Halving Fractals</h3>
                <span className="text-xs text-[#a1a1aa]">Crypto Intelligence • 10 min read</span>
              </div>
            </li>
          </ul>
        </div>

        {/* Archived Articles */}
        <div className="bg-[#18181b] border border-[#27272a] p-6 rounded-xl lg:col-span-2 opacity-90">
          <h2 className="text-lg font-bold text-[#f4f4f5] mb-4 flex justify-between items-center">
            Historical Archives
            <span className="text-sm text-[#c87d55] font-normal hover:underline cursor-pointer">Browse</span>
          </h2>
          <ul className="space-y-4">
            {[1, 2, 3].map((item) => (
              <li key={item} className="flex gap-4 items-center group cursor-pointer">
                <div className="w-2 h-2 rounded-full bg-[#27272a] group-hover:bg-[#c87d55]"></div>
                <div>
                  <h3 className="text-[#a1a1aa] group-hover:text-[#f4f4f5] transition-colors text-sm">2024 Global Recession Indicators Review</h3>
                  <span className="text-xs text-[#52525b]">Q1 2024 Archive</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* ================= SECTION 4: Sponsors ================= */}
        <div className="lg:col-span-4 mt-4">
          <h3 className="text-[#a1a1aa] text-sm uppercase tracking-wider mb-4 font-semibold">Exclusive Partners</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((partner) => (
              <div key={partner} className="bg-[#18181b] border border-[#27272a] h-20 rounded-xl flex items-center justify-center grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer">
                <span className="text-[#52525b] font-bold text-lg">SPONSOR {partner}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}