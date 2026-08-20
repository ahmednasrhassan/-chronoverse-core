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

      let data: { status?: string; message?: string } = {};
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
        setFeedback(data.message || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setFeedback("Network error. Please try again shortly.");
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full">
        <input
          type="email"
          aria-label="Corporate email address"
          placeholder="Enter your corporate email address"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-[#120e0c] border border-zinc-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#c87d55] focus:ring-1 focus:ring-[#c87d55] transition-all placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-[#c87d55] hover:bg-[#b06a43] text-zinc-950 font-bold px-8 py-3 rounded-lg transition-colors whitespace-nowrap shadow-lg shadow-[#c87d55]/20 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Submitting…" : "Subscribe Now"}
        </button>
      </form>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-4 text-sm font-medium ${
            status === "success" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}
