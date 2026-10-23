import type { Metadata } from "next";
import Link from "next/link";
import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Data Sources",
  description:
    "How Chronoverse identifies sources, dates, and revisions in published financial research.",
  pathname: "/data-sources",
});

export default function Page() {
  return (
    <InstitutionalPage
      pathname="/data-sources"
      eyebrow="Research publication"
      title="Data Sources"
      summary="How Chronoverse identifies sources, dates, and revisions in published financial research."
    >
      <InstitutionalSection title="Sources in each article">
        <p>
          Published research identifies material sources in context. These may
          include central banks, statistical agencies, company filings, and
          other primary publications.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Evidence and interpretation">
        <p>
          Source observations and attributed facts remain distinct from our
          analysis, assumptions, and scenarios. Publication does not imply
          endorsement by a source provider.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Revisions and corrections">
        <p>
          Economic data and other source material may be revised. Read the
          reference period and publication date together, and use{" "}
          <Link href="/contact">Contact</Link> to report a possible error.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Related standards">
        <p>
          Read our <Link href="/methodology">Methodology</Link> and{" "}
          <Link href="/editorial-policy">Editorial Policy</Link> for research
          and correction standards.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
