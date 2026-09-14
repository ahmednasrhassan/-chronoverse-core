"use client";

import { useState } from "react";

type CheckoutPlan = "monthly" | "annual";

const CHECKOUT_OPTIONS: ReadonlyArray<{
  readonly plan: CheckoutPlan;
  readonly label: string;
  readonly price: string;
}> = [
  { plan: "monthly", label: "Choose monthly", price: "$15.99 monthly" },
  { plan: "annual", label: "Choose annual", price: "$150.99 annually" },
];

export default function CheckoutButtons() {
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);
  const [message, setMessage] = useState("");

  async function beginCheckout(plan: CheckoutPlan): Promise<void> {
    if (pendingPlan !== null) return;

    setPendingPlan(plan);
    setMessage("Creating your secure checkout…");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (response.status === 401) {
        window.location.assign("/account");
        return;
      }

      const payload = await response.json() as unknown;

      if (!response.ok || !isCheckoutResponse(payload)) {
        throw new Error("Checkout unavailable");
      }

      window.location.assign(payload.url);
    } catch {
      setPendingPlan(null);
      setMessage("Checkout is temporarily unavailable. Please try again.");
    }
  }

  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {CHECKOUT_OPTIONS.map((option) => (
          <button
            key={option.plan}
            type="button"
            disabled={pendingPlan !== null}
            onClick={() => void beginCheckout(option.plan)}
            aria-label={`${option.label} VIP checkout at ${option.price}`}
            className="rounded-md border border-purple-border bg-purple-brand px-5 py-3 text-sm font-semibold text-[#050506] transition hover:bg-mauve disabled:cursor-wait disabled:opacity-60"
          >
            {pendingPlan === option.plan ? "Opening checkout…" : option.price}
          </button>
        ))}
      </div>
      <p className="mt-3 min-h-6 text-sm text-secondary" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

function isCheckoutResponse(value: unknown): value is { readonly url: string } {
  return typeof value === "object"
    && value !== null
    && "url" in value
    && typeof value.url === "string";
}
