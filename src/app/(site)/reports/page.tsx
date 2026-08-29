import Link from 'next/link';
import { getSanityArticles, stripHtml, calculateReadTime } from '@/lib/content';

/**
 * Research & Intelligence Reports
 * --------------------------------
 * Fetches every published post directly from Sanity via
 * `getSanityArticles()` (see `src/lib/content.ts`). No hardcoded article
 * data — the report cards below (title, category, summary, date, read
 * time) are refreshed on-demand when Sanity publishes, updates, or deletes
 * a post through `/api/revalidate`.
 */

export default async function ReportsPage() {
  const articles = await getSanityArticles();

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="mb-12 border-b border-border pb-8">
        <h1 className="text-4xl font-bold text-[#F3EBDD] mb-4">
          Research & <span className="text-[#C8A7E8]">Intelligence Reports</span>
        </h1>
        <p className="text-[#CFC5B8] text-lg">
          Institutional-grade research, macro liquidity analysis, and cyclical dynamics.
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="bg-[#0D0D11] border border-border rounded-xl p-10 text-center text-[#CFC5B8]">
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
                className="bg-[#0D0D11] border border-border rounded-xl p-6 hover:border-[#C8A7E8]/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[#CFC5B8] mb-3">
                    <span className="px-2.5 py-1 rounded-md bg-[#C8A7E8]/15 text-[#C8A7E8] border border-[#C8A7E8]/30 font-medium">
                      {article.category}
                    </span>
                    <span>{readTime}</span>
                  </div>
                  <h2 className="text-xl font-bold text-[#F3EBDD] mb-3 hover:text-[#C8A7E8] transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-[#CFC5B8] text-sm mb-6 line-clamp-3">{summary}</p>
                </div>

                <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-[#CFC5B8]">
                  <span>{article.date}</span>
                  <span className="text-[#C8A7E8] font-semibold hover:underline">Read Report →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}