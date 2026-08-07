"use client";

import dynamic from "next/dynamic";

// TradingView's "Symbol Overview" widget pulls in a sizeable third-party
// script and is only rendered conditionally (when a market symbol is
// detected in the article). Loading it via `next/dynamic` with `ssr: false`
// keeps it completely out of the server-rendered HTML / initial JS bundle,
// so it never blocks first paint or LCP on articles that don't need it.
//
// CLS fix: the `loading` fallback reproduces the exact same structural
// shell (`my-10` wrapper, label row, `h-[420px]` bordered box) that
// `SymbolOverview.tsx` renders once mounted. This reserves the full
// 420px-tall region for the widget from the very first paint, so its
// eventual "pop in" once the client bundle + third-party script load
// causes zero layout shift to everything below it in the article.
//
// `ssr: false` is only allowed inside a Client Component in Next.js —
// this thin wrapper exists solely to host that dynamic import so the
// parent Server Component (`[slug]/page.tsx`) stays a server component.
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
