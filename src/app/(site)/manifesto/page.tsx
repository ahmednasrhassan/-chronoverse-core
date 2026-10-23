import type { Metadata } from "next";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  ...buildPublicPageMetadata({
    title: "Operating Principles",
    description:
      "The principles behind Chronoverse's original software platform and independent editorial research.",
    pathname: "/manifesto",
  }),
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};

export default function ManifestoPage() {
  return (
    <InstitutionalPage
      pathname="/manifesto"
      eyebrow="Operating principles"
      title="Operating Principles"
      summary="Original software with a clear purpose. Independent editorial work with identifiable sources and honest limits."
    >
      <InstitutionalSection title="Purpose before claims">
        <p>
          The software catalog is in pre-launch. Product information should
          describe confirmed capabilities, requirements and availability,
          without invented results or unsupported performance claims.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Identifiable evidence">
        <p>
          Research begins with identified sources and evidence. Source identity
          and derived interpretation remain distinct in the published analysis.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Evidence before claims">
        <p>
          Source dates, reference periods and material uncertainty belong with
          editorial analysis. Historical information should not be presented as
          current market data.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Analysis, not instruction">
        <p>
          Chronoverse provides informational market analysis and independent
          research. Its classifications are not personalized advice, trade
          orders, predictive certainty, or guarantees of performance.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Commercial restraint">
        <p>
          Sponsorship and other commercial arrangements remain separate from
          research findings and editorial conclusions.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
