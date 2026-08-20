"use client";

import React, { useState } from "react";
import Link from "next/link";

interface ArticleItem {
  _id: string;
  title: string;
  slug?: string | { current: string };
}

interface RelatedDropdownProps {
  articles?: ArticleItem[];
}

export default function RelatedDropdown({ articles = [] }: RelatedDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!articles || articles.length === 0) return null;

  return (
    <div className="my-6 border border-zinc-800 rounded-xl bg-[#181310] overflow-hidden">
      {/* Dropdown Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="related-links-list"
        className="w-full px-5 py-3.5 text-left flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:text-[#c87d55] transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <span className="text-[#c87d55]" aria-hidden="true">
            🔗
          </span>{" "}
          Related Context &amp; Research ({articles.length})
        </span>
        <span
          className={`transform transition-transform duration-200 text-zinc-400 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {/* Accordion Links List */}
      {isOpen && (
        <ul
          id="related-links-list"
          className="border-t border-zinc-800 divide-y divide-zinc-800/60 bg-black/20"
        >
          {articles.map((item, idx) => {
            const rawSlug = item.slug;
            const slugPath =
              typeof rawSlug === "string"
                ? rawSlug
                : typeof rawSlug === "object" && rawSlug !== null && "current" in rawSlug
                ? rawSlug.current
                : item._id;

            return (
              <li key={item._id || `related-${idx}`}>
                <Link
                  href={`/${slugPath}`}
                  className="block px-5 py-3 text-xs text-zinc-300 hover:text-[#c87d55] hover:bg-zinc-900/40 transition-colors"
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
