"use client";

import React, { useEffect, useState } from "react";

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

/**
 * CLS fix: this component previously returned `null` until a post-mount
 * `useEffect` finished walking the rendered <article> DOM for headings,
 * then "popped in" a whole nav block a tick later. We render a reserved
 * skeleton immediately, so swapping in the real TOC list causes zero layout shift.
 */
export default function AutoTOC() {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const article = document.querySelector("article");
    if (!article) {
      setIsReady(true);
      return;
    }

    const elements = Array.from(article.querySelectorAll("h2, h3"));

    const items: HeadingItem[] = elements.map((elem, index) => {
      const text = elem.textContent?.trim() || "";

      // Generate clean slug ID from heading text if missing
      if (!elem.id) {
        const cleanSlug = text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s-]/gu, "")
          .trim()
          .replace(/\s+/g, "-");

        elem.id = cleanSlug || `heading-${index + 1}`;
      }

      return {
        id: elem.id,
        text: text,
        level: Number(elem.tagName.replace("H", "")) || 2,
      };
    });

    setHeadings(items);
    setIsReady(true);
  }, []);

  // Before the DOM scan completes, reserve a minimum-height skeleton
  // block instead of rendering nothing — key CLS fix.
  if (!isReady) {
    return (
      <div
        className="my-8 p-6 bg-zinc-950 border border-zinc-800 rounded-none shadow-md min-h-[140px] animate-pulse"
        aria-hidden="true"
      >
        <div className="h-3 w-32 bg-zinc-800 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-3 w-full bg-zinc-900 rounded" />
          <div className="h-3 w-5/6 bg-zinc-900 rounded" />
          <div className="h-3 w-2/3 bg-zinc-900 rounded" />
        </div>
      </div>
    );
  }

  if (headings.length === 0) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="my-8 p-6 bg-zinc-950 border border-zinc-800 rounded-none shadow-md"
    >
      <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c87d55] mb-4 flex items-center gap-2">
        <span aria-hidden="true">::</span> SECTION INDEX <span aria-hidden="true">::</span>
      </h3>
      <ul className="space-y-2 text-sm font-sans">
        {headings.map((item, idx) => {
          const serialNum = String(idx + 1).padStart(2, "0");
          return (
            <li
              key={`${item.id}-${idx}`}
              className={item.level === 3 ? "pl-8 text-xs" : "font-semibold"}
            >
              <a
                href={`#${item.id}`}
                className="group flex items-baseline gap-3 text-zinc-300 hover:text-[#c87d55] transition-colors py-1"
              >
                <span className="font-mono text-xs text-zinc-400 group-hover:text-[#c87d55]/70">
                  {serialNum}.
                </span>
                <span
                  className="border-b border-dotted border-zinc-800 flex-1 group-hover:border-[#c87d55]/30 order-2 h-3"
                  aria-hidden="true"
                />
                <span className="order-1 group-hover:underline decoration-1 decoration-dotted underline-offset-4">
                  {item.text}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
