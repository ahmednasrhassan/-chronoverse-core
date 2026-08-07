"use client";

import dynamic from "next/dynamic";

// TradingView's mini symbol widgets pull in a third-party script and are
// entirely client-side — loading them via `next/dynamic` with `ssr: false`
// keeps them out of the server-rendered HTML / initial JS bundle so they
// never block first paint or the homepage's LCP.
//
// `ssr: false` is only allowed inside a Client Component in Next.js —
// this thin wrapper exists solely to host that dynamic import so the
// parent Server Component (`app/page.tsx`) stays a server component.
const MiniChart = dynamic(() => import("./MiniChart"), {
  ssr: false,
});

export default MiniChart;
