import { NextResponse } from "next/server";
import {
  NEWSLETTER_SIGNUPS_PAUSED,
  NEWSLETTER_SIGNUP_PAUSE_MESSAGE,
} from "@/config/newsletterAvailability";
import { handleNewsletterSignup } from "@/lib/newsletter/signup";

export async function POST(request: Request) {
  // Reject before reading the address or constructing a storage client. Neither
  // existing records nor delivery environment settings can bypass this pause.
  if (NEWSLETTER_SIGNUPS_PAUSED) {
    return NextResponse.json(
      { status: "paused", code: "newsletter_signups_paused", message: NEWSLETTER_SIGNUP_PAUSE_MESSAGE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handleNewsletterSignup(request);
}
