import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";

export default function TermsOfServicePage() {
  return (
    <InstitutionalPage
      eyebrow="Legal framework"
      title="Terms of Service"
      summary="These terms describe the boundaries for using the Chronoverse Capital website, market-intelligence surfaces, accounts, and published research."
    >
      <p className="text-xs font-mono text-muted">
        Last updated: September 2026
      </p>

      <InstitutionalSection title="1. Acceptance and service scope">
        <p>
          By using this website, you agree to these terms. If you do not agree,
          do not use the service.
        </p>
        <p>
          The launch market-intelligence surface covers EUR/USD, EUR/JPY,
          EUR/GBP, EUR/CHF, and €STR. Free provides the Lite projection; VIP
          provides the Deep projection of the same five products through
          protected Market Rooms. Editorial and standalone research are
          separate surfaces and may discuss broader subjects.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="2. Accounts and access">
        <p>
          Passwordless sign-in verifies identity. The server-side account
          record determines whether access is anonymous Free, authenticated
          Free, VIP Active, Administrator, or Owner. Signing in does not itself
          purchase or elevate access.
        </p>
        <p>
          Keep sign-in links and account access secure. Do not attempt to enter
          protected areas without authorization or interfere with the
          operation, security, or availability of the service.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="3. Information, not advice">
        <p>
          Chronoverse provides general analytical and informational material.
          It is not personalized investment, financial, legal, or tax advice
          and is not a trade order, offer, recommendation, or solicitation.
          Review the{" "}
          <Link href="/disclaimer">Financial Information Disclaimer</Link>.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="4. Data and service availability">
        <p>
          Official observations and derived outputs may be delayed, incomplete,
          revised, partial, degraded, or unavailable. Chronoverse does not
          promise continuous service, a particular publication time, or a
          specific analytical outcome.
        </p>
        <p>
          Source and range limits are described in{" "}
          <Link href="/data-sources">Data Sources</Link> and{" "}
          <Link href="/freshness">Freshness &amp; Availability</Link>.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="5. VIP pricing, billing, and research products">
        <p>
          Approved VIP pricing is $15.99 monthly or $150.99 annually. Public
          self-service VIP checkout and billing-portal controls are not
          currently available. Access and billing questions must use the
          published <Link href="/contact">support path</Link>.
        </p>
        <p>
          Standalone research offered through the{" "}
          <a
            href={siteConfig.commerce.gumroadResearchUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chronoverse research storefront
          </a>{" "}
          is separate from VIP membership and is also subject to the terms
          shown in its purchase flow.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="6. Content and intellectual property">
        <p>
          Chronoverse retains rights in its original text, analysis, models,
          graphics, software, and branding. Source-provider and other
          third-party material remains subject to the rights and terms of its
          owner. Access to the site does not transfer ownership.
        </p>
        <p>
          You may not sell, sublicense, materially reproduce, or republish
          protected Chronoverse material without permission except where
          applicable law permits it.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="7. External links and commercial disclosures">
        <p>
          External research-storefront, source, social, and other third-party
          links operate under their own terms and privacy practices.
          Sponsorship or another disclosed commercial relationship does not
          control analytical output or editorial conclusions.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="8. Risk and responsibility">
        <p>
          Use of the service and reliance on its content are at your own risk
          to the extent permitted by applicable law. Markets involve the
          possibility of loss, and no historical result, model, scenario, or
          classification guarantees future performance.
        </p>
        <p>
          Nothing in these terms excludes rights or responsibilities that
          cannot lawfully be excluded.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="9. Changes and contact">
        <p>
          These terms may be updated when the service or its operating
          boundaries change. The date above identifies the current published
          version.
        </p>
        <p>
          Questions may be sent to{" "}
          <a href={"mailto:" + siteConfig.contactEmail}>
            {siteConfig.contactEmail}
          </a>
          .
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
