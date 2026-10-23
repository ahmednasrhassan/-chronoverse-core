import type { Metadata } from "next";

import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Newsletter",
  description: NEWSLETTER_SIGNUPS_PAUSED
    ? "Newsletter signups and delivery are temporarily paused. Read published Chronoverse Capital research on the website."
    : "Subscribe to receive published market research and analytical updates, available free to readers.",
  pathname: "/newsletter",
});

export default function NewsletterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
