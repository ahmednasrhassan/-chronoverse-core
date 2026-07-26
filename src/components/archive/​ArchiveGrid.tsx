import React from 'react';
import Link from 'next/link';

export interface Article {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
  category?: string;
  excerpt?: string;
}

interface ArchiveGridProps {
  articles: Article[];
}

export default function ArchiveGrid({ articles }: ArchiveGridProps) {
  if (!articles || articles.length === 0) {
    return (
      <div className="text-center py-16 p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
        <p className="text-base text-[var(--text-secondary)] mb-2">No research reports found in the archive.</p>
        <p className="text-xs text-zinc-500">Try adjusting your search query or filter settings.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {articles.map((article) => (
        <article
          key={article.id}
          className="p-5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent-copper)] transition-all duration-200 flex flex-col justify-between group shadow-sm hover:shadow-md"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-3">
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--accent-copper)]/10 text-[var(--accent-copper)] font-medium">
                {article.category || "Research"}
              </span>
              <time className="text-zinc-400">
                {article.publishedAt
                  ? new Date(article.publishedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'N/A'}
              </time>
            </div>

            <h3 className="text-lg font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-copper)] transition-colors line-clamp-2 leading-snug">
              <Link href={`/articles/${article.slug}`}>
                {article.title}
              </Link>
            </h3>

            {article.excerpt && (
              <p className="mt-2.5 text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                {article.excerpt}
              </p>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--border-color)] flex items-center justify-between">
            <Link
              href={`/articles/${article.slug}`}
              className="text-xs font-semibold text-[var(--accent-copper)] hover:text-[var(--accent-copper-hover)] transition-colors flex items-center gap-1"
            >
              Read Full Report
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}