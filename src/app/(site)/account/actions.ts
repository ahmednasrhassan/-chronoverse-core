"use server";

import { redirect } from "next/navigation";

import {
  requestEmailOtpV1,
  signOutAndGetDestinationV1,
  type EmailOtpRequestStateV1,
} from "@/lib/auth/flow";
import { createSupabaseServerClientV1 } from "@/lib/auth/supabase/server";

export async function requestEmailOtpActionV1(
  _previousState: EmailOtpRequestStateV1,
  formData: FormData,
): Promise<EmailOtpRequestStateV1> {
  try {
    const supabase = await createSupabaseServerClientV1();

    return requestEmailOtpV1(
      formData,
      (credentials) => supabase.auth.signInWithOtp(credentials),
    );
  } catch {
    return {
      status: "error",
      message: "We could not send a sign-in link. Please try again shortly.",
    };
  }
}

export async function signOutActionV1(): Promise<never> {
  let destination = "/account?authError=signout";

  try {
    const supabase = await createSupabaseServerClientV1();
    destination = await signOutAndGetDestinationV1(
      () => supabase.auth.signOut(),
    );
  } catch {
    // The fixed Account destination displays a generic error.
  }

  redirect(destination);
}
