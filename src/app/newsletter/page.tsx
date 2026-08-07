"use client";

import { useState } from "react";

/**
 * Dedicated landing page served on the `newsletter.chronoversecapital.com`
 * subdomain (see `src/proxy.ts`, which rewrites requests on that host to
 * `/newsletter`). Kept as its own route so it never collides with the main
 * Vercel routes/domain — the middleware rewrite means this file is reached
 * both via `newsletter.chronoversecapital.com/` (subdomain) and, for
 * previewing/testing, `chronoversecapital.com/newsletter` directly.
 *
 * Subscriptions POST to `/api/newsletter`, which relays via AWS SES —
 * completely decoupled from Vercel's routing/DNS, so SES DKIM/Mail-From
 * records live on their own subdomain (e.g. `mail.chronoversecapital.com`)
 * without ever needing to touch the Vercel-managed `newsletter.*` CNAME.
 */
export default function NewsletterPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setFeedback("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok && data.status === "success") {
        setStatus("success");
        setFeedback("You're subscribed. Welcome to the Chronoverse dispatch list.");
        setEmail("");
      } else {
        setStatus("error");
        setFeedback(data.message || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setFeedback("Network error. Please try again shortly.");
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#120e0c]">
      <div className="max-w-lg w-full bg-[#18181b] border border-zinc-800 rounded-2xl p-8 md:p-10 shadow-2xl shadow-black/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#c87d55] bg-[#c87d55]/10 px-3 py-1.5 rounded-full border border-[#c87d55]/20">
          Chronoverse Dispatch
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-100 mt-4 mb-3 tracking-tight">
          Institutional Macro Intelligence — Direct to Your Inbox
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed mb-8">
          Subscribe to our Amazon SES-powered newsletter for exclusive macroeconomic
          data, asset allocation strategies, and direct institutional insights.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#c87d55] transition-colors"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full px-4 py-3 rounded-xl bg-[#c87d55] hover:bg-[#e0946a] text-black font-bold text-sm uppercase tracking-wide transition-colors disabled:opacity-60"
          >
            {status === "loading" ? "Submitting…" : "Subscribe"}
          </button>
        </form>

        {feedback && (
          <p
            className={`mt-4 text-sm ${
              status === "success" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {feedback}
          </p>
        )}
      </div>
    </main>
  );
}
