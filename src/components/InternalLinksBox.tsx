import React from "react";
import Link from "next/link";
import type { ContentItem } from "@/lib/content";

interface InternalLinksBoxProps {
  /** 6–8 related articles fetched via GROQ (see getRelatedArticles). */
  articles?: ContentItem[];
  /** Optional heading override. */
  title?: string;
}

function cleanText(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") {
    return input.replace(/<[^>]*>?/gm, "").trim();
  }
  return "";
}

/**
 * InternalLinksBox
 * -----------------
 * Automated internal-linking block placed at the bottom of individual post
 * templates. Renders a themed grid of 6–8 related articles matching the
 * current post's category and/or tags (see `getRelatedArticles` in
 * `src/lib/content.ts`), improving crawlability and topical SEO clustering.
 *
 * Styled to match the site's dark theme + copper (#c87d55) accent used
 * throughout `app/(site)/[slug]/page.tsx`.
 */
export default function InternalLinksBox({
  articles = [],
  title = "Recommended Reading",
}: InternalLinksBoxProps) {
  if (!articles || articles.length === 0) return null;

  const displayArticles = articles.slice(0, 8);

  return (
    <section
      className="mt-16 pt-10 border-t border-zinc-800 print:hidden"
      aria-labelledby="internal-links-heading"
    >
      <h2
        id="internal-links-heading"
        className="text-2xl font-bold text-zinc-100 mb-6 flex items-center gap-2 tracking-tight"
      >
        <span className="text-[#c87d55]" aria-hidden="true">
          📚
        </span>{" "}
        {title}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {displayArticles.map((article, idx) => {
          const rawSlug: unknown = article?.slug;
          const slugString =
            typeof rawSlug === "string"
              ? rawSlug
              : typeof rawSlug === "object" && rawSlug !== null && "current" in rawSlug
              ? String((rawSlug as { current: unknown }).current || "")
              : "";

          if (!slugString) return null;

          const itemObj: unknown = article;
          const record = itemObj as Record<string, unknown>;

          const rawExcerpt =
            (typeof record.excerpt === "string" && record.excerpt) ||
            (typeof record.description === "string" && record.description) ||
            cleanText(record.legacyBody || record.bodyContent || record.content || "");

          return (
            <Link
              key={`${slugString}-${idx}`}
              href={`/${slugString}`}
              className="group flex flex-col justify-between p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/60 hover:border-[#c87d55]/60 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <div>
                {article.category && (
                  <span className="text-[10px] uppercase font-bold text-[#c87d55] tracking-widest mb-3 block">
                    {article.category}
                  </span>
                )}
                <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white mb-2 line-clamp-2 leading-snug">
                  {article.title}
                </h3>
              </div>

              {rawExcerpt && (
                <p className="text-xs text-zinc-400 line-clamp-2 mt-3 pt-3 border-t border-zinc-800/50">
                  {rawExcerpt.substring(0, 90)}…
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
