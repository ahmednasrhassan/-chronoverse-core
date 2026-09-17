export const canonicalSiteOrigin = "https://chronoversecapital.com";

export const siteConfig = {
  name: "Chronoverse Capital",
  description:
    "Five-market intelligence and independent research from Chronoverse Capital",
  url: canonicalSiteOrigin,
  // Official contact email used across contact and policy surfaces.
  contactEmail: "info@chronoversecapital.com",
  commerce: {
    // Existing first-party storefront for standalone research products.
    gumroadResearchUrl: "https://shop.chronoversecapital.com",
    // Lemon-managed custom domain returned by the live Checkout API.
    lemonStoreHost: "vault.chronoversecapital.com",
  },
  founder: {
    name: "Ahmed N. Hassan",
    linkedInUrl: "https://www.linkedin.com/in/ahmed-n-hassan-09b739238",
  },
  // Approved brand destinations used by the global Footer.
  socialLinks: {
    x: "https://x.com/ChronoVerseCap",
    reddit: "https://www.reddit.com/r/ChronoVerseCapital/",
    pinterest: "https://pin.it/G3QCKVDL3",
  },
} as const;

export type SiteConfig = typeof siteConfig;
