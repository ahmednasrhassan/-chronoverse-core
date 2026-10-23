import type { Metadata } from "next";
import Link from "next/link";
import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Freshness & Availability",
  description:
    "Publication dates, source reference periods, and availability limits for Chronoverse research.",
  pathname: "/freshness",
});

export default function Page() {
  return (
    <InstitutionalPage
      pathname="/freshness"
      eyebrow="Research publication"
      title="Freshness & Availability"
      summary="Publication dates, source reference periods, and availability limits for Chronoverse research."
    >
      <InstitutionalSection title="Publication and reference dates">
        <p>
          An article reflects information available at publication. A source
          reference period, source release date, and article update date
          describe different events.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Availability and revisions">
        <p>
          Source material may be delayed, revised, incomplete, or temporarily
          unavailable. An older article is historical analysis and should be
          read in its original context.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Decision boundary">
        <p>
          Published research is informational and does not guarantee current
          prices or future outcomes. Consult suitable primary sources and the{" "}
          <Link href="/disclaimer">Financial Information Disclaimer</Link>.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
