import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, createChronoverseProxyV1, getWwwCanonicalRedirectUrlV1 } from "../../../proxy";

async function main(): Promise<void> {
  let refreshCalls = 0;
  const handler = createChronoverseProxyV1(async (request) => {
    refreshCalls += 1;
    return NextResponse.next({ request });
  });
  for (const path of ["/", "/reports?utm_source=seo&tag=a&tag=b", "/vip/eurusd?return=%2Faccount", "/account", "/billing", "/auth/callback?code=test", "/chronoverse-social.png"]) {
    const request = new NextRequest(`http://www.chronoversecapital.com:3000${path}`, { headers: { host: "www.chronoversecapital.com:3000" } });
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: request.url, headers: { host: "www.chronoversecapital.com" } }), true);
    const response = await handler(request);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `https://chronoversecapital.com${path}`);
    assert.equal(response.headers.get("x-middleware-rewrite"), null);
    assert.equal(getWwwCanonicalRedirectUrlV1(new NextRequest(response.headers.get("location")!, { headers: { host: "chronoversecapital.com" } })), null);
  }
  assert.equal(refreshCalls, 0, "alias redirects never consult authentication or private data");
  for (const host of ["chronoversecapital.com", "preview.vercel.app", "www.chronoversecapital.com.evil.example", "newsletter.chronoversecapital.com", "newsletter.www.chronoversecapital.com"]) {
    const request = new NextRequest(`https://${host}/reports?x=1`, { headers: { host } });
    assert.equal(getWwwCanonicalRedirectUrlV1(request), null);
    const response = await handler(request);
    assert.equal(response.headers.get("location"), null);
    if (host !== "chronoversecapital.com") assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  }
  const vip = await handler(new NextRequest("https://chronoversecapital.com/vip", { headers: { host: "chronoversecapital.com" } }));
  assert.equal(vip.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(refreshCalls, 1, "canonical private routing still refreshes authentication");
  console.log("PASS: exact www canonical host, paths, queries, assets and private/preview boundaries");
}
void main();
