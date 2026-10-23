import Link from "next/link";

export function NewsletterSignupPause() {
  return (
    <div className="space-y-4 border-l-2 border-[#A77BD8] pl-5 text-sm leading-relaxed">
      <p className="font-semibold text-primary">
        Newsletter signups are temporarily paused.
      </p>
      <p className="text-muted">
        Newsletter delivery is currently suspended, and we are not accepting
        new subscriptions. Published research remains available on the website.
      </p>
      <Link
        href="/reports"
        className="inline-block font-semibold text-[#C8A7E8] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8A7E8]"
      >
        Read published research
      </Link>
    </div>
  );
}
