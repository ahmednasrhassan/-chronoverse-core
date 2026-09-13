import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { refreshSupabaseSessionV1 } from '@/lib/auth/supabase/proxy';

/**
 * Newsletter Subdomain Alignment:
 * - `newsletter.chronoversecapital.com` points to this Vercel project to render
 *   a dedicated landing page.
 * - AWS SES uses the root domain identity to avoid DNS MX/TXT conflicts.
 * - This proxy transparently rewrites incoming requests on `newsletter.*`
 *   to the internal `/newsletter` route group.
 */

const NEWSLETTER_HOSTS = new Set([
  'newsletter.chronoversecapital.com',
  'newsletter.www.chronoversecapital.com',
]);

export const PRODUCTION_SEARCH_HOSTNAME_V1 = 'chronoversecapital.com';
export const PREVIEW_ROBOTS_HEADER_VALUE_V1 = 'noindex, nofollow';

export type SessionRefresherV1 = (
  request: NextRequest,
) => Promise<NextResponse>;

export function createChronoverseProxyV1(
  refreshSession: SessionRefresherV1 = refreshSupabaseSessionV1,
) {
  return async function handleProxy(request: NextRequest) {
    const refreshedResponse = await refreshSession(request);
    const rewriteUrl = getNewsletterRewriteUrlV1(request);

    if (rewriteUrl === null) {
      return applyPreviewRobotsHeaderV1(request, refreshedResponse);
    }

    const rewriteResponse = NextResponse.rewrite(rewriteUrl, { request });

    for (const cookie of refreshedResponse.cookies.getAll()) {
      rewriteResponse.cookies.set(cookie);
    }

    return applyPreviewRobotsHeaderV1(request, rewriteResponse);
  };
}

export function getPreviewRobotsHeaderValueV1(
  hostname: string,
): string | null {
  return hostname.toLowerCase() === PRODUCTION_SEARCH_HOSTNAME_V1
    ? null
    : PREVIEW_ROBOTS_HEADER_VALUE_V1;
}

function applyPreviewRobotsHeaderV1(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const headerValue = getPreviewRobotsHeaderValueV1(request.nextUrl.hostname);

  if (headerValue !== null) {
    response.headers.set('X-Robots-Tag', headerValue);
  }

  return response;
}

export function getNewsletterRewriteUrlV1(request: NextRequest): URL | null {
  const hostHeader = request.headers.get('host') || '';
  const host = hostHeader.split(':')[0].toLowerCase();
  const { pathname } = request.nextUrl;

  const isNewsletterHost =
    NEWSLETTER_HOSTS.has(host) || host.startsWith('newsletter.');

  // Rewrite page routes on newsletter subdomain without touching /api or assets
  if (
    isNewsletterHost &&
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
