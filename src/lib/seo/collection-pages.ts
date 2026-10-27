import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CategoryPageContentV1 } from "@/lib/content";
import { buildPublicPageMetadata } from "./metadata";

export function buildArchiveMetadata(page: number): Metadata {
  const metadata = buildPublicPageMetadata({
    title: page > 1 ? `Archive — Page ${page}` : "Archive",
    description:
      "Directory of published Chronoverse research organized by editorial category.",
    pathname: "/archive",
  });
  const canonical = `https://chronoversecapital.com/archive${page > 1 ? `?page=${page}` : ""}`;
  return {
    ...metadata,
    alternates: { ...metadata.alternates, canonical },
    openGraph: { ...metadata.openGraph, url: canonical },
    robots: {
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    },
  };
}

export function buildCategoryMetadataV1(category: CategoryPageContentV1): Metadata {
  const description = category.description || category.title;
  return buildPublicPageMetadata({
    title: category.title,
    description,
    pathname: `/category/${category.slug}`,
  });
}

export function requirePopulatedCategoryV1(category: CategoryPageContentV1 | null): CategoryPageContentV1 {
  if (category === null || category.articles.length === 0) notFound();
  return category;
}
