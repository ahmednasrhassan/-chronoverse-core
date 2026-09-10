import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import {
  getCanonicalLiveEurJpyIntelligence,
} from "@/lib/markets/assets/eurjpy/productionRuntime";
import {
  ECB_FX_REFERENCE_CACHE_SECONDS_V1,
} from "@/lib/markets/providers/ecb/fxReferenceSeriesCache";

const getCachedEurJpyIntelligence = unstable_cache(
  async () => ({
    generatedAt: new Date().toISOString(),
    intelligence: await getCanonicalLiveEurJpyIntelligence(),
  }),
  ["chronoverse", "markets", "eurjpy", "intelligence"],
  {
    revalidate: ECB_FX_REFERENCE_CACHE_SECONDS_V1,
    tags: ["eurjpy-intelligence"],
  },
);

/** Daily final cache aligned with the official once-daily ECB source cache. */
export async function GET() {
  try {
    const result = await getCachedEurJpyIntelligence();

    return NextResponse.json({
      ok: true,
      asset: "eurjpy",
      generatedAt: result.generatedAt,
      cached: true,
      stale: false,
      intelligence: result.intelligence,
    });
  } catch (error) {
    console.error("[Chronoverse EUR/JPY Intelligence API]", error);

    return NextResponse.json(
      {
        ok: false,
        asset: "eurjpy",
        generatedAt: new Date().toISOString(),
        error: "EUR/JPY intelligence is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}
