import type { Metadata } from "next";
import Link from "next/link";

import {
  formatAccountAccessStateV1,
  loadAccountShellStateV1,
} from "@/lib/auth/account";
import { resolveAccessV1 } from "@/lib/auth/access";
import { createSupabaseServerClientV1 } from "@/lib/auth/supabase/server";

import EmailOtpForm from "./EmailOtpForm";
import { signOutActionV1 } from "./actions";

export const metadata: Metadata = {
  title: "Account",
  description: "Chronoverse Capital account identity and access status.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

interface AccountPageProps {
  readonly searchParams: Promise<{
    readonly authError?: string | string[];
  }>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const [params, state] = await Promise.all([
    searchParams,
    loadAccountShellStateV1({
      loadIdentity: async () => {
        const supabase = await createSupabaseServerClientV1();
        return supabase.auth.getUser();
      },
      resolveAccess: resolveAccessV1,
    }),
  ]);
  const authError = Array.isArray(params.authError)
    ? params.authError[0]
    : params.authError;
  const errorMessage = authError === "callback"
    ? "That sign-in link could not be confirmed. Please request a new one."
    : authError === "signout"
    ? "We could not complete sign-out. Please try again."
    : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="rounded-xl border border-border bg-card p-6 sm:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-mauve">
          Identity & access
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-primary">
          Account
        </h1>
        <p className="mt-3 max-w-2xl text-secondary">
          Your verified identity and current Chronoverse access state.
        </p>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          >
            {errorMessage}
          </p>
        ) : null}

        <dl className="mt-8 divide-y divide-border border-y border-border">
          <StatusRow
            label="Session"
            value={formatIdentityStatus(state.identityStatus)}
          />
          {state.email ? <StatusRow label="Email" value={state.email} /> : null}
          <StatusRow
            label="Access"
            value={formatAccountAccessStateV1(state.accessState)}
          />
        </dl>

        {state.accessState === "unavailable" ? (
          <p className="mt-5 text-sm text-secondary" role="status">
            Trusted access is currently unavailable. No elevated access has
            been granted.
          </p>
        ) : null}

        {state.identityStatus === "signed_in" ? (
          <form action={signOutActionV1} className="mt-8">
            <button
              type="submit"
              className="rounded-md border border-purple-border px-5 py-3 text-sm font-semibold text-mauve transition hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Sign out
            </button>
          </form>
        ) : state.identityStatus === "signed_out" ? (
          <>
            <h2 className="mt-8 text-xl font-semibold text-primary">
              Sign in without a password
            </h2>
            <p className="mt-2 text-sm text-secondary">
              We will send a secure, single-use sign-in link to your email.
            </p>
            <EmailOtpForm />
          </>
        ) : (
          <p className="mt-8 text-sm text-secondary">
            Account identity is temporarily unavailable. Please retry shortly.
          </p>
        )}

        <div className="mt-8 border-t border-border pt-6 text-sm leading-6 text-secondary">
          <h2 className="font-semibold text-primary">Access and billing help</h2>
          <p className="mt-2">
            Signing in verifies identity; it does not purchase or change
            access. Public checkout and subscription-management controls are
            not available on this page. Review{" "}
            <Link
              href="/billing"
              className="rounded-sm text-mauve underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
            >
              Billing
            </Link>{" "}
            or use{" "}
            <Link
              href="/contact"
              className="rounded-sm text-mauve underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
            >
              Contact
            </Link>{" "}
            for support.
          </p>
        </div>
      </div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words text-sm font-medium text-primary">{value}</dd>
    </div>
  );
}

function formatIdentityStatus(
  status: "signed_in" | "signed_out" | "unavailable",
): string {
  if (status === "signed_in") return "Signed in";
  if (status === "signed_out") return "Signed out";
  return "Unavailable";
}
