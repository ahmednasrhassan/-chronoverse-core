import type { Metadata } from "next";
import { FreeHomePageContent, ResearchPreview } from "@/components/home/FreeHomePageContent";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Independent Market Research & Intelligence",
  description:
    "Independent financial research on markets, monetary systems and the global economy. Read independent financial research grounded in published sources.",
  pathname: "/",
});

export default function HomePage() {
  return <FreeHomePageContent researchPreview={<ResearchPreview />} />;
}
