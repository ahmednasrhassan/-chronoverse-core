import { client } from "@/sanity/client";

/**
 * Dynamic RSS 2.0 Feed
 * --------------------
 * Fetches published `post` documents directly from Sanity (most recent
 * first) and formats them into a valid RSS XML document. Consumed by:
 *   - Standard RSS reader clients (via /rss.xml).
 *   - The `/api/cron/send-newsletter` Vercel Cron job, which reads the same
 *     underlying Sanity data (via `getRecentPosts`) to build the daily
 *     newsletter digest.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://www.chronoversecapital.com";
const SITE_TITLE = "Chronoverse Capital";
const SITE_DESCRIPTION =
  "Decoding Future Markets Through Historical Intelligence — real-time market insights, global financial intelligence, and institutional updates from Chronoverse Capital.";

interface SanityRssPost {
  slug: string | null;
  title: string | null;
  publishedAt: string | null;
  seoDescription: string | null;
  excerpt: string | null;
  bodyPlainText: string | null;
  categoryTitle: string | null;
}

/**
 * Fetches published posts (i.e. `publishedAt` is set and not in the future)
 * ordered newest first, for the RSS feed.
 */
async function getPublishedPosts(): Promise<SanityRssPost[]> {
  const query = `*[
      _type == "post" &&
      defined(slug.current) &&
      defined(publishedAt) &&
      publishedAt <= now()
    ] | order(publishedAt desc) [0...50] {
      "slug": slug.current,
      title,
      publishedAt,
      seoDescription,
      excerpt,
      "bodyPlainText": pt::text(body),
      "categoryTitle": category->title
    }`;

  try {
    const posts = await client.fetch<SanityRssPost[]>(query);
    return posts || [];
  } catch (error) {
    console.warn("[rss.xml] Failed to fetch Sanity posts:", error);
    return [];
  }
}

/** Escapes reserved XML characters so titles/descriptions never break the feed. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Builds a short plain-text description for a post, preferring authored fields. */
function resolveDescription(post: SanityRssPost): string {
  const raw =
    (post.seoDescription && post.seoDescription.trim()) ||
    (post.excerpt && post.excerpt.trim()) ||
    (post.bodyPlainText && post.bodyPlainText.trim().slice(0, 300)) ||
    "";
  return raw;
}

export async function GET() {
  const posts = await getPublishedPosts();
  const now = new Date().toUTCString();

  const items = posts
    .filter((post) => !!post.slug && !!post.title)
    .map((post) => {
      const link = `${BASE_URL}/${post.slug}`;
      const pubDate = post.publishedAt
        ? new Date(post.publishedAt).toUTCString()
        : now;
      const description = resolveDescription(post);
      const category = post.categoryTitle
        ? `<category>${escapeXml(post.categoryTitle)}</category>`
        : "";

      return `
    <item>
      <title>${escapeXml(post.title || "")}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
      ${category}
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${BASE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
