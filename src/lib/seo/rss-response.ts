import { freshClient } from "@/sanity/client";
import { buildRssXml, type RssArticle } from "@/lib/seo/rss";

/**
 * Dynamic RSS 2.0 Feed
 * --------------------
 * Fetches published `post` documents directly from Sanity (most recent
 * first) and formats them into a valid RSS XML document. Consumed by:
 *   - Standard RSS reader clients (via /rss.xml).
 *   - The separately deployed AWS weekly digest, which reads this public feed.
 */

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
      !(_id in path('drafts.**')) &&
      !(_id in path('versions.**'))
    ] | order(publishedAt desc, _id asc) {
      _id,
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

  const posts = await freshClient.fetch<RssArticle[]>(query, {}, { cache: "no-store" });
  if (!Array.isArray(posts)) throw new Error("Invalid public article response");
  return posts;
}

type PublishedPostsLoader = () => Promise<RssArticle[]>;

export async function createRssResponse(
  loadPosts: PublishedPostsLoader = getPublishedPosts,
): Promise<Response> {
  try {
    const posts = await loadPosts();
    const xml = buildRssXml(posts);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=300, must-revalidate",
      },
    });
  } catch {
    return new Response("RSS temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
