"use client";

import { useState } from "react";

/**
 * Canonical landing page served at `chronoversecapital.com/newsletter`.
 * `src/proxy.ts` permanently redirects the known Newsletter host roots here
 * while retaining existing non-root rewrite behavior.
 *
 * Subscriptions POST only to the local `/api/newsletter` server endpoint;
 * persistence and optional notification credentials remain server-side.
 */
export default function NewsletterPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "loading") return;

    setStatus("loading");
    setFeedback("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      let data: { status?: string } = {};
      try {
        data = await res.json();
      } catch {
        // A non-JSON server error must not be mistaken for a subscription.
      }

      if (res.ok && data.status === "success") {
        setStatus("success");
        setFeedback("You're subscribed. Welcome to the Chronoverse dispatch list.");
        setEmail("");
      } else {
        setStatus("error");
        setFeedback("Subscription could not be completed. Please try again.");
      }
    } catch {
      setStatus("error");
      setFeedback("Network error. Please try again shortly.");
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#050506]">
      <div className="max-w-lg w-full bg-[#0D0D11] border border-border rounded-2xl p-8 md:p-10 shadow-2xl shadow-black/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#C8A7E8] bg-[#C8A7E8]/10 px-3 py-1.5 rounded-full border border-[#C8A7E8]/20">
          Chronoverse Dispatch
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary mt-4 mb-3 tracking-tight">
          Published Research — Direct to Your Inbox
        </h1>
        <p className="text-sm text-muted leading-relaxed mb-8">
          Receive published market research and analytical updates. Newsletter
          content is separate from Free Lite and VIP Deep product access.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-4 py-3 rounded-xl bg-raised border border-border text-primary placeholder:text-muted focus:outline-none focus:border-[#C8A7E8] transition-colors"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full px-4 py-3 rounded-xl bg-[#C8A7E8] hover:bg-[#A77BD8] text-black font-bold text-sm uppercase tracking-wide transition-colors disabled:opacity-60"
          >
            {status === "loading" ? "Submitting…" : "Subscribe"}
          </button>
        </form>

        {/* CLS fix: this feedback message is conditionally injected after
            the form submits, previously with no reserved space — its
            appearance pushed the card's bottom edge (and anything below
            it) down by its own height, a classic dynamic-content shift.
            Reserving a fixed-height `min-h` slot up front (present even
            when empty) means the text simply appears in place with zero
            layout movement. */}
        <div className="mt-4 min-h-5">
          {feedback && (
            <p
              role="status"
              aria-live="polite"
              className={`text-sm ${
                status === "success" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {feedback}
            </p>
          )}
        </div>

      </div>
    </main>
  );
}
