"use client";

import dynamic from "next/dynamic";

// TradingView's mini symbol widgets pull in a third-party script and are
// entirely client-side — loading them via `next/dynamic` with `ssr: false`
// keeps them out of the server-rendered HTML / initial JS bundle so they
// never block first paint or the homepage's LCP.
//
// CLS fix: the `loading` fallback below renders a skeleton with the exact
// same `h-32 w-full` box the real widget uses (see MiniChart.tsx). Without
// this, `dynamic(..., { ssr: false })` renders `null` until the client
// bundle loads, and when the widget finally mounts it "pops in" and
// resizes its container — a classic dynamic-import layout shift. Because
// the parent card in `page.tsx` already reserves `h-40`, this skeleton
// guarantees zero shift both on first paint and on widget mount.
//
// `ssr: false` is only allowed inside a Client Component in Next.js —
// this thin wrapper exists solely to host that dynamic import so the
// parent Server Component (`app/page.tsx`) stays a server component.
const MiniChart = dynamic(() => import("./MiniChart"), {
  ssr: false,
  loading: () => (
    <div
      className="tradingview-widget-container h-32 w-full rounded-lg bg-zinc-900/60 animate-pulse"
      aria-hidden="true"
    />
  ),
});

export default MiniChart;
