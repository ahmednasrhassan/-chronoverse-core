import type { Metadata } from "next";

import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Newsletter",
  description:
    "Subscribe to receive published market research and analytical updates, separate from Free Lite and VIP Deep access.",
  pathname: "/newsletter",
});

export default function NewsletterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
