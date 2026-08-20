import Link from 'next/link';
import { getSanityArticles, stripHtml, calculateReadTime } from '@/lib/content';

/**
 * Research & Intelligence Reports
 * --------------------------------
 * Fully dynamic: fetches every published post directly from Sanity via
 * `getSanityArticles()` (see `src/lib/content.ts`). No hardcoded article
 * data — the report cards below (title, category, summary, date, read
 * time) are all derived live from the CMS.
 */
export const revalidate = 60;

export default async function ReportsPage() {
  const articles = await getSanityArticles();

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-12 border-b border-[#27272a] pb-8">
        <h1 className="text-4xl font-bold text-[#f4f4f5] mb-4">
          Research & <span className="text-[#c87d55]">Intelligence Reports</span>
        </h1>
        <p className="text-[#a1a1aa] text-lg">
          Institutional-grade research, macro liquidity analysis, and cyclical dynamics.
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-10 text-center text-[#a1a1aa]">
          No reports have been published yet. Check back soon.
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => {
            const rawText = stripHtml(
              article.legacyBody || article.bodyContent || article.content || ''
            );
            const summary = rawText.length > 160 ? `${rawText.slice(0, 160)}...` : rawText;
            const readTime = `${calculateReadTime(rawText)} min read`;

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
                    <span>{readTime}</span>
                  </div>
                  <h2 className="text-xl font-bold text-[#f4f4f5] mb-3 hover:text-[#c87d55] transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-[#a1a1aa] text-sm mb-6 line-clamp-3">{summary}</p>
                </div>

                <div className="pt-4 border-t border-[#27272a] flex items-center justify-between text-xs text-[#a1a1aa]">
                  <span>{article.date}</span>
                  <span className="text-[#c87d55] font-semibold hover:underline">Read Report →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
