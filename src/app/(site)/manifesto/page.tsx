import type { Metadata } from "next";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
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
      eyebrow="Operating principles"
      title="The Chronoverse Manifesto"
      summary="A short statement of the restraint applied to market intelligence and published research."
    >
      <InstitutionalSection title="Focused coverage">
        <p>
          Financial research may cover currencies, interest rates, economic
          policy, and other market subjects. Each article defines its own scope.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="One canonical truth">
        <p>
          Research begins with identified sources and evidence.
          Source identity and derived interpretation remain distinct in the
          published analysis.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Evidence before claims">
        <p>
          Source identity, reference time, freshness status, and availability
          limits belong with analytical output. Unknown or not-assessed
          freshness is not presented as live delivery.
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
          research findings
          and editorial conclusions.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
