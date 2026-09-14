"use client";

import { useState } from "react";

export default function ManageSubscriptionButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function openPortal(): Promise<void> {
    if (pending) return;

    setPending(true);
    setMessage("Opening secure subscription management…");

    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });

      if (response.status === 401) {
        window.location.assign("/account");
        return;
      }

      const payload = await response.json() as unknown;

      if (!response.ok || !isSafePortalResponse(payload)) {
        throw new Error("Portal unavailable");
      }

      window.location.assign(payload.url);
    } catch {
      setPending(false);
      setMessage(
        "Subscription management is temporarily unavailable. Please try again.",
      );
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={pending}
        onClick={() => void openPortal()}
        className="rounded-md border border-purple-border bg-purple-brand px-5 py-3 text-sm font-semibold text-[#050506] transition hover:bg-mauve disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Opening subscription management…" : "Manage subscription"}
      </button>
      <p
        className="mt-3 min-h-6 text-sm text-secondary"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  );
}

function isSafePortalResponse(
  value: unknown,
): value is { readonly url: string } {
  if (!isRecord(value) || typeof value.url !== "string") return false;

  try {
    const url = new URL(value.url);
    const hostname = url.hostname.toLowerCase();

    return url.protocol === "https:" && url.username.length === 0 &&
      url.password.length === 0 &&
      (url.port.length === 0 || url.port === "443") &&
      hostname.endsWith(".lemonsqueezy.com") && url.pathname !== "/" &&
      url.hash.length === 0;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
