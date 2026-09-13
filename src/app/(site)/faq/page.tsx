import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";

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

      <InstitutionalSection title="What is the difference between Free and VIP?">
        <p>
          Both use the same canonical five-product truth. Free presents the
          Lite projection; verified VIP access presents the Deep projection in
          protected Market Rooms. See <Link href="/pricing">Pricing</Link> for
          the current commercial boundary.
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

      <InstitutionalSection title="Can I purchase or manage VIP on this site now?">
        <p>
          Not through public self-service controls. VIP pricing is $15.99
          monthly or $150.99 annually, but public checkout and billing-portal
          controls are not currently available. The{" "}
          <Link href="/account">Account page</Link> verifies identity and
          displays the access state trusted by the server.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Is standalone research included with VIP?">
        <p>
          No. VIP membership and standalone research are separate offerings.
          Standalone research is available from the{" "}
          <a
            href={siteConfig.commerce.gumroadResearchUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chronoverse research storefront
          </a>
          .
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Where can I ask for help or report an error?">
        <p>
          Use <Link href="/contact">Contact</Link> for account, access, billing,
          research-source, correction, sponsorship, or collaboration
          inquiries. Do not send passwords, one-time sign-in links, card
          numbers, or other secrets.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
