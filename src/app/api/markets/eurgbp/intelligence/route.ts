import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import {
  getCanonicalLiveEurGbpIntelligence,
} from "@/lib/markets/assets/eurgbp/productionRuntime";
import {
  ECB_FX_REFERENCE_CACHE_SECONDS_V1,
} from "@/lib/markets/providers/ecb/fxReferenceSeriesCache";

const getCachedEurGbpIntelligence = unstable_cache(
  async () => ({
    generatedAt: new Date().toISOString(),
    intelligence: await getCanonicalLiveEurGbpIntelligence(),
  }),
  ["chronoverse", "markets", "eurgbp", "intelligence"],
  {
    revalidate: ECB_FX_REFERENCE_CACHE_SECONDS_V1,
    tags: ["eurgbp-intelligence"],
  },
);

/** Daily final cache aligned with the official once-daily ECB source cache. */
export async function GET() {
  try {
    const result = await getCachedEurGbpIntelligence();

    return NextResponse.json({
      ok: true,
      asset: "eurgbp",
      generatedAt: result.generatedAt,
      cached: true,
      stale: false,
      intelligence: result.intelligence,
    });
  } catch (error) {
    console.error("[Chronoverse EUR/GBP Intelligence API]", error);

    return NextResponse.json(
      {
        ok: false,
        asset: "eurgbp",
        generatedAt: new Date().toISOString(),
        error: "EUR/GBP intelligence is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}
