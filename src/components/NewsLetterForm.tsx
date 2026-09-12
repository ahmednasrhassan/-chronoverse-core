"use client";

import React, { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || status === "loading") return;

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
        // تفادي انهيار التطبيق لو أرجع الخادم استجابة نصية/HTML عند حدوث خطأ غير متوقع
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
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
        <input
          type="email"
          aria-label="Email address"
          placeholder="you@company.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-border bg-page px-4 py-3 text-primary placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="cursor-pointer whitespace-nowrap rounded-md bg-mauve px-6 py-3 font-semibold text-page transition-colors hover:bg-purple-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Submitting…" : "Subscribe"}
        </button>
      </form>

      <div className="mt-3 min-h-6">
        {feedback ? (
          <p
            role="status"
            aria-live="polite"
            className={`text-sm ${
              status === "success" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {feedback}
          </p>
        ) : null}
      </div>
    </div>
  );
}
