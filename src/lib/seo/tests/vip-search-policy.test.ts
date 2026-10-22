import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createChronoverseProxyV1 } from "../../../proxy";
import Pricing, { metadata as pricingMetadata } from "../../../app/(site)/pricing/page";
import Sponsors, { metadata as sponsorsMetadata } from "../../../app/(site)/sponsors/page";
import { metadata as vipMetadata } from "../../../app/(vip)/vip/layout";
import { metadata as overviewMetadata } from "../../../app/(vip)/vip/page";
import { metadata as marketsMetadata } from "../../../app/(vip)/vip/markets/page";
import { metadata as roomMetadata } from "../../../app/(vip)/vip/markets/[market]/page";
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
  for (const metadata of [pricingMetadata, sponsorsMetadata, vipMetadata, overviewMetadata, marketsMetadata, roomMetadata]) {
    assert.equal(metadata.title, "Page not found");
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.equal(metadata.alternates, undefined);
    assert.doesNotMatch(JSON.stringify(metadata), /VIP|pricing|checkout|15\.99/i);
  }
  for (const page of [Pricing, Sponsors]) assert.throws(page, (error: unknown) => (error as { digest?: string }).digest === "NEXT_HTTP_ERROR_FALLBACK;404");
  const urls = buildSitemap({ posts: [{ slug: "pricing" }, { slug: "vip" }, { slug: "real-article" }], categorySlugs: ["macro"] }).map(({ url }) => url);
  assert.ok(urls.includes("https://chronoversecapital.com/real-article"));
  assert.ok(urls.includes("https://chronoversecapital.com/category/macro"));
  for (const route of ["pricing", "premium", "vip", "sponsors"]) assert.ok(!urls.includes(`https://chronoversecapital.com/${route}`));
  assert.equal(robots().sitemap, "https://chronoversecapital.com/sitemap.xml");
  console.log("PASS: retired commercial routes return non-streamed no-store 404s on every host");
}

void main();
