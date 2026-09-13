import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { metadata as pricingMetadata } from "@/app/(site)/pricing/page";
import robots from "@/app/robots";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import {
  createChronoverseProxyV1,
  getSearchRobotsHeaderValueV1,
  PREVIEW_ROBOTS_HEADER_VALUE_V1,
  PRODUCTION_SEARCH_HOSTNAME_V1,
} from "../../../proxy";

type RobotsRuleV1 = {
  readonly userAgent?: string | readonly string[];
  readonly allow?: string | readonly string[];
  readonly disallow?: string | readonly string[];
};

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

function request(hostname: string, pathname: string): NextRequest {
  return new NextRequest(`https://${hostname}${pathname}`, {
    headers: { host: hostname },
  });
}

function toStrings(value: string | readonly string[] | undefined): string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : [...value];
}

function verifyProtectedMetadata(): void {
  for (const relativePath of [
    "src/app/(vip)/vip/layout.tsx",
    "src/app/(vip)/vip/page.tsx",
    "src/app/(vip)/vip/markets/page.tsx",
    "src/app/(vip)/vip/markets/[market]/page.tsx",
  ]) {
    const source = readSource(relativePath);
    const metadataStart = source.indexOf("export const metadata");
    const componentStart = source.search(/export default (?:async )?function/);

    assert.notEqual(metadataStart, -1, `${relativePath} exports metadata`);
    assert.ok(
      componentStart > metadataStart,
      `${relativePath} declares metadata before its component`,
    );

    const metadataSource = source.slice(metadataStart, componentStart);
    assert.match(
      metadataSource,
      /robots:\s*\{\s*index:\s*false,\s*follow:\s*false,\s*googleBot:\s*\{\s*index:\s*false,\s*follow:\s*false,/,
      `${relativePath} remains noindex, nofollow for all crawlers`,
    );
    assert.equal(
      metadataSource.includes("canonical"),
      false,
      `${relativePath} has no public-search canonical`,
    );
  }

  const accountSource = readSource("src/app/(site)/account/page.tsx");
  assert.match(
    accountSource,
    /robots:\s*\{\s*index:\s*false,\s*follow:\s*false,\s*googleBot:\s*\{\s*index:\s*false,\s*follow:\s*false,/,
    "Account retains its existing B3 noindex, nofollow policy",
  );
}

async function verifyVipResponseHeaders(): Promise<void> {
  assert.equal(PRODUCTION_SEARCH_HOSTNAME_V1, "chronoversecapital.com");
  assert.equal(PREVIEW_ROBOTS_HEADER_VALUE_V1, "noindex, nofollow");

  let refreshCalls = 0;
  const handler = createChronoverseProxyV1(async (incomingRequest) => {
    refreshCalls += 1;
    const response = NextResponse.next({ request: incomingRequest });
    response.cookies.set("vip-search-test", "preserved");
    return response;
  });

  for (const pathname of [
    "/vip",
    "/vip/markets",
    "/vip/markets/eurusd",
    "/vip/markets/estr",
  ]) {
    assert.equal(
      getSearchRobotsHeaderValueV1(PRODUCTION_SEARCH_HOSTNAME_V1, pathname),
      PREVIEW_ROBOTS_HEADER_VALUE_V1,
      `${pathname} receives the production VIP search policy`,
    );

    const response = await handler(
      request(PRODUCTION_SEARCH_HOSTNAME_V1, pathname),
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("x-robots-tag"),
      PREVIEW_ROBOTS_HEADER_VALUE_V1,
      `${pathname} response is noindex, nofollow`,
    );
    assert.equal(
      response.cookies.get("vip-search-test")?.value,
      "preserved",
      `${pathname} preserves refreshed session cookies`,
    );
  }

  const queryResponse = await handler(
    request(PRODUCTION_SEARCH_HOSTNAME_V1, "/vip?market=eurusd"),
  );
  assert.equal(
    queryResponse.headers.get("x-robots-tag"),
    PREVIEW_ROBOTS_HEADER_VALUE_V1,
    "query-selected VIP URLs remain noindex, nofollow",
  );

  const previewResponse = await handler(
    request("chronoverse-git-seo-b5-preview.vercel.app", "/vip"),
  );
  assert.equal(
    previewResponse.headers.get("x-robots-tag"),
    PREVIEW_ROBOTS_HEADER_VALUE_V1,
    "preview VIP composes to one noindex, nofollow policy",
  );

  for (const [pathname, destination] of [
    ["/vip", "/account"],
    ["/vip/markets", "/pricing"],
  ] as const) {
    const redirectingHandler = createChronoverseProxyV1(
      async (incomingRequest) =>
        NextResponse.redirect(new URL(destination, incomingRequest.url), 307),
    );
    const response = await redirectingHandler(
      request(PRODUCTION_SEARCH_HOSTNAME_V1, pathname),
    );

    assert.equal(response.status, 307);
    assert.equal(
      new URL(response.headers.get("location")!).pathname,
      destination,
    );
    assert.equal(
      response.headers.get("x-robots-tag"),
      PREVIEW_ROBOTS_HEADER_VALUE_V1,
      `${pathname} ${destination} redirect remains noindex, nofollow`,
    );
  }

  for (const pathname of ["/pricing", "/markets"]) {
    const response = await handler(
      request(PRODUCTION_SEARCH_HOSTNAME_V1, pathname),
    );
    assert.equal(
      response.headers.get("x-robots-tag"),
      null,
      `${pathname} does not receive VIP path-level noindex`,
    );
  }

  const accountResponse = await handler(
    request(PRODUCTION_SEARCH_HOSTNAME_V1, "/account"),
  );
  assert.equal(
    accountResponse.headers.get("x-robots-tag"),
    null,
    "Account continues to rely on its existing page-level B3 policy",
  );
  assert.equal(refreshCalls, 9, "session refresh runs exactly once per request");
}

function verifyRobotsPolicy(): void {
  const output = robots() as {
    readonly rules: RobotsRuleV1 | readonly RobotsRuleV1[];
    readonly sitemap?: string | readonly string[];
  };
  const rules = Array.isArray(output.rules) ? output.rules : [output.rules];

  assert.equal(rules.length, 2, "existing crawler-specific rules remain intact");

  for (const rule of rules) {
    const disallowed = toStrings(rule.disallow);
    assert.equal(
      disallowed.some((pathname) =>
        pathname === "/vip" || pathname.startsWith("/vip/")),
      false,
      "robots does not block crawlers from retrieving VIP noindex responses",
    );
    assert.ok(disallowed.length > 0, "sensitive-path policy was not cleared");
  }

  const wildcardRule = rules.find((rule) =>
    toStrings(rule.userAgent).includes("*"));
  assert.ok(wildcardRule, "wildcard crawler rule remains present");
  assert.ok(toStrings(wildcardRule.allow).includes("/"));
  for (const pathname of [
    "/api/",
    "/studio/",
    "/dashboard/",
    "/checkout/",
    "/cart/",
    "/private/",
    "/drafts/",
  ]) {
    assert.ok(
      toStrings(wildcardRule.disallow).includes(pathname),
      `${pathname} remains blocked for the wildcard crawler rule`,
    );
  }

  const googleRule = rules.find((rule) =>
    toStrings(rule.userAgent).includes("Googlebot"));
  assert.ok(googleRule, "Google crawler rule remains present");
  assert.ok(toStrings(googleRule.allow).includes("/"));
  assert.ok(toStrings(googleRule.disallow).includes("/api/"));
  assert.ok(toStrings(googleRule.disallow).includes("/studio/"));
  assert.equal(
    output.sitemap,
    "https://chronoversecapital.com/sitemap.xml",
    "production sitemap reference remains intact",
  );
}

function verifySitemapAndPricing(): void {
  const sitemapSource = readSource("src/app/sitemap.ts");
  for (const pathname of [
    "vip",
    "vip/markets",
    "vip/markets/eurusd",
    "vip/markets/eurjpy",
    "vip/markets/eurgbp",
    "vip/markets/eurchf",
    "vip/markets/estr",
  ]) {
    assert.doesNotMatch(
      sitemapSource,
      new RegExp(`["']${pathname.replaceAll("/", "\\/")}["']`),
      `${pathname} remains absent from sitemap source`,
    );
  }

  assert.equal(pricingMetadata.robots, undefined, "Pricing remains indexable");
  assert.equal(
    pricingMetadata.alternates?.canonical,
    "https://chronoversecapital.com/pricing",
  );
  assert.equal(
    (pricingMetadata.openGraph as { readonly url?: unknown }).url,
    pricingMetadata.alternates?.canonical,
  );

  const pricingSource = readSource("src/app/(site)/pricing/page.tsx");
  assert.match(pricingSource, /\$15\.99 monthly/);
  assert.match(pricingSource, /\$150\.99 annually/);
  assert.match(
    pricingSource,
    /self-service checkout[^.]*not currently[\s\S]{0,40}available/i,
  );
}

function verifyPublicVipLinks(): void {
  const homepageSource = readSource("src/app/(site)/page.tsx");
  assert.match(
    homepageSource,
    /<Link href="\/pricing" className=\{PRIMARY_CTA_CLASS\}>[\s\S]{0,120}Explore VIP/,
    "homepage VIP exploration CTA uses Pricing",
  );
  assert.match(
    homepageSource,
    /title="Chronoverse VIP"[\s\S]{0,320}href="\/pricing"[\s\S]{0,120}cta="Explore VIP"/,
    "homepage VIP membership card uses Pricing",
  );

  const marketsSource = readSource("src/app/(site)/markets/page.tsx");
  assert.match(
    marketsSource,
    /href="\/vip"[\s\S]{0,400}Enter VIP/,
    "explicit application entry remains pointed at protected VIP",
  );

  const navigationSource = readSource("src/config/institutionalNavigation.ts");
  assert.match(navigationSource, /label: "VIP", href: "\/vip"/);
  assert.match(navigationSource, /label: "Pricing", href: "\/pricing"/);

  const aboutSource = readSource("src/app/(site)/about/page.tsx");
  assert.match(aboutSource, /<Link href="\/vip">VIP<\/Link>/);
  assert.match(aboutSource, /protected VIP Market[\s\S]{0,40}Rooms/);

  const vipOverviewSource = readSource(
    "src/components/vip/VipOverviewSurface.tsx",
  );
  assert.ok(
    vipOverviewSource.includes("`/vip?market=${market.productId}`"),
    "protected VIP selector query behavior remains supported",
  );

  assert.deepEqual(
    LAUNCH_MARKETS_V1.map((market) => market.productId),
    ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"],
    "exact five-product scope remains unchanged",
  );
}

async function main(): Promise<void> {
  verifyProtectedMetadata();
  await verifyVipResponseHeaders();
  verifyRobotsPolicy();
  verifySitemapAndPricing();
  verifyPublicVipLinks();

  console.log("PASS: SEO-B5 protected VIP search policy");
}

void main();
