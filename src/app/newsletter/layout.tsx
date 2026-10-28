import type { Metadata } from "next";

import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";
import SiteLayout from "@/app/(site)/layout";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Chronoverse Capital Weekly",
  description: NEWSLETTER_SIGNUPS_PAUSED
    ? "Independent research and market insights from Chronoverse Capital. Newsletter subscriptions are temporarily unavailable; explore our published research."
    : "Independent research and market insights, delivered to your inbox. Subscribe to Chronoverse Capital Weekly, free to readers with email confirmation.",
  pathname: "/newsletter",
});

export default function NewsletterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SiteLayout>{children}</SiteLayout>;
}
