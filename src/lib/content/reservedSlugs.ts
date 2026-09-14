const ROOT_SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Current application-owned root identities. Keep this list aligned with
 * concrete App Router routes and exact redirects, not prospective features.
 */
export const RESERVED_ROOT_SLUGS = Object.freeze([
  "about",
  "account",
  "api",
  "archive",
  "auth",
  "billing",
  "category",
  "contact",
  "data-sources",
  "disclaimer",
  "dmca",
  "editorial-policy",
  "faq",
  "feed.xml",
  "freshness",
  "intelligence",
  "manifesto",
  "markets",
  "methodology",
  "newsletter",
  "premium",
  "pricing",
  "privacy-policy",
  "products",
  "reports",
  "robots.txt",
  "rss.xml",
  "sitemap.xml",
  "sponsors",
  "studio",
  "terms-of-service",
  "vip",
] as const);

const RESERVED_ROOT_SLUG_SET: ReadonlySet<string> = new Set(
  RESERVED_ROOT_SLUGS,
);

export const ROOT_SLUG_FORMAT_ERROR =
  'Slug must be lowercase letters, numbers, and single hyphens only (e.g. "my-article-title").';

export function normalizeRootSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function isReservedRootSlug(slug: string): boolean {
  return RESERVED_ROOT_SLUG_SET.has(normalizeRootSlug(slug));
}

/** Returns a Sanity-compatible validation result without depending on Sanity. */
export function validatePublicRootSlug(
  slug: string | null | undefined,
): true | string {
  if (!slug) return true;

  if (isReservedRootSlug(slug)) {
    return `The root slug "${normalizeRootSlug(slug)}" is reserved by the application.`;
  }

  return ROOT_SLUG_FORMAT.test(slug)
    ? true
    : ROOT_SLUG_FORMAT_ERROR;
}
