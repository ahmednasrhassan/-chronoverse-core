import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildPublicPageMetadata, siteLocale } from "../metadata";
import { buildCanonicalUrl, canonicalSiteOrigin } from "../site-url";

const PERSONAL_PORTRAIT_ID = "a03a88e45b450a8f347633edf76d251bd9881fea";

function verifyCanonicalUrls(): void {
  assert.equal(canonicalSiteOrigin, "https://chronoversecapital.com");
  assert.equal(buildCanonicalUrl("/"), "https://chronoversecapital.com/");
  assert.equal(
    buildCanonicalUrl("/about"),
    "https://chronoversecapital.com/about",
  );
  assert.equal(
    buildCanonicalUrl("about"),
    "https://chronoversecapital.com/about",
  );
  assert.equal(
    buildCanonicalUrl("/research/euro-outlook"),
    "https://chronoversecapital.com/research/euro-outlook",
  );
  assert.equal(
    buildCanonicalUrl("/research//euro-outlook/"),
    "https://chronoversecapital.com/research/euro-outlook",
  );

  for (const unsafeInput of [
    "https://attacker.example/about",
    "http://localhost:3000/about",
    "https://branch.vercel.app/about",
    "//attacker.example/about",
    "\\\\attacker.example\\about",
    "/about?campaign=preview",
    "/about#section",
    "/about\nredirect",
  ]) {
    assert.throws(
      () => buildCanonicalUrl(unsafeInput),
      TypeError,
      `rejects unsafe canonical input: ${JSON.stringify(unsafeInput)}`,
    );
  }

  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://branch.vercel.app";

  try {
    assert.equal(
      buildCanonicalUrl("/about"),
      "https://chronoversecapital.com/about",
      "canonical identity ignores NEXT_PUBLIC_SITE_URL",
    );
  } finally {
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  }
}

function verifyMetadataFoundation(): void {
  const metadata = buildPublicPageMetadata({
    title: "About",
    description: "Truthful route description.",
    pathname: "/about/",
    openGraphTitle: "About Chronoverse",
    openGraphDescription: "Truthful Open Graph description.",
    twitterTitle: "About on X",
    twitterDescription: "Truthful Twitter description.",
  });

  assert.equal(metadata.title, "About", "helper leaves title branding to root");
  assert.equal(metadata.description, "Truthful route description.");
  assert.equal(
    metadata.alternates?.canonical,
    "https://chronoversecapital.com/about",
  );
  assert.deepEqual(metadata.alternates?.types?.["application/rss+xml"], [
    {
      url: "https://chronoversecapital.com/rss.xml",
      title: "Chronoverse Capital - RSS Feed",
    },
  ]);
  assert.equal(metadata.openGraph?.url, "https://chronoversecapital.com/about");
  assert.equal(metadata.openGraph?.title, "About Chronoverse");
  assert.equal(
    metadata.openGraph?.description,
    "Truthful Open Graph description.",
  );
  assert.equal(metadata.openGraph?.siteName, "Chronoverse Capital");
  assert.equal(metadata.openGraph?.locale, siteLocale);
  assert.equal(metadata.twitter?.images, undefined);
  assert.deepEqual(metadata.twitter, {
    card: "summary_large_image",
    title: "About on X",
    description: "Truthful Twitter description.",
  });
  assert.equal(metadata.authors, undefined);
  assert.equal(metadata.icons, undefined);
  assert.equal(metadata.openGraph?.images, undefined);
  assert.equal(JSON.stringify(metadata).includes(PERSONAL_PORTRAIT_ID), false);
}

function verifyRootMetadataCleanup(): void {
  const layoutPath = fileURLToPath(
    new URL("../../../app/layout.tsx", import.meta.url),
  );
  const layoutSource = readFileSync(layoutPath, "utf8");

  assert.equal(layoutSource.includes("Chronoverse Capital Team"), false);
  assert.equal(layoutSource.includes(PERSONAL_PORTRAIT_ID), false);
  assert.equal(layoutSource.includes("NEXT_PUBLIC_SITE_URL"), false);
}

verifyCanonicalUrls();
verifyMetadataFoundation();
verifyRootMetadataCleanup();

console.log("PASS: SEO canonical URL and metadata foundation");
