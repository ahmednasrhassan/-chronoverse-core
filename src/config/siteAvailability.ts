/**
 * Deployment policy for this free-only application. Deliberately independent
 * of credentials, request parameters, cookies and deployment environment.
 * Historical billing/webhook processing is a separate concern and is retained.
 */
export function isFreeOnlyMode(): boolean {
  return true;
}

export function isRetiredCommercialPath(pathname: string): boolean {
  // Next may dispatch decoded paths while nextUrl retains percent escapes.
  // Decode once, matching filesystem dispatch without broad prefix blocking.
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return isFreeOnlyMode() && ["/pricing", "/premium", "/vip", "/sponsors"].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export const RETIRED_PAGE_METADATA = Object.freeze({
  title: "Page not found",
  description: "The requested page is unavailable.",
  robots: { index: false, follow: false },
});
