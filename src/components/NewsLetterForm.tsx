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
      <form
        onSubmit={handleSubmit}
        className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <input
          type="email"
          aria-label="Email address"
          placeholder="you@company.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 border border-[#6F4C91] bg-[#0D0D11] px-4 py-3.5 text-sm text-[#F3EBDD] placeholder:text-[#91889A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506]"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="cursor-pointer whitespace-nowrap border border-[#A77BD8] bg-[#A77BD8] px-7 py-3.5 text-sm font-semibold text-[#050506] transition-colors hover:border-[#C8A7E8] hover:bg-[#C8A7E8] hover:text-[#050506] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A7E8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050506] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Submitting…" : "Subscribe"}
        </button>
      </form>

      <div className="mt-3 min-h-6 border-l border-[#6F4C91]/40 pl-3">
        {feedback ? (
          <p
            role="status"
            aria-live="polite"
            className={`text-xs ${
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
