import Image from "next/image";
import Link from "next/link";

import { FOOTER_NAV_GROUPS_V1 } from "@/config/institutionalNavigation";

const FOOTER_LINK_CLASS =
  "rounded-sm text-sm text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-page text-secondary">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              aria-label="Chronoverse Capital home"
              className="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              <Image
                src="/logo.svg"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full"
              />
              <span className="text-sm font-bold tracking-[0.12em] text-primary">
                CHRONOVERSE <span className="text-mauve">CAPITAL</span>
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-secondary">
              Independent market analysis for disciplined decisions across a
              focused five-market launch universe.
            </p>
          </div>

          {FOOTER_NAV_GROUPS_V1.map((group) => (
            <nav key={group.label} aria-label={`${group.label} links`}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {group.label}
              </h2>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className={FOOTER_LINK_CLASS}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 text-xs leading-5 text-muted">
          <p>
            Chronoverse output is informational and analytical, not
            personalized financial advice or a trade order. Market data may be
            delayed, incomplete, revised, or unavailable.
          </p>
          <p className="mt-3">
            © {new Date().getFullYear()} Chronoverse Capital. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
