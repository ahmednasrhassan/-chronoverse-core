import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getAllCategories,
  getSanityArticlesByCategorySlug,
  stripHtml,
} from "@/lib/content";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Automated Category Article Feed
 * --------------------------------
 * Every category page is generated dynamically from Sanity: the list of
 * valid category slugs comes from `getAllCategories()`, and the articles
 * shown on each page are fetched live via GROQ using
 * `getSanityArticlesByCategorySlug(slug)` (see `src/lib/content.ts`).
 * Nothing here is hardcoded — adding a new category document + tagging
 * posts with it in Sanity Studio is enough for a fully working
 * `/category/[slug]` feed with zero code changes.
 */
export async function generateStaticParams() {
  const categories = await getAllCategories();
  return categories.map((category) => ({
    slug: category.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getAllCategories();
  const category = categories.find((c) => c.slug === slug);
  const title = category?.title || slug.replace(/-/g, " ");

  return {
    title: `${title} | Chronoverse Intelligence`,
    description: `Latest ${title} articles, research, and intelligence briefings from ChronoVerse Capital.`,
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;

  const [categories, articles] = await Promise.all([
    getAllCategories(),
    getSanityArticlesByCategorySlug(slug),
  ]);

  const category = categories.find((c) => c.slug === slug);
  const categoryTitle = category?.title || slug.replace(/-/g, " ");

  if (!category && articles.length === 0) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-12 border-b border-[#27272a] pb-8">
        <span className="bg-[#c87d55]/15 text-[#c87d55] px-3 py-1 rounded-md text-xs font-semibold border border-[#c87d55]/30 inline-block mb-4 uppercase tracking-wider">
          Category
        </span>
        <h1 className="text-4xl font-bold text-[#f4f4f5] mb-4 capitalize">
          {categoryTitle}
        </h1>
        <p className="text-[#a1a1aa] text-lg">
          {articles.length} {articles.length === 1 ? "article" : "articles"} filed under this category.
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-10 text-center text-[#a1a1aa]">
          No articles have been published in this category yet. Check back soon.
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => {
            const summary = stripHtml(
              article.legacyBody || article.bodyContent || article.content || ""
            ).slice(0, 140);

            return (
              <Link
                key={article.slug}
                href={`/${article.slug}`}
                className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 hover:border-[#c87d55]/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[#a1a1aa] mb-3">
                    <span className="px-2.5 py-1 rounded-md bg-[#c87d55]/15 text-[#c87d55] border border-[#c87d55]/30 font-medium">
                      {article.category}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-[#f4f4f5] mb-3 hover:text-[#c87d55] transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-[#a1a1aa] text-sm mb-6 line-clamp-3">
                    {summary}
                    {summary.length >= 140 ? "…" : ""}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#27272a] flex items-center justify-between text-xs text-[#a1a1aa]">
                  <span>{article.date}</span>
                  <span className="text-[#c87d55] font-semibold">Read Article →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
