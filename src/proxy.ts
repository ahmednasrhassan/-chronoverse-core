import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { refreshSupabaseSessionV1 } from '@/lib/auth/supabase/proxy';
import { buildCanonicalUrl } from '@/lib/seo/site-url';

/**
 * Newsletter Subdomain Alignment:
 * - The canonical public landing page is `/newsletter` on the main domain.
 * - Known Newsletter host roots redirect there in one permanent hop.
 * - AWS SES uses the root domain identity to avoid DNS MX/TXT conflicts.
 * - Existing non-root `newsletter.*` behavior remains a transparent rewrite.
 */

const NEWSLETTER_HOSTS = new Set([
  'newsletter.chronoversecapital.com',
  'newsletter.www.chronoversecapital.com',
]);

export const PRODUCTION_SEARCH_HOSTNAME_V1 = 'chronoversecapital.com';
export const PREVIEW_ROBOTS_HEADER_VALUE_V1 = 'noindex, nofollow';
export const CANONICAL_NEWSLETTER_URL_V1 = buildCanonicalUrl('/newsletter');

export type SessionRefresherV1 = (
  request: NextRequest,
) => Promise<NextResponse>;

export function createChronoverseProxyV1(
  refreshSession: SessionRefresherV1 = refreshSupabaseSessionV1,
) {
  return async function handleProxy(request: NextRequest) {
    const refreshedResponse = await refreshSession(request);
    const newsletterRedirectUrl = getNewsletterCanonicalRedirectUrlV1(request);

    if (newsletterRedirectUrl !== null) {
      const redirectResponse = NextResponse.redirect(newsletterRedirectUrl, 308);

      for (const cookie of refreshedResponse.cookies.getAll()) {
        redirectResponse.cookies.set(cookie);
      }

      return applySearchRobotsHeaderV1(request, redirectResponse);
    }

    const rewriteUrl = getNewsletterRewriteUrlV1(request);

    if (rewriteUrl === null) {
      return applySearchRobotsHeaderV1(request, refreshedResponse);
    }

    const rewriteResponse = NextResponse.rewrite(rewriteUrl, { request });

    for (const cookie of refreshedResponse.cookies.getAll()) {
      rewriteResponse.cookies.set(cookie);
    }

    return applySearchRobotsHeaderV1(request, rewriteResponse);
  };
}

export function getPreviewRobotsHeaderValueV1(
  hostname: string,
): string | null {
  return hostname.toLowerCase() === PRODUCTION_SEARCH_HOSTNAME_V1
    ? null
    : PREVIEW_ROBOTS_HEADER_VALUE_V1;
}

export function getSearchRobotsHeaderValueV1(
  hostname: string,
  pathname: string,
): string | null {
  return getPreviewRobotsHeaderValueV1(hostname) ??
    (pathname === '/vip' || pathname.startsWith('/vip/')
      ? PREVIEW_ROBOTS_HEADER_VALUE_V1
      : null);
}

function applySearchRobotsHeaderV1(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const headerValue = getSearchRobotsHeaderValueV1(
    request.nextUrl.hostname,
    request.nextUrl.pathname,
  );

  if (headerValue !== null) {
    response.headers.set('X-Robots-Tag', headerValue);
  }

  return response;
}

export function getNewsletterCanonicalRedirectUrlV1(
  request: NextRequest,
): URL | null {
  const host = getRequestHostV1(request);

  return NEWSLETTER_HOSTS.has(host) && request.nextUrl.pathname === '/'
    ? new URL(CANONICAL_NEWSLETTER_URL_V1)
    : null;
}

export function getNewsletterRewriteUrlV1(request: NextRequest): URL | null {
  const host = getRequestHostV1(request);
  const { pathname } = request.nextUrl;

  const isNewsletterHost =
    NEWSLETTER_HOSTS.has(host) || host.startsWith('newsletter.');

  // Rewrite page routes on newsletter subdomain without touching /api or assets
  if (
    isNewsletterHost &&
    !(NEWSLETTER_HOSTS.has(host) && pathname === '/') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/newsletter') &&
    !pathname.startsWith('/_next')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `/newsletter${pathname === '/' ? '' : pathname}`;
    return url;
  }

  return null;
}

function getRequestHostV1(request: NextRequest): string {
  const hostHeader = request.headers.get('host') || '';
  return hostHeader.split(':')[0].toLowerCase();
}

export const proxy = createChronoverseProxyV1();

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - common static image assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
