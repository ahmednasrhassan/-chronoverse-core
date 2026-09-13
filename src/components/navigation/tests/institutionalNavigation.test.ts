import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FOOTER_NAV_GROUPS_V1,
  LAUNCH_MARKETS_V1,
  PUBLIC_ACCOUNT_NAV_V1,
  PUBLIC_PRIMARY_NAV_V1,
} from "../../../config/institutionalNavigation";
import { siteConfig } from "../../../config/siteConfig";

const repositoryRoot = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");
const headerSource = readSource("src/components/navigation/Header.tsx");
const footerSource = readSource("src/components/navigation/Footer.tsx");
const socialIconSource = readSource("src/components/socialicons.tsx");
const aboutSource = readSource("src/app/(site)/about/page.tsx");

assert.deepEqual(
  LAUNCH_MARKETS_V1.map(({ productId, label, kind }) => ({
    productId,
    label,
    kind,
  })),
  [
    { productId: "eurusd", label: "EUR/USD", kind: "fx" },
    { productId: "eurjpy", label: "EUR/JPY", kind: "fx" },
    { productId: "eurgbp", label: "EUR/GBP", kind: "fx" },
    { productId: "eurchf", label: "EUR/CHF", kind: "fx" },
    { productId: "estr", label: "€STR", kind: "rate" },
  ],
  "launch navigation must expose exactly the five approved markets",
);

assert.deepEqual(
  PUBLIC_PRIMARY_NAV_V1.map(({ label, href }) => ({ label, href })),
  [
    { label: "Markets", href: "/markets" },
    { label: "Free", href: "/" },
    { label: "VIP", href: "/vip" },
    { label: "Pricing", href: "/pricing" },
    { label: "Research", href: "/reports" },
  ],
  "desktop and mobile primary navigation must share the approved IA",
);

assert.deepEqual(
  PUBLIC_ACCOUNT_NAV_V1.map(({ label, href }) => ({ label, href })),
  [
    { label: "Account", href: "/account" },
    { label: "Sign In", href: "/account" },
  ],
  "account actions must truthfully reuse the working Account route",
);
assert.match(headerSource, /PUBLIC_PRIMARY_NAV_V1\.map/);
assert.match(headerSource, /PUBLIC_ACCOUNT_NAV_V1/);

assert.deepEqual(
  FOOTER_NAV_GROUPS_V1.map(({ label, links }) => ({
    label,
    links: links.map(({ label: linkLabel, href }) => ({
      label: linkLabel,
      href,
    })),
  })),
  [
    {
      label: "Product",
      links: [
        { label: "Markets", href: "/markets" },
        { label: "Free", href: "/" },
        { label: "VIP", href: "/vip" },
        { label: "Pricing", href: "/pricing" },
      ],
    },
    {
      label: "Research",
      links: [
        { label: "Research", href: "/reports" },
        { label: "Methodology", href: "/methodology" },
        { label: "Data Sources", href: "/data-sources" },
        { label: "Freshness & Availability", href: "/freshness" },
      ],
    },
    {
      label: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Account", href: "/account" },
        { label: "Billing", href: "/billing" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      label: "Legal",
      links: [
        { label: "Terms", href: "/terms-of-service" },
        { label: "Privacy", href: "/privacy-policy" },
        {
          label: "Financial Information Disclaimer",
          href: "/disclaimer",
        },
        { label: "Editorial Policy", href: "/editorial-policy" },
        { label: "DMCA", href: "/dmca" },
      ],
    },
  ],
  "footer groups must match the approved four-group structure",
);

const discoverableHrefs: readonly string[] = [
  ...PUBLIC_PRIMARY_NAV_V1.map((item) => item.href),
  ...PUBLIC_ACCOUNT_NAV_V1.map((item) => item.href),
  ...FOOTER_NAV_GROUPS_V1.flatMap((group) =>
    group.links.map((item) => item.href)
  ),
];

for (const contextualOnlyRoute of [
  "/faq",
  "/manifesto",
  "/sponsors",
  "/intelligence",
  "/products",
  "/premium",
]) {
  assert.equal(
    discoverableHrefs.includes(contextualOnlyRoute),
    false,
    contextualOnlyRoute + " must not appear in global navigation",
  );
}

const socialBlock = footerSource.match(
  /const FOOTER_SOCIAL_LINKS = \[([\s\S]*?)\] as const;/,
)?.[1];
assert.ok(socialBlock, "footer must define a bounded social-link set");
assert.deepEqual(
  [...socialBlock.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]),
  ["reddit", "x", "pinterest"],
  "footer must expose exactly the approved brand profiles",
);
assert.deepEqual(
  [...socialBlock.matchAll(/siteConfig\.socialLinks\.([a-z]+)/g)].map(
    (match) => match[1],
  ),
  ["reddit", "x", "pinterest"],
  "footer social destinations must resolve through site configuration",
);
assert.deepEqual(
  [...socialBlock.matchAll(/accessibleLabel: "([^"]+)"/g)].map(
    (match) => match[1],
  ),
  [
    "Join Chronoverse Capital on Reddit",
    "Follow Chronoverse Capital on X",
    "Chronoverse Capital on Pinterest",
  ],
  "every icon-only social link must have its approved accessible name",
);

assert.deepEqual(
  siteConfig.socialLinks,
  {
    x: "https://x.com/ChronoVerseCap",
    reddit: "https://www.reddit.com/r/ChronoVerseCapital/",
    pinterest: "https://pin.it/G3QCKVDL3",
  },
  "footer must use the exact approved brand destinations",
);
assert.deepEqual(siteConfig.founder, {
  name: "Ahmed N. Hassan",
  linkedInUrl: "https://www.linkedin.com/in/ahmed-n-hassan-09b739238",
});
assert.equal(
  footerSource.includes(siteConfig.founder.linkedInUrl),
  false,
  "the founder's personal LinkedIn must not appear in the global Footer",
);
assert.doesNotMatch(footerSource, /LinkedIn|Prestigious_Mine_321/);
assert.match(footerSource, /title=\{social\.title\}/);
assert.match(footerSource, /min-h-11 min-w-11/);
assert.match(footerSource, /focus-visible:ring-2/);
assert.match(footerSource, /<SocialIcon platform=\{social\.id\}/);
assert.doesNotMatch(socialIconSource, /<a\b|https?:\/\//);
assert.match(aboutSource, /siteConfig\.founder\.linkedInUrl/);
assert.match(aboutSource, /Ahmed N\. Hassan — LinkedIn/);
assert.match(aboutSource, /rel="noopener noreferrer"/);

for (const genericHomepage of [
  "https://x.com",
  "https://www.pinterest.com",
  "https://www.reddit.com",
]) {
  assert.equal(
    Object.values(siteConfig.socialLinks).some(
      (configuredUrl: string) => configuredUrl === genericHomepage,
    ),
    false,
    "generic social homepage must not be used: " + genericHomepage,
  );
}

assert.doesNotMatch(footerSource, /affs\.click|sponsor|affiliate/i);

console.log("PASS: institutional navigation, footer identity, and launch scope");
