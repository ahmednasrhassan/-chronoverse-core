import React from "react";
import Link from "next/link";
import { client } from "@/sanity/client";
import { DEFAULT_CATEGORY, DEFAULT_CATEGORY_SLUG } from "@/lib/content";

/**
 * Intelligence Archive Index
 * ----------------------------
 * Pulls every published `post` document directly from Sanity via a single
 * GROQ query. Posts are then grouped server-side (in this server
 * component) by their category for display — no hardcoded section/post
 * data is used anywhere on this page.
 *
 * Uses Incremental Static Regeneration (revalidated at most once every 60
 * seconds) instead of a zero-cache `force-dynamic` render, so this page is
 * served instantly from cache while still staying reasonably fresh after
 * new articles are published.
 */
export const revalidate = 60;

interface ArchivePost {
  slug: string;
  title: string;
  date: string | null;
  category: string | null;
  categorySlug: string | null;
}

async function getAllPublishedPosts(): Promise<ArchivePost[]> {
  const query = `*[_type == "post" && defined(slug.current) && publishedAt <= now()] | order(publishedAt desc) {
    "slug": slug.current,
    title,
    "date": publishedAt,
    "category": category->title,
    "categorySlug": category->slug.current
  }`;

  try {
    const posts = await client.fetch<ArchivePost[]>(query);
    return posts || [];
  } catch (error) {
    console.warn("Sanity fetch for archive posts failed:", error);
    return [];
  }
}

export default async function ArchiveIndexPage() {
  const posts = await getAllPublishedPosts();

  // Group the flat list of posts into per-category sections, preserving
  // first-seen order (which mirrors the `publishedAt desc` sort already
  // applied by the GROQ query above).
  const sectionsMap = new Map<
    string,
    { category: { title: string; slug: string }; posts: ArchivePost[] }
  >();

  for (const post of posts) {
    const categoryTitle = post.category || DEFAULT_CATEGORY;
    const categorySlug = post.categorySlug || DEFAULT_CATEGORY_SLUG;

    if (!sectionsMap.has(categorySlug)) {
      sectionsMap.set(categorySlug, {
        category: { title: categoryTitle, slug: categorySlug },
        posts: [],
      });
    }
    sectionsMap.get(categorySlug)!.posts.push(post);
  }

  const populatedSections = Array.from(sectionsMap.values());

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
                      [{post.date ? new Date(post.date).toISOString().split("T")[0] : "—"}]
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
        {"// Chronoverse Intelligence Ledger | Automated Directory Node //"}
      </footer>

    </div>
  );
}
