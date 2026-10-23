/**
 * Deployment policy for free browsing. Deliberately independent
 * of credentials, request parameters, cookies and deployment environment.
 * The retired commercial runtime is removed; historical database records remain.
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
