import type { Metadata } from "next";
import { PlatformHomePageContent } from "@/components/platform/PlatformHomePage";
import { ResearchPreview } from "@/components/home/ResearchPreview";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Original Software. Independent by Design.",
  description:
    "Original software applications and independent ideas from Chronoverse Capital. Explore the apps catalog and read our published research.",
  pathname: "/",
});

export default function HomePage() {
  return <PlatformHomePageContent researchPreview={<ResearchPreview />} />;
}
