import { MetadataRoute } from "next";
import { client } from "@/sanity/client";
import { DEFAULT_CATEGORY_SLUG } from "@/lib/content";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://chronoversecapital.com";

// Revalidates cache every 1 hour (3600 seconds) to reduce Sanity API roundtrips
export const revalidate = 86400;

// Slugs that are permanently redirected (301/308) and MUST NOT appear in the sitemap
const EXCLUDED_SLUGS = new Set([
  "the-new-scarcity-economy-macro-crisis",
]);

/**
 * Utility function to generate perfectly clean, canonical-matching URLs.
 * Strips leading/trailing slashes to prevent duplicate indexing issues.
 */
const cleanUrl = (path: string): string => {
  const cleanPath = path.replace(/^\/+|\/+$/g, "");
  return cleanPath ? `${BASE_URL}/${cleanPath}` : BASE_URL;
};

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
  { path: "about", changeFrequency: "monthly", priority: 0.6 },
  { path: "archive", changeFrequency: "daily", priority: 0.8 },
  { path: "contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "disclaimer", changeFrequency: "yearly", priority: 0.3 },
  { path: "dmca", changeFrequency: "yearly", priority: 0.3 },
  { path: "editorial-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "faq", changeFrequency: "monthly", priority: 0.4 },
  { path: "intelligence", changeFrequency: "weekly", priority: 0.7 },
  { path: "manifesto", changeFrequency: "monthly", priority: 0.5 },
  { path: "markets", changeFrequency: "weekly", priority: 0.7 },
  { path: "premium", changeFrequency: "weekly", priority: 0.6 },
  { path: "privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "products", changeFrequency: "weekly", priority: 0.6 },
  { path: "reports", changeFrequency: "weekly", priority: 0.9 },
  { path: "terms-of-service", changeFrequency: "yearly", priority: 0.3 },
  { path: "sponsors", changeFrequency: "monthly", priority: 0.5 },
];

/**
 * Optional: manually tracked last-modified dates for static assets.
 */
const STATIC_LAST_MODIFIED: Record<string, Date> = {};

/**
 * Fetches ONLY published `post` documents from Sanity.
 */
async function getSanityPosts(): Promise<SanitySlugDoc[]> {
  try {
    const posts = await client.fetch<SanitySlugDoc[]>(
      `*[_type == "post" && defined(slug.current) && !(_id in path('drafts.**'))] {
        "slug": slug.current,
        "updatedAt": _updatedAt,
        publishedAt
      }`
    );
    return posts || [];
  } catch (error) {
    console.warn("[Sitemap] Failed to fetch Sanity posts:", error);
    return [];
  }
}

/**
 * Resolves active category slugs referenced by at least one published post.
 */
async function getCategorySlugs(): Promise<string[]> {
  try {
    const [usedSlugs, hasUncategorizedPosts] = await Promise.all([
      client.fetch<string[]>(
        `array::unique(*[
          _type == "post" &&
          defined(category->slug.current) &&
          !(_id in path('drafts.**'))
        ].category->slug.current)`
      ),
      client.fetch<boolean>(
        `count(*[
          _type == "post" &&
          !defined(category) &&
          !(_id in path('drafts.**'))
        ]) > 0`
      ),
    ]);

    const slugs = (usedSlugs || []).filter((s): s is string => Boolean(s));

    if (hasUncategorizedPosts && !slugs.includes(DEFAULT_CATEGORY_SLUG)) {
      slugs.push(DEFAULT_CATEGORY_SLUG);
    }

    return Array.from(new Set(slugs));
  } catch (error) {
    console.warn("[Sitemap] Failed to fetch category slugs:", error);
    return [];
  }
}

/**
 * Resolves the accurate modification timestamp for each post.
 */
function resolvePostDate(post: SanitySlugDoc): Date {
  if (post.updatedAt) return new Date(post.updatedAt);
  if (post.publishedAt) return new Date(post.publishedAt);
  return new Date();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, categorySlugs] = await Promise.all([
    getSanityPosts(),
    getCategorySlugs(),
  ]);

  // 1. Process Static Entries
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => {
    const entry: MetadataRoute.Sitemap[number] = {
      url: cleanUrl(route.path),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    };

    const overrideDate = STATIC_LAST_MODIFIED[route.path];
    if (overrideDate) {
      entry.lastModified = overrideDate;
    }

    return entry;
  });

  // 2. Process Post Entries
  const postEntries: MetadataRoute.Sitemap = posts
    .filter(
      (post): post is SanitySlugDoc & { slug: string } =>
        typeof post.slug === "string" &&
        !post.slug.endsWith(".html") &&
        !post.slug.startsWith("p/") &&
        !EXCLUDED_SLUGS.has(post.slug)
    )
    .map((post) => ({
      url: cleanUrl(post.slug),
      lastModified: resolvePostDate(post),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  // 3. Process Category Entries
  const categoryEntries: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: cleanUrl(`category/${slug}`),
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // 4. De-duplicate URLs strictly to ensure clean XML generation
  const seen = new Set<string>();
  const merged: MetadataRoute.Sitemap = [];

  for (const entry of [...staticEntries, ...postEntries, ...categoryEntries]) {
    if (!seen.has(entry.url)) {
      seen.add(entry.url);
      merged.push(entry);
    }
  }

  return merged;
}
