import assert from "node:assert/strict";

import { NextRequest, NextResponse } from "next/server";

import { metadata } from "@/app/newsletter/layout";
import {
  CANONICAL_NEWSLETTER_URL_V1,
  createChronoverseProxyV1,
  getNewsletterCanonicalRedirectUrlV1,
  PREVIEW_ROBOTS_HEADER_VALUE_V1,
  PRODUCTION_SEARCH_HOSTNAME_V1,
} from "../../../proxy";

const PERSONAL_PORTRAIT_ID = "a03a88e45b450a8f347633edf76d251bd9881fea";

function request(hostname: string, pathname: string): NextRequest {
  return new NextRequest(`https://${hostname}${pathname}`, {
    headers: { host: hostname },
  });
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  assert.ok(value && typeof value === "object", `${label} must be present`);
  return value as Record<string, unknown>;
}

function verifyNewsletterMetadata(): void {
  assert.equal(metadata.title, "Newsletter");
  assert.equal(
    metadata.description,
    "Subscribe to receive published market research and analytical updates, separate from Free Lite and VIP Deep access.",
  );
  assert.equal(
    metadata.alternates?.canonical,
    CANONICAL_NEWSLETTER_URL_V1,
  );

  const openGraph = requireRecord(metadata.openGraph, "Newsletter Open Graph");
  assert.equal(openGraph.url, CANONICAL_NEWSLETTER_URL_V1);
  assert.equal(openGraph.title, metadata.title);
  assert.equal(openGraph.description, metadata.description);
  assert.equal(openGraph.siteName, "Chronoverse Capital");
  assert.equal(openGraph.locale, "en_US");
  assert.equal(openGraph.images, undefined);

  const twitter = requireRecord(metadata.twitter, "Newsletter Twitter");
  assert.equal(twitter.card, "summary_large_image");
  assert.equal(twitter.title, metadata.title);
  assert.equal(twitter.description, metadata.description);
  assert.equal(twitter.images, undefined);

  assert.deepEqual(metadata.alternates?.types?.["application/rss+xml"], [
    {
      url: "https://chronoversecapital.com/rss.xml",
      title: "Chronoverse Capital - RSS Feed",
    },
  ]);
  assert.equal(metadata.authors, undefined);
  assert.equal(metadata.icons, undefined);
  assert.equal(JSON.stringify(metadata).includes(PERSONAL_PORTRAIT_ID), false);
}

async function verifyNewsletterHostPolicy(): Promise<void> {
  assert.equal(
    CANONICAL_NEWSLETTER_URL_V1,
    "https://chronoversecapital.com/newsletter",
  );
  assert.equal(PRODUCTION_SEARCH_HOSTNAME_V1, "chronoversecapital.com");

  let refreshCalls = 0;
  const handler = createChronoverseProxyV1(async (incomingRequest) => {
    refreshCalls += 1;
    const response = NextResponse.next({ request: incomingRequest });
    response.cookies.set("newsletter-search-test", "preserved");
    return response;
  });

  const productionRequest = request(
    PRODUCTION_SEARCH_HOSTNAME_V1,
    "/newsletter",
  );
  assert.equal(getNewsletterCanonicalRedirectUrlV1(productionRequest), null);

  const productionResponse = await handler(productionRequest);
  assert.equal(productionResponse.status, 200);
  assert.equal(productionResponse.headers.get("location"), null);
  assert.equal(productionResponse.headers.get("x-middleware-rewrite"), null);
  assert.equal(productionResponse.headers.get("x-robots-tag"), null);

  const subdomainRequest = request(
    "newsletter.chronoversecapital.com",
    "/",
  );
  assert.equal(
    getNewsletterCanonicalRedirectUrlV1(subdomainRequest)?.toString(),
    CANONICAL_NEWSLETTER_URL_V1,
  );

  const subdomainResponse = await handler(subdomainRequest);
  assert.equal(subdomainResponse.status, 308);
  assert.equal(
    subdomainResponse.headers.get("location"),
    CANONICAL_NEWSLETTER_URL_V1,
  );
  assert.equal(
    subdomainResponse.headers.get("x-robots-tag"),
    PREVIEW_ROBOTS_HEADER_VALUE_V1,
  );
  assert.equal(
    subdomainResponse.cookies.get("newsletter-search-test"),
    undefined,
    "Newsletter host redirect avoids unnecessary auth refresh",
  );

  const redirectDestinationRequest = request(
    PRODUCTION_SEARCH_HOSTNAME_V1,
    "/newsletter",
  );
  assert.equal(
    getNewsletterCanonicalRedirectUrlV1(redirectDestinationRequest),
    null,
    "canonical destination does not redirect again",
  );

  for (const hostname of [
    "localhost",
    "chronoverse-git-newsletter-preview.vercel.app",
    "preview.example",
  ]) {
    const previewResponse = await handler(request(hostname, "/newsletter"));
    assert.equal(
      previewResponse.headers.get("x-robots-tag"),
      PREVIEW_ROBOTS_HEADER_VALUE_V1,
      `${hostname} retains preview protection`,
    );
    assert.equal(previewResponse.headers.get("location"), null);
  }

  const preservedPathResponse = await handler(
    request("newsletter.chronoversecapital.com", "/about"),
  );
  assert.equal(preservedPathResponse.status, 200);
  assert.equal(preservedPathResponse.headers.get("location"), null);
  assert.equal(
    new URL(preservedPathResponse.headers.get("x-middleware-rewrite")!).pathname,
    "/newsletter/about",
    "non-root Newsletter host behavior remains a rewrite",
  );
  assert.equal(
    preservedPathResponse.headers.get("x-robots-tag"),
    PREVIEW_ROBOTS_HEADER_VALUE_V1,
  );

  assert.equal(refreshCalls, 0, "public Newsletter requests skip session refresh");
}

async function main(): Promise<void> {
  verifyNewsletterMetadata();
  await verifyNewsletterHostPolicy();

  console.log("PASS: SEO-B4 Newsletter search identity");
}

void main();
