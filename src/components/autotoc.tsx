"use client";

import { useEffect, useState } from "react";
import "katex/dist/katex.min.css";

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export default function AutoTOC() {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);

  useEffect(() => {
    const article = document.querySelector("article");
    if (!article) return;

    const elements = Array.from(article.querySelectorAll("h2, h3"));

    const items: HeadingItem[] = elements.map((elem, index) => {
      const text = elem.textContent?.trim() || "";
      
      // Generate clean slug ID from heading text if missing
      if (!elem.id) {
        elem.id = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-") || `heading-${index}`;
      }

      return {
        id: elem.id,
        text: text,
        level: Number(elem.tagName.replace("H", "")),
      };
    });

    setHeadings(items);
  }, []);

  if (headings.length === 0) return null;

  return (
<nav className="my-8 p-6 bg-zinc-950 border border-zinc-800 rounded-none shadow-md">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#c87d55] mb-4 flex items-center gap-2">
        <span>::</span> SECTION INDEX <span>::</span>
      </h3>
      <ul className="space-y-2 text-sm font-sans">
        {headings.map((item, idx) => {
          const serialNum = String(idx + 1).padStart(2, "0");
          return (
            <li
              key={item.id}
              className={item.level === 3 ? "pl-8 text-xs" : "font-semibold"}
            >
              <a
                href={`#${item.id}`}
                className="group flex items-baseline gap-3 text-zinc-400 hover:text-[#c87d55] transition-colors py-1"
              >
                <span className="font-mono text-xs text-zinc-600 group-hover:text-[#c87d55]/70">
                  {serialNum}.
                </span>
                <span className="border-b border-dotted border-zinc-850 flex-1 group-hover:border-[#c87d55]/30 order-2 h-3" />
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
