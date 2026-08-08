"use client";

import dynamic from "next/dynamic";

// The proprietary mini chart pulls in `lightweight-charts` and is
// entirely client-side — loading it via `next/dynamic` with
// `ssr: false` keeps it out of the server-rendered HTML / initial JS
// bundle so it never blocks first paint or the homepage's LCP.
//
// CLS fix: the `loading` fallback below renders a skeleton with the exact
// same `h-32 w-full` box the real widget uses. Without this, the widget
// popping in on mount would cause a layout shift.
const MiniChart = dynamic(() => import("./MiniChart"), {
  ssr: false,
  loading: () => (
    <div
      className="h-32 w-full rounded-lg bg-zinc-900/60 animate-pulse"
      aria-hidden="true"
    />
  ),
});

export default MiniChart;
