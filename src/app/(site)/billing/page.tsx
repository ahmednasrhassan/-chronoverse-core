import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Billing",
  description: "Billing support and account access information for Chronoverse.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function BillingPage() {
  return (
    <InstitutionalPage
      eyebrow="Account support"
      title="Billing"
      summary="Public self-service VIP checkout and billing-portal controls are not currently available."
    >
      <InstitutionalSection title="Current VIP pricing">
        <p>
          The approved VIP price is $15.99 monthly or $150.99 annually. Listing
          these prices does not indicate that a public checkout is active.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Account and access state">
        <p>
          Use the <Link href="/account">Account page</Link> to verify your
          signed-in identity and current access state. Signing in does not
          purchase, activate, or change VIP access.
        </p>
        <p>
          Access is determined from the trusted server-side account record.
          This page does not expose subscription-management or payment controls.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Billing support">
        <p>
          For an existing access or billing question, use the{" "}
          <Link href="/contact">Contact page</Link>. Include the email address
          associated with the account and a concise description of the issue.
          Do not send card numbers, passwords, authentication links, or other
          secrets.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Standalone research">
        <p>
          Purchases from the separate Chronoverse research storefront are not
          VIP memberships. Use <Link href="/contact">Contact</Link> for a
          question about a standalone research order.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
