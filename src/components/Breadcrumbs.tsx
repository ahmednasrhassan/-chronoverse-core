import React from "react";
import Link from "next/link";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
}

export default function Breadcrumbs({ items = [] }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  // Schema Markup (JSON-LD) for Google Rich Snippets
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <>
      {/* Google SEO JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Visual Navigation */}
      <nav aria-label="Breadcrumb" className="my-4 text-xs md:text-sm text-neutral-400">
        <ol className="flex flex-wrap items-center gap-2">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={`${item.url}-${index}`} className="flex items-center gap-2">
                {isLast ? (
                  <span
                    aria-current="page"
                    className="text-neutral-200 font-medium truncate max-w-[200px] md:max-w-xs"
                  >
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link
                      href={item.url}
                      className="hover:text-amber-500 transition-colors"
                    >
                      {item.name}
                    </Link>
                    <span className="text-neutral-600 select-none" aria-hidden="true">
                      /
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
