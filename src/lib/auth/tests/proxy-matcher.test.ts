import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { NextRequest, NextResponse } from "next/server";
import {
  unstable_doesMiddlewareMatch,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { getPageStaticInfo } from "next/dist/build/analysis/get-page-static-info";
import { loadBindings } from "next/dist/build/swc";
import type { PAGE_TYPES } from "next/dist/lib/page-types";
import { defaultConfig } from "next/dist/server/config-shared";
import { createRequestResponseMocks } from "next/dist/server/lib/mock-request";
import { getResolveRoutes } from "next/dist/server/lib/router-utils/resolve-routes";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";

import nextConfig from "../../../../next.config";
import { config, createChronoverseProxyV1 } from "../../../proxy";
import { createCheckoutRouteHandlerV1 } from "../../../app/api/billing/checkout/route";
import { createPortalRouteHandlerV1 } from "../../../app/api/billing/portal/route";
import { createAccessGuardsV1 } from "../guards";
import { enforceVipPageAccessV1 } from "../vipPageAccess";
import type { AccessResultV1 } from "../types";

const APEX = "chronoversecapital.com";
const FAMILIES = ["account", "auth", "billing", "vip"];
// Approved baseline: evaluated by the same Next compiler as the new config.
const baselineConfig = {
  matcher: [
    { source: "/:path*", has: [{ type: "host" as const, value: "www\\.chronoversecapital\\.com" }] },
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

// This experimental helper checks the raw pathname only, unlike production dispatch.
function matches(
  host: string,
  pathname: string,
  headers = {},
  candidate: Parameters<typeof unstable_doesMiddlewareMatch>[0]["config"] = config,
  cookies: Record<string, string> = {},
): boolean {
  return unstable_doesMiddlewareMatch({
    config: candidate,
    nextConfig,
    url: `https://${host}${pathname}`,
    headers: { host, ...headers },
    cookies,
  });
}

async function productionDispatchMatches(
  host: string,
  pathname: string,
  match: ReturnType<typeof getMiddlewareRouteMatcher>,
): Promise<boolean> {
  const dispatched = new Error("proxy dispatch reached render server");
  const resolveRoutes = getResolveRoutes(
    // Only filesystem lookups and rendering are stubbed; Next owns raw/decoded dispatch.
    {
      buildId: "matcher-test",
      headers: [], redirects: [],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      getMiddlewareMatchers: () => match,
      getItem: async () => null,
      getDynamicRoutes: () => [],
      handleLocale: (path: string) => ({ pathname: path }),
    } as unknown as Parameters<typeof getResolveRoutes>[0],
    { ...defaultConfig, ...nextConfig } as unknown as Parameters<typeof getResolveRoutes>[1],
    { dir: process.cwd(), port: 3000, dev: false, onDevServerCleanup: undefined },
    { initialize: async () => { throw dispatched; } } as unknown as Parameters<typeof getResolveRoutes>[3],
    {} as Parameters<typeof getResolveRoutes>[4],
  );
  const { req, res } = createRequestResponseMocks({ url: pathname, headers: { host } });
  try {
    await resolveRoutes({ req, res, isUpgradeReq: false, signal: new AbortController().signal });
    return false;
  } catch (error) {
    if (error === dispatched) return true;
    throw error;
  }
}

function request(host: string, pathname: string, headers = {}): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, {
    headers: { host, ...headers },
  });
}

test("Next build analysis statically extracts and compiles all six matcher rules", async () => {
  await loadBindings();
  const info = await getPageStaticInfo({
    pageFilePath: fileURLToPath(new URL("../../../proxy.ts", import.meta.url)),
    nextConfig, isDev: false, page: "/proxy", pageType: "pages" as PAGE_TYPES.PAGES,
  });
  assert.equal(info.hadUnsupportedValue, false);
  assert.equal(info.middleware?.matchers?.length, 6);
  assert.deepEqual(info.middleware?.matchers?.map(({ originalSource, has, missing }) => ({
    source: originalSource, has, missing,
  })), config.matcher.map(({ source, has, missing }) => ({ source, has, missing })));
});

test("ordinary public apex requests skip invocation, including sessions, RSC and prefetch", () => {
  const sessionCookies = { "sb-session-test": "existing-session" };
  // A cookie-sensitive matcher proves the helper actually receives the session cookie.
  const sessionMatcher = {
    matcher: [{ source: "/:path*", has: [{ type: "cookie" as const, key: "sb-session-test", value: "existing-session" }] }],
  };
  assert.equal(matches(APEX, "/reports", {}, sessionMatcher), false);
  assert.equal(matches(APEX, "/reports", {}, sessionMatcher, sessionCookies), true);
  for (const pathname of [
    "/", "/about", "/markets", "/markets/eurusd", "/pricing", "/reports",
    "/newsletter", "/category/macro", "/research-article", "/research",
    "/intelligence", "/known-article.html", "/robots.txt", "/sitemap.xml",
    "/rss.xml", "/api/newsletter", "/api/billing/checkout", "/api/billing/portal",
    "/api/markets/eurusd/intelligence", "/accounting", "/authentication",
    "/billings", "/billing-example", "/vipers",
  ]) {
    for (const headers of [
      {},
      { rsc: "1", "next-router-state-tree": "[]" },
      { "next-router-prefetch": "1", purpose: "prefetch" },
      { "next-action": "action-id" },
    ]) {
      assert.equal(matches(APEX, `${pathname}?_rsc=test`, headers), false, pathname);
    }
    assert.equal(matches(APEX, pathname, {}, config, sessionCookies), false, `existing session ${pathname}`);
    assert.equal(matches(APEX, pathname, {}, baselineConfig), true, `baseline ${pathname}`);
  }
  for (const pathname of ["/logo.png", "/favicon.ico", "/_next/static/app.js", "/_next/image?url=x&w=64&q=75"]) {
    assert.equal(matches(APEX, pathname), false, pathname);
  }
});

test("every protected apex family and descendant matches without extension or header bypasses", async () => {
  let refreshCalls = 0;
  const handler = createChronoverseProxyV1(async (incoming) => {
    refreshCalls += 1;
    const response = NextResponse.next({ request: incoming });
    response.cookies.set("refresh-test", "preserved", { httpOnly: true, secure: true });
    return response;
  });
  for (const family of FAMILIES) {
    for (const suffix of ["", "/", "/profile", "/nested/route", "/download.png", "/favicon.ico", "/file.svg"]) {
      const pathname = `/${family}${suffix}`;
      for (const headers of [
        {}, { rsc: "1", "next-router-state-tree": "[]" },
        { "next-router-prefetch": "1", purpose: "prefetch", rsc: "1" },
        { "next-action": "action-id" },
      ]) {
        assert.equal(matches(APEX, `${pathname}?_rsc=test`, headers), true, pathname);
        const response = await handler(request(APEX, `${pathname}?_rsc=test`, headers));
        assert.equal(response.cookies.get("refresh-test")?.value, "preserved");
        assert.equal(response.cookies.get("refresh-test")?.httpOnly, true);
        assert.equal(response.cookies.get("refresh-test")?.secure, true);
        assert.equal(response.headers.get("x-robots-tag"), family === "vip" ? "noindex, nofollow" : null);
      }
    }
    assert.equal(matches(APEX, `/_next/data/build-id/${family}/profile.json`), true,
      "Next-generated data route matches the protected family");
  }
  assert.equal(refreshCalls, 112);
});

test("other hosts retain baseline matching, including preview and newsletter exclusions", async () => {
  const handler = createChronoverseProxyV1(async (incoming) => NextResponse.next({ request: incoming }));
  for (const host of [
    "preview.vercel.app", "localhost:3000", "127.0.0.1:3000",
    "newsletter.chronoversecapital.com", "newsletter.www.chronoversecapital.com",
    "newsletter.preview.example", "chronoversecapital.com.evil.example",
    "www.chronoversecapital.com.evil.example", "chronoversecapital.com.",
  ]) {
    for (const pathname of [
      "/", "/reports", "/vip", "/account/profile", "/api/newsletter", "/rss.xml",
      "/_next/static/app.js", "/_next/image", "/favicon.ico", "/logo.png", "/vip/file.png",
    ]) {
      assert.equal(matches(host, pathname), matches(host, pathname, {}, baselineConfig), `${host}${pathname}`);
      if (matches(host, pathname)) {
        const response = await handler(request(host, pathname));
        assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${host}${pathname}`);
      }
    }
  }
});

test("exact host and path boundaries preserve ports, case, queries and URL normalization", () => {
  for (const host of [APEX, `${APEX}:443`, `${APEX}:3000`, "CHRONOVERSECAPITAL.COM:443"]) {
    assert.equal(matches(host, "/reports?next=/vip"), false, host);
    assert.equal(matches(host, "/vip/markets/eurusd?return=%2Faccount"), true, host);
  }
  for (const pathname of ["/VIP", "/Account", "/foo/vip"]) {
    assert.equal(matches(APEX, pathname), false, pathname);
  }
  for (const pathname of ["/vip/../account", "/reports/../vip", "/vip/%2e/profile"]) {
    const incoming = request(APEX, pathname);
    assert.equal(matches(APEX, incoming.nextUrl.pathname), true, pathname);
  }
  assert.equal(matches(APEX, request(APEX, "/vip/../reports").nextUrl.pathname), false);
  // The actual Host, rather than forwarding headers, controls the matcher.
  assert.equal(matches(APEX, "/reports", { "x-forwarded-host": "preview.vercel.app" }), false);
  assert.equal(matches("preview.vercel.app", "/reports", { "x-forwarded-host": APEX }), true);
});

test("Next production dispatch matches decoded protected paths that the raw helper misses", async () => {
  await loadBindings();
  const info = await getPageStaticInfo({
    pageFilePath: fileURLToPath(new URL("../../../proxy.ts", import.meta.url)),
    nextConfig, isDev: false, page: "/proxy", pageType: "pages" as PAGE_TYPES.PAGES,
  });
  assert.ok(info.middleware?.matchers);
  const match = getMiddlewareRouteMatcher(info.middleware.matchers);
  for (const [encoded, decoded] of [
    ["/%76ip", "/vip"],
    ["/vip%2Fmarkets", "/vip/markets"],
    ["/vip%2fmarkets", "/vip/markets"],
    ["/%61ccount/profile", "/account/profile"],
    ["/auth%2Fconfirm", "/auth/confirm"],
    ["/%62illing/history", "/billing/history"],
  ]) {
    assert.equal(matches(APEX, encoded), false, `raw helper: ${encoded}`);
    assert.equal(matches(APEX, decoded), true, `decoded helper: ${decoded}`);
    assert.equal(await productionDispatchMatches(APEX, encoded, match), true, `production: ${encoded}`);
    assert.equal(await productionDispatchMatches(APEX, decoded, match), true, `production: ${decoded}`);
  }
  // Keep negative controls so dispatch cannot pass by always invoking the proxy.
  for (const pathname of ["/reports", "/%72eports", "/%76ipers", "/VIP", "/foo/vip"]) {
    assert.equal(await productionDispatchMatches(APEX, pathname, match), false, `production: ${pathname}`);
  }
});

test("www canonicalizes all paths and assets before session refresh", async () => {
  const handler = createChronoverseProxyV1(async () => {
    throw new Error("www must redirect before auth");
  });
  for (const host of ["www.chronoversecapital.com", "WWW.CHRONOVERSECAPITAL.COM:3000"]) {
    for (const pathname of [
      "/", "/vip/markets/eurusd?x=1&x=2", "/auth/confirm?code=test",
      "/billing", "/account", "/logo.png", "/favicon.ico", "/_next/static/app.js",
      "/_next/image?url=%2Flogo.png&w=64&q=75",
    ]) {
      assert.equal(matches(host, pathname), true, `${host}${pathname}`);
      const response = await handler(request(host, pathname));
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), `https://${APEX}${pathname}`);
      assert.equal(response.headers.get("x-middleware-rewrite"), null);
      assert.equal(response.headers.get("set-cookie"), null);
    }
  }
});

test("newsletter aliases keep one-hop canonical roots, query-preserving rewrites and cookies", async () => {
  const handler = createChronoverseProxyV1(async (incoming) => {
    const response = NextResponse.next({ request: incoming });
    response.cookies.set("newsletter-refresh", "rotated", { httpOnly: true, secure: true });
    return response;
  });
  for (const host of ["newsletter.chronoversecapital.com", "newsletter.www.chronoversecapital.com"]) {
    assert.equal(matches(host, "/?utm_source=test"), true);
    const root = await handler(request(host, "/?utm_source=test"));
    assert.equal(root.status, 308);
    assert.equal(root.headers.get("location"), `https://${APEX}/newsletter`);
    assert.equal(root.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(matches(APEX, "/newsletter"), false, "canonical destination bypasses proxy");
    for (const pathname of ["/archive", "/vip/profile"]) {
      assert.equal(matches(host, pathname), true);
      const response = await handler(request(host, `${pathname}?page=2`));
      assert.equal(response.headers.get("x-middleware-rewrite"), `https://${host}/newsletter${pathname}?page=2`);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      if (pathname.startsWith("/vip")) {
        assert.equal(response.cookies.get("newsletter-refresh")?.value, "rotated");
        assert.equal(response.cookies.get("newsletter-refresh")?.httpOnly, true);
        assert.equal(response.cookies.get("newsletter-refresh")?.secure, true);
      }
    }
    for (const pathname of ["/api/newsletter", "/newsletter/archive"]) {
      assert.equal(matches(host, pathname), true);
      assert.equal((await handler(request(host, pathname))).headers.get("x-middleware-rewrite"), null);
    }
  }
});

test("existing Next redirects and security headers survive the public apex bypass", async () => {
  assert.equal(matches(APEX, "/research"), false);
  const response = await unstable_getResponseFromNextConfig({
    url: `https://${APEX}/research?utm_source=test`, nextConfig,
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), `https://${APEX}/reports?utm_source=test`);
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "origin-when-cross-origin");
});

test("direct VIP guards and billing APIs enforce authorization independently of proxy", async () => {
  const anonymous: AccessResultV1 = {
    state: "anonymous_free", isAuthenticated: false, authSubject: null,
    userId: null, role: null, canAccessVip: false,
  };
  const free: AccessResultV1 = {
    state: "authenticated_free", isAuthenticated: true, authSubject: "verified-subject",
    userId: "internal-user", role: "user", canAccessVip: false,
  };
  for (const [access, destination] of [[anonymous, "/account"], [free, "/pricing"]] as const) {
    const guards = createAccessGuardsV1(async () => access);
    for (const pathname of ["/vip", "/vip/markets", "/vip/markets/eurusd"]) {
      assert.equal(matches(APEX, pathname), true);
      await assert.rejects(
        enforceVipPageAccessV1(guards.requireVip, (url) => { throw new Error(`redirect:${url}`); }),
        { message: `redirect:${destination}` },
      );
    }
  }
  const guards = createAccessGuardsV1(async () => anonymous);
  const checkout = createCheckoutRouteHandlerV1({ createCheckout: async () => {
    await guards.requireAuthenticated();
    throw new Error("anonymous checkout reached provider");
  } });
  const portal = createPortalRouteHandlerV1({ createPortal: async () => {
    await guards.requireAuthenticated();
    throw new Error("anonymous portal reached provider");
  } });
  for (const [pathname, handler, body] of [
    ["/api/billing/checkout", checkout, JSON.stringify({ plan: "monthly" })],
    ["/api/billing/portal", portal, undefined],
  ] as const) {
    assert.equal(matches(APEX, pathname), false);
    const response = await handler(new Request(`https://${APEX}${pathname}`, { method: "POST", body }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "authentication-required" });
  }
  const failure = new Error("trusted access unavailable");
  await assert.rejects(enforceVipPageAccessV1(async () => { throw failure; }, () => {
    throw new Error("resolver failure must propagate");
  }), failure);
});
