import Link from "next/link";

import NewsletterForm from "@/components/NewsLetterForm";

export default function NewsletterPage() {
  return (
    <section aria-labelledby="newsletter-title" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20 lg:py-28">
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        <header>
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
            Independent perspectives
          </p>
          <h1 id="newsletter-title" className="max-w-xl text-4xl font-medium leading-tight tracking-tight text-primary sm:text-5xl lg:text-6xl">
            Chronoverse Capital Weekly
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-secondary sm:text-xl">
            Independent research and market insights, delivered to your inbox.
          </p>
          <p className="mt-5 max-w-lg leading-relaxed text-secondary">
            Make room for a considered view of economics, finance, and the forces
            shaping markets. Read our published research while subscriptions are
            temporarily unavailable.
          </p>
          <dl className="mt-9 grid grid-cols-2 gap-6 border-t border-border pt-6 text-sm">
            <div>
              <dt className="text-secondary">Frequency</dt>
              <dd className="mt-1 font-medium text-primary">Weekly</dd>
            </div>
            <div>
              <dt className="text-secondary">Subscription</dt>
              <dd className="mt-1 font-medium text-primary">Free to readers</dd>
            </div>
          </dl>
          <Link href="/reports" className="mt-8 inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mauve">
            Explore published research <span aria-hidden="true" className="ml-2">&rarr;</span>
          </Link>
        </header>

        <div className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/20 sm:p-9">
          <h2 className="text-2xl font-medium tracking-tight text-primary">Research worth making time for.</h2>
          <p className="mb-7 mt-3 text-sm leading-relaxed text-secondary">
            A weekly research newsletter, with your permission.
          </p>
          <NewsletterForm />
          <div className="mt-8 border-t border-border pt-6 text-sm leading-relaxed text-secondary">
            <h3 className="font-semibold text-primary">Confirm before you receive</h3>
            <p className="mt-2">
              When subscriptions reopen, please check your inbox and confirm your
              subscription to start receiving our weekly research. Submitting the
              form alone does not confirm a subscription.
            </p>
            <h3 className="mt-5 font-semibold text-primary">Unsubscribe</h3>
            <p className="mt-2">
              Confirmed subscribers can unsubscribe using the secure links in
              their emails. You do not need an account.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
