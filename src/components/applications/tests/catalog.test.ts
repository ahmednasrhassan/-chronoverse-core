import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest, NextResponse } from "next/server";
import {
  applications,
  applicationUrl,
  availableDownload,
  filterApplications,
  findApplication,
  type SoftwareApplication,
} from "../../../config/applications";
import {
  createChronoverseProxyV1,
  getApplicationsRewriteUrlV1,
  getPreviewRobotsHeaderValueV1,
} from "../../../proxy";
import { AppDiscovery } from "../AppDiscovery";
import { ApplicationDetails } from "../ApplicationPresentation";
import catalogSitemap from "../../../app/(site)/apps/sitemap";
import { metadata as catalogMetadata } from "../../../app/(site)/apps/page";
import { GET as catalogRobots } from "../../../app/(site)/apps/robots.txt/route";
import { isReservedRootSlug } from "../../../lib/content/reservedSlugs";

// Fixtures never enter the production applications registry or generated routes.
const fixture: SoftwareApplication = {
  slug: "fixture-tool",
  name: "Fixture tool",
  summary: "A test-only analysis tool.",
  description: "An unpublished fixture for product presentation contracts.",
  category: "Analysis",
  platforms: ["Windows"],
  availability: "coming-soon",
  features: [
    { title: "Fixture feature", description: "Test-only description" },
  ],
  requirements: ["Fixture system requirement"],
  version: "0.0.0-test",
  download: {
    url: "https://example.invalid/fixture.zip",
    format: "ZIP",
    size: "1 MB",
  },
};

test("public catalog has an honest empty state and publishes no fixture products", async () => {
  assert.equal(applications.length, 0);
  assert.equal(findApplication(fixture.slug), undefined);
  const html = renderToStaticMarkup(
    createElement(AppDiscovery, { applications }),
  );
  assert.match(html, /No applications have been released yet/);
  assert.match(html, /Search the catalog/);
  assert.doesNotMatch(html, /fixture|checkout|Buy now|<article/i);
  assert.deepEqual(
    catalogSitemap().map((entry) => entry.url),
    [applicationUrl()],
  );
  assert.equal(isReservedRootSlug("apps"), true);
  assert.equal(catalogMetadata.title, "Software Applications");
  assert.equal(catalogMetadata.alternates?.canonical, applicationUrl());
  const robots = catalogRobots();
  assert.equal(robots.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.match(
    await robots.text(),
    /Sitemap: https:\/\/apps.chronoversecapital.com\/sitemap.xml/,
  );
});

test("discovery filters real supplied data by name, keyword and platform", () => {
  assert.deepEqual(filterApplications([fixture], "  WINDOWS  "), [fixture]);
  assert.deepEqual(filterApplications([fixture], "analysis"), [fixture]);
  assert.deepEqual(filterApplications([fixture], "fixture tool"), [fixture]);
  assert.deepEqual(filterApplications([fixture], "macOS"), []);
  assert.deepEqual(filterApplications([fixture], " "), [fixture]);
});

test("product presentation preserves feature/requirement data without activating unavailable downloads", () => {
  const html = renderToStaticMarkup(
    createElement(ApplicationDetails, { application: fixture }),
  );
  assert.match(html, /Fixture feature/);
  assert.match(html, /Fixture system requirement/);
  assert.match(html, /Coming soon/);
  assert.doesNotMatch(html, /href="https:\/\/example.invalid\/fixture.zip"/);
  assert.equal(availableDownload(fixture), undefined);
  const released = { ...fixture, availability: "available" as const };
  assert.equal(availableDownload(released)?.url, fixture.download!.url);
  for (const url of [
    "javascript:alert(1)",
    "http://example.invalid/file",
    "https://user:pass@example.invalid/file",
    "not a URL",
  ]) {
    assert.equal(
      availableDownload({
        ...released,
        download: { ...fixture.download!, url },
      }),
      undefined,
    );
  }
});

test("product canonicals cannot escape the apps host or inject extra path segments", () => {
  assert.equal(
    applicationUrl(fixture.slug),
    "https://apps.chronoversecapital.com/fixture-tool",
  );
  for (const slug of [
    "../account",
    "//evil.invalid",
    "https://evil.invalid",
    "a/b",
    "%2Fadmin",
    "a?x=y",
  ]) {
    assert.throws(() => applicationUrl(slug), TypeError);
  }
});

test("apps host gets isolated catalog routing and leaves assets and APIs untouched", async () => {
  const handler = createChronoverseProxyV1(async () => {
    throw Error("catalog must not load auth");
  });
  const response = await handler(
    new NextRequest("https://apps.chronoversecapital.com/"),
  );
  assert.equal(
    response.headers.get("x-middleware-rewrite"),
    "https://apps.chronoversecapital.com/apps",
  );
  assert.equal(response.headers.get("x-robots-tag"), null);
  for (const path of ["/fixture-tool", "/sitemap.xml", "/robots.txt"]) {
    assert.equal(
      getApplicationsRewriteUrlV1(
        new NextRequest(`https://apps.chronoversecapital.com${path}`),
      )?.pathname,
      `/apps${path}`,
    );
  }
  for (const path of [
    "/_next/static/app.js",
    "/api/newsletter",
    "/chronoverse-capital-official-logo.png",
  ]) {
    assert.equal(
      getApplicationsRewriteUrlV1(
        new NextRequest(`https://apps.chronoversecapital.com${path}`),
      ),
      null,
    );
  }
  for (const host of [
    "chronoversecapital.com",
    "preview.vercel.app",
    "apps.chronoversecapital.com.evil.invalid",
  ]) {
    assert.equal(
      getApplicationsRewriteUrlV1(new NextRequest(`https://${host}/`)),
      null,
    );
  }
  assert.equal(
    getPreviewRobotsHeaderValueV1("preview.vercel.app"),
    "noindex, nofollow",
  );
});

test("catalog aliases and identity stay on their designated hosts", async () => {
  const handler = createChronoverseProxyV1(async () => NextResponse.next());
  for (const [url, destination] of [
    [
      "https://chronoversecapital.com/apps",
      "https://apps.chronoversecapital.com/",
    ],
    [
      "https://chronoversecapital.com/apps/fixture-tool?from=test",
      "https://apps.chronoversecapital.com/fixture-tool?from=test",
    ],
    [
      "https://apps.chronoversecapital.com/account",
      "https://chronoversecapital.com/account",
    ],
    [
      "https://apps.chronoversecapital.com/auth/confirm?code=fixture",
      "https://chronoversecapital.com/auth/confirm?code=fixture",
    ],
  ]) {
    const response = await handler(new NextRequest(url));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), destination);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("retired Lemon webhook is a provider-free tombstone before body parsing on every host", async () => {
  const handler = createChronoverseProxyV1(async () => {
    throw Error("retired webhook must not load auth");
  });
  for (const host of [
    "chronoversecapital.com",
    "apps.chronoversecapital.com",
    "preview.vercel.app",
  ]) {
    for (const method of ["GET", "POST", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
      const request = new NextRequest(
        `https://${host}/api/webhooks/lemon-squeezy`,
        { method },
      );
      Object.defineProperty(request, "body", {
        get() {
          throw Error("body read");
        },
      });
      const response = await handler(request);
      assert.equal(response.status, 410);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal(response.headers.get("x-middleware-rewrite"), null);
    }
  }
});
