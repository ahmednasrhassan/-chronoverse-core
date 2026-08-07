"use client";

import dynamic from "next/dynamic";

// TradingView's "Symbol Overview" widget pulls in a sizeable third-party
// script and is only rendered conditionally (when a market symbol is
// detected in the article). Loading it via `next/dynamic` with `ssr: false`
// keeps it completely out of the server-rendered HTML / initial JS bundle,
// so it never blocks first paint or LCP on articles that don't need it.
//
// `ssr: false` is only allowed inside a Client Component in Next.js —
// this thin wrapper exists solely to host that dynamic import so the
// parent Server Component (`[slug]/page.tsx`) stays a server component.
const SymbolOverview = dynamic(() => import("./SymbolOverview"), {
  ssr: false,
});

export default SymbolOverview;
