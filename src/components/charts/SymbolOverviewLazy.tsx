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
    <div className="my-10 print:hidden" aria-hidden="true">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-4 w-64 animate-pulse rounded bg-zinc-800" />
      </div>
      {/* Exact height matching component: 396px chart + 24px padding = 420px */}
    <div style={{ height: '420px' }} className="w-full animate-pulse rounded-xl border border-zinc-800 bg-zinc-950 shadow-lg" />
    </div>
  ),
});

export default SymbolOverview;