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
const headerSource = readFileSync(
  path.join(repositoryRoot, "src/components/navigation/Header.tsx"),
  "utf8",
);
const footerSource = readFileSync(
  path.join(repositoryRoot, "src/components/navigation/Footer.tsx"),
  "utf8",
);

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
    links: links.map((link) => link.label),
  })),
  [
    {
      label: "Product",
      links: ["Markets", "Free", "VIP", "Pricing"],
    },
    {
      label: "Research",
      links: [
        "Research",
        "Methodology",
        "Data Sources",
        "Freshness & Availability",
      ],
    },
    {
      label: "Company",
      links: ["About", "Account", "Billing", "Contact"],
    },
    {
      label: "Legal",
      links: ["Terms", "Privacy", "Financial Information Disclaimer"],
    },
  ],
  "footer groups must match the institutional shell structure",
);

const discoverableHrefs: readonly string[] = [
  ...PUBLIC_PRIMARY_NAV_V1.map((item) => item.href),
  ...PUBLIC_ACCOUNT_NAV_V1.map((item) => item.href),
  ...FOOTER_NAV_GROUPS_V1.flatMap((group) =>
    group.links.map((item) => item.href)
  ),
];

assert.equal(discoverableHrefs.includes("/intelligence"), false);
assert.equal(discoverableHrefs.includes("/products"), false);
assert.equal(discoverableHrefs.includes("/sponsors"), false);
assert.equal(discoverableHrefs.includes("/premium"), false);

const socialBlock = footerSource.match(
  /const FOOTER_SOCIAL_LINKS = \[([\s\S]*?)\] as const;/,
)?.[1];
assert.ok(socialBlock, "footer must define a bounded social-link set");
assert.deepEqual(
  [...socialBlock.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]),
  ["X", "LinkedIn", "Pinterest", "Reddit"],
  "footer must restore exactly the four requested social labels",
);
assert.deepEqual(
  [...socialBlock.matchAll(/siteConfig\.socialLinks\.([a-z]+)/g)].map(
    (match) => match[1],
  ),
  ["x", "linkedin", "pinterest", "reddit"],
  "footer social links must resolve through the verified site configuration",
);

assert.deepEqual(
  {
    x: siteConfig.socialLinks.x,
    linkedin: siteConfig.socialLinks.linkedin,
    pinterest: siteConfig.socialLinks.pinterest,
    reddit: siteConfig.socialLinks.reddit,
  },
  {
    x: "https://x.com/ChronoVerseCap",
    linkedin: "https://www.linkedin.com/in/ahmed-n-hassan-09b739238",
    pinterest: "https://pin.it/G3QCKVDL3",
    reddit: "https://www.reddit.com/u/Prestigious_Mine_321/s/D6hnVH4BE4",
  },
  "footer must use the exact historically tracked Chronoverse destinations",
);

for (const genericHomepage of [
  "https://x.com",
  "https://www.linkedin.com",
  "https://www.pinterest.com",
  "https://www.reddit.com",
]) {
  assert.equal(
    Object.values(siteConfig.socialLinks).some(
      (configuredUrl: string) => configuredUrl === genericHomepage,
    ),
    false,
    `generic social homepage must not be used: ${genericHomepage}`,
  );
}

assert.doesNotMatch(footerSource, /affs\.click|sponsor|affiliate/i);

console.log("PASS: institutional navigation and five-market scope");
