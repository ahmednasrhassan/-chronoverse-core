import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free Lite and VIP Deep access structure for Chronoverse markets.",
};

export default function PricingPage() {
  return (
    <InstitutionalPage
      eyebrow="Access structure"
      title="Free clarity. Deeper analysis for VIP."
      summary="Both access levels cover the same five launch markets. Pricing and checkout controls are not yet active on this public page."
    >
      <InstitutionalSection title="Free — Lite projection">
        <p>
          A restrained market view designed to communicate the current Lite
          projection without exposing VIP analysis.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="VIP — Deep projection">
        <p>
          The authenticated Deep tier uses the same market universe with the
          additional analysis reserved for verified VIP access.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Launch coverage">
        <ul className="flex flex-wrap gap-2" aria-label="Launch markets">
          {LAUNCH_MARKETS_V1.map((market) => (
            <li
              key={market.productId}
              className="rounded-md border border-border bg-raised px-3 py-2 text-primary"
            >
              {market.label}
            </li>
          ))}
        </ul>
        <p>
          <Link className="font-medium text-mauve hover:text-purple-brand" href="/account">
            Sign in through Account
          </Link>{" "}
          to establish identity or register interest in early access.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
