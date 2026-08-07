import React from "react";
import Link from "next/link";
import { getAllCategories, getSanityArticlesByCategorySlug } from "@/lib/content";

/**
 * Intelligence Archive Index
 * ----------------------------
 * Fully dynamic: pulls the live list of categories from Sanity via
 * `getAllCategories()`, then fetches each category's articles via GROQ
 * using `getSanityArticlesByCategorySlug(slug)` (see `src/lib/content.ts`).
 * Categories with zero published posts are skipped automatically — no
 * hardcoded section/post data is used anywhere on this page.
 */
export const revalidate = 60;

export default async function ArchiveIndexPage() {
  const categories = await getAllCategories();

  const sections = await Promise.all(
    categories.map(async (category) => {
      const posts = await getSanityArticlesByCategorySlug(category.slug);
      return { category, posts };
    })
  );

  const populatedSections = sections.filter((section) => section.posts.length > 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10 font-mono">

      {/* Header */}
      <header className="border-b border-[#27272a] pb-8 space-y-2">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-semibold border border-[#c87d55]/30 inline-block">
          SYSTEM DIRECTORY
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5]">
          Intelligence <span className="text-[#c87d55]">Archive Index</span>
        </h1>
        <p className="text-[#a1a1aa] text-sm font-sans">
          Full directory of all strategic dossiers, proprietary research assets, and historical intelligence — synced live from the CMS.
        </p>
      </header>

      {/* Directory Sections */}
      {populatedSections.length === 0 ? (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-10 text-center text-[#a1a1aa]">
          No archived content available yet. Check back soon.
        </div>
      ) : (
        <div className="space-y-10">
          {populatedSections.map((section) => (
            <section key={section.category.slug} className="space-y-4">
              <h2 className="text-sm font-bold text-[#c87d55] tracking-wider uppercase flex items-center justify-between gap-2 border-b border-[#27272a] pb-2">
                <span className="flex items-center gap-2">
                  <span>[PATH]</span> {section.category.title}
                </span>
                <Link
                  href={`/category/${section.category.slug}`}
                  className="text-[10px] text-zinc-500 hover:text-[#c87d55] normal-case font-sans transition-colors"
                >
                  View all →
                </Link>
              </h2>

              <ul className="divide-y divide-[#27272a]/60">
                {section.posts.slice(0, 5).map((post) => (
                  <li
                    key={post.slug}
                    className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-[#18181b] px-3 rounded-lg transition-colors group cursor-pointer"
                  >
                    <Link
                      href={`/${post.slug}`}
                      className="text-[#f4f4f5] text-sm font-medium group-hover:text-[#c87d55] transition-colors leading-snug"
                    >
                      {post.title}
                    </Link>
                    <time className="text-xs text-[#a1a1aa] font-mono whitespace-nowrap">
                      [{post.date}]
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Footer Info */}
      <footer className="border-t border-[#27272a] pt-8 text-center text-xs text-[#52525b]">
        // ChronoVerse Intelligence Ledger | Automated Directory Node //
      </footer>

    </div>
  );
}
