"use client";

import dynamic from "next/dynamic";

// The proprietary Symbol Overview chart pulls in `lightweight-charts`
// and is only rendered conditionally (when a market symbol is detected
// in the article). Loading it via `next/dynamic` with `ssr: false` keeps
// it completely out of the server-rendered HTML / initial JS bundle, so
// it never blocks first paint or LCP on articles that don't need it.
//
// CLS fix: the `loading` fallback reproduces the exact same structural
// shell (`my-10` wrapper, label row, `h-[420px]` bordered box) that
// `SymbolOverview.tsx` renders once mounted, so its eventual "pop in"
// causes zero layout shift to everything below it in the article.
const SymbolOverview = dynamic(() => import("./SymbolOverview"), {
  ssr: false,
  loading: () => (
    <div className="my-10" aria-hidden="true">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 w-56 bg-zinc-800 rounded animate-pulse" />
      </div>
      <div className="w-full h-[420px] rounded-xl overflow-hidden border border-[#27272a] bg-[#18181b] animate-pulse" />
    </div>
  ),
});

export default SymbolOverview;
