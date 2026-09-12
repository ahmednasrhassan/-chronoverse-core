import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Billing",
  description: "Billing support and account access information for Chronoverse.",
};

export default function BillingPage() {
  return (
    <InstitutionalPage
      eyebrow="Account support"
      title="Billing"
      summary="Self-service checkout and billing-portal controls are not yet available from this public shell."
    >
      <InstitutionalSection title="Account status">
        <p>
          Use the <Link href="/account">Account page</Link> to verify your
          signed-in identity and current access state. Access is determined by
          the trusted server-side account record, not by a client-side code.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Billing support">
        <p>
          For an existing commercial-account question, use the{" "}
          <Link href="/contact">Contact page</Link>. Do not send card numbers,
          passwords, authentication links, or other secrets in a support
          message.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
