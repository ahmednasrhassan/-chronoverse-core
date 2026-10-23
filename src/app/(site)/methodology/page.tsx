import type { Metadata } from "next";
import Link from "next/link";
import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Methodology",
  description:
    "How Chronoverse develops evidence-led financial research and communicates analytical limits.",
  pathname: "/methodology",
});

export default function Page() {
  return (
    <InstitutionalPage
      pathname="/methodology"
      eyebrow="Research publication"
      title="Methodology"
      summary="How Chronoverse develops evidence-led financial research and communicates analytical limits."
    >
      <InstitutionalSection title="Source selection">
        <p>
          Research begins with identified source material relevant to the
          question. Authors should check dates, figures, and attributed claims
          against the available evidence.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Analysis and uncertainty">
        <p>
          We distinguish sourced facts from interpretation, assumptions, and
          scenarios. Missing evidence and material uncertainty should be made
          clear, rather than replaced with unsupported certainty.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Interpretation limits">
        <p>
          Research is informational analysis, not personalized advice, trade
          orders, predictive certainty, or a guarantee of performance. Readers
          remain responsible for evaluating suitability and risk.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Related controls">
        <p>
          Read <Link href="/data-sources">Data Sources</Link>,{" "}
          <Link href="/editorial-policy">Editorial Policy</Link>, and the{" "}
          <Link href="/disclaimer">Financial Information Disclaimer</Link>{" "}
          alongside published research.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
