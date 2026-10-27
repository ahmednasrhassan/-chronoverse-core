import { NEWSLETTER_REGISTER_URL } from "@/config/newsletterAvailability";
import Link from "next/link";

export function AwsNewsletterRegistration() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p className="text-muted">
        Subscribe on our secure AWS registration page. AWS handles your email,
        consent, confirmation and unsubscribe preferences. Weekly research is sent only after you confirm your subscription.
      </p>
      <a href={NEWSLETTER_REGISTER_URL} referrerPolicy="no-referrer"
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#A77BD8] px-6 py-3 font-semibold text-[#050506] transition-colors hover:bg-[#C8A7E8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8A7E8]">
        Subscribe
      </a>
      <p className="text-xs text-muted">Registration continues on AWS. A confirmation email is required before you subscribe. You can unsubscribe at any time.</p>
      <Link href="/privacy-policy" className="text-[#C8A7E8] underline underline-offset-4">Privacy policy</Link>
    </div>
  );
}
