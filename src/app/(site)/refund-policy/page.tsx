import type { Metadata } from "next";
import Link from "next/link";
import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import { siteConfig } from "@/config/siteConfig";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPublicPageMetadata({
  title: "Purchase and Refund Information",
  description:
    "Find support for historical book purchases and understand the separation between Chronoverse's pre-launch apps catalog and the Gumroad storefront.",
  pathname: "/refund-policy",
});

export default function RefundInformationPage() {
  return (
    <InstitutionalPage
      pathname="/refund-policy"
      eyebrow="Purchases and support"
      title="Purchase and Refund Information"
      summary="The apps catalog is in pre-launch. No Chronoverse software application is currently offered for purchase or download."
    >
      <InstitutionalSection title="Catalog and storefront">
        <p>
          The{" "}
          <a href="https://apps.chronoversecapital.com/">
            applications catalog
          </a>{" "}
          is the place to explore future original software. The{" "}
          <a href={siteConfig.storefrontUrl}>Gumroad storefront</a> is a
          separate website. Future eligible applications will link to their
          corresponding verified Gumroad product pages after launch; no
          product-specific purchase link is published here.
        </p>
        <p>
          No application-specific refund terms, software license, update
          commitment or support guarantee has been published. These details
          require confirmation for each future product before it is offered.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Historical book purchases">
        <p>
          Previous purchases were completed one-time books, not recurring
          subscriptions. This page does not replace the terms shown at the
          original purchase or remove applicable customer rights. Any refund or
          other remedy depends on those terms and the circumstances of the
          order.
        </p>
        <p>
          For a delivery, refund or dispute issue, use the contact details on
          your original receipt or{" "}
          <Link href="/contact">contact Chronoverse purchase support</Link>.
          Include the order reference, purchase date and a clear description of
          the problem. Do not send card numbers or sign-in links.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Before a future purchase">
        <p>
          Read the verified product page, system requirements and the terms
          presented at checkout. Browsing the catalog or signing into a
          Chronoverse account does not purchase an application or grant a
          license.
        </p>
        <p>
          See the <Link href="/terms-of-service">Terms of Service</Link> and{" "}
          <Link href="/privacy-policy">Privacy Policy</Link> for the current
          website&apos;s boundaries.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
