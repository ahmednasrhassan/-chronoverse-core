import type { Metadata } from "next";
import { PlatformHomePageContent } from "@/components/platform/PlatformHomePage";
import { ResearchPreview } from "@/components/home/ResearchPreview";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";
import { StructuredData } from "@/components/content/StructuredData";
import { buildSiteJsonLd } from "@/lib/seo/structured-data";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Original Downloadable Software",
  description:
    "Discover Chronoverse Capital's original downloadable software platform. Explore the pre-launch apps catalog and independent research on economics, finance and history.",
  pathname: "/",
});

export default function HomePage() {
  return (
    <>
      <StructuredData data={buildSiteJsonLd()} />
      <PlatformHomePageContent researchPreview={<ResearchPreview />} />
    </>
  );
}
