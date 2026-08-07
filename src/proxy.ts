import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Newsletter Subdomain Alignment
 * ------------------------------
 * `newsletter.chronoversecapital.com` is a CNAME pointed at this same
 * Vercel project (so it can render a dedicated subscribe/landing page),
 * while AWS SES uses a *separate* DNS name (see README notes below / DNS
 * instructions) for its Mail-From/DKIM identity so the two never fight
 * over the same DNS record.
 *
 * At the application layer, requests that arrive on the `newsletter.*`
 * host are transparently rewritten to the `/newsletter` route group. This
 * keeps the main Vercel routing (chronoversecapital.com/*) completely
 * untouched — no redirect loops, no duplicate-content SEO issues — while
 * still letting the newsletter subdomain resolve to a purpose-built page
 * that posts to `/api/newsletter` (AWS SES) for subscription handling.
 */
const NEWSLETTER_HOSTS = new Set([
  'newsletter.chronoversecapital.com',
  'newsletter.www.chronoversecapital.com',
]);

export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  const { pathname } = request.nextUrl;

  const isNewsletterHost = NEWSLETTER_HOSTS.has(host) || host.startsWith('newsletter.');

  // Only rewrite page routes on the newsletter subdomain — never touch
  // /api/* (so /api/newsletter and /api/amazon keep working identically on
  // every host) or already-namespaced /newsletter paths (avoids infinite
  // rewrite loops).
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
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
