import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Methodology",
  description: "How Chronoverse transforms market observations into analytical output.",
};

export default function MethodologyPage() {
  return (
    <InstitutionalPage
      eyebrow="Research controls"
      title="Methodology"
      summary="Chronoverse applies independent analytical transformations to identified market observations and presents the resulting evidence with explicit availability limits."
    >
      <InstitutionalSection title="Analytical process">
        <p>
          The system evaluates market observations through documented,
          repeatable transformations. Free and VIP surfaces may expose
          different depths of the same underlying analysis; neither changes
          the source observation.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Interpretation limits">
        <p>
          System-generated recommendations are analytical classifications,
          not trade orders or personalized instructions. Users remain
          responsible for independently evaluating assumptions, suitability,
          liquidity, and risk.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Related controls">
        <p>
          Review the <Link href="/data-sources">Data Sources</Link>,{" "}
          <Link href="/freshness">Freshness &amp; Availability</Link>, and{" "}
          <Link href="/disclaimer">Financial Information Disclaimer</Link>{" "}
          alongside every analytical output.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
