import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Financial Information Disclaimer",
  description: "Important limitations for Chronoverse market information and analysis.",
};

export default function DisclaimerPage() {
  return (
    <InstitutionalPage
      eyebrow="Important information"
      title="Financial Information Disclaimer"
      summary="Chronoverse provides general market information and independent analytical output. It does not provide personalized financial, investment, legal, or tax advice."
    >
      <InstitutionalSection title="Information, not advice">
        <p>
          Content is supplied for informational and analytical purposes only.
          It is not an offer, recommendation, or solicitation to buy or sell
          any security, currency, instrument, service, or strategy.
        </p>
        <p>
          System-generated recommendations and classifications are analytical
          outputs. They are not trade orders and do not account for an
          individual user&apos;s objectives, circumstances, or risk tolerance.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Risk and performance">
        <p>
          Markets involve risk, including possible loss. Historical results,
          simulations, scenarios, signals, and model outputs do not guarantee
          future performance or any particular outcome.
        </p>
        <p>
          Users should independently evaluate relevant risks and obtain
          qualified professional advice where appropriate before acting.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Data limitations">
        <p>
          Market data may be delayed, incomplete, revised, inaccurate, or
          unavailable. Chronoverse may withhold an output when required source
          evidence cannot be verified.
        </p>
        <p>
          See <Link href="/methodology">Methodology</Link>,{" "}
          <Link href="/data-sources">Data Sources</Link>, and{" "}
          <Link href="/freshness">Freshness &amp; Availability</Link> for
          additional context.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
