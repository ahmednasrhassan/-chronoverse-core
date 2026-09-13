import assert from "node:assert/strict";

import type { Metadata } from "next";

import { metadata as aboutMetadata } from "@/app/(site)/about/page";
import { metadata as contactMetadata } from "@/app/(site)/contact/page";
import { metadata as dataSourcesMetadata } from "@/app/(site)/data-sources/page";
import { metadata as disclaimerMetadata } from "@/app/(site)/disclaimer/page";
import { metadata as dmcaMetadata } from "@/app/(site)/dmca/page";
import { metadata as editorialPolicyMetadata } from "@/app/(site)/editorial-policy/page";
import { metadata as faqMetadata } from "@/app/(site)/faq/page";
import { metadata as freshnessMetadata } from "@/app/(site)/freshness/page";
import { metadata as marketsMetadata } from "@/app/(site)/markets/page";
import { metadata as methodologyMetadata } from "@/app/(site)/methodology/page";
import { metadata as pricingMetadata } from "@/app/(site)/pricing/page";
import { metadata as privacyPolicyMetadata } from "@/app/(site)/privacy-policy/page";
import { metadata as reportsMetadata } from "@/app/(site)/reports/page";
import { metadata as termsMetadata } from "@/app/(site)/terms-of-service/page";
import { canonicalSiteOrigin } from "../site-url";

const HOMEPAGE_TITLE = "Chronoverse Capital | Five-Market Intelligence";
const PERSONAL_PORTRAIT_ID = "a03a88e45b450a8f347633edf76d251bd9881fea";
const EXPECTED_LAUNCH_MARKETS = [
  "EUR/USD",
  "EUR/JPY",
  "EUR/GBP",
  "EUR/CHF",
  "€STR",
] as const;

type StaticRouteExpectation = {
  pathname: string;
  title: string;
  metadata: Metadata;
};

const STATIC_ROUTES = [
  { pathname: "/markets", title: "Markets", metadata: marketsMetadata },
  { pathname: "/pricing", title: "Pricing", metadata: pricingMetadata },
  {
    pathname: "/reports",
    title: "Research Reports",
    metadata: reportsMetadata,
  },
  { pathname: "/about", title: "About", metadata: aboutMetadata },
  { pathname: "/contact", title: "Contact", metadata: contactMetadata },
  {
    pathname: "/faq",
    title: "Frequently Asked Questions",
    metadata: faqMetadata,
  },
  {
    pathname: "/methodology",
    title: "Methodology",
    metadata: methodologyMetadata,
  },
  {
    pathname: "/data-sources",
    title: "Data Sources",
    metadata: dataSourcesMetadata,
  },
  {
    pathname: "/freshness",
    title: "Freshness & Availability",
    metadata: freshnessMetadata,
  },
  {
    pathname: "/disclaimer",
    title: "Financial Information Disclaimer",
    metadata: disclaimerMetadata,
  },
  {
    pathname: "/terms-of-service",
    title: "Terms of Service",
    metadata: termsMetadata,
  },
  {
    pathname: "/privacy-policy",
    title: "Privacy Policy",
    metadata: privacyPolicyMetadata,
  },
  {
    pathname: "/editorial-policy",
    title: "Editorial Policy",
    metadata: editorialPolicyMetadata,
  },
  {
    pathname: "/dmca",
    title: "Copyright and DMCA Notices",
    metadata: dmcaMetadata,
  },
] as const satisfies readonly StaticRouteExpectation[];

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    assert.fail(`${label} must be a string`);
  }

  assert.notEqual(value.trim(), "", `${label} must not be empty`);
  return value;
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  assert.ok(value && typeof value === "object", `${label} must be present`);
  return value as Record<string, unknown>;
}

const resolvedTitles: string[] = [];
const resolvedDescriptions: string[] = [];

for (const route of STATIC_ROUTES) {
  const label = route.pathname;
  const title = requireString(route.metadata.title, `${label} title`);
  const description = requireString(
    route.metadata.description,
    `${label} description`,
  );
  const canonical = requireString(
    route.metadata.alternates?.canonical,
    `${label} canonical`,
  );
  const canonicalUrl = new URL(canonical);
  const openGraph = requireRecord(route.metadata.openGraph, `${label} Open Graph`);
  const twitter = requireRecord(route.metadata.twitter, `${label} Twitter`);

  assert.equal(title, route.title);
  assert.notEqual(title, HOMEPAGE_TITLE, `${label} must not reuse homepage title`);
  assert.equal(canonicalUrl.origin, canonicalSiteOrigin);
  assert.equal(canonicalUrl.pathname, route.pathname);
  assert.equal(canonicalUrl.search, "", `${label} canonical must omit query`);
  assert.equal(canonicalUrl.hash, "", `${label} canonical must omit hash`);

  assert.equal(openGraph.url, canonical);
  assert.equal(openGraph.title, title);
  assert.equal(openGraph.description, description);
  assert.equal(openGraph.siteName, "Chronoverse Capital");
  assert.equal(openGraph.locale, "en_US");
  assert.equal(openGraph.images, undefined);

  assert.equal(twitter.card, "summary_large_image");
  assert.equal(twitter.title, title);
  assert.equal(twitter.description, description);
  assert.equal(twitter.images, undefined);

  assert.deepEqual(route.metadata.alternates?.types?.["application/rss+xml"], [
    {
      url: `${canonicalSiteOrigin}/rss.xml`,
      title: "Chronoverse Capital - RSS Feed",
    },
  ]);
  assert.equal(route.metadata.authors, undefined);
  assert.equal(route.metadata.icons, undefined);
  assert.equal(route.metadata.robots, undefined);
  assert.equal(
    JSON.stringify(route.metadata).includes(PERSONAL_PORTRAIT_ID),
    false,
  );

  const routeIdentity = `${title} ${description}`;
  assert.doesNotMatch(
    routeIdentity,
    /\breal[- ]?time\b|\bstreaming\b|\bticks?\b|\blive\b/i,
  );
  assert.doesNotMatch(routeIdentity, /\bAfrico\b|strategic partner/i);

  resolvedTitles.push(title);
  resolvedDescriptions.push(description);
}

assert.equal(new Set(resolvedTitles).size, STATIC_ROUTES.length);
assert.equal(new Set(resolvedDescriptions).size, STATIC_ROUTES.length);

const marketsDescription = requireString(
  marketsMetadata.description,
  "/markets description",
);
for (const market of EXPECTED_LAUNCH_MARKETS) {
  assert.ok(marketsDescription.includes(market), `/markets must include ${market}`);
}
assert.doesNotMatch(marketsDescription, /Gold|Bitcoin|Oil|Nasdaq|S&P|DXY/i);
assert.match(marketsDescription, /Free Lite/);

const pricingDescription = requireString(
  pricingMetadata.description,
  "/pricing description",
);
assert.match(pricingDescription, /\$15\.99 monthly/);
assert.match(pricingDescription, /\$150\.99 annually/);
assert.match(pricingDescription, /not currently available/i);
assert.doesNotMatch(
  pricingDescription,
  /buy now|subscribe now|instant access after payment/i,
);

console.log("PASS: SEO-B2 static route metadata");
