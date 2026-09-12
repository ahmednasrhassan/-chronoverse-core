import type {
  MarketProjectionDisplayNameV1,
  MarketProjectionProductIdV1,
} from "@/lib/markets/projections/types";

interface NavigationItemV1 {
  readonly label: string;
  readonly href: string;
}

interface LaunchMarketDisplayV1 {
  readonly productId: MarketProjectionProductIdV1;
  readonly label: MarketProjectionDisplayNameV1;
  readonly kind: "fx" | "rate";
}

export const LAUNCH_MARKETS_V1 = Object.freeze([
  { productId: "eurusd", label: "EUR/USD", kind: "fx" },
  { productId: "eurjpy", label: "EUR/JPY", kind: "fx" },
  { productId: "eurgbp", label: "EUR/GBP", kind: "fx" },
  { productId: "eurchf", label: "EUR/CHF", kind: "fx" },
  { productId: "estr", label: "€STR", kind: "rate" },
] as const satisfies readonly LaunchMarketDisplayV1[]);

export const PUBLIC_PRIMARY_NAV_V1 = Object.freeze([
  { label: "Markets", href: "/markets" },
  { label: "Free", href: "/" },
  { label: "VIP", href: "/vip" },
  { label: "Pricing", href: "/pricing" },
  { label: "Research", href: "/reports" },
] as const satisfies readonly NavigationItemV1[]);

export const PUBLIC_ACCOUNT_NAV_V1 = Object.freeze([
  { label: "Account", href: "/account" },
  { label: "Early Access", href: "/account" },
] as const satisfies readonly NavigationItemV1[]);

export const FOOTER_NAV_GROUPS_V1 = Object.freeze([
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
    ],
  },
] as const satisfies readonly {
  readonly label: string;
  readonly links: readonly NavigationItemV1[];
}[]);
