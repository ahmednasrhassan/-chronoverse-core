"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import {
  PUBLIC_ACCOUNT_NAV_V1,
  PUBLIC_PRIMARY_NAV_V1,
} from "@/config/institutionalNavigation";

const NAV_LINK_CLASS =
  "rounded-md px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-raised hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-page/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Chronoverse Capital home"
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page"
        >
          <Image
            src="/logo.svg"
            alt=""
            width={36}
            height={36}
            priority
            className="h-9 w-9 shrink-0 rounded-full"
          />
          <span className="truncate text-sm font-bold tracking-[0.12em] text-primary sm:text-base">
            CHRONOVERSE <span className="text-mauve">CAPITAL</span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 xl:flex"
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
            className="rounded-md border border-purple-border bg-raised px-4 py-2 text-sm font-semibold text-primary transition-colors hover:border-mauve hover:text-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page"
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
          <div className="mx-auto grid max-w-7xl gap-1">
            {[...PUBLIC_PRIMARY_NAV_V1, ...PUBLIC_ACCOUNT_NAV_V1].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
                className={item.label === "Early Access"
                  ? "mt-2 rounded-md border border-purple-border bg-raised px-3 py-3 text-center text-sm font-semibold text-primary hover:border-mauve hover:text-mauve focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
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
