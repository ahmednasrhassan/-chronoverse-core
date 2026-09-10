import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import {
  getCanonicalLiveEurUsdIntelligence,
} from "@/lib/markets/assets/eurusd/productionRuntime";
import {
  ECB_FX_REFERENCE_CACHE_SECONDS_V1,
} from "@/lib/markets/providers/ecb/fxReferenceSeriesCache";

const getCachedEurUsdIntelligence = unstable_cache(
  async () => ({
    generatedAt: new Date().toISOString(),
    intelligence: await getCanonicalLiveEurUsdIntelligence(),
  }),
  ["chronoverse", "markets", "eurusd", "intelligence"],
  {
    revalidate: ECB_FX_REFERENCE_CACHE_SECONDS_V1,
    tags: ["eurusd-intelligence"],
  },
);

/** Daily final cache aligned with the official once-daily ECB source cache. */
export async function GET() {
  try {
    const result = await getCachedEurUsdIntelligence();

    return NextResponse.json({
      ok: true,
      asset: "eurusd",
      generatedAt: result.generatedAt,
      cached: true,
      stale: false,
      intelligence: result.intelligence,
    });
  } catch (error) {
    console.error("[Chronoverse EUR/USD Intelligence API]", error);

    return NextResponse.json(
      {
        ok: false,
        asset: "eurusd",
        generatedAt: new Date().toISOString(),
        error: "EUR/USD intelligence is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}
