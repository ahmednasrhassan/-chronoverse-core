import { strict as assert } from "node:assert";

import {
  FOOTER_NAV_GROUPS_V1,
  LAUNCH_MARKETS_V1,
  PUBLIC_ACCOUNT_NAV_V1,
  PUBLIC_PRIMARY_NAV_V1,
} from "../../../config/institutionalNavigation";

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
    { label: "Early Access", href: "/account" },
  ],
  "early access must truthfully reuse the working Account route",
);

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

console.log("PASS: institutional navigation and five-market scope");
