import type { Metadata } from "next";
import Link from "next/link";
import { InstitutionalPage, InstitutionalSection } from "@/components/content/InstitutionalPage";

export const metadata: Metadata = {
  title: "Billing",
  description: "Support for historical book and digital-product purchases.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function BillingPage() {
  return <HistoricalPurchaseSupport />;
}

function HistoricalPurchaseSupport() {
  return (
    <InstitutionalPage
      eyebrow="Customer support"
      title="Purchase support"
      summary="Help with historical book and digital-product orders."
    >
      <InstitutionalSection title="Past orders">
        <p>
          Previous Lemon Squeezy and Gumroad purchases were one-time books or
          digital products. This free-only website does not offer checkout or
          paid memberships. Original purchase terms and applicable customer
          rights remain in effect; historical records and refund handling are
          preserved.
        </p>
      </InstitutionalSection>
      <InstitutionalSection title="Order, delivery, refund or dispute questions">
        <p>
          Use the <Link href="/contact">Contact page</Link> or the support
          details on your original receipt. Include the order reference and a
          description of the issue. Do not send card numbers, passwords or
          authentication links. One-time orders are not displayed as account
          subscriptions here.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
