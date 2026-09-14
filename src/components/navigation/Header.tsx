"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import {
  PUBLIC_ACCOUNT_NAV_V1,
  PUBLIC_PRIMARY_NAV_V1,
} from "@/config/institutionalNavigation";

const MOBILE_NAV_LINK_CLASS =
  "flex min-h-11 items-center border-b border-[#6F4C91]/20 px-3 text-sm font-medium text-[#CFC5B8] hover:border-[#6F4C91] hover:bg-[#15131A] hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8A7E8]";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#6F4C91]/35 bg-[#050506]">
      <div className="mx-auto h-[4.5rem] max-w-[88rem] px-4 sm:px-6 lg:px-8 xl:h-[5.75rem]">
        <div className="grid h-full grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 xl:grid-cols-[minmax(19rem,31fr)_minmax(31rem,45fr)_minmax(18rem,24fr)] xl:gap-0">
          <Link
            href="/"
            aria-label="Chronoverse Capital home"
            className="relative flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8A7E8] xl:border-r xl:border-[#6F4C91]/35 xl:bg-[#0D0D11] xl:px-6"
          >
            <Image
              src="/logo.svg"
              alt=""
              width={54}
              height={54}
              loading="eager"
              className="h-11 w-11 shrink-0 rounded-full xl:h-[3.375rem] xl:w-[3.375rem]"
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-extrabold tracking-[0.08em] text-[#F3EBDD] sm:text-base xl:text-[17px]">
                CHRONOVERSE <span className="text-[#C8A7E8]">CAPITAL</span>
              </span>
              <span className="mt-1 hidden font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-[#C8A7E8] sm:block">
                Market intelligence
              </span>
            </span>
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-6 hidden h-px w-16 bg-[#A77BD8]/70 xl:block"
            />
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center bg-[#050506] px-4 xl:flex"
          >
            <ol className="grid h-14 w-full grid-cols-5 border-y border-[#6F4C91]/30 bg-[#0D0D11]/65">
              {PUBLIC_PRIMARY_NAV_V1.map((item, index) => (
                <li
                  key={item.label}
                  className="relative min-w-0"
                >
                  <Link
                    href={item.href}
                    className="group relative flex h-full min-w-0 items-center justify-center gap-2.5 px-2 text-[#CFC5B8] hover:bg-[#15131A]/55 hover:text-[#F3EBDD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8A7E8]"
                  >
                    <span className="font-mono text-[9px] tabular-nums text-[#91889A] group-hover:text-[#C8A7E8]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-sm font-semibold">
                      {item.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-3 bottom-0 h-0.5 bg-transparent group-hover:bg-[#A77BD8]"
                    />
                  </Link>
                  {index < PUBLIC_PRIMARY_NAV_V1.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-0 top-1/2 h-5 w-px -translate-y-1/2 bg-[#6F4C91]/25"
                    />
                  ) : null}
                </li>
              ))}
            </ol>
          </nav>

          <div className="hidden items-center border-l border-[#6F4C91]/35 bg-[#15131A] px-5 xl:flex">
            <div className="flex h-14 w-full items-center border-y border-[#6F4C91]/30 bg-[#0D0D11] px-1">
              <Link
                href="/account"
                className="flex min-h-11 min-w-[6.5rem] flex-1 flex-col justify-center px-3 hover:bg-[#15131A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8A7E8]"
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#91889A]">
                  Member
                </span>
                <span className="mt-1 text-sm font-semibold text-[#F3EBDD]">
                  Account
                </span>
              </Link>
              <span
                aria-hidden="true"
                className="mx-1 h-7 w-px shrink-0 bg-[#6F4C91]/35"
              />
              <Link
                href="/account"
                aria-label="Sign in to your account"
                className="chronoverse-primary-cta flex min-h-11 min-w-[8.5rem] items-center justify-center border border-[#6F4C91] px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3EBDD]"
              >
                Sign In
              </Link>
            </div>
          </div>

          <button
            type="button"
            aria-label="Toggle primary navigation"
            aria-controls="public-mobile-navigation"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
            className="my-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[#6F4C91]/55 bg-[#0D0D11] text-[#F3EBDD] hover:border-[#C8A7E8] hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506] xl:hidden"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18 18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {isMenuOpen ? (
        <nav
          id="public-mobile-navigation"
          aria-label="Mobile navigation"
          className="border-t border-[#6F4C91]/30 bg-[#0D0D11] px-4 py-5 sm:px-6 xl:hidden"
        >
          <div className="mx-auto grid max-w-[88rem] gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)] md:gap-10">
            <div aria-labelledby="mobile-primary-navigation-label">
              <p
                id="mobile-primary-navigation-label"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C8A7E8]"
              >
                Primary
              </p>
              <div className="mt-2 grid sm:grid-cols-2 sm:gap-x-4">
                {PUBLIC_PRIMARY_NAV_V1.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={MOBILE_NAV_LINK_CLASS}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div
              aria-labelledby="mobile-account-navigation-label"
              className="border-t border-[#6F4C91]/30 pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0"
            >
              <p
                id="mobile-account-navigation-label"
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C8A7E8]"
              >
                Account
              </p>
              <div className="mt-2 grid gap-2">
                {PUBLIC_ACCOUNT_NAV_V1.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={item.label === "Sign In"
                      ? "chronoverse-primary-cta flex min-h-11 items-center justify-center rounded-[2px] border border-[#6F4C91] px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3EBDD]"
                      : MOBILE_NAV_LINK_CLASS}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
