import type { MetadataRoute } from "next";

import { buildCanonicalUrl } from "@/lib/seo/site-url";

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
          "/private/",
          "/drafts/",
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
        ],
      },
    ],
    sitemap: buildCanonicalUrl("/sitemap.xml"),
  };
}
