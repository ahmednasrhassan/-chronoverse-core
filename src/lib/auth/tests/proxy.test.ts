import { NextRequest, NextResponse } from "next/server";

import {
  createChronoverseProxyV1,
  getNewsletterRewriteUrlV1,
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

async function main(): Promise<void> {
  const rewriteCases = [
    ["newsletter.chronoversecapital.com", "/", "/newsletter"],
    ["newsletter.chronoversecapital.com", "/about", "/newsletter/about"],
    ["newsletter.www.chronoversecapital.com", "/dispatch", "/newsletter/dispatch"],
    ["newsletter.preview.example", "/archive", "/newsletter/archive"],
  ] as const;

  for (const [host, pathname, expectedPathname] of rewriteCases) {
    assertEqual(getNewsletterRewriteUrlV1(request(host, pathname))?.pathname,
      expectedPathname, `${host}${pathname} keeps newsletter rewrite behavior`);
  }

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

  assertEqual(refreshCalls, 1, "session refresh runs before rewrite");
  assertEqual(
    new URL(rewritten.headers.get("x-middleware-rewrite")!).pathname,
    "/newsletter/research",
    "composed proxy returns newsletter rewrite",
  );
  assertEqual(rewritten.cookies.get("auth-refresh-test")?.value, "preserved",
    "rewrite preserves refreshed auth cookie");

  const direct = await handler(request("chronoversecapital.com", "/about"));
  assertEqual(refreshCalls, 2, "session refresh also runs without a rewrite");
  assertEqual(direct.headers.get("x-middleware-rewrite"), null,
    "main-domain response remains direct");
  assertEqual(direct.cookies.get("auth-refresh-test")?.value, "preserved",
    "direct response preserves refreshed auth cookie");

  console.log("PASS: Supabase session refresh preserves newsletter proxy");
}

void main();
