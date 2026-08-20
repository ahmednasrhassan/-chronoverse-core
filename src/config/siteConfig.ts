export const siteConfig = {
  name: "Chronoverse Capital",
  description: "Decoding Future Markets Through Historical Intelligence",
  url: "https://chronoversecapital.com",
  // Official contact email used across Contact page, Footer, and all Policy pages
  contactEmail: "info@chronoversecapital.com",
  // Social links configuration (Amazon SES & footer compliant)
  socialLinks: {
    x: "https://x.com/ChronoVerseCap",
    twitter: "https://x.com/ChronoVerseCap",
    reddit: "https://www.reddit.com/u/Prestigious_Mine_321/s/D6hnVH4BE4",
    pinterest: "https://pin.it/G3QCKVDL3",
    linkedin: "https://www.linkedin.com/in/ahmed-n-hassan-09b739238",
  },
} as const;

export type SiteConfig = typeof siteConfig;
