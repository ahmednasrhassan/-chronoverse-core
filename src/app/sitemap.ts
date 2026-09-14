import type { MetadataRoute } from "next";

import { DEFAULT_CATEGORY_SLUG } from "@/lib/content";
import { isReservedRootSlug } from "@/lib/content/reservedSlugs";
import { buildCanonicalUrl } from "@/lib/seo/site-url";
import { client } from "@/sanity/client";

// The sitemap is refreshed on-demand when Sanity publishes, updates,
// or deletes editorial content through `/api/revalidate`.

interface SanitySlugDoc {
  readonly slug: string | null;
  readonly updatedAt?: string | null;
  readonly publishedAt?: string | null;
}

interface SitemapContent {
  readonly posts: readonly SanitySlugDoc[];
  readonly categorySlugs: readonly string[];
}

const ROOT_POST_SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATEGORY_SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Static routes whose existing route metadata permits indexing. */
const STATIC_ROUTES: ReadonlyArray<{
  readonly path: string;
  readonly changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  readonly priority: number;
}> = [
  { path: "", changeFrequency: "daily", priority: 1.0 },
  { path: "about", changeFrequency: "monthly", priority: 0.6 },
  { path: "contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "data-sources", changeFrequency: "monthly", priority: 0.5 },
  { path: "disclaimer", changeFrequency: "yearly", priority: 0.3 },
  { path: "dmca", changeFrequency: "yearly", priority: 0.3 },
  { path: "editorial-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "faq", changeFrequency: "monthly", priority: 0.4 },
  { path: "freshness", changeFrequency: "monthly", priority: 0.5 },
  { path: "markets", changeFrequency: "weekly", priority: 0.7 },
  { path: "methodology", changeFrequency: "monthly", priority: 0.6 },
  { path: "newsletter", changeFrequency: "monthly", priority: 0.5 },
  { path: "pricing", changeFrequency: "weekly", priority: 0.6 },
  { path: "privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "reports", changeFrequency: "weekly", priority: 0.9 },
  { path: "terms-of-service", changeFrequency: "yearly", priority: 0.3 },
];

async function getSanityPosts(): Promise<SanitySlugDoc[]> {
  const posts = await client.fetch<SanitySlugDoc[]>(
    `*[
      _type == "post" &&
      defined(slug.current) &&
      defined(publishedAt) &&
      publishedAt <= now() &&
      !(_id in path('drafts.**'))
    ] {
      "slug": slug.current,
      "updatedAt": _updatedAt,
      publishedAt
    }`,
  );
  return posts || [];
}

async function getCategorySlugs(): Promise<string[]> {
  const [usedSlugs, hasUncategorizedPosts, hasGeneralCategory] =
    await Promise.all([
      client.fetch<string[]>(
        `array::unique(*[
          _type == "post" &&
          defined(slug.current) &&
          defined(publishedAt) &&
          publishedAt <= now() &&
          defined(category->slug.current) &&
          !(_id in path('drafts.**'))
        ].category->slug.current)`,
      ),
      client.fetch<boolean>(
        `count(*[
          _type == "post" &&
          defined(slug.current) &&
          defined(publishedAt) &&
          publishedAt <= now() &&
          !defined(category) &&
          !(_id in path('drafts.**'))
        ]) > 0`,
      ),
      client.fetch<boolean>(
        `count(*[
          _type == "category" &&
          slug.current == $generalSlug &&
          !(_id in path('drafts.**'))
        ]) > 0`,
        { generalSlug: DEFAULT_CATEGORY_SLUG },
      ),
    ]);

  const slugs = (usedSlugs || []).filter(
    (slug): slug is string =>
      typeof slug === "string" && CATEGORY_SLUG_FORMAT.test(slug),
  );

  if (
    hasUncategorizedPosts &&
    hasGeneralCategory &&
    !slugs.includes(DEFAULT_CATEGORY_SLUG)
  ) {
    slugs.push(DEFAULT_CATEGORY_SLUG);
  }

  return Array.from(new Set(slugs));
}

/** Loads every required dynamic source without partial-success fallbacks. */
export async function loadSitemapContent(
  loadPosts: () => Promise<readonly SanitySlugDoc[]> = getSanityPosts,
  loadCategorySlugs: () => Promise<readonly string[]> = getCategorySlugs,
): Promise<SitemapContent> {
  const [posts, categorySlugs] = await Promise.all([
    loadPosts(),
    loadCategorySlugs(),
  ]);
  return { posts, categorySlugs };
}

function resolvePostDate(post: SanitySlugDoc): string | undefined {
  return post.updatedAt || post.publishedAt || undefined;
}

/** Builds only canonical, indexable entries from successfully loaded data. */
export function buildSitemap(content: SitemapContent): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: buildCanonicalUrl(route.path ? `/${route.path}` : "/"),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const postEntries: MetadataRoute.Sitemap = content.posts
    .filter(
      (post): post is SanitySlugDoc & { readonly slug: string } =>
        typeof post.slug === "string" &&
        ROOT_POST_SLUG_FORMAT.test(post.slug) &&
        !isReservedRootSlug(post.slug),
    )
    .map((post) => {
      const lastModified = resolvePostDate(post);
      return {
        url: buildCanonicalUrl(`/${post.slug}`),
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      };
    });

  const categoryEntries: MetadataRoute.Sitemap = Array.from(
    new Set(content.categorySlugs),
  )
    .filter((slug) => CATEGORY_SLUG_FORMAT.test(slug))
    .map((slug) => ({
      url: buildCanonicalUrl(`/category/${slug}`),
      changeFrequency: "weekly",
      priority: 0.6,
    }));

  const seen = new Set<string>();
  return [...staticEntries, ...postEntries, ...categoryEntries].filter(
    (entry) => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    },
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(await loadSitemapContent());
}
