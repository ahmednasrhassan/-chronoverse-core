import type { Metadata } from "next";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";

export const metadata: Metadata = {
  title: "Data Sources",
  description: "Source provenance for the Chronoverse launch market universe.",
};

export default function DataSourcesPage() {
  return (
    <InstitutionalPage
      eyebrow="Source provenance"
      title="Data Sources"
      summary="Source identity and observation timestamps are part of the analytical context. Availability is never inferred when a required source cannot be verified."
    >
      <InstitutionalSection title="Launch universe">
        <p>
          Current launch coverage is limited to{" "}
          {LAUNCH_MARKETS_V1.map((market) => market.label).join(", ")}.
          No additional market is implied by this list.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="ECB-origin data">
        <p>
          Underlying ECB source data remains ECB-origin data. Chronoverse
          transformations and analysis are independent. Chronoverse output is
          not produced, endorsed, or warranted by the European Central Bank.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Provenance and limitations">
        <p>
          Source metadata should be read together with the reference date,
          retrieval time, and availability state. Upstream corrections or
          revisions may change later analytical output.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
