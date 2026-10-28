"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/config/newsletterConsent";
import Link from "next/link";

export function AwsNewsletterRegistration() {
  const id = useId(), submitted = useRef(false);
  const [status, setStatus] = useState<"idle" | "sending" | "accepted" | "uncertain">("idle");
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current) return;
    submitted.current = true;
    const data = new FormData(event.currentTarget);
    setStatus("sending");
    try {
      const response = await fetch("/api/newsletter", { method: "POST", credentials: "same-origin", redirect: "error",
        headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ email: data.get("email"), consent: data.get("consent") === "yes", consentVersion: CONSENT_VERSION, consentText: CONSENT_TEXT }) });
      setStatus(response.status === 202 ? "accepted" : "uncertain");
    } catch { setStatus("uncertain"); }
  }
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p className="text-muted">Weekly research is sent only after you confirm your subscription.</p>
      <form method="post" action="/api/newsletter" onSubmit={register} className="space-y-4">
        <label htmlFor={`${id}-email`} className="block">Email address</label>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254} required disabled={status !== "idle"}
          className="w-full rounded-lg border border-white/20 bg-transparent px-4 py-3 focus-visible:outline-2 focus-visible:outline-[#C8A7E8]" />
        <label className="flex items-start gap-3" htmlFor={`${id}-consent`}>
          <input id={`${id}-consent`} name="consent" type="checkbox" value="yes" required disabled={status !== "idle"} className="mt-1" />
          <span>{CONSENT_TEXT}</span>
        </label>
        <button type="submit" disabled={status !== "idle"}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#A77BD8] px-6 py-3 font-semibold text-[#050506] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8A7E8]">
          {status === "sending" ? "Submitting…" : "Request confirmation email"}
        </button>
      </form>
      <noscript>JavaScript is required to submit this form securely. Contact info@chronoversecapital.com for help.</noscript>
      <p role="status" aria-live="polite">
        {status === "accepted" ? "If eligible, check your inbox. A confirmation email is required before you subscribe." :
          status === "uncertain" ? "We could not verify the result. Please do not submit again. Check your inbox or contact info@chronoversecapital.com for help." : "You can unsubscribe at any time."}
      </p>
      <Link href="/privacy-policy" className="text-[#C8A7E8] underline underline-offset-4">Privacy policy</Link>
    </div>
  );
}
