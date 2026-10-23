interface NavigationItemV1 {
  readonly label: string;
  readonly href: string;
}

export const PUBLIC_PRIMARY_NAV_V1 = Object.freeze([
  { label: "Home", href: "/" },
  { label: "Research", href: "/reports" },
] as const satisfies readonly NavigationItemV1[]);

export const PUBLIC_ACCOUNT_NAV_V1 = Object.freeze([
  { label: "Account", href: "/account" },
  { label: "Sign In", href: "/account" },
] as const satisfies readonly NavigationItemV1[]);

export const FOOTER_NAV_GROUPS_V1 = Object.freeze([
  {
    label: "Publication",
    links: [
          { label: "Home", href: "/" },
    ],
  },
  {
    label: "Research",
    links: [
      { label: "Research", href: "/reports" },
      { label: "Newsletter", href: "/newsletter" },
      { label: "Methodology", href: "/methodology" },
      { label: "Data Sources", href: "/data-sources" },
      { label: "Freshness & Availability", href: "/freshness" },
    ],
  },
  {
    label: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "FAQ", href: "/faq" },
      { label: "Account", href: "/account" },
      { label: "Purchase support", href: "/billing" },
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
] as const satisfies readonly {
  readonly label: string;
  readonly links: readonly NavigationItemV1[];
}[]);
