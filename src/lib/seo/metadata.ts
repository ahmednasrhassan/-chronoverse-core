import type { Metadata } from "next";

import { siteConfig } from "@/config/siteConfig";
import { buildCanonicalUrl } from "@/lib/seo/site-url";

export const siteLocale = "en_US";
export const primaryRssPath = "/rss.xml";
export const publicSocialImage = {
  url: buildCanonicalUrl("/chronoverse-social.png"),
  width: 1200,
  height: 630,
  alt: `${siteConfig.name} institutional macroeconomic intelligence`,
} as const;

export type PublicPageMetadataInput = {
  title: string;
  description: string;
  pathname: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
};

/**
 * Returns complete nested metadata objects so route metadata does not depend
 * on shallow inheritance for canonical, social, or RSS identity.
 * Titles remain unbranded unless the caller supplies a branded root title;
 * the root layout's title template owns child-route branding.
 */
export function buildPublicPageMetadata({
  title,
  description,
  pathname,
  openGraphTitle = title,
  openGraphDescription = description,
  twitterTitle = openGraphTitle,
  twitterDescription = openGraphDescription,
}: PublicPageMetadataInput): Metadata {
  const canonicalUrl = buildCanonicalUrl(pathname);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      types: {
        "application/rss+xml": [
          {
            url: buildCanonicalUrl(primaryRssPath),
            title: `${siteConfig.name} - RSS Feed`,
          },
        ],
      },
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: siteConfig.name,
      title: openGraphTitle,
      description: openGraphDescription,
      locale: siteLocale,
      images: [publicSocialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: twitterTitle,
      description: twitterDescription,
      images: [publicSocialImage],
    },
  };
}
