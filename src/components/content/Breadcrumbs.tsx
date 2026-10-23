import Link from "next/link";
import {
  buildBreadcrumbJsonLd,
  type BreadcrumbItem,
} from "@/lib/seo/structured-data";
import { StructuredData } from "./StructuredData";

export function Breadcrumbs({
  items,
}: {
  readonly items: readonly BreadcrumbItem[];
}) {
  return (
    <>
      <StructuredData data={buildBreadcrumbJsonLd(items)} />
      <nav aria-label="Breadcrumb" className="cv-breadcrumbs">
        <ol>
          {items.map((item, index) => (
            <li key={item.href}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {index === items.length - 1 ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <Link href={item.href}>{item.label}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
