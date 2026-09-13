import type { ReactNode } from "react";

interface InstitutionalPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly children: ReactNode;
}

interface InstitutionalSectionProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function InstitutionalPage({
  eyebrow,
  title,
  summary,
  children,
}: InstitutionalPageProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="max-w-3xl border-b border-border pb-10">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-mauve">
          {eyebrow}
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
          {title}
        </h1>
        <p className="mt-5 text-base leading-7 text-secondary">{summary}</p>
      </header>
      <div className="mt-10 grid min-w-0 gap-5 break-words">{children}</div>
    </div>
  );
}

export function InstitutionalSection({
  title,
  children,
}: InstitutionalSectionProps) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      <div className="mt-3 min-w-0 space-y-3 break-words text-sm leading-6 text-secondary [&_a]:rounded-sm [&_a]:font-medium [&_a]:text-mauve [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-mauve [&_a:hover]:text-primary">
        {children}
      </div>
    </section>
  );
}
