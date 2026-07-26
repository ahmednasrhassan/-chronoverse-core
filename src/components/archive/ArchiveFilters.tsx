"use client";

import React from "react";

interface ArchiveFiltersProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
}

export default function ArchiveFilters({
  categories,
  selectedCategory,
  onSelectCategory,
  selectedYear,
  onSelectYear,
}: ArchiveFiltersProps) {
  const years = ["All", "2026", "2025", "2024", "2023"];

  return (
    <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-wrap gap-4 items-center justify-between mb-8">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-[var(--text-secondary)] font-medium mr-2">Category:</span>
        <button
          onClick={() => onSelectCategory("All")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            selectedCategory === "All"
              ? "bg-[var(--accent-copper)] text-white shadow-sm"
              : "bg-zinc-800/60 text-[var(--text-secondary)] hover:text-white hover:bg-zinc-800"
          }`}
        >
          All Categories
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onSelectCategory(category)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedCategory === category
                ? "bg-[var(--accent-copper)] text-white shadow-sm"
                : "bg-zinc-800/60 text-[var(--text-secondary)] hover:text-white hover:bg-zinc-800"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Year Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] font-medium">Year:</span>
        <select
          value={selectedYear}
          onChange={(e) => onSelectYear(e.target.value)}
          className="bg-zinc-800/80 border border-[var(--border-color)] text-xs text-[var(--text-primary)] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[var(--accent-copper)] transition-colors cursor-pointer"
        >
          {years.map((year) => (
            <option key={year} value={year} className="bg-zinc-900 text-white">
              {year === "All" ? "All Years" : year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}