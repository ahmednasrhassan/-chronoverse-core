import { siteConfig } from "@/config/siteConfig";
import { APPLICATIONS_ORIGIN } from "@/config/applications";
import { buildCanonicalUrl } from "./site-url";

export interface BreadcrumbItem {
  readonly label: string;
  readonly href: string;
}

export const organizationId = `${siteConfig.url}/#organization`;

export function buildOrganizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": organizationId,
    name: siteConfig.name,
    url: `${siteConfig.url}/`,
    description: siteConfig.description,
    logo: {
      "@type": "ImageObject",
      url: buildCanonicalUrl("/icon.png"),
      width: 192,
      height: 192,
    },
    email: siteConfig.contactEmail,
    sameAs: [siteConfig.socialLinks.x, siteConfig.socialLinks.reddit],
  };
}

export function buildSiteJsonLd(site: "main" | "apps" = "main") {
  const url =
    site === "apps" ? `${APPLICATIONS_ORIGIN}/` : `${siteConfig.url}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationJsonLd(),
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        url,
        name:
          site === "apps"
            ? "Chronoverse Capital Applications"
            : siteConfig.name,
        inLanguage: "en",
        publisher: { "@id": organizationId },
      },
    ],
  };
}

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href,
    })),
  };
}
