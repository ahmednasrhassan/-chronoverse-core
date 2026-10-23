import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";
import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";
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
      pathname="/privacy-policy"
      eyebrow="Data protection and transparency"
      title="Privacy Policy"
      summary="This policy describes the information processed by the current Chronoverse Capital website and the choices available on its account, newsletter, contact, and analytics surfaces."
    >
      <p className="text-xs font-mono text-muted">Last updated: October 2026</p>

      <InstitutionalSection title="1. Information processed">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-primary">Account identity:</strong> the
            email address submitted for passwordless sign-in and the resulting
            authenticated identity and access state.
          </li>
          <li>
            <strong className="text-primary">Newsletter:</strong> the email
            address submitted to join the newsletter and its active subscription
            record, signup time and source. Delivery safeguards also record
            opt-outs, suppression status and dispatch outcomes. Unsubscribe
            links contain an encrypted token used to process the opt-out.
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
          may be used for delivery, reliability, abuse prevention, and security.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="3. Current service boundaries">
        <p>
          Supabase supports the current identity and passwordless authentication
          flow. Sanity stores published content and newsletter subscriber
          records. The newsletter delivery workflow uses Amazon SES.{" "}
          {NEWSLETTER_SIGNUPS_PAUSED ? "New newsletter signups and delivery are temporarily paused. Existing subscribers can still use their unsubscribe links. " : ""}
          Public signup, when available, records the subscription; it does not
          itself send an email.
          Vercel hosts the website and its server routes. Credentials used by
          these integrations remain server-side and are not fields users are
          asked to submit.
        </p>
        <p>
          Providers process information under their own terms and privacy
          practices. For questions about retention, processing locations or a
          particular record, contact the address below.
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
          Analytics is limited to the main website; the apps catalog does not
          load the analytics library. Read the{" "}
          <Link href="/cookie-policy">Cookie Policy</Link> for storage details
          and instructions for resetting your choices.
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

      <InstitutionalSection title="5. Historical purchases and external websites">
        <p>
          The main website and apps catalog do not offer checkout or ask for
          payment-card details. Previous sales were one-time books. The
          providers that handled those transactions operate under their own
          privacy practices. Historical order and customer records may be
          retained for delivery, accounting, refunds, disputes and applicable
          obligations.
        </p>
        <p>
          This platform no longer processes payment notifications. Historical
          records are preserved; the change in website focus does not erase
          those records or remove customer rights. For assistance, use
          <Link href="/contact"> Purchase support</Link> or
          <Link href="/contact"> Contact</Link>.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Gumroad and future software purchases">
        <p>
          The apps catalog is in pre-launch. The{" "}
          <a href={siteConfig.storefrontUrl}>Gumroad storefront</a> is separate
          from the catalog. A future eligible application will link to its
          verified Gumroad product page, where the applicable checkout terms and
          provider privacy information can be reviewed. No software purchase
          integration or license system is active on this website.
        </p>
        <p>
          Read{" "}
          <Link href="/refund-policy">Purchase and Refund Information</Link> for
          the current purchase-support boundaries.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="6. Choices and requests">
        <p>
          You may decline optional analytics in the consent controls. Requests
          concerning account, newsletter, contact, or other personal information
          can be sent to the published address below. Available rights and
          exceptions depend on applicable law and the circumstances of the
          request.
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
