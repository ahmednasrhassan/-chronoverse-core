import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";

export default function ContactPage() {
  return (
    <InstitutionalPage
      eyebrow="Contact"
      title="Contact Chronoverse Capital"
      summary="Use the published contact address for account, billing, research, correction, or commercial inquiries."
    >
      <InstitutionalSection title="Direct contact">
        <p>
          Email{" "}
          <a href={"mailto:" + siteConfig.contactEmail}>
            {siteConfig.contactEmail}
          </a>
          . The public site does not submit an unseen contact form.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="What to include">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            For account or access support, include the account email and the
            access state shown on the <Link href="/account">Account page</Link>.
          </li>
          <li>
            For billing or standalone research support, identify the relevant
            offering or order without sending payment-card details.
          </li>
          <li>
            For a source question or correction, include the page, market,
            reference date, and the specific statement or observation at issue.
          </li>
          <li>
            For a sponsorship or collaboration inquiry, describe the
            organization and proposed scope.
          </li>
        </ul>
      </InstitutionalSection>

      <InstitutionalSection title="Security boundary">
        <p>
          Do not send passwords, one-time sign-in links, API keys, card
          numbers, or other secrets by email. Chronoverse does not promise a
          particular response time.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Commercial inquiries">
        <p>
          The <Link href="/sponsors">Sponsorships page</Link> explains the
          separation between commercial support and analytical or editorial
          output. Submission of an inquiry does not create an agreement.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Related information">
        <p>
          For operating boundaries, review <Link href="/about">About</Link>,{" "}
          <Link href="/methodology">Methodology</Link>,{" "}
          <Link href="/editorial-policy">Editorial Policy</Link>, and{" "}
          <Link href="/privacy-policy">Privacy Policy</Link>.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
