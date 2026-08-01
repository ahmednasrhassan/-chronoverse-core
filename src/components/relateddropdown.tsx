"use client";

import { useState } from "react";

interface ArticleItem {
  _id: string;
  title: string;
  slug: { current: string };
}

interface RelatedDropdownProps {
  articles: ArticleItem[];
}

export default function RelatedDropdown({ articles }: RelatedDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!articles || articles.length === 0) return null;

  return (
    <div className="my-6 border border-zinc-800 rounded-xl bg-[#181310] overflow-hidden">
      {/* Dropdown Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 text-left flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:text-[#c87d55] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-[#c87d55]">🔗</span> Related Context & Research ({articles.length})
        </span>
        <span
          className={`transform transition-transform duration-200 text-zinc-500 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
        >
          ▼
        </span>
      </button>

      {/* Accordion Links List */}
      {isOpen && (
        <ul className="border-t border-zinc-800 divide-y divide-zinc-800/60 bg-black/20">
          {articles.map((item) => (
            <li key={item._id}>
              <a
             href={`/${item.slug?.current ?? item._id}`}
                className="block px-5 py-3 text-xs text-zinc-400 hover:text-[#c87d55] hover:bg-zinc-900/40 transition-colors"
              >
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}