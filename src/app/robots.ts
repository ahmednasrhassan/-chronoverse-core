import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://chronoversecapital.com";

/**
 * Generates crawler directives for search engines and AI scrapers.
 * Complies with Next.js App Router Metadata API standards.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/api/*",
          "/studio/",
          "/studio/*",
          "/dashboard/",
          "/dashboard/*",
          "/checkout/",
          "/checkout/*",
          "/cart/",
          "/cart/*",
          "/_next/",
          "/_next/*",
          "/private/",
          "/drafts/",
          "/vip",
          "/vip/",
        ],
      },
      {
        // Explicit crawl permissions for standard Google crawlers
        userAgent: ["Googlebot", "Googlebot-Image"],
        allow: ["/", "/_next/static/"],
        disallow: [
          "/api/",
          "/studio/",
          "/dashboard/",
          "/checkout/",
          "/cart/",
          "/private/",
          "/drafts/",
          "/vip/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
