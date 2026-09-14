import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

import CheckoutButtons from "./CheckoutButtons";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Pricing",
  description:
    "Compare Free Lite with VIP Deep at $15.99 monthly or $150.99 annually.",
  pathname: "/pricing",
});

export default function PricingPage() {
  return (
    <InstitutionalPage
      eyebrow="Access structure"
      title="Free clarity. Deeper analysis for VIP."
      summary="Both access levels cover the same five launch markets. Choose monthly or annual VIP access through secure hosted checkout."
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
        <p>
          VIP pricing is $15.99 monthly or $150.99 annually. Checkout requires
          a verified Chronoverse account and opens on Lemon Squeezy.
          Billing-portal controls are not currently available.
        </p>
        <CheckoutButtons />
        <p className="text-sm text-secondary">
          If you are not signed in, you will be sent to Account first and can
          select your plan again after authentication. VIP access begins only
          after trusted payment confirmation.
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
          to establish identity and review your current access state.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
