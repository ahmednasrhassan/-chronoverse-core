import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Frequently Asked Questions",
  description:
    "Find answers about published financial research, free accounts, the newsletter, and purchase support.",
  pathname: "/faq",
});

export default function FaqPage() {
  return (
    <InstitutionalPage
      eyebrow="Knowledge base"
      title="Frequently Asked Questions"
      summary="Answers about research, account access, source dates, and historical purchase support."
    >
      <InstitutionalSection title="What does Chronoverse publish?">
        <p>Independent financial research, market analysis, and economic commentary. Browse published articles in <Link href="/reports">Research</Link> or subscribe to the newsletter.</p>
      </InstitutionalSection>
      <InstitutionalSection title="How current is the research?">
        <p>Each article reflects information available at publication. Source observations may be revised. See <Link href="/freshness">Freshness &amp; Availability</Link> for context.</p>
      </InstitutionalSection>

      <InstitutionalSection title="Do I need a paid account?">
        <p>
          No. This website is free-only and does not offer paid memberships or
          checkout. The <Link href="/account">Account page</Link> provides
          free passwordless sign-in.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="How do I get help with a past purchase?">
        <p>
          Previous Lemon Squeezy and Gumroad purchases were one-time books or
          digital products. For order, delivery, refund or dispute questions,
          use <Link href="/billing">Purchase support</Link> or the contact
          details on your original receipt. Historical purchase obligations
          remain applicable.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Where can I ask for help or report an error?">
        <p>
          Use <Link href="/contact">Contact</Link> for account, access, billing,
          research-source, correction, or historical purchase-support
          inquiries. Do not send passwords, one-time sign-in links, card
          numbers, or other secrets.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
