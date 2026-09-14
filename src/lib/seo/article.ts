import type { Metadata } from "next";

import { siteConfig } from "@/config/siteConfig";
import { primaryRssPath, siteLocale } from "@/lib/seo/metadata";
import {
  buildCanonicalUrl,
  canonicalSiteOrigin,
} from "@/lib/seo/site-url";

const ARTICLE_DESCRIPTION_MAX_LENGTH = 160;
const SITE_DESCRIPTION_FALLBACK =
  "Independent market research from Chronoverse Capital.";

export type ArticleDescriptionSource =
  | "seoDescription"
  | "excerpt"
  | "body"
  | "site";

export interface ArticleSeoInput {
  readonly slug: string;
  readonly title: string;
  readonly seoDescription?: string;
  readonly excerpt?: string;
  readonly bodyText?: string;
  readonly publishedAt?: string;
  readonly modifiedAt?: string;
  readonly author?: string;
  readonly category?: string;
  readonly keywords?: readonly string[];
  readonly featuredImageUrl?: string;
  readonly imageAlt?: string;
  readonly imageCaption?: string;
  readonly socialImageUrl?: string;
}

export interface NormalizedArticleSeo {
  readonly slug: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly description: string;
  readonly descriptionSource: ArticleDescriptionSource;
  readonly publishedAt?: string;
  readonly modifiedAt?: string;
  readonly author?: string;
  readonly category?: string;
  readonly keywords: readonly string[];
  readonly featuredImage?: {
    readonly url: string;
    readonly alt?: string;
    readonly caption?: string;
  };
  readonly socialImage: {
    readonly url: string;
    readonly alt?: string;
  };
}

function normalizeText(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function trimWithoutInventing(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const candidate = value.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  return (lastSpace >= Math.floor(maxLength * 0.7)
    ? candidate.slice(0, lastSpace)
    : value.slice(0, maxLength)
  ).trimEnd();
}

function normalizeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveArticleDescription(input: Pick<
  ArticleSeoInput,
  "seoDescription" | "excerpt" | "bodyText"
>): {
  readonly description: string;
  readonly source: ArticleDescriptionSource;
} {
  const candidates: ReadonlyArray<
    readonly [ArticleDescriptionSource, string | undefined]
  > = [
    ["seoDescription", normalizeText(input.seoDescription)],
    ["excerpt", normalizeText(input.excerpt)],
    ["body", normalizeText(input.bodyText)],
  ];
  const resolved = candidates.find(([, value]) => value !== undefined);
  const source = resolved?.[0] ?? "site";
  const value = resolved?.[1] ?? SITE_DESCRIPTION_FALLBACK;

  return {
    description: trimWithoutInventing(value, ARTICLE_DESCRIPTION_MAX_LENGTH),
    source,
  };
}

function buildDynamicSocialImage(title: string, category?: string): string {
  const url = new URL("/api/og", canonicalSiteOrigin);
  url.searchParams.set("title", title);
  if (category) url.searchParams.set("category", category);
  return url.toString();
}

export function normalizeArticleSeo(
  input: ArticleSeoInput,
): NormalizedArticleSeo {
  const title = input.title.trim() || "Untitled";
  const description = resolveArticleDescription(input);
  const author = normalizeText(input.author);
  const category = normalizeText(input.category);
  const imageAlt = normalizeText(input.imageAlt);
  const imageCaption = normalizeText(input.imageCaption);
  const featuredImageUrl = normalizeHttpUrl(input.featuredImageUrl);
  const socialImageUrl =
    normalizeHttpUrl(input.socialImageUrl) ||
    featuredImageUrl ||
    buildDynamicSocialImage(title, category);

  return {
    slug: input.slug,
    title,
    canonicalUrl: buildCanonicalUrl(`/${input.slug}`),
    description: description.description,
    descriptionSource: description.source,
    ...(normalizeText(input.publishedAt)
      ? { publishedAt: normalizeText(input.publishedAt) }
      : {}),
    ...(normalizeText(input.modifiedAt)
      ? { modifiedAt: normalizeText(input.modifiedAt) }
      : {}),
    ...(author ? { author } : {}),
    ...(category ? { category } : {}),
    keywords: (input.keywords || [])
      .map((keyword) => normalizeText(keyword))
      .filter((keyword): keyword is string => keyword !== undefined),
    ...(featuredImageUrl
      ? {
          featuredImage: {
            url: featuredImageUrl,
            ...(imageAlt ? { alt: imageAlt } : {}),
            ...(imageCaption ? { caption: imageCaption } : {}),
          },
        }
      : {}),
    socialImage: {
      url: socialImageUrl,
      ...(featuredImageUrl === socialImageUrl && imageAlt
        ? { alt: imageAlt }
        : {}),
    },
  };
}

export function buildArticleMetadata(article: NormalizedArticleSeo): Metadata {
  const socialImage = {
    url: article.socialImage.url,
    ...(article.socialImage.alt ? { alt: article.socialImage.alt } : {}),
  };

  return {
    title: article.title,
    description: article.description,
    keywords: [...article.keywords],
    ...(article.author ? { authors: [{ name: article.author }] } : {}),
    ...(article.category ? { category: article.category } : {}),
    alternates: {
      canonical: article.canonicalUrl,
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
      type: "article",
      title: article.title,
      description: article.description,
      url: article.canonicalUrl,
      siteName: siteConfig.name,
      locale: siteLocale,
      ...(article.publishedAt
        ? { publishedTime: article.publishedAt }
        : {}),
      ...(article.modifiedAt ? { modifiedTime: article.modifiedAt } : {}),
      ...(article.author ? { authors: [article.author] } : {}),
      ...(article.category ? { section: article.category } : {}),
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: [socialImage],
    },
  };
}

export function buildArticleJsonLd(
  article: NormalizedArticleSeo,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    url: article.canonicalUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": article.canonicalUrl,
    },
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(article.modifiedAt ? { dateModified: article.modifiedAt } : {}),
    ...(article.author
      ? { author: { "@type": "Person", name: article.author } }
      : {}),
    ...(article.featuredImage ? { image: article.featuredImage.url } : {}),
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      logo: {
        "@type": "ImageObject",
        url: buildCanonicalUrl("/logo.svg"),
      },
    },
  };
}

const JSON_FOR_HTML_ESCAPES: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) => JSON_FOR_HTML_ESCAPES[character],
  );
}
