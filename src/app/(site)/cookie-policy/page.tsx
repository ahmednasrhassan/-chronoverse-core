import type { Metadata } from "next";
import Link from "next/link";
import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Cookie Policy",
  description:
    "Understand Chronoverse's local consent preferences, account cookies and optional analytics, including how to reset your browser choices.",
  pathname: "/cookie-policy",
});

export default function CookiePolicyPage() {
  return (
    <InstitutionalPage
      pathname="/cookie-policy"
      eyebrow="Privacy and browser storage"
      title="Cookie Policy"
      summary="How the current Chronoverse website uses cookies and local browser storage. Browsing the apps catalog does not require an account."
    >
      <p className="text-xs font-mono text-muted">Last updated: October 2026</p>
      <InstitutionalSection title="Consent preferences">
        <p>
          The consent controls offer Essential Only, Accept Analytics and
          individual analytics preferences. Your choice is saved in this site&apos;s
          local browser storage under <code>chrono_cookie_consent</code> and{" "}
          <code>cookie_consent</code>. These are local storage entries, not
          cookies. They have no expiry set by this application and remain until
          cleared by you or your browser.
        </p>
        <p>
          Preferences are stored separately for each website origin. A choice
          made on the main site is not automatically shared with the apps
          catalog or the Gumroad storefront.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Optional analytics">
        <p>
          The Google Analytics library loads only after analytics consent, and
          only on the main chronoversecapital.com website. It is excluded from
          the apps host and from authentication, API and content-studio routes.
          The current controls keep advertising storage denied.
        </p>
        <p>
          When enabled, analytics can process page views, page titles, referral
          information and selected campaign parameters, and Google may set
          analytics cookies. Declining analytics does not prevent you from
          browsing the catalog or reading articles.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Account cookies">
        <p>
          Supabase supports passwordless sign-in and session handling. Its
          authentication cookies can store session information and sign-in
          verification state when account features are used. Cookie names can
          include the project-specific <code>sb-</code> prefix and can be split
          into multiple parts.
        </p>
        <p>
          Blocking or deleting authentication cookies can sign you out or
          interrupt sign-in. These cookies do not purchase software or create a
          software license.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Changing your choice">
        <p>
          To reset the current consent choice, use your browser&apos;s site-data
          settings to clear this site&apos;s saved local storage, then reload the
          page and choose Essential Only or your preferred setting when the
          controls appear. You can also delete existing analytics cookies
          through your browser. Clearing all site data may sign you out.
        </p>
        <p>
          The consent choice does not remove data already processed by an
          external provider. For privacy questions, see the{" "}
          <Link href="/privacy-policy">Privacy Policy</Link> or{" "}
          <Link href="/contact">contact Chronoverse</Link>.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="External websites">
        <p>
          Gumroad and other linked websites have their own cookie and privacy
          controls. This policy describes the Chronoverse website; it does not
          describe or configure a third-party checkout.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
