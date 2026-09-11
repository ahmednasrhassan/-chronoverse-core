"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  INITIAL_EMAIL_OTP_STATE_V1,
} from "@/lib/auth/flow";

import { requestEmailOtpActionV1 } from "./actions";

export default function EmailOtpForm() {
  const [state, action] = useActionState(
    requestEmailOtpActionV1,
    INITIAL_EMAIL_OTP_STATE_V1,
  );

  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label
          htmlFor="account-email"
          className="mb-2 block text-sm font-medium text-secondary"
        >
          Email address
        </label>
        <input
          id="account-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={320}
          className="w-full rounded-md border border-border bg-raised px-4 py-3 text-primary outline-none transition focus:border-purple-border focus:ring-2 focus:ring-purple-brand/30"
          placeholder="you@example.com"
        />
      </div>

      <SubmitButton />

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error"
            ? "text-sm text-red-300"
            : "text-sm text-secondary"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-purple-border bg-purple-brand px-5 py-3 text-sm font-semibold text-[#050506] transition hover:bg-mauve disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Sending…" : "Email me a sign-in link"}
    </button>
  );
}
