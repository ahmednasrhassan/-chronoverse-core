import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function proxy(request: NextRequest) {
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
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
