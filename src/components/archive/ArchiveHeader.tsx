import React from "react";

interface ArchiveHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalArticles: number;
}

export default function ArchiveHeader({
  searchQuery,
  onSearchChange,
  totalArticles,
}: ArchiveHeaderProps) {
  return (
    <div className="py-8 mb-6 border-b border-border">
      <div className="max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-copper/10 text-copper text-xs font-semibold mb-4">
          <span>Historical Research</span>
          <span className="w-1.5 h-1.5 rounded-full bg-copper"></span>
          <span>{totalArticles} Reports Available</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-primary mb-3">
          Chronoverse Capital Archive
        </h1>
        <p className="text-sm sm:text-base text-secondary leading-relaxed mb-6">
          Explore historical macroeconomic analysis, asset allocation intelligence, and market reports saved over time.
        </p>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            aria-label="Search reports by keyword, topic, or ticker"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search reports by keyword, topic, or ticker..."
            className="w-full bg-card border border-border text-sm text-primary placeholder-secondary rounded-xl px-4 py-3 pl-11 focus:outline-none focus:border-copper transition-all shadow-inner"
          />
          <svg
            className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
