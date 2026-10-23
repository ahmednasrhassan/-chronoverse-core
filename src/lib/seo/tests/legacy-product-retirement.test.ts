import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../../../../next.config";
import { buildSitemap } from "../../../app/sitemap";
import { NextRequest } from "next/server";
import { createChronoverseProxyV1, config } from "../../../proxy";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const products = ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"];
test("retired public URLs reach the final research route in one permanent hop", async () => {
  const handler = createChronoverseProxyV1(async () => { throw new Error("public APIs must not refresh sessions"); });
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
  // Similar names and live APIs must not inherit the retirement policy.
  for (const path of ["/api/newsletter", "/api/markets-news", "/api/billing-help", "/api/market-database", "/billings", "/billing-help"]) {
    const response = await handler(new NextRequest(`https://chronoversecapital.com${path}`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("location"), null, path);
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
  }
});
test("retired API families respond before auth, body parsing, redirects and rewrites", async () => {
  const handler = createChronoverseProxyV1(async () => { throw new Error("authentication invoked"); });
  for (const host of ["chronoversecapital.com", "www.chronoversecapital.com", "apps.chronoversecapital.com", "newsletter.chronoversecapital.com", "preview.vercel.app"]) {
    for (const path of ["/api/markets", ...[...products, "gold", "oil"].map(id => `/api/markets/${id}/intelligence`), "/api/markets/unknown/file.svg", "/api/market-data", "/api/cron/ecb-live-progression", "/api/billing/checkout", "/api/billing/portal", "/api/webhooks/lemon-squeezy"]) {
      assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig, url: `https://${host}${path}`, headers: { host } }), true);
      for (const method of ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"]) {
        const request = new NextRequest(`https://${host}${path}`, { method, headers: { host, "next-action": "fixture" } });
        Object.defineProperty(request, "body", { get() { throw new Error("body read"); } });
        const response = await handler(request);
        assert.equal(response.status, 410);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
        for (const header of ["location", "x-middleware-rewrite", "set-cookie"]) assert.equal(response.headers.get(header), null);
        assert.deepEqual(await response.json(), { status: "retired" });
      }
    }
    for (const path of ["/billing", "/billing/history", "/billing/file.svg"]) {
      const response = await handler(new NextRequest(`https://${host}${path}`, { headers: { host } }));
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), "https://chronoversecapital.com/contact");
      assert.equal(response.headers.get("set-cookie"), null);
    }
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
