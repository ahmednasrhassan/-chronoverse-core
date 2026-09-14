import { RSS_CANONICAL_URL } from "@/lib/seo/rss";

/**
 * Dynamic RSS 2.0 Feed — `/feed.xml` alias
 * -----------------------------------------
 * Permanently redirects the legacy feed alias to the one canonical feed.
 */
export const dynamic = "force-static";

export async function GET() {
  return Response.redirect(RSS_CANONICAL_URL, 301);
}
