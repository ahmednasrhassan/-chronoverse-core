import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createChronoverseProxyV1 } from "../../../proxy";
import { buildSitemap } from "../../../app/sitemap";
import robots from "../../../app/robots";

async function main(): Promise<void> {
  const proxy = createChronoverseProxyV1(async () => { throw new Error("Retired routes must not refresh sessions"); });
  for (const host of ["chronoversecapital.com", "www.chronoversecapital.com", "preview.vercel.app", "newsletter.chronoversecapital.com", "localhost:3000"]) {
    for (const route of ["/pricing", "/premium", "/sponsors", "/vip", "/vip/markets", "/vip/markets/eurusd", "/vip/markets/estr", "/vip/unknown/nested.svg", "/%76ip", "/vip%2Fmarkets/eurusd", "/%70ricing"]) {
      for (const headers of [{}, { rsc: "1", "next-router-prefetch": "1" }, { "next-action": "fixture" }] as Record<string, string>[]) {
        const response = await proxy(new NextRequest(`https://${host}${route}?market=eurusd`, { headers }));
        assert.equal(response.status, 404);
        assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("location"), null);
        assert.equal(response.headers.get("x-middleware-rewrite"), null);
        assert.equal(response.headers.get("set-cookie"), null);
      }
    }
  }
  const urls = buildSitemap({ posts: [{ slug: "pricing" }, { slug: "vip" }, { slug: "real-article" }], categorySlugs: ["macro"] }).map(({ url }) => url);
  assert.ok(urls.includes("https://chronoversecapital.com/real-article"));
  assert.ok(urls.includes("https://chronoversecapital.com/category/macro"));
  for (const route of ["pricing", "premium", "vip", "sponsors"]) assert.ok(!urls.includes(`https://chronoversecapital.com/${route}`));
  assert.equal(robots().sitemap, "https://chronoversecapital.com/sitemap.xml");
  console.log("PASS: retired commercial routes return non-streamed no-store 404s on every host");
}

void main();
