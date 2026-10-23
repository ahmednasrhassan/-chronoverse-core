import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Financial Information Disclaimer",
  description:
    "Understand the limits of Chronoverse's educational research on economics, finance and history, and the pre-launch status of its software catalog.",
  pathname: "/disclaimer",
});

export default function DisclaimerPage() {
  return (
    <InstitutionalPage
      pathname="/disclaimer"
      eyebrow="Important information"
      title="Financial Information Disclaimer"
      summary="Chronoverse's editorial articles are general information. The website does not provide personalized financial, investment, legal or tax advice. Its software catalog is in pre-launch."
    >
      <InstitutionalSection title="Information, not advice">
        <p>
          Content is supplied for informational and analytical purposes only. It
          is not an offer, recommendation, or solicitation to buy or sell any
          security, currency, instrument, service, or strategy.
        </p>
        <p>
          Articles on financial events, economic ideas and history provide
          context and interpretation. They do not account for an individual
          reader&apos;s objectives, circumstances or risk tolerance.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Risk and performance">
        <p>
          Markets involve risk, including possible loss. Historical results,
          examples, scenarios and interpretations do not guarantee future
          performance or any particular outcome.
        </p>
        <p>
          Users should independently evaluate relevant risks and obtain
          qualified professional advice where appropriate before acting.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Data limitations">
        <p>
          Source material may be delayed, incomplete, revised, inaccurate or
          unavailable. An older article should be read in the context of its
          publication date, sources and stated assumptions.
        </p>
        <p>
          See <Link href="/methodology">Methodology</Link>,{" "}
          <Link href="/data-sources">Data Sources</Link>, and{" "}
          <Link href="/freshness">Freshness &amp; Availability</Link> for
          additional context.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Software and external purchases">
        <p>
          No application is currently released in the{" "}
          <a href="https://apps.chronoversecapital.com/">software catalog</a>.
          Future product pages will describe confirmed features, supported
          systems and availability. Editorial examples are not claims about an
          unreleased product&apos;s capabilities or performance.
        </p>
        <p>
          For the distinction between catalog browsing and future eligible
          Gumroad purchases, see{" "}
          <Link href="/refund-policy">Purchase and Refund Information</Link>.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
