import Image from "next/image";
import Link from "next/link";

import {
  PinterestIcon,
  RedditIcon,
  XIcon,
} from "@/components/socialicons";
import { FOOTER_NAV_GROUPS_V1 } from "@/config/institutionalNavigation";
import { siteConfig } from "@/config/siteConfig";

const FOOTER_LINK_CLASS =
  "rounded-sm text-[13px] text-secondary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-card";

const FOOTER_SOCIAL_LINKS = [
  {
    id: "reddit",
    href: siteConfig.socialLinks.reddit,
    accessibleLabel: "Join Chronoverse Capital on Reddit",
    title: "Reddit",
  },
  {
    id: "x",
    href: siteConfig.socialLinks.x,
    accessibleLabel: "Follow Chronoverse Capital on X",
    title: "X",
  },
  {
    id: "pinterest",
    href: siteConfig.socialLinks.pinterest,
    accessibleLabel: "Chronoverse Capital on Pinterest",
    title: "Pinterest",
  },
] as const;

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[#6F4C91]/25 bg-[#0D0D11] text-secondary">
      <div className="mx-auto max-w-[88rem] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(4,minmax(0,1fr))]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              aria-label="Chronoverse Capital home"
              className="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-page"
            >
              <Image
                src="/logo.svg"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-full"
              />
              <span className="text-sm font-bold tracking-[0.1em] text-primary">
                CHRONOVERSE <span className="text-mauve">CAPITAL</span>
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-secondary">
              Independent market analysis for disciplined decisions across a
              focused five-market launch universe.
            </p>
            <div className="mt-7">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
                Community
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {FOOTER_SOCIAL_LINKS.map((social) => (
                  <li key={social.id}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.accessibleLabel}
                      title={social.title}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-transparent text-secondary transition-colors hover:border-[#6F4C91]/40 hover:bg-[#15131A] hover:text-[#C8A7E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D11]"
                    >
                      <SocialIcon platform={social.id} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {FOOTER_NAV_GROUPS_V1.map((group) => (
            <nav key={group.label} aria-label={`${group.label} links`}>
              <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
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

        <div className="mt-12 grid gap-3 border-t border-[#6F4C91]/25 pt-6 text-xs leading-5 text-muted lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <p>
            Chronoverse output is informational and analytical, not
            personalized financial advice or a trade order. Market data may be
            delayed, incomplete, revised, or unavailable.
          </p>
          <p>
            © {new Date().getFullYear()} Chronoverse Capital. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({
  platform,
}: {
  platform: (typeof FOOTER_SOCIAL_LINKS)[number]["id"];
}) {
  const iconClassName = "h-5 w-5";

  if (platform === "reddit") {
    return <RedditIcon className={iconClassName} />;
  }
  if (platform === "pinterest") {
    return <PinterestIcon className={iconClassName} />;
  }
  return <XIcon className={iconClassName} />;
}
