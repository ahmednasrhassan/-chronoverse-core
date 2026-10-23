import { serializeJsonForHtml } from "@/lib/seo/article";

export function StructuredData({ data }: { readonly data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(data) }}
    />
  );
}
