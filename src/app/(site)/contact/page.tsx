import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Contact",
  description:
    "Contact Chronoverse Capital about software, account access, research sources, corrections, or historical purchase support.",
  pathname: "/contact",
});

export default function ContactPage() {
  return (
    <InstitutionalPage
      pathname="/contact"
      eyebrow="Contact"
      title="Contact Chronoverse Capital"
      summary="Use the published contact address for software, account, research, correction, or historical purchase support."
    >
      <InstitutionalSection title="Direct contact">
        <p>
          Email{" "}
          <a href={"mailto:" + siteConfig.contactEmail}>
            {siteConfig.contactEmail}
          </a>
          . Use this address for software questions, account help, editorial
          corrections and historical purchase support.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="What to include">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            For account or access support, include the account email and the
            access state shown on the <Link href="/account">Account page</Link>.
          </li>
          <li>
            For software questions, describe the task or platform you are asking
            about. For a past purchase, include the order reference without
            payment-card details.
          </li>
          <li>
            For a source question or correction, include the article URL,
            reference date, and the specific statement or observation at issue.
          </li>
        </ul>
      </InstitutionalSection>

      <InstitutionalSection title="Security boundary">
        <p>
          Do not send passwords, one-time sign-in links, API keys, card numbers,
          or other secrets by email.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Historical purchase support">
        <p>
          Previous orders were one-time books. Include the order reference and
          describe any delivery, refund or dispute issue. Original purchase
          terms and applicable customer rights remain in effect.
        </p>
        <p>
          See <Link href="/refund-policy">Purchase and Refund Information</Link>{" "}
          for historical orders and the distinction between our catalog and the
          separate Gumroad storefront.
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
