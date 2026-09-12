import type { Metadata } from "next";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Freshness & Availability",
  description: "How Chronoverse communicates data freshness and service availability.",
};

export default function FreshnessPage() {
  return (
    <InstitutionalPage
      eyebrow="Operational disclosure"
      title="Freshness & Availability"
      summary="Market observations and derived analysis can be delayed, incomplete, revised, or unavailable. A displayed timestamp is context, not a guarantee of real-time delivery."
    >
      <InstitutionalSection title="Reference time">
        <p>
          Where provided, reference dates and source timestamps describe the
          observation used by the system. They may differ from retrieval or
          page-render time.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Unavailable states">
        <p>
          If required source evidence cannot be verified, the corresponding
          output may be withheld or marked unavailable rather than replaced
          with assumed data.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Independent verification">
        <p>
          Users should verify current market conditions through suitable
          primary sources before making any decision. Historical availability
          does not guarantee future continuity.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
