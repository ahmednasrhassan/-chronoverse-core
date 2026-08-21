"use client";

import { useState } from "react";

interface AIExecutiveSummaryProps {
  /** Exactly 3 (or fewer, defensively handled) key takeaway strings. */
  points?: any[];
}

/**
 * دالة مساعدة صارمة لحذف كافة مفاتيح Sanity والرموز والشرط واستخراج النص الإنجليزي الصافي
 */
function cleanTakeawayText(item: any): string {
  if (!item) return "";

  // 1. معالجة الكائنات والمصفوفات
  if (typeof item === "object") {
    if (Array.isArray(item)) {
      return item.map(cleanTakeawayText).filter(Boolean).join(" ");
    }
    if (Array.isArray(item.children)) {
      return item.children
        .map((child: any) => (child && typeof child.text === "string" ? child.text : ""))
        .filter(Boolean)
        .join(" ");
    }
    if (typeof item.text === "string") {
      return item.text.trim();
    }
  }

  // 2. معالجة السلاسل النصية
  if (typeof item === "string") {
    let text = item.trim();

    // فك تشفير JSON إذا كان بصيغة كائن مشفر
    if (
      (text.startsWith("{") && text.endsWith("}")) ||
      (text.startsWith("[") && text.endsWith("]"))
    ) {
      try {
        const parsed = JSON.parse(text);
        return cleanTakeawayText(parsed);
      } catch {
        // الاستمرار للتنظيف النصي
      }
    }

    // تنظيف شامل إذا كان النص يحتوي على بنية Portable Text المشوهة
    if (
      text.includes("_key") ||
      text.includes("_type") ||
      text.includes("children") ||
      text.includes("markDefs") ||
      text.includes("marks") ||
      text.includes("style")
    ) {
      // حذف مفاتيح Sanity وقيمها العشوائية
      text = text
        .replace(/_?key\s*[:=]?\s*\w+/gi, "")
        .replace(/_?type\s*[:=]?\s*\w+/gi, "")
        .replace(/markDefs\s*[:=]?\s*(\[[^\]]*\]|\w+)?/gi, "")
        .replace(/marks\s*[:=]?\s*(\[[^\]]*\]|\w+)?/gi, "")
        .replace(/style\s*[:=]?\s*\w+/gi, "")
        .replace(/children\s*[:=]?\s*/gi, "")
        .replace(/\btext\s*[:=]?\s*/gi, "")
        .replace(/\bspan\b/gi, "")
        .replace(/\bblock\b/gi, "")
        .replace(/\bstrong\b/gi, "");

      // إزالة كل علامات الـ JSON والأقواس والشرط السفلية
      text = text
        .replace(/[{}[\]"']/g, " ")
        .replace(/[_:,;]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    return text;
  }

  return "";
}

/**
 * AIExecutiveSummary
 * -------------------
 * Institutional-terminal styled "AI Executive Summary" box rendered at the
 * very top of every article body. Displays 3 concise key takeaways with a
 * smooth collapse/expand toggle that matches the dark copper (#c87d55)
 * aesthetic used across Chronoverse Capital.
 *
 * Defensive by design: renders nothing if no usable points are provided
 * (e.g. `points` is empty/undefined), never throwing at render time.
 */
export default function AIExecutiveSummary({ points = [] }: AIExecutiveSummaryProps) {
  const [isOpen, setIsOpen] = useState(true);

  // استخراج النصوص الصافية النظيفة وفلترتها
  const safePoints = (points ?? [])
    .map(cleanTakeawayText)
    .filter((text) => typeof text === "string" && text.trim().length > 0)
    .slice(0, 3);

  if (safePoints.length === 0) return null;

  return (
    <div
      className="relative mb-10 rounded-2xl border border-[#c87d55]/30 bg-gradient-to-br from-[#1a1512] via-[#151110] to-[#0f0c0b] shadow-xl overflow-hidden print:hidden"
      role="region"
      aria-label="AI Executive Summary"
    >
      {/* Top accent line */}
      <div className="h-0.5 w-full bg-[linear-gradient(to_right,#c87d55,#d97706,#c87d55)] opacity-80" />

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left group cursor-pointer"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#c87d55]/10 border border-[#c87d55]/30 text-[#c87d55] text-sm font-bold">
            AI
          </span>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-[#c87d55] leading-none">
              Executive Summary
            </h2>
            <p className="text-[11px] text-zinc-300 mt-1">
              3 key takeaways · auto-generated briefing
            </p>
          </div>
        </div>

        <span
          className={`text-[#c87d55] text-xs font-mono transition-transform duration-300 shrink-0 ${
            isOpen ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <ul className="px-5 pb-5 space-y-3">
            {safePoints.map((point, idx) => (
              <li
                key={`${idx}-${point.slice(0, 15)}`}
                className="flex items-start gap-3 text-sm text-zinc-300 leading-relaxed bg-black/20 border border-zinc-800/60 rounded-xl px-4 py-3"
              >
                <span className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-[#c87d55]/15 border border-[#c87d55]/40 text-[#c87d55] text-[10px] font-bold shrink-0">
                  {idx + 1}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

