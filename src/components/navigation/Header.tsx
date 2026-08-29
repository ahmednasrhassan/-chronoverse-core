'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import MarketTicker from '@/components/charts/MarketTicker';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      {/* Proprietary Market Ticker Strip — fully unbranded, sourced from
          `/api/market-data` (yahoo-finance2). Replaces the previous
          ticker tape widget. */}
      <MarketTicker />

      {/* Main Header */}
      <header className="w-full bg-[#050506]/95 border-b border-border/80 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo & Domain */}
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.svg"
              alt="Chronoverse Capital logo"
              width={40}
              height={40}
              priority
             className="rounded-full shrink-0"
            />
            <div className="flex flex-col justify-center">
              <span className="text-xl font-extrabold tracking-wider text-primary transition-colors group-hover:text-purple-brand">
                CHRONOVERSE <span className="text-[#C8A7E8]">CAPITAL</span>
              </span>
              <span className="text-[10px] text-secondary font-mono tracking-widest group-hover:text-[#C8A7E8]/80 transition-colors">
                www.chronoversecapital.com
              </span>
            </div>
          </Link>

          {/* Desktop Links */}
          <nav className="hidden lg:flex items-center space-x-8 text-sm font-medium text-secondary">
            <Link href="/" className="hover:text-[#C8A7E8] transition-colors">
              Home
            </Link>
            <Link href="/reports" className="hover:text-[#C8A7E8] transition-colors flex items-center space-x-1 group">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5 group-hover:bg-[#C8A7E8] transition-colors"></span>
              Terminal & Reports
            </Link>
            <Link href="/intelligence" className="hover:text-[#C8A7E8] transition-colors">
              Macro Echoes
            </Link>
            <Link href="/archive" className="hover:text-[#C8A7E8] transition-colors">
             Alpha Insights
            </Link>
          </nav>

          {/* Mobile Hamburger */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              type="button"
              className="text-muted hover:text-purple-brand focus:outline-none p-2 rounded-md bg-[#15131A] border border-border"
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
          <div className="lg:hidden bg-[#050506] border-b border-border px-4 pt-4 pb-6 space-y-3">
            <Link
              href="/"
              onClick={() => setIsMenuOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-secondary hover:bg-[#15131A] hover:text-[#C8A7E8]"
            >
              Home
            </Link>
            <Link
              href="/reports"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center px-3 py-2.5 rounded-md text-sm font-medium text-secondary hover:bg-[#15131A] hover:text-[#C8A7E8]"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
              Terminal & Reports
            </Link>
            <Link
              href="/intelligence"
              onClick={() => setIsMenuOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-secondary hover:bg-[#15131A] hover:text-[#C8A7E8]"
            >
              Macro Echoes
            </Link>
            <Link
              href="/archive"
              onClick={() => setIsMenuOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-secondary hover:bg-[#15131A] hover:text-[#C8A7E8]"
            >
              Alpha Insights
            </Link>
          </div>
        )}
      </header>
    </>
  );
}