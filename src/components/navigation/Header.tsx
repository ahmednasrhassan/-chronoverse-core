"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import {
  PUBLIC_ACCOUNT_NAV_V1,
  PUBLIC_PRIMARY_NAV_V1,
} from "@/config/institutionalNavigation";

const NAV_LINK_CLASS =
  "rounded-sm px-2.5 py-2 text-[13px] font-medium text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page 2xl:px-3";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#6F4C91]/25 bg-[#050506]/95 backdrop-blur-md">
      <div className="mx-auto flex h-[4.5rem] max-w-[88rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Chronoverse Capital home"
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page"
        >
          <Image
            src="/logo.svg"
            alt=""
            width={40}
            height={40}
            priority
            className="h-10 w-10 shrink-0 rounded-full"
          />
          <span className="truncate text-sm font-bold tracking-[0.1em] text-primary sm:text-[15px]">
            CHRONOVERSE <span className="text-mauve">CAPITAL</span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-0.5 xl:flex 2xl:gap-1"
        >
          {PUBLIC_PRIMARY_NAV_V1.map((item) => (
            <Link key={item.label} href={item.href} className={NAV_LINK_CLASS}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          <Link href="/account" className={NAV_LINK_CLASS}>
            Account
          </Link>
          <Link
            href="/account"
            aria-label="Sign in for early access"
            className="rounded-sm border border-[#A77BD8] bg-[#A77BD8] px-4 py-2.5 text-[13px] font-semibold text-[#050506] transition-colors hover:border-[#C8A7E8] hover:bg-[#C8A7E8] hover:text-[#050506] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]"
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
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary transition-colors hover:border-purple-border hover:text-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page xl:hidden"
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
                  ? "mt-2 rounded-sm border border-[#A77BD8] bg-[#A77BD8] px-3 py-3 text-center text-sm font-semibold text-[#050506] hover:border-[#C8A7E8] hover:bg-[#C8A7E8] hover:text-[#050506] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8]"
                  : NAV_LINK_CLASS}
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
