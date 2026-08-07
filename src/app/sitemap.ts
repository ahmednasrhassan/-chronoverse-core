import type { MetadataRoute } from "next";
import { client } from "@/sanity/client";

const BASE_URL = "https://www.chronoversecapital.com";

interface SanitySlugDoc {
  slug: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
}

/**
 * Static, first-class routes for the site. Kept in sync with the
 * `src/app/(site)` route group.
 */
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "", changeFrequency: "daily", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/archive", changeFrequency: "daily", priority: 0.8 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/disclaimer", changeFrequency: "yearly", priority: 0.3 },
  { path: "/dmca", changeFrequency: "yearly", priority: 0.3 },
  { path: "/editorial-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.4 },
  { path: "/intelligence", changeFrequency: "weekly", priority: 0.7 },
  { path: "/manifesto", changeFrequency: "monthly", priority: 0.5 },
  { path: "/markets", changeFrequency: "weekly", priority: 0.7 },
  { path: "/premium", changeFrequency: "weekly", priority: 0.6 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/products", changeFrequency: "weekly", priority: 0.6 },
  { path: "/reports", changeFrequency: "weekly", priority: 0.9 },
  { path: "/sponsors", changeFrequency: "monthly", priority: 0.2 },
  { path: "/terms-of-service", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Fetches all published `post` documents from Sanity for inclusion in the
 * sitemap. Fails gracefully (returns an empty array) if Sanity is
 * unreachable so the sitemap always renders successfully.
 */
async function getSanityPosts(): Promise<SanitySlugDoc[]> {
  try {
    const posts = await client.fetch<SanitySlugDoc[]>(
      `*[_type == "post" && defined(slug.current)] {
        "slug": slug.current,
        "updatedAt": _updatedAt,
        publishedAt
      }`
    );
    return posts || [];
  } catch (error) {
    console.warn("[sitemap] Failed to fetch Sanity posts:", error);
    return [];
  }
}

/**
 * Fetches all `page` documents (administrative/static pages authored in
 * Sanity Studio) so any editor-managed pages are automatically included.
 */
async function getSanityPages(): Promise<SanitySlugDoc[]> {
  try {
    const pages = await client.fetch<SanitySlugDoc[]>(
      `*[_type == "page" && defined(slug.current)] {
        "slug": slug.current,
        "updatedAt": _updatedAt
      }`
    );
    return pages || [];
  } catch (error) {
    console.warn("[sitemap] Failed to fetch Sanity pages:", error);
    return [];
  }
}

interface SanityCategoryDoc {
  slug: string;
}

/**
 * Fetches all `category` documents so their dynamically-generated
 * `/category/[slug]` feed pages are included in the sitemap automatically.
 */
async function getSanityCategories(): Promise<SanityCategoryDoc[]> {
  try {
    const categories = await client.fetch<SanityCategoryDoc[]>(
      `*[_type == "category" && defined(slug.current)] {
        "slug": slug.current
      }`
    );
    return categories || [];
  } catch (error) {
    console.warn("[sitemap] Failed to fetch Sanity categories:", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, pages, categories] = await Promise.all([
    getSanityPosts(),
    getSanityPages(),
    getSanityCategories(),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const postEntries: MetadataRoute.Sitemap = posts
    .filter((post) => !!post.slug)
    .map((post) => ({
      url: `${BASE_URL}/${post.slug}`,
      lastModified: post.updatedAt ? new Date(post.updatedAt) : new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  const pageEntries: MetadataRoute.Sitemap = pages
    .filter((page) => !!page.slug)
    .map((page) => ({
      url: `${BASE_URL}/${page.slug}`,
      lastModified: page.updatedAt ? new Date(page.updatedAt) : new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    }));

  const categoryEntries: MetadataRoute.Sitemap = categories
    .filter((category) => !!category.slug)
    .map((category) => ({
      url: `${BASE_URL}/category/${category.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    }));

  // De-duplicate by URL (static routes take precedence over dynamic ones).
  const seen = new Set<string>();
  const merged: MetadataRoute.Sitemap = [];

  for (const entry of [...staticEntries, ...postEntries, ...pageEntries, ...categoryEntries]) {
    if (!seen.has(entry.url)) {
      seen.add(entry.url);
      merged.push(entry);
    }
  }

  return merged;
}
