import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";
import { registrationHandler } from "@/lib/newsletterAws/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signup remains unavailable until the AWS transport is verified.
export const POST = registrationHandler(NEWSLETTER_SIGNUPS_PAUSED, async () => {
  throw new Error("registration_unavailable");
});
