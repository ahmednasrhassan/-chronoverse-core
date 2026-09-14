import type { Metadata } from "next";
import Link from "next/link";

import {
  InstitutionalPage,
  InstitutionalSection,
} from "@/components/content/InstitutionalPage";
import {
  loadBillingPageStateV1,
  type BillingPageStateV1,
  type BillingSubscriptionSummaryV1,
} from "@/lib/billing/billingManagement";

import ManageSubscriptionButton from "./ManageSubscriptionButton";

export const metadata: Metadata = {
  title: "Billing",
  description: "Authenticated VIP billing and subscription management.",
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
  let state: BillingPageStateV1 | null = null;

  try {
    state = await loadBillingPageStateV1();
  } catch {
    // Fail closed: no partial commercial facts or management capability render.
  }

  return (
    <InstitutionalPage
      eyebrow="Account management"
      title="Billing"
      summary="Review trusted commercial facts and open Lemon-hosted subscription management."
    >
      {state?.kind === "anonymous" ? <AnonymousBilling /> : null}
      {state?.kind === "authenticated" ? (
        <AuthenticatedBilling state={state} />
      ) : null}
      {state === null ? <UnavailableBilling /> : null}

      <InstitutionalSection title="Billing support">
        <p>
          For an access or billing question, use the{" "}
          <Link href="/contact">Contact page</Link>. Do not send card numbers,
          passwords, authentication links, or other secrets.
        </p>
        <p>
          Standalone research storefront purchases are separate from VIP
          memberships and do not appear here.
        </p>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}

function AnonymousBilling() {
  return (
    <InstitutionalSection title="Sign in required">
      <p>
        Subscription facts are private. Continue to{" "}
        <Link href="/account">Account</Link> to sign in and review your own
        billing state.
      </p>
    </InstitutionalSection>
  );
}

function AuthenticatedBilling({
  state,
}: {
  state: Extract<BillingPageStateV1, { kind: "authenticated" }>;
}) {
  const subscription = state.subscription;

  return (
    <>
      <InstitutionalSection title="Chronoverse access">
        <dl className="divide-y divide-border border-y border-border">
          <FactRow
            label="Access"
            value={formatAccessV1(state.accessState, subscription)}
          />
          <FactRow
            label="Commercial subscription"
            value={subscription === null ? "None" : "Recorded"}
          />
        </dl>
        <p>
          Access comes only from trusted role and persisted subscription facts.
          Opening or returning from the billing portal does not change access.
        </p>
      </InstitutionalSection>

      <InstitutionalSection title="Subscription">
        {subscription === null ? (
          <>
            <p>No active paid subscription is recorded for this account.</p>
            <p>
              Review the current VIP options on{" "}
              <Link href="/pricing">Pricing</Link>.
            </p>
          </>
        ) : (
          <SubscriptionFacts subscription={subscription} />
        )}

        {state.portalAvailable ? <ManageSubscriptionButton /> : null}
        <p>
          Current advertised VIP pricing remains $15.99 monthly or $150.99 annually on{" "}
          <Link href="/pricing">Pricing</Link>.
        </p>
      </InstitutionalSection>
    </>
  );
}

function SubscriptionFacts({
  subscription,
}: {
  subscription: BillingSubscriptionSummaryV1;
}) {
  return (
    <dl className="divide-y divide-border border-y border-border">
      <FactRow label="Plan" value={subscription.plan} />
      <FactRow
        label="Provider status"
        value={formatProviderStatusV1(subscription.providerStatus)}
      />
      <FactRow
        label="Cancellation"
        value={subscription.cancelled ? "Cancelled" : "Not cancelled"}
      />
      <FactRow
        label="Commercial access result"
        value={formatEntitlementV1(subscription.commercialEntitlement)}
      />
      {subscription.renewsAt ? (
        <DateFact label="Renews" value={subscription.renewsAt} />
      ) : null}
      {subscription.endsAt ? (
        <DateFact label="Access ends" value={subscription.endsAt} />
      ) : null}
      {subscription.trialEndsAt ? (
        <DateFact label="Trial ends" value={subscription.trialEndsAt} />
      ) : null}
      {subscription.pauseMode ? (
        <FactRow label="Pause state" value={subscription.pauseMode} />
      ) : null}
      {subscription.pauseResumesAt ? (
        <DateFact label="Pause resumes" value={subscription.pauseResumesAt} />
      ) : null}
    </dl>
  );
}

function UnavailableBilling() {
  return (
    <InstitutionalSection title="Billing unavailable">
      <p role="status">
        Trusted billing information is temporarily unavailable. No subscription
        state or management link has been shown. Please retry shortly.
      </p>
    </InstitutionalSection>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-primary">{value}</dd>
    </div>
  );
}

function DateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-primary">
        <time dateTime={value}>{formatDateV1(value)}</time>
      </dd>
    </div>
  );
}

function formatAccessV1(
  state: Extract<BillingPageStateV1, { kind: "authenticated" }>["accessState"],
  subscription: BillingSubscriptionSummaryV1 | null,
): string {
  if (state === "owner") return "Owner VIP";
  if (state === "admin") return "Admin VIP";
  if (state === "authenticated_free") return "Free";

  if (subscription?.cancelled && subscription.endsAt) {
    return `VIP active until ${formatDateV1(subscription.endsAt)}`;
  }

  return "VIP active";
}

function formatProviderStatusV1(value: string): string {
  const words = value.trim().replaceAll("_", " ");
  return words.length === 0
    ? "Unavailable"
    : words.charAt(0).toUpperCase() + words.slice(1);
}

function formatEntitlementV1(
  value: BillingSubscriptionSummaryV1["commercialEntitlement"],
): string {
  if (value === "active") return "Active";
  if (value === "inactive") return "Inactive";
  return "Unresolved — no commercial VIP claim";
}

function formatDateV1(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
