"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/config/newsletterConsent";
import Link from "next/link";
import { NEWSLETTER_SIGNUPS_PAUSED, NEWSLETTER_SIGNUP_PAUSE_MESSAGE } from "@/config/newsletterAvailability";
import { NewsletterSignupPause } from "./NewsletterSignupPause";

export function AwsNewsletterRegistration() {
  const id = useId(), submitted = useRef(false);
  const [status, setStatus] = useState<"idle" | "sending" | "accepted" | "unavailable" | "uncertain">("idle");
  const [validationError, setValidationError] = useState("");
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (NEWSLETTER_SIGNUPS_PAUSED || submitted.current) return;
    if (!event.currentTarget.reportValidity()) return;
    submitted.current = true;
    const data = new FormData(event.currentTarget);
    setValidationError("");
    setStatus("sending");
    try {
      const response = await fetch("/api/newsletter", { method: "POST", credentials: "same-origin", redirect: "error",
        headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ email: data.get("email"), consent: data.get("consent") === "yes", consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT }) });
      if (response.status === 202) setStatus("accepted");
      else if (response.status === 503 && (await response.json()).code === "registration_paused") setStatus("unavailable");
      else setStatus("uncertain");
    } catch { setStatus("uncertain"); }
  }
  // Defense in depth: even an accidental direct render cannot admit a request
  // while the reviewed code pause holds. The API separately enforces the pause.
  if (NEWSLETTER_SIGNUPS_PAUSED) return <NewsletterSignupPause />;

  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p id={`${id}-guidance`} className="text-secondary">Weekly research is sent only after you confirm your subscription.</p>
      <form method="post" action="/api/newsletter" onSubmit={register} aria-busy={status === "sending"}
        onInvalid={() => setValidationError("Enter a valid email address and agree to receive the newsletter.")}
        onInput={() => setValidationError("")} className="space-y-4">
        <label htmlFor={`${id}-email`} className="block font-medium text-primary">Email address</label>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
          placeholder="you@example.com" maxLength={254} required disabled={status !== "idle"} aria-describedby={`${id}-guidance ${id}-error`}
          className="min-h-12 w-full rounded-lg border border-border bg-page px-4 py-3 text-base text-primary placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mauve disabled:opacity-60" />
        <label className="flex items-start gap-3" htmlFor={`${id}-consent`}>
          <input id={`${id}-consent`} name="consent" type="checkbox" value="yes" required disabled={status !== "idle"}
            aria-describedby={`${id}-error`} className="mt-1 size-5 shrink-0 accent-mauve focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mauve" />
          <span className="text-secondary">{CONSENT_TEXT}</span>
        </label>
        <p id={`${id}-error`} role="alert" className="text-primary">{validationError}</p>
        <button type="submit" disabled={status !== "idle"}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-purple-brand px-6 py-3 font-semibold text-page hover:bg-mauve disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mauve">
          Subscribe
        </button>
      </form>
      <noscript>JavaScript is required to submit this form securely. Contact info@chronoversecapital.com for help.</noscript>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-secondary">
        {status === "sending" ? "Submitting your request. Please wait." :
          status === "accepted" ? "If your email is eligible, check your inbox for a confirmation link." :
          status === "unavailable" ? NEWSLETTER_SIGNUP_PAUSE_MESSAGE :
          status === "uncertain" ? "We could not verify the result. Please do not submit again. Check your inbox or contact info@chronoversecapital.com for help." : "Confirmed subscribers can unsubscribe using the secure links in their emails."}
      </p>
      <Link href="/privacy-policy" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mauve">Privacy policy</Link>
    </div>
  );
}
