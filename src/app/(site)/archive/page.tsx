import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getArchivePage,
  parseArchivePage,
  type ArchivePost,
} from "@/lib/archive";
import { DEFAULT_CATEGORY, DEFAULT_CATEGORY_SLUG } from "@/lib/content";

export const metadata: Metadata = {
  title: "Archive",
  description:
    "Directory of published Chronoverse research organized by editorial category.",
  robots: {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
    },
  },
};

/**
 * Intelligence Archive Index
 * ----------------------------
 * Pulls one bounded page of published `post` documents from Sanity. Posts
 * are then grouped server-side (in this server
 * component) by their category for display — no hardcoded section/post
 * data is used anywhere on this page. One lookahead row determines whether
 * a next page exists without a separate collection-count query.
 *
 * This page is refreshed on-demand when Sanity publishes, updates,
 * or deletes a post through `/api/revalidate`.
 */

interface ArchiveIndexPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

export default async function ArchiveIndexPage({
  searchParams,
}: ArchiveIndexPageProps) {
  const page = parseArchivePage((await searchParams).page);
  const { posts, hasNext } = await getArchivePage(page);

  // Group the flat list of posts into per-category sections, preserving
  // first-seen order (which mirrors the `publishedAt desc` sort already
  // applied by the GROQ query above).
  const sectionsMap = new Map<
    string,
    {
      category: { title: string; slug: string; href?: string };
      posts: ArchivePost[];
    }
  >();

  for (const post of posts) {
    const categoryTitle = post.category || DEFAULT_CATEGORY;
    const categorySlug = post.categorySlug || DEFAULT_CATEGORY_SLUG;
    const categoryHref = post.category && post.categorySlug
      ? `/category/${post.categorySlug}`
      : undefined;

    if (!sectionsMap.has(categorySlug)) {
      sectionsMap.set(categorySlug, {
        category: {
          title: categoryTitle,
          slug: categorySlug,
          href: categoryHref,
        },
        posts: [],
      });
    }
    const section = sectionsMap.get(categorySlug)!;
    if (!section.category.href && categoryHref) {
      section.category.href = categoryHref;
    }
    section.posts.push(post);
  }

  const populatedSections = Array.from(sectionsMap.values());

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10 font-mono">

      {/* Header */}
      <header className="border-b border-border pb-8 space-y-2">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-semibold border border-[#C8A7E8]/30 inline-block">
          SYSTEM DIRECTORY
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD]">
          Intelligence <span className="text-[#C8A7E8]">Archive Index</span>
        </h1>
        <p className="text-[#CFC5B8] text-sm font-sans">
          Directory of published Chronoverse research, organized by its
          recorded editorial category.
        </p>
      </header>

      {/* Directory Sections */}
      {populatedSections.length === 0 ? (
        <div className="bg-[#0D0D11] border border-border rounded-xl p-10 text-center text-[#CFC5B8]">
          No archived content available yet. Check back soon.
        </div>
      ) : (
        <div className="space-y-10">
          {populatedSections.map((section) => (
            <section key={section.category.slug} className="space-y-4">
              <h2 className="text-sm font-bold text-[#C8A7E8] tracking-wider uppercase flex items-center justify-between gap-2 border-b border-border pb-2">
                <span className="flex items-center gap-2">
                  <span>[PATH]</span> {section.category.title}
                </span>
                {section.category.href ? (
                  <Link
                    href={section.category.href}
                    className="text-[10px] text-muted hover:text-[#C8A7E8] normal-case font-sans transition-colors"
                  >
                    View all →
                  </Link>
                ) : (
                  <span className="text-[10px] text-muted normal-case font-sans">
                    Uncategorized
                  </span>
                )}
              </h2>

              <ul className="divide-y divide-border/60">
                {section.posts.map((post) => (
                  <li
                    key={post.slug}
                    className="py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:bg-[#0D0D11] px-3 rounded-lg transition-colors group cursor-pointer"
                  >
                    <Link
                      href={`/${post.slug}`}
                      className="text-[#F3EBDD] text-sm font-medium group-hover:text-[#C8A7E8] transition-colors leading-snug"
                    >
                      {post.title}
                    </Link>
                    <time className="text-xs text-[#CFC5B8] font-mono whitespace-nowrap">
                      [{post.date ? new Date(post.date).toISOString().split("T")[0] : "—"}]
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {(page > 1 || hasNext) && (
        <nav
          aria-label="Archive pagination"
          className="flex items-center justify-between gap-4 border-t border-border pt-6 text-sm"
        >
          {page > 1 ? (
            <Link
              href={page === 2 ? "/archive" : `/archive?page=${page - 1}`}
              aria-label={`View archive page ${page - 1}`}
              className="text-[#C8A7E8] hover:text-[#F3EBDD] transition-colors"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">Page {page}</span>
          {hasNext ? (
            <Link
              href={`/archive?page=${page + 1}`}
              aria-label={`View archive page ${page + 1}`}
              className="text-[#C8A7E8] hover:text-[#F3EBDD] transition-colors"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}

      {/* Footer Info */}
      <footer className="border-t border-border pt-8 text-center text-xs text-muted">
        {"// Chronoverse Intelligence Ledger | Automated Directory Node //"}
      </footer>

    </div>
  );
}
