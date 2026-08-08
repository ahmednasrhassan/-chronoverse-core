"use client";

import dynamic from "next/dynamic";

// `MarketQuoteCard` fetches live quotes and pulls in `lightweight-charts`,
// both entirely client-side concerns. Loading it via `next/dynamic` with
// `ssr: false` keeps it out of the server-rendered HTML / initial JS
// bundle so it never blocks first paint or the homepage's LCP.
//
// CLS fix: the `loading` fallback below renders a skeleton matching the
// card's real dimensions so mounting causes zero layout shift.
const MarketQuoteCard = dynamic(() => import("./MarketQuoteCard"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full rounded-lg bg-zinc-900/60 animate-pulse"
      aria-hidden="true"
    />
  ),
});

export default MarketQuoteCard;
