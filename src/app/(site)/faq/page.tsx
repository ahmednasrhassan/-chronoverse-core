import type { Metadata } from "next";
import Link from "next/link";
import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Frequently Asked Questions",
  description:
    "Find answers about Chronoverse's pre-launch software catalog, future Gumroad purchases, independent articles, free accounts and newsletter.",
  pathname: "/faq",
});

export default function FaqPage() {
  return (
    <InstitutionalPage
      pathname="/faq"
      eyebrow="Knowledge base"
      title="Frequently Asked Questions"
      summary="Answers about original software, research, account access and historical purchase support."
    >
      <InstitutionalSection title="Where can I find Chronoverse applications?">
        <p>
          Visit the{" "}
          <a href="https://apps.chronoversecapital.com/">
            applications catalog
          </a>
          . No applications have been released yet. Each future product page
          will explain its features, system requirements and availability.
          Browsing does not require an account.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="What kinds of software are planned?">
        <p>
          The platform is intended for original downloadable applications that
          help with focused work. The first product, categories and supported
          operating systems have not yet been confirmed. No products,
          specifications or launch dates are being advertised as available.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Is the apps catalog a checkout?">
        <p>
          No. Browse and compare future releases in the catalog. Future eligible
          applications will link to verified product pages on the separate{" "}
          <a href="https://shop.chronoversecapital.com/">Gumroad storefront</a>.
          No software payments, subscriptions or licenses are implemented here.
          See <Link href="/refund-policy">Purchase and Refund Information</Link>
          .
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="What does Chronoverse publish?">
        <p>
          Alongside the software platform, Chronoverse retains independent
          articles on economics, finance and history. They provide context and a
          broader perspective, rather than personalized investment advice.
          Browse <Link href="/reports">published research</Link> or{" "}
          <Link href="/newsletter">
            {NEWSLETTER_SIGNUPS_PAUSED ? "view newsletter status" : "join the research newsletter"}
          </Link>.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="How current is the research?">
        <p>
          Each article reflects information available at publication. Source
          observations may be revised. See{" "}
          <Link href="/freshness">Freshness &amp; Availability</Link> for
          context.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Do I need a paid account?">
        <p>
          No. Browsing the catalog and reading research are free. No software
          checkout, licensing or subscriptions are currently offered. The{" "}
          <Link href="/account">Account page</Link> provides free passwordless
          sign-in.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="How do I get help with a past purchase?">
        <p>
          Previous purchases were one-time books. For order, delivery, refund or
          dispute questions, see{" "}
          <Link href="/refund-policy">purchase and refund information</Link>,
          use <Link href="/contact">purchase support</Link> or the contact
          details on your original receipt. Historical purchase obligations
          remain applicable.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Where can I ask for help or report an error?">
        <p>
          Use <Link href="/contact">Contact</Link> for software, account,
          access, research-source, correction, or historical purchase-support
          inquiries. Do not send passwords, one-time sign-in links, card
          numbers, or other secrets.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
