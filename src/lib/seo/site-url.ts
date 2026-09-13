import { canonicalSiteOrigin } from "@/config/siteConfig";

const CANONICAL_ORIGIN = new URL(canonicalSiteOrigin).origin;
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * Builds an absolute search canonical from a route pathname only.
 * Query strings, fragments, absolute URLs, and backslashes are rejected so
 * callers cannot change the canonical host or create parameter canonicals.
 */
export function buildCanonicalUrl(pathname: string): string {
  const candidate = pathname.trim();

  if (!candidate) {
    throw new TypeError("Canonical pathname must not be empty.");
  }

  if (
    ABSOLUTE_URL_PATTERN.test(candidate) ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("?") ||
    candidate.includes("#") ||
    CONTROL_CHARACTER_PATTERN.test(candidate)
  ) {
    throw new TypeError("Canonical URL input must be a safe pathname.");
  }

  const rootedPathname = candidate.startsWith("/")
    ? candidate
    : `/${candidate}`;
  const withoutDuplicateSlashes = rootedPathname.replace(/\/{2,}/g, "/");
  const normalizedPathname = withoutDuplicateSlashes.length > 1
    ? withoutDuplicateSlashes.replace(/\/+$/, "")
    : withoutDuplicateSlashes;
  const canonicalUrl = new URL(normalizedPathname, `${CANONICAL_ORIGIN}/`);

  if (canonicalUrl.origin !== CANONICAL_ORIGIN) {
    throw new TypeError("Canonical URL must use the production origin.");
  }

  return canonicalUrl.toString();
}

export { canonicalSiteOrigin };
