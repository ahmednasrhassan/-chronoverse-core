import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextRequest, NextResponse } from "next/server";

import {
  createChronoverseProxyV1,
  getPreviewRobotsHeaderValueV1,
  PREVIEW_ROBOTS_HEADER_VALUE_V1,
  PRODUCTION_SEARCH_HOSTNAME_V1,
} from "../../../proxy";

const ROUTE_POLICIES = [
  {
    pathname: "/account",
    sourcePath: "../../../app/(site)/account/page.tsx",
    follow: false,
  },
  {
    pathname: "/billing",
    sourcePath: "../../../app/(site)/billing/page.tsx",
    follow: false,
  },
  {
    pathname: "/manifesto",
    sourcePath: "../../../app/(site)/manifesto/page.tsx",
    follow: true,
  },
  {
    pathname: "/sponsors",
    sourcePath: "../../../app/(site)/sponsors/page.tsx",
    follow: true,
  },
  {
    pathname: "/studio",
    sourcePath: "../../../app/studio/layout.tsx",
    follow: false,
  },
] as const;

function verifyRoutePolicies(): void {
  for (const route of ROUTE_POLICIES) {
    const source = readFileSync(
      fileURLToPath(new URL(route.sourcePath, import.meta.url)),
      "utf8",
    );
    const metadataStart = source.indexOf("export const metadata");
    const componentStart = source.search(/export default (?:async )?function/);

    assert.notEqual(metadataStart, -1, `${route.pathname} exports metadata`);
    assert.notEqual(componentStart, -1, `${route.pathname} exports a component`);
    assert.ok(
      componentStart > metadataStart,
      `${route.pathname} metadata precedes its component`,
    );

    const metadataSource = source.slice(metadataStart, componentStart);
    const followValue = String(route.follow);
    const robotsPattern = new RegExp(
      `robots:\\s*\\{\\s*index:\\s*false,\\s*follow:\\s*${followValue},` +
        `\\s*googleBot:\\s*\\{\\s*index:\\s*false,\\s*follow:\\s*${followValue},`,
    );

    assert.match(
      metadataSource,
      robotsPattern,
      `${route.pathname} has the expected noindex policy`,
    );
    assert.equal(
      metadataSource.includes("canonical"),
      false,
      `${route.pathname} does not use a canonical instead of noindex`,
    );
  }

  const accountSource = readFileSync(
    fileURLToPath(
      new URL("../../../app/(site)/account/page.tsx", import.meta.url),
    ),
    "utf8",
  );
  for (const preservedAccountBehavior of [
    "authError",
    "loadAccountShellStateV1",
    "resolveAccessV1",
    "EmailOtpForm",
    "signOutActionV1",
  ]) {
    assert.ok(
      accountSource.includes(preservedAccountBehavior),
      `/account preserves ${preservedAccountBehavior}`,
    );
  }

  const billingSource = readFileSync(
    fileURLToPath(
      new URL("../../../app/(site)/billing/page.tsx", import.meta.url),
    ),
    "utf8",
  );
  for (const preservedBillingTruth of [
    "$15.99 monthly",
    "$150.99 annually",
    "Public self-service VIP checkout",
    "billing-portal controls are not currently available",
  ]) {
    assert.ok(
      billingSource.includes(preservedBillingTruth),
      `/billing preserves ${preservedBillingTruth}`,
    );
  }
}

function request(hostname: string, pathname: string): NextRequest {
  return new NextRequest(`https://${hostname}${pathname}`, {
    headers: { host: hostname },
  });
}

async function verifyPreviewProtection(): Promise<void> {
  assert.equal(PRODUCTION_SEARCH_HOSTNAME_V1, "chronoversecapital.com");
  assert.equal(PREVIEW_ROBOTS_HEADER_VALUE_V1, "noindex, nofollow");
  assert.equal(
    getPreviewRobotsHeaderValueV1(PRODUCTION_SEARCH_HOSTNAME_V1),
    null,
  );

  const nonProductionHosts = [
    "localhost",
    "127.0.0.1",
    "chronoverse-git-seo-b3-preview.vercel.app",
    "preview.example",
    "www.chronoversecapital.com",
  ] as const;

  for (const hostname of nonProductionHosts) {
    assert.equal(
      getPreviewRobotsHeaderValueV1(hostname),
      PREVIEW_ROBOTS_HEADER_VALUE_V1,
      `${hostname} is not the production search host`,
    );
  }

  let refreshCalls = 0;
  const handler = createChronoverseProxyV1(async (incomingRequest) => {
    refreshCalls += 1;
    return NextResponse.next({ request: incomingRequest });
  });

  const productionResponse = await handler(
    request(PRODUCTION_SEARCH_HOSTNAME_V1, "/markets"),
  );
  assert.equal(
    productionResponse.headers.get("x-robots-tag"),
    null,
    "production response omits the global preview noindex header",
  );
  assert.equal(
    productionResponse.headers.get("x-middleware-rewrite"),
    null,
    "production public routing remains direct",
  );

  for (const hostname of nonProductionHosts.slice(0, 4)) {
    const response = await handler(request(hostname, "/markets"));

    assert.equal(
      response.headers.get("x-robots-tag"),
      PREVIEW_ROBOTS_HEADER_VALUE_V1,
      `${hostname} response receives preview protection`,
    );
    assert.equal(
      response.headers.get("x-middleware-rewrite"),
      null,
      `${hostname} public routing remains direct`,
    );
  }

  const newsletterPreviewResponse = await handler(
    request("newsletter.preview.example", "/archive"),
  );
  assert.equal(
    newsletterPreviewResponse.headers.get("x-robots-tag"),
    PREVIEW_ROBOTS_HEADER_VALUE_V1,
    "a rewritten preview response receives preview protection",
  );
  assert.equal(
    new URL(
      newsletterPreviewResponse.headers.get("x-middleware-rewrite")!,
    ).pathname,
    "/newsletter/archive",
    "preview protection preserves the newsletter rewrite",
  );

  assert.equal(
    refreshCalls,
    0,
    "public production and preview requests skip session refresh",
  );
}

async function main(): Promise<void> {
  verifyRoutePolicies();
  await verifyPreviewProtection();

  console.log("PASS: SEO-B3 indexing safeguards");
}

void main();
