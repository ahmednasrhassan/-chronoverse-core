import DOMPurify from "isomorphic-dompurify";

import { buildCanonicalUrl } from "@/lib/seo/site-url";
import { normalizeEditorialArtifacts } from "@/lib/editorialArtifacts";
import { isReservedRootSlug, validatePublicRootSlug } from "@/lib/content/reservedSlugs";

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
  readonly _id: string;
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
  // XML 1.0 excludes controls, unpaired surrogates and U+FFFE/U+FFFF.
  return Array.from(value).filter((character) => {
    const code = character.codePointAt(0)!;
    return code === 9 || code === 10 || code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000;
  }).join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function legacyHtmlToPlainText(html: string | null): string {
  if (!html) return "";

  const text = DOMPurify.sanitize(normalizeEditorialArtifacts(html), {
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
  const authored = normalizeEditorialArtifacts(post.seoDescription || "").trim() ||
    normalizeEditorialArtifacts(post.excerpt || "").trim();
  if (authored) return legacyHtmlToPlainText(authored);

  const bodyText =
    legacyHtmlToPlainText(post.bodyPlainText) || legacyHtmlToPlainText(post.bodyRaw);
  if (bodyText.length <= 300) return bodyText;

  const candidate = bodyText.slice(0, 301);
  const lastSpace = candidate.lastIndexOf(" ");
  return (lastSpace >= 210 ? candidate.slice(0, lastSpace) : bodyText.slice(0, 300))
    .trimEnd();
}

export function buildRssXml(
  posts: readonly RssArticle[],
  buildDate: Date = new Date(),
): string {
  if (!Array.isArray(posts) || posts.length > 5000) throw new Error("RSS archive exceeds supported size");
  const ids = new Set<string>();
  const links = new Set<string>();
  const eligible = posts.filter((post) =>
    typeof post._id === "string" && /^[a-zA-Z0-9_.-]+$/.test(post._id) &&
    !/^(drafts|versions)\./.test(post._id) &&
    post.slug && validatePublicRootSlug(post.slug) === true && !isReservedRootSlug(post.slug) &&
    post.title?.trim() && post.publishedAt && Number.isFinite(Date.parse(post.publishedAt)) &&
    Date.parse(post.publishedAt) <= buildDate.getTime(),
  ).sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!) ||
    a._id.localeCompare(b._id, "en") || a.slug!.localeCompare(b.slug!, "en"));
  const items = eligible
    .map((post) => {
      const link = buildCanonicalUrl(`/${post.slug}`);
      if (ids.has(post._id) || links.has(link)) return "";
      ids.add(post._id); links.add(link);
      const pubDate = new Date(post.publishedAt!).toUTCString();
      const category = post.categoryTitle?.trim()
        ? `\n      <category>${escapeXml(post.categoryTitle.trim())}</category>`
        : "";
      const creator = post.authorName?.trim()
        ? `\n      <dc:creator>${escapeXml(post.authorName.trim())}</dc:creator>`
        : "";

      return `
    <item>
      <title>${escapeXml(post.title!.trim())}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">urn:chronoverse:article:${escapeXml(post._id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(resolveRssDescription(post))}</description>${category}${creator}
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
  // Never silently truncate the archive: AWS needs every still-public backlog item.
  if (Buffer.byteLength(xml) > 2000000) throw new Error("RSS archive exceeds supported size");
  return xml;
}
