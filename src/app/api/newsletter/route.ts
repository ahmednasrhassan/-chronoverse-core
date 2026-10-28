import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";
import { registrationHandler } from "@/lib/newsletterAws/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// No credential lookup, request body read or AWS call while the code pause holds.
export const POST = registrationHandler(NEWSLETTER_SIGNUPS_PAUSED, async body => {
  const { submitFromVercel } = await import("@/lib/newsletterAws/vercelRegistration");
  return submitFromVercel(body);
});
