import { NextRequest, NextResponse } from "next/server";

import {
  CANONICAL_NEWSLETTER_URL_V1,
  createChronoverseProxyV1,
  getNewsletterCanonicalRedirectUrlV1,
  getNewsletterRewriteUrlV1,
  requiresAuthSessionRefreshV1,
} from "../../../proxy";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function request(host: string, pathname: string): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, {
    headers: { host },
  });
}

function requestWithSessionCookie(host: string, pathname: string): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, {
    headers: {
      host,
      cookie: "sb-session-test=existing-session",
    },
  });
}

async function main(): Promise<void> {
  const rewriteCases = [
    ["newsletter.chronoversecapital.com", "/about", "/newsletter/about"],
    ["newsletter.www.chronoversecapital.com", "/dispatch", "/newsletter/dispatch"],
    ["newsletter.preview.example", "/archive", "/newsletter/archive"],
  ] as const;

  for (const [host, pathname, expectedPathname] of rewriteCases) {
    assertEqual(getNewsletterRewriteUrlV1(request(host, pathname))?.pathname,
      expectedPathname, `${host}${pathname} keeps newsletter rewrite behavior`);
  }

  const newsletterRoot = request("newsletter.chronoversecapital.com", "/");
  assertEqual(
    getNewsletterCanonicalRedirectUrlV1(newsletterRoot)?.toString(),
    CANONICAL_NEWSLETTER_URL_V1,
    "Newsletter host root resolves to the canonical main-domain page",
  );
  assertEqual(
    getNewsletterRewriteUrlV1(newsletterRoot),
    null,
    "Newsletter host root is not rewritten before its canonical redirect",
  );

  const bypassCases = [
    ["chronoversecapital.com", "/"],
    ["newsletter.chronoversecapital.com", "/api/newsletter"],
    ["newsletter.chronoversecapital.com", "/newsletter"],
    ["newsletter.chronoversecapital.com", "/_next/static/app.js"],
  ] as const;

  for (const [host, pathname] of bypassCases) {
    assertEqual(getNewsletterRewriteUrlV1(request(host, pathname)), null,
      `${host}${pathname} is not rewritten`);
  }

  let refreshCalls = 0;
  const handler = createChronoverseProxyV1(async (incomingRequest) => {
    refreshCalls += 1;
    const response = NextResponse.next({ request: incomingRequest });
    response.cookies.set("auth-refresh-test", "preserved");
    return response;
  });
  const rewritten = await handler(request(
    "newsletter.chronoversecapital.com",
    "/research",
  ));

  assertEqual(refreshCalls, 0, "public newsletter rewrite skips session refresh");
  assertEqual(
    new URL(rewritten.headers.get("x-middleware-rewrite")!).pathname,
    "/newsletter/research",
    "composed proxy returns newsletter rewrite",
  );
  assertEqual(rewritten.cookies.get("auth-refresh-test"), undefined,
    "public rewrite does not synthesize refreshed auth cookies");

  const direct = await handler(request("chronoversecapital.com", "/about"));
  assertEqual(refreshCalls, 0, "public page skips session refresh");
  assertEqual(direct.headers.get("x-middleware-rewrite"), null,
    "main-domain response remains direct");
  assertEqual(direct.cookies.get("auth-refresh-test"), undefined,
    "public response does not synthesize refreshed auth cookies");

  await handler(requestWithSessionCookie("chronoversecapital.com", "/reports"));
  assertEqual(refreshCalls, 0,
    "public requests tolerate an existing session without requiring rotation");

  for (const pathname of [
    "/account",
    "/account/profile",
    "/auth/confirm",
    "/vip",
    "/vip/markets/eurusd",
  ]) {
    assertEqual(requiresAuthSessionRefreshV1(pathname), true,
      `${pathname} requires session refresh`);
    const response = await handler(request("chronoversecapital.com", pathname));
    assertEqual(response.cookies.get("auth-refresh-test")?.value, "preserved",
      `${pathname} preserves refreshed auth cookies`);
  }

  for (const pathname of [
    "/",
    "/markets",
    "/pricing",
    "/reports",
    "/newsletter",
    "/category/macro",
    "/research-article",
    "/billing",
    "/api/newsletter",
    "/accounting",
    "/authentication",
    "/vipers",
  ]) {
    assertEqual(requiresAuthSessionRefreshV1(pathname), false,
      `${pathname} skips session refresh`);
  }

  assertEqual(refreshCalls, 5,
    "only auth-sensitive route families invoke session refresh");

  console.log("PASS: proxy bounds Supabase refresh to auth-sensitive routes");
}

void main();
