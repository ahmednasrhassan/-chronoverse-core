"use client";

import { useEffect, useState } from "react";

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
    <nav className="my-6 p-5 bg-[#181310] border border-zinc-800 rounded-xl">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#c87d55] mb-3 flex items-center gap-2">
        Table of Contents
      </h3>
      <ul className="space-y-2 text-sm">
        {headings.map((item) => (
          <li
            key={item.id}
            className={item.level === 3 ? "ml-4 text-xs" : "font-medium"}
          >
            <a
              href={`#${item.id}`}
              className="text-zinc-400 hover:text-[#c87d55] transition-colors block py-0.5"
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}