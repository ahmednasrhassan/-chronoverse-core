import type { Metadata } from "next";

import { stripHtml, type PageContentItem } from "@/lib/content";

function truncateMetadataText(text: string, maxLength: number): string {
  const cleanText = text.trim();
  if (cleanText.length <= maxLength) return cleanText;
  return `${cleanText.substring(0, maxLength - 3).trim()}...`;
}

/** Search policy for legacy/custom Sanity Page fallback content. */
export function buildCmsPageMetadata(page: PageContentItem): Metadata {
  const title = truncateMetadataText(page.title, 45);
  const rawPageText = stripHtml(page.legacyHtml || page.bodyContent || "");
  const descriptionSource = page.seoDescription || rawPageText;
  const description = descriptionSource
    ? truncateMetadataText(descriptionSource, 155)
    : undefined;
  const images = page.imageUrl ? [{ url: page.imageUrl }] : undefined;

  return {
    title,
    ...(description ? { description } : {}),
    robots: {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      type: "website",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      ...(description ? { description } : {}),
      ...(page.imageUrl ? { images: [page.imageUrl] } : {}),
    },
  };
}
