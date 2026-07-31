'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Load TradingView Ticker Widget Script
  useEffect(() => {
    const scriptId = 'tv-ticker-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
      script.async = true;
      script.innerHTML = JSON.stringify({
        "symbols": [
          { "proName": "FOREXCOM:SPXUSD", "title": "S&P 500" },
          { "proName": "TVC:GOLD", "title": "Gold" },
          { "proName": "TVC:USOIL", "title": "Crude Oil" },
          { "proName": "BITSTAMP:BTCUSD", "title": "Bitcoin" },
          { "proName": "FX:EURUSD", "title": "EUR/USD" },
          { "proName": "TVC:DXY", "title": "US Dollar Index" }
        ],
        "showSymbolLogo": true,
        "isTransparent": true,
        "displayMode": "adaptive",
        "colorTheme": "dark",
        "locale": "en"
      });
      document.getElementById('tv-ticker-container')?.appendChild(script);
    }
  }, []);

  return (
    <>
      {/* TradingView Ticker Tape */}
      <div className="w-full bg-[#0a0806] border-b border-zinc-800/80 h-10 flex items-center overflow-hidden">
        <div id="tv-ticker-container" className="w-full h-full"></div>
      </div>

      {/* Main Header */}
      <header className="w-full bg-[#0d0a08]/95 border-b border-zinc-800/80 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo & Domain */}
          <Link href="/" className="flex flex-col justify-center group">
            <span className="text-xl font-extrabold tracking-wider text-zinc-100 transition-colors group-hover:text-white">
              CHRONOVERSE <span className="text-[#c87d55]">CAPITAL</span>
            </span>
            <span className="text-[10px] text-zinc-500 font-mono tracking-widest group-hover:text-[#c87d55]/80 transition-colors">
              www.chronoversecapital.com
            </span>
          </Link>

          {/* Desktop Links */}
          <nav className="hidden lg:flex items-center space-x-8 text-sm font-medium text-zinc-300">
            <Link href="/" className="hover:text-[#c87d55] transition-colors">
              Home
            </Link>
            <Link href="/reports" className="hover:text-[#c87d55] transition-colors flex items-center space-x-1 group">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5 group-hover:bg-[#c87d55] transition-colors"></span>
              Terminal & Reports
            </Link>
            <Link href="/intelligence" className="hover:text-[#c87d55] transition-colors">
              Macro Echoes
            </Link>
            <Link href="/archive" className="hover:text-[#c87d55] transition-colors">
              Alpha Insights
            </Link>
          </nav>

          {/* Right Action Button (Studio) - Desktop */}
          <div className="hidden lg:flex items-center space-x-4">
            <Link
              href="/studio"
              className="text-xs font-extrabold uppercase tracking-wider px-5 py-2.5 rounded-lg bg-[#c87d55] hover:bg-[#b06a43] text-[#0d0a08] transition-all shadow-md shadow-[#c87d55]/20"
            >
              Access Studio
            </Link>
          </div>

          {/* Mobile Hamburger */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              type="button"
              className="text-zinc-400 hover:text-white focus:outline-none p-2 rounded-md bg-[#181310] border border-zinc-800"
              aria-label="Toggle Menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMenuOpen && (
          <div className="lg:hidden bg-[#0d0a08] border-b border-zinc-800 px-4 pt-4 pb-6 space-y-3">
            <Link
              href="/"
              onClick={() => setIsMenuOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-zinc-300 hover:bg-[#181310] hover:text-[#c87d55]"
            >
              Home
            </Link>
            <Link
              href="/reports"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center px-3 py-2.5 rounded-md text-sm font-medium text-zinc-300 hover:bg-[#181310] hover:text-[#c87d55]"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
              Terminal & Reports
            </Link>
            <Link
              href="/intelligence"
              onClick={() => setIsMenuOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-zinc-300 hover:bg-[#181310] hover:text-[#c87d55]"
            >
              Macro Echoes
            </Link>
            <Link
              href="/archive"
              onClick={() => setIsMenuOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-zinc-300 hover:bg-[#181310] hover:text-[#c87d55]"
            >
              Alpha Insights
            </Link>

            {/* Mobile Action Button (Studio) - Mobile */}
            <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
             <Link
          href="/studio"
          onClick={() => setIsMenuOpen(false)}
          className="w-full text-center text-xs font-extrabold uppercase tracking-wider px-4 py-3 rounded-lg bg-[#c87d55] text-[#0d0a08] hover:bg-[#b56c44] transition-colors"
        >
          Access Studio
        </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}