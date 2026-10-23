export const canonicalSiteOrigin = "https://chronoversecapital.com";

export const siteConfig = {
  name: "Chronoverse Capital",
  description:
    "An independent, English-language platform for original downloadable software, supported by editorial research on economics, finance and history.",
  url: canonicalSiteOrigin,
  // Official contact email used across contact and policy surfaces.
  contactEmail: "info@chronoversecapital.com",
  storefrontUrl: "https://shop.chronoversecapital.com",
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
