import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRetiredCommercialPath } from "@/config/siteAvailability";

import { refreshSupabaseSessionV1 } from "@/lib/auth/supabase/proxy";
import { buildCanonicalUrl } from "@/lib/seo/site-url";
import { APPLICATIONS_ORIGIN } from "@/config/applications";

/**
 * Newsletter Subdomain Alignment:
 * - The canonical public landing page is `/newsletter` on the main domain.
 * - Known Newsletter host roots redirect there in one permanent hop.
 * - AWS SES uses the root domain identity to avoid DNS MX/TXT conflicts.
 * - Existing non-root `newsletter.*` behavior remains a transparent rewrite.
 */

const NEWSLETTER_HOSTS = new Set([
  "newsletter.chronoversecapital.com",
  "newsletter.www.chronoversecapital.com",
]);

export const PRODUCTION_SEARCH_HOSTNAME_V1 = "chronoversecapital.com";
export const PREVIEW_ROBOTS_HEADER_VALUE_V1 = "noindex, nofollow";
export const CANONICAL_NEWSLETTER_URL_V1 = buildCanonicalUrl("/newsletter");

export type SessionRefresherV1 = (
  request: NextRequest,
) => Promise<NextResponse>;

const AUTH_SESSION_ROUTE_FAMILIES_V1 = ["/account", "/auth"] as const;

export function requiresAuthSessionRefreshV1(pathname: string): boolean {
  return AUTH_SESSION_ROUTE_FAMILIES_V1.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function createChronoverseProxyV1(
  refreshSession: SessionRefresherV1 = refreshSupabaseSessionV1,
) {
  return async function handleProxy(request: NextRequest) {
    let pathname = request.nextUrl.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      /* Invalid paths fall through to Next. */
    }
    // Tombstones execute before authentication, body parsing and host rewrites.
    // No product route or provider service is needed to retire these APIs.
    if (
      [
        "/api/markets",
        "/api/billing",
        "/api/market-data",
        "/api/cron/ecb-live-progression",
        "/api/webhooks/lemon-squeezy",
      ].some((route) => pathname === route || pathname.startsWith(`${route}/`))
    ) {
      return NextResponse.json(
        { status: "retired" },
        {
          status: 410,
          headers: {
            "Cache-Control": "no-store",
            "X-Robots-Tag": PREVIEW_ROBOTS_HEADER_VALUE_V1,
          },
        },
      );
    }
    if (pathname === "/billing" || pathname.startsWith("/billing/")) {
      return NextResponse.redirect(buildCanonicalUrl("/contact"), 308);
    }
    // Respond before session refresh, rewrites, redirects or streamed rendering.
    // Every host and descendant is covered by the explicit matchers below.
    if (isRetiredCommercialPath(request.nextUrl.pathname)) {
      return new NextResponse("Not found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": PREVIEW_ROBOTS_HEADER_VALUE_V1,
        },
      });
    }
    const canonicalHostUrl = getWwwCanonicalRedirectUrlV1(request);
    if (canonicalHostUrl !== null) {
      // Redirect before authentication: apex owns the session and private route.
      return NextResponse.redirect(canonicalHostUrl, 308);
    }
    const host = getRequestHostV1(request);
    if (
      host === PRODUCTION_SEARCH_HOSTNAME_V1 &&
      (pathname === "/apps" || pathname.startsWith("/apps/"))
    ) {
      const target = new URL(APPLICATIONS_ORIGIN);
      target.pathname = pathname.slice("/apps".length) || "/";
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }
    if (host === "apps.chronoversecapital.com") {
      // Identity and editorial links remain on the main site. Only catalog
      // documents are rewritten; APIs and static assets keep their boundaries.
      if (
        requiresAuthSessionRefreshV1(pathname) ||
        [
          "/reports",
          "/about",
          "/contact",
          "/newsletter",
          "/terms-of-service",
          "/privacy-policy",
          "/cookie-policy",
          "/refund-policy",
          "/faq",
          "/disclaimer",
          "/methodology",
          "/data-sources",
          "/freshness",
          "/editorial-policy",
          "/dmca",
          "/manifesto",
          "/archive",
        ].includes(pathname) ||
        pathname.startsWith("/category/")
      ) {
        const target = new URL(buildCanonicalUrl(pathname));
        target.search = request.nextUrl.search;
        return NextResponse.redirect(target, 308);
      }
      const rewrite = getApplicationsRewriteUrlV1(request);
      if (rewrite) return NextResponse.rewrite(rewrite, { request });
    }
    const sessionResponse = requiresAuthSessionRefreshV1(
      request.nextUrl.pathname,
    )
      ? await refreshSession(request)
      : NextResponse.next({ request });
    const newsletterRedirectUrl = getNewsletterCanonicalRedirectUrlV1(request);

    if (newsletterRedirectUrl !== null) {
      const redirectResponse = NextResponse.redirect(
        newsletterRedirectUrl,
        308,
      );

      for (const cookie of sessionResponse.cookies.getAll()) {
        redirectResponse.cookies.set(cookie);
      }

      return applySearchRobotsHeaderV1(request, redirectResponse);
    }

    const rewriteUrl = getNewsletterRewriteUrlV1(request);

    if (rewriteUrl === null) {
      return applySearchRobotsHeaderV1(request, sessionResponse);
    }

    const rewriteResponse = NextResponse.rewrite(rewriteUrl, { request });

    for (const cookie of sessionResponse.cookies.getAll()) {
      rewriteResponse.cookies.set(cookie);
    }

    return applySearchRobotsHeaderV1(request, rewriteResponse);
  };
}

export function getWwwCanonicalRedirectUrlV1(request: NextRequest): URL | null {
  if (getRequestHostV1(request) !== "www.chronoversecapital.com") return null;
  const url = new URL(buildCanonicalUrl("/"));
  url.pathname = request.nextUrl.pathname;
  url.search = request.nextUrl.search;
  return url;
}

export function getPreviewRobotsHeaderValueV1(hostname: string): string | null {
  return [
    PRODUCTION_SEARCH_HOSTNAME_V1,
    "apps.chronoversecapital.com",
  ].includes(hostname.toLowerCase())
    ? null
    : PREVIEW_ROBOTS_HEADER_VALUE_V1;
}

export function getSearchRobotsHeaderValueV1(
  hostname: string,
  pathname: string,
): string | null {
  return (
    getPreviewRobotsHeaderValueV1(hostname) ??
    (pathname === "/vip" || pathname.startsWith("/vip/")
      ? PREVIEW_ROBOTS_HEADER_VALUE_V1
      : null)
  );
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
    response.headers.set("X-Robots-Tag", headerValue);
  }

  return response;
}

export function getNewsletterCanonicalRedirectUrlV1(
  request: NextRequest,
): URL | null {
  const host = getRequestHostV1(request);

  return NEWSLETTER_HOSTS.has(host) && request.nextUrl.pathname === "/"
    ? new URL(CANONICAL_NEWSLETTER_URL_V1)
    : null;
}

export function getNewsletterRewriteUrlV1(request: NextRequest): URL | null {
  const host = getRequestHostV1(request);
  const { pathname } = request.nextUrl;

  const isNewsletterHost =
    NEWSLETTER_HOSTS.has(host) || host.startsWith("newsletter.");

  // Rewrite page routes on newsletter subdomain without touching /api or assets
  if (
    isNewsletterHost &&
    !(NEWSLETTER_HOSTS.has(host) && pathname === "/") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/newsletter") &&
    !pathname.startsWith("/_next")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `/newsletter${pathname === "/" ? "" : pathname}`;
    return url;
  }

  return null;
}

export function getApplicationsRewriteUrlV1(request: NextRequest): URL | null {
  if (getRequestHostV1(request) !== "apps.chronoversecapital.com") return null;
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/apps/") ||
    pathname === "/apps"
  )
    return null;
  if (
    pathname !== "/robots.txt" &&
    pathname !== "/sitemap.xml" &&
    /\.[a-z0-9]+$/i.test(pathname)
  )
    return null;
  const url = request.nextUrl.clone();
  url.pathname = `/apps${pathname === "/" ? "" : pathname}`;
  return url;
}

function getRequestHostV1(request: NextRequest): string {
  const hostHeader = request.headers.get("host") || request.nextUrl.host;
  return hostHeader.split(":")[0].toLowerCase();
}

export const proxy = createChronoverseProxyV1();

export const config = {
  matcher: [
    { source: "/api/markets/:path*" },
    { source: "/api/billing/:path*" },
    { source: "/api/webhooks/lemon-squeezy/:path*" },
    { source: "/apps/:path*" },
    { source: "/api/market-data/:path*" },
    { source: "/api/cron/ecb-live-progression/:path*" },
    { source: "/billing/:path*" },
    { source: "/pricing/:path*" },
    { source: "/premium/:path*" },
    { source: "/vip/:path*" },
    { source: "/sponsors/:path*" },
    // Include asset requests on this exact alias, too.
    {
      source: "/:path*",
      has: [{ type: "host", value: "www\\.chronoversecapital\\.com" }],
    },
    // Apex session routes include every descendant, even paths with asset extensions.
    {
      source: "/account/:path*",
      has: [{ type: "host", value: "chronoversecapital\\.com" }],
    },
    {
      source: "/auth/:path*",
      has: [{ type: "host", value: "chronoversecapital\\.com" }],
    },
    // Other hosts retain the existing broad matcher for preview noindex and newsletter routing.
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [{ type: "host", value: "chronoversecapital\\.com" }],
    },
  ],
};
