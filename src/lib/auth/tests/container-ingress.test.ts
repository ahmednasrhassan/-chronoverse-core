import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import {
  createChronoverseProxyV1,
  getNewsletterRewriteUrlV1,
  getWwwCanonicalRedirectUrlV1,
} from "../../../proxy";

function ingress(host: string, forwardedHost: string, path = "/account?view=identity") {
  return new NextRequest(`http://container.internal:8080${path}`, {
    headers: { host, "x-forwarded-host": forwardedHost, "x-forwarded-proto": "https" },
  });
}

test("container ingress must preserve actual www Host, path and query", () => {
  const result = getWwwCanonicalRedirectUrlV1(ingress(
    "www.chronoversecapital.com", "container.internal:8080", "/account?view=identity",
  ));
  assert.equal(result?.href, "https://chronoversecapital.com/account?view=identity");
});

test("a forwarded www hostname alone cannot repair the proxy contract", () => {
  assert.equal(getWwwCanonicalRedirectUrlV1(ingress(
    "container.internal:8080", "www.chronoversecapital.com",
  )), null);
});

test("actual newsletter Host owns rewrites behind container ingress", () => {
  assert.equal(getNewsletterRewriteUrlV1(ingress(
    "newsletter.chronoversecapital.com", "container.internal:8080", "/archive?page=2",
  ))?.pathname, "/newsletter/archive");
  assert.equal(getNewsletterRewriteUrlV1(ingress(
    "container.internal:8080", "newsletter.chronoversecapital.com", "/archive?page=2",
  )), null);
});

test("ingress must also preserve the public URL authority for search robots", async () => {
  const handler = createChronoverseProxyV1(async request => NextResponse.next({ request }));
  const internal = await handler(ingress("chronoversecapital.com", "chronoversecapital.com", "/reports"));
  assert.equal(internal.headers.get("x-robots-tag"), "noindex, nofollow");
  const external = await handler(new NextRequest("https://chronoversecapital.com/vip", {
    headers: { host: "chronoversecapital.com", "x-forwarded-proto": "https" },
  }));
  assert.equal(external.headers.get("x-robots-tag"), "noindex, nofollow");
  const publicPage = await handler(new NextRequest("https://chronoversecapital.com/reports", {
    headers: { host: "chronoversecapital.com" },
  }));
  assert.equal(publicPage.headers.get("x-robots-tag"), null);
});

test("www canonicalization occurs before Supabase session refresh", async () => {
  let refreshCalls = 0;
  const handler = createChronoverseProxyV1(async request => {
    refreshCalls += 1;
    return NextResponse.next({ request });
  });
  const result = await handler(ingress("www.chronoversecapital.com", "container.internal"));
  assert.equal(result.status, 308);
  assert.equal(result.headers.get("location"), "https://chronoversecapital.com/account?view=identity");
  assert.equal(refreshCalls, 0);
});
