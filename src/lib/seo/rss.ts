import DOMPurify from "isomorphic-dompurify";

import { buildCanonicalUrl } from "@/lib/seo/site-url";

export const RSS_CHANNEL_TITLE = "Chronoverse Capital";
export const RSS_CHANNEL_DESCRIPTION =
  "Published market research and analytical updates from Chronoverse Capital.";
export const RSS_CANONICAL_URL = buildCanonicalUrl("/rss.xml");

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
};

export interface RssArticle {
  readonly slug: string | null;
  readonly title: string | null;
  readonly publishedAt: string | null;
  readonly seoDescription: string | null;
  readonly excerpt: string | null;
  readonly bodyPlainText: string | null;
  readonly bodyRaw: string | null;
  readonly categoryTitle: string | null;
  readonly authorName: string | null;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function legacyHtmlToPlainText(html: string | null): string {
  if (!html) return "";

  const text = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });

  return text
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex: string) =>
      decodeHtmlCodePoint(entity, hex, 16),
    )
    .replace(/&#(\d+);/g, (entity, decimal: string) =>
      decodeHtmlCodePoint(entity, decimal, 10),
    )
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/gi,
      (entity) => NAMED_HTML_ENTITIES[entity.toLowerCase()] || entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlCodePoint(
  entity: string,
  value: string,
  radix: number,
): string {
  const codePoint = Number.parseInt(value, radix);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : entity;
}

export function resolveRssDescription(post: RssArticle): string {
  const authored = post.seoDescription?.trim() || post.excerpt?.trim();
  if (authored) return authored;

  const bodyText =
    post.bodyPlainText?.trim() || legacyHtmlToPlainText(post.bodyRaw);
  if (bodyText.length <= 300) return bodyText;

  const candidate = bodyText.slice(0, 301);
  const lastSpace = candidate.lastIndexOf(" ");
  return (lastSpace >= 210 ? candidate.slice(0, lastSpace) : bodyText.slice(0, 300))
    .trimEnd();
}

function validPubDate(value: string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toUTCString();
}

export function buildRssXml(
  posts: readonly RssArticle[],
  buildDate: Date = new Date(),
): string {
  const items = posts
    .map((post) => {
      if (!post.slug || !post.title || !post.publishedAt) return "";
      const pubDate = validPubDate(post.publishedAt);
      if (!pubDate) return "";

      const link = buildCanonicalUrl(`/${post.slug}`);
      const category = post.categoryTitle?.trim()
        ? `\n      <category>${escapeXml(post.categoryTitle.trim())}</category>`
        : "";
      const creator = post.authorName?.trim()
        ? `\n      <dc:creator>${escapeXml(post.authorName.trim())}</dc:creator>`
        : "";

      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(resolveRssDescription(post))}</description>${category}${creator}
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(RSS_CHANNEL_TITLE)}</title>
    <link>${buildCanonicalUrl("/")}</link>
    <description>${escapeXml(RSS_CHANNEL_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate.toUTCString()}</lastBuildDate>
    <atom:link href="${RSS_CANONICAL_URL}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}
