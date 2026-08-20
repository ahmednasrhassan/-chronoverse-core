"use client";

import React, { useMemo } from "react";

interface ArchiveFiltersProps {
  categories?: string[];
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  selectedYear?: string;
  onSelectYear?: (year: string) => void;
  // تم الإبقاء على الخاصيتين كـ optional لضمان عدم كسر أي ملف أب يمررهما
  initialArticles?: unknown[];
  articles?: unknown[];
}

export default function ArchiveFilters({
  categories = [],
  selectedCategory = "All",
  onSelectCategory = () => {},
  selectedYear = "All",
  onSelectYear = () => {},
}: ArchiveFiltersProps) {
  // توليد السنوات تلقائياً لتبدأ دائماً من السنة الحالية تنازلياً حتى 2023
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 2023;
    const dynamicYears = ["All"];
    for (let y = currentYear; y >= startYear; y--) {
      dynamicYears.push(y.toString());
    }
    return dynamicYears;
  }, []);

  // دالة مساعدة لتوحيد تنسيق الأزرار وتفادي تكرار نصوص Tailwind
  const getButtonClass = (isActive: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
      isActive
        ? "bg-copper text-white shadow-sm"
        : "bg-zinc-800/60 text-secondary hover:text-white hover:bg-zinc-800"
    }`;

  return (
    <div className="p-4 rounded-xl bg-card border border-border flex flex-wrap gap-4 items-center justify-between mb-8">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-secondary font-medium mr-2">Category:</span>
        <button
          onClick={() => onSelectCategory("All")}
          className={getButtonClass(selectedCategory === "All")}
        >
          All Categories
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onSelectCategory(category)}
            className={getButtonClass(selectedCategory === category)}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Year Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-secondary font-medium">Year:</span>
        <select
          value={selectedYear}
          onChange={(e) => onSelectYear(e.target.value)}
          className="bg-zinc-800/80 border border-border text-xs text-primary rounded-lg px-3 py-1.5 focus:outline-none focus:border-copper transition-colors cursor-pointer"
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
