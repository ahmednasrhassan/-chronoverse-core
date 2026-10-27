import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";
import { NewsletterSignupPause } from "./NewsletterSignupPause";
import { AwsNewsletterRegistration } from "./AwsNewsletterRegistration";

export default function NewsletterForm() {
  return NEWSLETTER_SIGNUPS_PAUSED ? <NewsletterSignupPause /> : <AwsNewsletterRegistration />;
}
