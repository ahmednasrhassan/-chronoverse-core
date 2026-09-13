import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Copyright and DMCA Notices",
  description:
    "Review guidance for submitting copyright notices and counter-notices about material published on the Chronoverse Capital website.",
  pathname: "/dmca",
});

export default function DmcaPage() {
  return (
    <InstitutionalPage
      eyebrow="Copyright"
      title="Copyright and DMCA Notices"
      summary="Chronoverse Capital provides this contact path for good-faith notices about material published on the website."
    >
      <InstitutionalSection title="Copyright notice">
        <p>
          If you believe material on this site infringes a copyright you own or
          are authorized to represent, send a notice that includes:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>your name and reliable contact information;</li>
          <li>identification of the copyrighted work;</li>
          <li>
            the exact URL and enough detail to locate the material at issue;
          </li>
          <li>
            a statement that you have a good-faith belief the disputed use is
            not authorized by the owner, its agent, or the law;
          </li>
          <li>
            a statement that the notice is accurate and, under penalty of
            perjury, that you are authorized to act for the rights owner; and
          </li>
          <li>your physical or electronic signature.</li>
        </ul>
      </InstitutionalSection>

      <InstitutionalSection title="Counter-notice">
        <p>
          If material you provided is removed or restricted and you believe
          that resulted from mistake or misidentification, reply through the
          same contact path. Identify the material, its former location, your
          contact information, and the basis for your request. Additional
          information may be required before the request can be evaluated.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Review process">
        <p>
          Chronoverse may request clarification, forward relevant notice
          information to the affected party, or remove, restrict, preserve, or
          restore material as appropriate. Submitting a notice does not
          guarantee a particular outcome.
        </p>
        <p>
          Knowingly material misstatements can have legal consequences.
          Consider obtaining qualified advice if you are uncertain about your
          rights or obligations.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Copyright contact">
        <p>
          Send notices to{" "}
          <a href={"mailto:" + siteConfig.contactEmail}>
            {siteConfig.contactEmail}
          </a>
          . This page does not represent that the address is registered as a
          statutory designated agent.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Related terms">
        <p>
          See the <Link href="/terms-of-service">Terms of Service</Link> for
          site-use and intellectual-property boundaries and the{" "}
          <Link href="/privacy-policy">Privacy Policy</Link> for information
          about contact messages.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
