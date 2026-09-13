import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";

export const metadata: Metadata = {
  title: "Sponsorships",
  description:
    "Contact Chronoverse Capital about research sponsorship and collaboration inquiries.",
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};

export default function SponsorsPage() {
  return (
    <InstitutionalPage
      eyebrow="Commercial inquiries"
      title="Sponsorships"
      summary="Chronoverse considers research sponsorship and collaboration inquiries case by case, with a firm separation between commercial support and published output."
    >
      <InstitutionalSection title="Suitable inquiries">
        <p>
          Organizations may contact Chronoverse about clearly disclosed
          research sponsorship, publication support, or a bounded
          collaboration. Availability, format, scope, and commercial terms are
          discussed before any agreement is made.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Independence boundary">
        <p>
          Sponsorship does not influence Free Lite intelligence, VIP Deep
          intelligence, analytical outputs, or editorial conclusions. It does
          not add a market to the five-product launch scope or grant a sponsor
          control over source selection, classifications, or corrections.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="No performance promise">
        <p>
          An inquiry or agreement does not guarantee reach, visibility,
          placement, conversion, financial performance, or another outcome.
          Any accepted placement must be identified in context.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Start an inquiry">
        <p>
          Email{" "}
          <a href={"mailto:" + siteConfig.contactEmail}>
            {siteConfig.contactEmail}
          </a>{" "}
          with the organization name and proposed scope, or review the general{" "}
          <Link href="/contact">Contact guidance</Link>. Do not include
          passwords, card details, or other secrets.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
