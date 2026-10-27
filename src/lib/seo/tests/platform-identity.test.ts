import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSiteJsonLd, buildBreadcrumbJsonLd } from "../structured-data";
import { buildPublicPageMetadata } from "../metadata";
import { StructuredData } from "../../../components/content/StructuredData";
import { Breadcrumbs } from "../../../components/content/Breadcrumbs";
import { generateMetadata as archiveMetadata } from "../../../app/(site)/archive/page";
import CookiePolicy from "../../../app/(site)/cookie-policy/page";
import RefundInformation from "../../../app/(site)/refund-policy/page";
import PrivacyPolicy from "../../../app/(site)/privacy-policy/page";
import { applications } from "../../../config/applications";

test("each site has its own English website identity and the same factual organization", () => {
  for (const site of ["main", "apps"] as const) {
    const graph = buildSiteJsonLd(site);
    const [organization, website] = graph["@graph"];
    assert.equal(organization["@type"], "Organization");
    assert.equal(
      organization["@id"],
      "https://chronoversecapital.com/#organization",
    );
    assert.equal(website["@type"], "WebSite");
    assert.equal("inLanguage" in website && website.inLanguage, "en");
    assert.equal(
      "url" in website && website.url,
      site === "apps"
        ? "https://apps.chronoversecapital.com/"
        : "https://chronoversecapital.com/",
    );
    assert.doesNotMatch(
      JSON.stringify(graph),
      /SoftwareApplication|FinancialService|aggregateRating|SearchAction|foundingDate|PostalAddress/,
    );
  }
  assert.equal(applications.length, 0);
});

test("catalog social metadata and canonicals stay on their designated hosts", () => {
  const metadata = buildPublicPageMetadata({
    title: "Software Applications",
    description: "Pre-launch catalog.",
    pathname: "/",
    site: "apps",
  });
  assert.equal(metadata.title, "Software Applications");
  assert.equal(
    metadata.alternates?.canonical,
    "https://apps.chronoversecapital.com/",
  );
  assert.equal(metadata.openGraph?.url, metadata.alternates?.canonical);
  assert.equal(metadata.twitter?.title, "Software Applications");
  assert.match(
    JSON.stringify(metadata.openGraph),
    /https:\/\/chronoversecapital.com\/social-image/,
  );
  assert.equal(metadata.alternates?.types, undefined);
  assert.throws(() =>
    buildPublicPageMetadata({
      title: "Unsafe",
      description: "Test",
      pathname: "//evil.invalid",
      site: "apps",
    }),
  );
});

test("breadcrumbs match visible links and JSON-LD cannot escape its script element", () => {
  const title = '</script><script>alert("unsafe")</script>';
  const items = [
    { label: "Home", href: "https://chronoversecapital.com/" },
    { label: title, href: "https://chronoversecapital.com/test-article" },
  ];
  const graph = buildBreadcrumbJsonLd(items);
  assert.deepEqual(
    graph.itemListElement.map((item) => item.position),
    [1, 2],
  );
  const html = renderToStaticMarkup(
    createElement(StructuredData, { data: graph }),
  );
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.doesNotMatch(html, /<script>alert/);
  assert.equal(
    JSON.parse(html.match(/>([\s\S]*)<\/script>/)![1]).itemListElement[1].name,
    title,
  );
  const rendered = renderToStaticMarkup(createElement(Breadcrumbs, { items }));
  assert.match(rendered, /aria-label="Breadcrumb"/);
  assert.match(rendered, /aria-current="page"/);
  assert.match(rendered, /href="https:\/\/chronoversecapital.com\/"/);
});

test("archive pagination has distinct canonical identities and remains noindex", async () => {
  for (const [input, expected] of [
    ["2", "?page=2"],
    ["0", ""],
    ["bad", ""],
  ]) {
    const metadata = await archiveMetadata({
      searchParams: Promise.resolve({ page: input }),
    });
    assert.equal(
      metadata.alternates?.canonical,
      `https://chronoversecapital.com/archive${expected}`,
    );
    assert.equal(
      typeof metadata.robots === "object" && metadata.robots?.index,
      false,
    );
    assert.equal(
      typeof metadata.robots === "object" && metadata.robots?.follow,
      true,
    );
  }
});

test("policies describe actual storage and preserve purchase boundaries without new promises", () => {
  const cookies = renderToStaticMarkup(createElement(CookiePolicy));
  for (const marker of [
    "chrono_cookie_consent",
    "cookie_consent",
    "local storage",
    "Supabase",
    "Google",
    "main chronoversecapital.com",
    "separately",
  ])
    assert.ok(cookies.includes(marker), marker);
  const refund = renderToStaticMarkup(createElement(RefundInformation));
  assert.match(refund, /pre-launch/);
  assert.match(refund, /separate website/);
  assert.match(refund, /does not replace the terms/);
  assert.doesNotMatch(
    refund,
    /href="https:\/\/[^" ]+\/l\/|money.back|guaranteed refund|30.day refund/i,
  );
  const privacy = renderToStaticMarkup(createElement(PrivacyPolicy));
  for (const provider of [
    "Supabase",
    "Sanity",
    "Amazon SES",
    "Vercel",
    "Google Analytics",
  ])
    assert.ok(privacy.includes(provider));
  assert.match(privacy, /Sanity supplies published research content/);
  assert.match(privacy, /does not store newsletter addresses or use AWS subscriber credentials/);
  assert.match(privacy, /confirmation through the submitted mailbox/);
  assert.doesNotMatch(
    privacy,
    /Lemon Squeezy|GDPR compliant|never sell|EU.only/i,
  );
});
