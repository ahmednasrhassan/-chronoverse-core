import React from "react";

export default function AuthorCard({ authorName }: { authorName?: string }) {
  const normalizedName = authorName?.trim();
  if (!normalizedName) return null;

  const initials = normalizedName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <section className="my-10 p-5 bg-card border border-border/80 rounded-md">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded border border-amber-500/30 bg-raised flex items-center justify-center font-mono text-amber-500 font-bold shrink-0">
          [{initials}]
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-primary font-mono">
            {normalizedName}
          </span>
          <span className="text-[10px] bg-raised border border-amber-500/30 text-amber-500/90 px-1.5 py-0.5 rounded uppercase font-mono tracking-wider">
            Author
          </span>
        </div>
      </div>
    </section>
  );
}
