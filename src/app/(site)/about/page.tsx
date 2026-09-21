import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { LAUNCH_MARKETS_V1 } from "@/config/institutionalNavigation";
import { siteConfig } from "@/config/siteConfig";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "About",
  description:
    "Learn about Chronoverse Capital's independent, evidence-led market intelligence for four euro FX pairs and €STR.",
  pathname: "/about",
});

export default function AboutPage() {
  const launchMarkets = LAUNCH_MARKETS_V1.map((market) => market.label).join(", ");

  return (
    <InstitutionalPage
      eyebrow="Company"
      title="About Chronoverse Capital"
      summary="Chronoverse Capital is an independent market-intelligence and research platform built around a focused, evidence-led launch."
    >
      <InstitutionalSection title="Current platform">
        <p>
          The market-intelligence product covers exactly {launchMarkets}. These
          are four euro foreign-exchange reference pairs and the €STR benchmark
          rate; no other public product is implied.
        </p>
        <p>
          Chronoverse separates official source observations, its own
          normalization and analytical layer, freshness context, and
          availability limits so users can see the boundaries of each output.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Free, VIP, and Research">
        <p>
          <Link href="/">Free</Link> is the Lite projection.{" "}
          <Link href="/pricing">VIP</Link> is the Deep projection of the same
          canonical five-product truth, delivered through protected VIP Market
          Rooms for verified access.
        </p>
        <p>
          <Link href="/reports">Editorial Research</Link> is a separate
          publishing surface. Standalone research available from the{" "}
          <a
            href={siteConfig.commerce.gumroadResearchUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chronoverse research storefront
          </a>{" "}
          is also separate from VIP membership.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Independent analytical position">
        <p>
          Chronoverse presents analytical evidence and classifications, not
          personalized advice, trade orders, or assured outcomes. Commercial
          arrangements do not determine Free Lite intelligence, VIP Deep
          intelligence, or editorial conclusions.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Founder and leadership">
        <p>
          <strong className="text-primary">{siteConfig.founder.name}</strong>
          {" — "}Founder
        </p>
        <p>
          <a
            href={siteConfig.founder.linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ahmed N. Hassan — LinkedIn
          </a>
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Trust and contact">
        <p>
          Review our <Link href="/methodology">Methodology</Link>,{" "}
          <Link href="/data-sources">Data Sources</Link>,{" "}
          <Link href="/editorial-policy">Editorial Policy</Link>, and{" "}
          <Link href="/disclaimer">Financial Information Disclaimer</Link> for
          the controls behind the public surface.
        </p>
        <p>
          Use <Link href="/contact">Contact</Link> for account, billing,
          research, correction, or sponsorship inquiries. Our{" "}
          <Link href="/manifesto">operating principles</Link> describe the
          restraint applied across the platform.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
