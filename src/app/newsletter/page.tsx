import { NEWSLETTER_SIGNUPS_PAUSED } from "@/config/newsletterAvailability";
import { NewsletterSignupPause } from "@/components/NewsletterSignupPause";
import { AwsNewsletterRegistration } from "@/components/AwsNewsletterRegistration";

export default function NewsletterPage() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-[#050506]">
      <div className="max-w-lg w-full bg-[#0D0D11] border border-border rounded-2xl p-8 md:p-10 shadow-2xl shadow-black/40">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#C8A7E8] bg-[#C8A7E8]/10 px-3 py-1.5 rounded-full border border-[#C8A7E8]/20">
          Chronoverse Dispatch
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary mt-4 mb-6 tracking-tight">
          Chronoverse Newsletter
        </h1>
        {NEWSLETTER_SIGNUPS_PAUSED ? <NewsletterSignupPause /> : <AwsNewsletterRegistration />}
      </div>
    </main>
  );
}
