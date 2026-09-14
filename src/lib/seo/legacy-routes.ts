import { isReservedRootSlug } from "@/lib/content/reservedSlugs";

const CURRENT_ROOT_SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOGGER_YEAR_FORMAT = /^\d{4}$/;
const BLOGGER_MONTH_FORMAT = /^(?:0[1-9]|1[0-2])$/;

function isCurrentContentSlug(slug: string): boolean {
  return CURRENT_ROOT_SLUG_FORMAT.test(slug) && !isReservedRootSlug(slug);
}

/** Returns a candidate only for a structurally valid root Blogger HTML URL. */
export function getRootHtmlCandidate(slug: string): string | null {
  if (!slug.endsWith(".html")) return null;
  const candidate = slug.slice(0, -".html".length);
  return isCurrentContentSlug(candidate) ? candidate : null;
}

/** Supports the two deterministic Blogger forms: /YYYY/MM/slug[.html]. */
export function getDatedBloggerCandidate(
  year: string,
  month: string,
  legacySlug: string,
): string | null {
  if (!BLOGGER_YEAR_FORMAT.test(year) || !BLOGGER_MONTH_FORMAT.test(month)) {
    return null;
  }

  const candidate = legacySlug.endsWith(".html")
    ? legacySlug.slice(0, -".html".length)
    : legacySlug;

  return isCurrentContentSlug(candidate) ? candidate : null;
}

/**
 * Redirects only when the deterministic candidate currently resolves to
 * public Sanity content. Provider failures deliberately propagate.
 */
export async function resolveLegacyContentRedirect(
  candidate: string | null,
  contentExists: (slug: string) => Promise<boolean>,
): Promise<string | null> {
  if (!candidate) return null;
  return (await contentExists(candidate)) ? `/${candidate}` : null;
}
