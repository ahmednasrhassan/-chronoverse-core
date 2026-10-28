import Link from "next/link";
import { NEWSLETTER_SIGNUP_PAUSE_MESSAGE } from "@/config/newsletterAvailability";

export function NewsletterSignupPause() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p role="status" className="rounded-lg border border-mauve/30 bg-mauve/5 p-4 text-primary">
        {NEWSLETTER_SIGNUP_PAUSE_MESSAGE}
      </p>
      <button type="button" disabled className="min-h-12 w-full rounded-lg border border-border bg-raised px-6 py-3 font-semibold text-secondary disabled:cursor-not-allowed">
        Subscribe
      </button>
      <p className="text-secondary">No new subscriptions are being accepted. Newsletter delivery remains paused.</p>
      <Link
        href="/reports"
        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mauve"
      >
        Read published research
      </Link>
      <p className="text-secondary">
        Learn how we handle your information in our{" "}
        <Link href="/privacy-policy" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mauve">Privacy policy</Link>.
      </p>
    </div>
  );
}
