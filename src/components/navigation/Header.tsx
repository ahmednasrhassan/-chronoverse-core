"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import {
  PUBLIC_ACCOUNT_NAV_V1,
  PUBLIC_PRIMARY_NAV_V1,
} from "@/config/institutionalNavigation";

const NAV_LINK_CLASS =
  "border-b border-transparent px-2.5 py-2 text-[13px] font-medium text-secondary transition-colors hover:border-[#6F4C91] hover:text-primary active:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page 2xl:px-3";

const MOBILE_NAV_LINK_CLASS =
  "flex min-h-11 items-center border-b border-[#6F4C91]/20 px-3 text-sm font-medium text-secondary hover:border-[#6F4C91] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mauve";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#6F4C91]/25 bg-[#050506]/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.75rem] max-w-[88rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:grid xl:grid-cols-[minmax(16rem,1fr)_auto_minmax(16rem,1fr)]">
        <Link
          href="/"
          aria-label="Chronoverse Capital home"
          className="flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page xl:justify-self-start"
        >
          <Image
            src="/logo.svg"
            alt=""
            width={44}
            height={44}
            priority
            className="h-11 w-11 shrink-0 rounded-full"
          />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold tracking-[0.11em] text-primary sm:text-base">
              CHRONOVERSE <span className="text-mauve">CAPITAL</span>
            </span>
            <span className="mt-0.5 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-muted sm:block">
              Market intelligence
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-0.5 xl:flex xl:justify-self-center 2xl:gap-1"
        >
          {PUBLIC_PRIMARY_NAV_V1.map((item) => (
            <Link key={item.label} href={item.href} className={NAV_LINK_CLASS}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 border-l border-[#6F4C91]/25 pl-3 xl:flex xl:justify-self-end">
          <Link href="/account" className={NAV_LINK_CLASS}>
            Account
          </Link>
          <Link
            href="/account"
            aria-label="Sign in for early access"
            className="rounded-sm border border-[#6F4C91] bg-[#15131A] px-4 py-2.5 text-[13px] font-semibold text-[#F3EBDD] transition-colors hover:border-[#C8A7E8] hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]"
          >
            Early Access
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle primary navigation"
          aria-controls="public-mobile-navigation"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#6F4C91]/50 bg-[#0D0D11] text-primary transition-colors hover:border-[#C8A7E8] hover:text-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page xl:hidden"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {isMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {isMenuOpen ? (
        <nav
          id="public-mobile-navigation"
          aria-label="Mobile navigation"
          className="border-t border-border bg-page px-4 py-4 sm:px-6 xl:hidden"
        >
          <div className="mx-auto grid max-w-[88rem] gap-1">
            {[...PUBLIC_PRIMARY_NAV_V1, ...PUBLIC_ACCOUNT_NAV_V1].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={item.label === "Early Access"
                  ? "mt-2 flex min-h-11 items-center justify-center rounded-sm border border-[#6F4C91] bg-[#15131A] px-3 text-sm font-semibold text-[#F3EBDD] hover:border-[#C8A7E8] hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
                  : MOBILE_NAV_LINK_CLASS}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
