import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Chronoverse VIP | Institutional Intelligence",
  description:
    "Private institutional market intelligence, advanced analytics, signals, portfolio tools, and executive research from Chronoverse Capital.",

  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

const vipNav = [
  {
    label: "Overview",
    href: "/vip",
  },
  {
    label: "Markets",
    href: "/vip/markets",
  },
  {
    label: "Intelligence",
    href: "/vip/intelligence",
  },
  {
    label: "Portfolio",
    href: "/vip/portfolio",
  },
  {
    label: "Watchlist",
    href: "/vip/watchlist",
  },
  {
    label: "Account",
    href: "/vip/account",
  },
];

export default function VipLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050506] text-[#F2EEF8]">
      {/* VIP background atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
      >
        <div className="absolute inset-0 bg-[#050506]" />

        <div className="absolute left-1/2 -top-45 h-105 w-190 -translate-x-1/2 rounded-full bg-[#596BAF]/12 blur-[120px]" />

        <div className="absolute -right-35 -bottom-55 h-105 w-105 rounded-full bg-[#7185D8]/10 blur-[140px]" />

        <div className="absolute top-[45%] -left-35 h-80 w-80 rounded-full bg-[#35436F]/8 blur-[120px]" />
      </div>

      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-[#201D26] bg-[#050506]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-4 md:px-6 lg:px-8">
          {/* Brand */}
          <Link
            href="/vip"
            aria-label="Chronoverse VIP home"
            className="group flex min-w-0 items-center gap-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#596BAF]/50 bg-[#111014] shadow-[0_0_28px_rgba(102,82,142,0.18)] transition-all group-hover:border-[#7185D8]/80">
              <span className="text-sm font-black tracking-tight text-[#F2EEF8]">
                CV
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold tracking-[0.08em] text-[#F2EEF8]">
                  CHRONOVERSE
                </span>

                <span className="rounded border border-[#596BAF]/50 bg-[#596BAF]/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#B8C4FF]">
                  VIP
                </span>
              </div>

              <p className="truncate text-[9px] uppercase tracking-[0.22em] text-[#8992B8]">
                Institutional Intelligence
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-1 lg:flex">
            {vipNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B8C4FF] transition-all hover:bg-[#14131A] hover:text-[#FFFFFF]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Status */}
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-[#292432] bg-[#0D0D11] px-3 py-2 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" />

              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#AAB2CC]">
                Private Network
              </span>
            </div>

            <div className="rounded-lg border border-[#596BAF]/50 bg-[#596BAF]/12 px-3 py-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#B8C4FF]">
                Preview
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="border-t border-[#1B1920] lg:hidden">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2">
            {vipNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B8C4FF] transition-colors hover:bg-[#14131A] hover:text-[#FFFFFF]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Main Shell */}
      <div className="mx-auto flex w-full max-w-7xl">
        {/* Sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-[#1F1D25] bg-[#080809]/80 px-4 py-6 xl:block">
          <div className="space-y-8">
            {/* Identity Card */}
            <div className="rounded-2xl border border-[#292432] bg-[#0D0D11] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#93A4F5]">
                Access Layer
              </p>

              <h2 className="mt-2 text-sm font-bold text-[#F2EEF8]">
                Private Alpha Desk
              </h2>

              <p className="mt-2 text-[11px] leading-5 text-[#AAB2CC]">
                Institutional-grade market intelligence and private analytical
                infrastructure.
              </p>

              <div className="mt-4 h-px bg-[#24212B]" />

              <div className="mt-4 flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-[0.18em] text-[#8992B8]">
                  Environment
                </span>

                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#B8C4FF]">
                  Preview
                </span>
              </div>
            </div>

            {/* Navigation */}
            <div>
              <p className="mb-3 px-2 text-[9px] font-bold uppercase tracking-[0.22em] text-[#8992B8]">
                Intelligence Suite
              </p>

              <div className="space-y-1">
                {vipNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-[11px] font-semibold text-[#B8C4FF] transition-all hover:border-[#292432] hover:bg-[#14131A] hover:text-[#FFFFFF]"
                  >
                    <span>{item.label}</span>

                    <span className="text-[10px] text-[#6677BA] transition-colors group-hover:text-[#9BABFF]">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* System Status */}
            <div className="rounded-2xl border border-[#211F29] bg-[#0A0A0D] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#8992B8]">
                System Status
              </p>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#AAB2CC]">
                    Market Engine
                  </span>

                  <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
                    Online
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#AAB2CC]">
                    Intelligence
                  </span>

                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[#B8C4FF]">
                    Preview
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#AAB2CC]">
                    Membership
                  </span>

                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[#8992B8]">
                    Pending
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 lg:py-10">
            {children}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1F1D25] bg-[#080809]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-6 lg:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#B8C4FF]">
              Chronoverse Capital
            </p>

            <p className="mt-1 text-[9px] uppercase tracking-[0.16em] text-[#8992B8]">
              Private Institutional Intelligence Environment
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/"
              className="text-[9px] uppercase tracking-[0.16em] text-[#B8C4FF] transition-colors hover:text-[#FFFFFF]"
            >
              Public Site
            </Link>

            <Link
              href="/privacy-policy"
              className="text-[9px] uppercase tracking-[0.16em] text-[#B8C4FF] transition-colors hover:text-[#FFFFFF]"
            >
              Privacy
            </Link>

            <Link
              href="/terms-of-service"
              className="text-[9px] uppercase tracking-[0.16em] text-[#B8C4FF] transition-colors hover:text-[#FFFFFF]"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
