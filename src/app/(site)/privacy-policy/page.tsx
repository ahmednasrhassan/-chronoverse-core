import type { Metadata } from "next";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Privacy Policy",
  description:
    "Review how the current Chronoverse Capital website processes account, newsletter, contact, consent, and request information.",
  pathname: "/privacy-policy",
});

export default function PrivacyPolicyPage() {
  return (
    <InstitutionalPage
      eyebrow="Data protection and transparency"
      title="Privacy Policy"
      summary="This policy describes the information processed by the current Chronoverse Capital website and the choices available on its account, newsletter, contact, and analytics surfaces."
    >
      <p className="text-xs font-mono text-muted">
        Last updated: September 2026
      </p>

      <InstitutionalSection title="1. Information processed">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-primary">Account identity:</strong> the
            email address submitted for passwordless sign-in and the resulting
            authenticated identity and access state.
          </li>
          <li>
            <strong className="text-primary">Newsletter:</strong> the email
            address submitted to join the newsletter and its active
            subscription record.
          </li>
          <li>
            <strong className="text-primary">Contact:</strong> the address and
            message content you choose to send through your email provider.
          </li>
          <li>
            <strong className="text-primary">Consent preferences:</strong> the
            necessary and analytics choices stored locally in your browser.
          </li>
          <li>
            <strong className="text-primary">Request information:</strong>{" "}
            hosting and security systems may process standard request metadata,
            such as IP address, user agent, time, and requested path, to deliver
            and protect the site.
          </li>
        </ul>
      </InstitutionalSection>

      <InstitutionalSection title="2. How the information is used">
        <p>
          Account information is used to send and verify passwordless sign-in
          links and to resolve the trusted access state. Newsletter information
          is used to maintain and operate the requested subscription. Contact
          messages are used to respond to the subject raised. Request metadata
          may be used for delivery, reliability, abuse prevention, and
          security.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="3. Current service boundaries">
        <p>
          Supabase supports the current identity and passwordless
          authentication flow. Newsletter subscriber records are persisted
          through the site&apos;s Sanity service, and an Amazon SES email
          notification may support newsletter operations. Credentials used by
          these integrations remain server-side and are not fields users are
          asked to submit.
        </p>
        <p>
          Providers process information under their own terms and privacy
          practices. Chronoverse does not publish a fixed retention period or
          storage-location promise on this page.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="4. Optional analytics and local preferences">
        <p>
          Google Analytics is not loaded unless analytics consent is granted
          through the site&apos;s consent controls. Necessary storage records
          the consent choice locally; advertising storage remains denied by the
          current controls.
        </p>
        <p>
          Google&apos;s privacy information is available at{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            policies.google.com/privacy
          </a>
          .
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="5. Purchases and external websites">
        <p>
          The public application does not ask users to enter payment-card
          details. Standalone research is offered through the external{" "}
          <a
            href={siteConfig.commerce.gumroadResearchUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Chronoverse research storefront
          </a>
          , whose privacy practices apply to that purchase flow. VIP checkout
          is hosted by Lemon Squeezy, whose privacy practices apply to payment
          processing. Subscription-management and billing-portal controls are
          not currently available on Chronoverse.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="6. Choices and requests">
        <p>
          You may decline optional analytics in the consent controls. Requests
          concerning account, newsletter, contact, or other personal
          information can be sent to the published address below. Available
          rights and exceptions depend on applicable law and the circumstances
          of the request.
        </p>
        <p>
          Do not send passwords, one-time sign-in links, card numbers, or other
          secrets with a privacy request.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="7. Contact">
        <p>
          Send privacy questions or requests to{" "}
          <a href={"mailto:" + siteConfig.contactEmail}>
            {siteConfig.contactEmail}
          </a>
          .
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
