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
    "Find answers about Chronoverse market coverage, free access, ECB data, published research, and purchase support.",
  pathname: "/faq",
});

export default function FaqPage() {
  return (
    <InstitutionalPage
      eyebrow="Knowledge base"
      title="Frequently Asked Questions"
      summary="Concise answers to durable questions about launch coverage, access, data, research, and support."
    >
      <InstitutionalSection title="Which markets are included?">
        <p>
          Chronoverse covers exactly EUR/USD, EUR/JPY, EUR/GBP, EUR/CHF, and
          €STR. €STR is a benchmark rate, not a currency pair. Editorial
          research may discuss other subjects without adding them to the
          product.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="What is available free?">
        <p>
          All five markets use the Free Lite projection, with reference values,
          market context, freshness and availability limits. Published articles,
          archives and the newsletter remain available free.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Is the data live or intraday?">
        <p>
          No. The launch surface uses official ECB daily reference-rate
          observations for the four FX products and the official ECB €STR
          series. It does not present streaming, tick, intraday, or OHLC data.
          See <Link href="/freshness">Freshness &amp; Availability</Link>.
        </p>
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
