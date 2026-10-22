import type { Metadata } from "next";
import { FreeHomePageContent, ResearchPreview, MarketToolsPreview } from "@/components/home/FreeHomePageContent";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Independent Market Research & Intelligence",
  description:
    "Independent financial research on markets, monetary systems and the global economy. Read free published research and explore five ECB-sourced Free Lite market tools.",
  pathname: "/",
});

export default function HomePage() {
  return <FreeHomePageContent researchPreview={<ResearchPreview />} marketTools={<MarketToolsPreview />} />;
}
