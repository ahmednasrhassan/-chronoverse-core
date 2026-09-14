import { client } from "@/sanity/client";
import { buildRssXml, type RssArticle } from "@/lib/seo/rss";

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

export const dynamic = "force-static";

/**
 * Fetches published posts (i.e. `publishedAt` is set and not in the future)
 * ordered newest first, for the RSS feed.
 */
async function getPublishedPosts(): Promise<RssArticle[]> {
  const query = `*[
      _type == "post" &&
      defined(slug.current) &&
      defined(publishedAt) &&
      publishedAt <= now() &&
      !(_id in path('drafts.**'))
    ] | order(publishedAt desc) [0...50] {
      "slug": slug.current,
      title,
      publishedAt,
      seoDescription,
      excerpt,
      "bodyPlainText": pt::text(body),
      "bodyRaw": bodyRaw,
      "categoryTitle": category->title,
      "authorName": author->name
    }`;

  try {
    const posts = await client.fetch<RssArticle[]>(query);
    return posts || [];
  } catch (error) {
    console.warn("[rss.xml] Failed to fetch Sanity posts:", error);
    return [];
  }
}

export async function GET() {
  const posts = await getPublishedPosts();
  const xml = buildRssXml(posts);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
