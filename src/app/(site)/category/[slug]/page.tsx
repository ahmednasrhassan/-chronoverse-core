import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  type CategoryPageContentV1,
  getAllCategories,
  getSanityCategoryPageBySlugV1,
  stripHtml,
} from "@/lib/content";
import { buildPublicPageMetadata } from "@/lib/seo/metadata";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Category content is refreshed on-demand when Sanity publishes,
// updates, or deletes a post through `/api/revalidate`.
export async function generateStaticParams() {
  const categories = await getAllCategories();
  return categories.map((category) => ({
    slug: category.slug || "general",
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = requirePopulatedCategoryV1(
    await getSanityCategoryPageBySlugV1(slug),
  );

  return buildCategoryMetadataV1(category);
}

export function buildCategoryMetadataV1(
  category: CategoryPageContentV1,
): Metadata {
  const description = category.description || category.title;

  return buildPublicPageMetadata({
    title: category.title,
    description,
    pathname: `/category/${category.slug}`,
  });
}

export function requirePopulatedCategoryV1(
  category: CategoryPageContentV1 | null,
): CategoryPageContentV1 {
  if (category === null || category.articles.length === 0) {
    notFound();
  }

  return category;
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = requirePopulatedCategoryV1(
    await getSanityCategoryPageBySlugV1(slug),
  );
  const articles = category.articles;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-12 border-b border-border pb-8">
        <span className="bg-[#C8A7E8]/15 text-[#C8A7E8] px-3 py-1 rounded-md text-xs font-semibold border border-[#C8A7E8]/30 inline-block mb-4 uppercase tracking-wider">
          Category
        </span>
        <h1 className="text-4xl font-bold text-[#F3EBDD] mb-4 capitalize">
          {category.title}
        </h1>
        {category.description ? (
          <p className="text-[#CFC5B8] text-lg mb-3">
            {category.description}
          </p>
        ) : null}
        <p className="text-[#CFC5B8] text-lg">
          {articles.length} {articles.length === 1 ? "article" : "articles"} filed under this category.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => {
          const summary = stripHtml(
            article.legacyBody || article.bodyContent || article.content || ""
          ).slice(0, 140);

          return (
            <Link
              key={article.slug}
              href={`/${article.slug}`}
              className="bg-[#0D0D11] border border-border rounded-xl p-6 hover:border-[#C8A7E8]/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#CFC5B8] mb-3">
                  <span className="px-2.5 py-1 rounded-md bg-[#C8A7E8]/15 text-[#C8A7E8] border border-[#C8A7E8]/30 font-medium">
                    {article.category || category.title}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-[#F3EBDD] mb-3 hover:text-[#C8A7E8] transition-colors">
                  {article.title}
                </h2>
                <p className="text-[#CFC5B8] text-sm mb-6 line-clamp-3">
                  {summary}
                  {summary.length >= 140 ? "…" : ""}
                </p>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-[#CFC5B8]">
                <span>{article.date}</span>
                <span className="text-[#C8A7E8] font-semibold">Read Article →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
