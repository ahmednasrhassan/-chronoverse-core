import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../../../../next.config";
import { buildSitemap } from "../../../app/sitemap";
import { GET as eurusd } from "../../../app/api/markets/eurusd/intelligence/route";
import { GET as eurjpy } from "../../../app/api/markets/eurjpy/intelligence/route";
import { GET as eurgbp } from "../../../app/api/markets/eurgbp/intelligence/route";
import { GET as eurchf } from "../../../app/api/markets/eurchf/intelligence/route";
import { GET as estr } from "../../../app/api/markets/estr/intelligence/route";
import { GET as cron, POST as cronPost } from "../../../app/api/cron/ecb-live-progression/route";

const products = ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"];
test("retired public URLs reach the final research route in one permanent hop", async () => {
  for (const host of ["chronoversecapital.com", "www.chronoversecapital.com"]) {
    for (const path of ["/markets", ...products.map(id => `/markets/${id}`), "/markets/estr/history", "/intelligence", "/research"]) {
      const response = await unstable_getResponseFromNextConfig({ url: `https://${host}${path}?utm_source=legacy`, nextConfig });
      assert.equal(response.status, 308);
      const destination = new URL(response.headers.get("location")!);
      assert.equal(destination.origin, "https://chronoversecapital.com");
      assert.equal(destination.pathname, "/reports");
      assert.equal(destination.search, "?utm_source=legacy");
      const final = await unstable_getResponseFromNextConfig({ url: destination.href, nextConfig });
      assert.equal(final.headers.get("location"), null);
    }
  }
});
test("retired market APIs and acquisition cron never read caller input", async () => {
  const hostile = new Proxy({} as Request, { get() { throw new Error("request accessed"); } });
  for (const handler of [eurusd, eurjpy, eurgbp, eurchf, estr, cron, cronPost] as ((request: Request) => Response | Promise<Response>)[]) {
    const response = await handler(hostile);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "retired" });
  }
});
test("retired implementation is removed and editorial market subjects remain indexable", () => {
  // Directory existence is not significant: empty directories can remain in a worktree.
  for (const file of ["src/lib/markets/services/canonicalProductResults.ts", "src/components/home/FreeMarketSurface.tsx", "src/app/(vip)/vip/page.tsx", "src/app/(site)/pricing/page.tsx", "src/lib/billing/lemonCheckout.ts", "archive/legacy-paid-intelligence/manifest.json"]) {
    assert.equal(existsSync(file), false, file);
  }
  const urls = buildSitemap({ posts: [{ slug: "eurusd" }, { slug: "eurusd-policy-analysis" }, { slug: "interest-rates-outlook" }], categorySlugs: ["currencies"] }).map(item => item.url);
  assert.ok(urls.includes("https://chronoversecapital.com/eurusd"));
  assert.ok(urls.includes("https://chronoversecapital.com/eurusd-policy-analysis"));
  assert.ok(urls.includes("https://chronoversecapital.com/interest-rates-outlook"));
  assert.ok(!urls.some(url => /\/(?:markets|vip|pricing)(?:\/|$)/.test(new URL(url).pathname)));
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /Free Lite|Five-Market|EUR\/USD|€STR/);
});
