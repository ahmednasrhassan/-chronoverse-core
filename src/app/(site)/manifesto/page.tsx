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
          The launch product covers EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and
          €STR. Broader editorial subjects do not become additional public
          products.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="One canonical truth">
        <p>
          Free and VIP begin with the same official observations and canonical
          analysis. Free presents the Lite projection; VIP presents the Deep
          projection for verified access.
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
          Free Lite intelligence, VIP Deep intelligence, analytical outputs,
          and editorial conclusions.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
