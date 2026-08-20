"use client";

import dynamic from "next/dynamic";

// `lightweight-charts` touches browser-only canvas/DOM APIs and is only
// ever needed on the client. Loading it via `next/dynamic` with
// `ssr: false` keeps it out of the server-rendered HTML / initial JS
// bundle so it never blocks first paint or LCP.
//
// The `loading` fallback reserves the exact same box (matching the
// `height` prop convention used by `LightweightChart`) so mounting causes
// zero layout shift.
const LightweightChart = dynamic(() => import("./LightweightChart"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full min-h-50 bg-[#0a0a0a] animate-pulse rounded-lg"
      aria-hidden="true"
    />
  ),
});

export default LightweightChart;
