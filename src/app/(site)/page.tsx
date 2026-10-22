import type { Metadata } from "next";
import { FreeHomePageContent, ResearchPreview } from "@/components/home/FreeHomePageContent";
import { getFiveProductFreeLiteProjectionMapV1 } from "@/lib/markets/services/canonicalProductResults";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Free Market Intelligence",
  description:
    "Free Lite market intelligence for EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and €STR.",
  pathname: "/",
});

export default async function HomePage() {
  const projections = await getFiveProductFreeLiteProjectionMapV1();
  return <FreeHomePageContent projections={projections} researchPreview={<ResearchPreview />} />;
}
