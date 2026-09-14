import {
  getDatedBloggerCandidate,
  resolveLegacyContentRedirect,
} from "@/lib/seo/legacy-routes";
import { rootContentExistsForLegacyRedirect } from "@/lib/seo/article-data";
import { notFound, permanentRedirect } from "next/navigation";

interface LegacyBloggerPageProps {
  readonly params: Promise<{
    readonly slug: string;
    readonly month: string;
    readonly legacySlug: string;
  }>;
}

export default async function LegacyBloggerArticlePage({
  params,
}: LegacyBloggerPageProps) {
  const { slug: year, month, legacySlug } = await params;
  const target = await resolveLegacyContentRedirect(
    getDatedBloggerCandidate(year, month, legacySlug),
    rootContentExistsForLegacyRedirect,
  );

  if (!target) notFound();
  permanentRedirect(target);
}
