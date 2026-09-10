import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import {
  getCanonicalLiveEurChfIntelligence,
} from "@/lib/markets/assets/eurchf/productionRuntime";
import {
  ECB_FX_REFERENCE_CACHE_SECONDS_V1,
} from "@/lib/markets/providers/ecb/fxReferenceSeriesCache";

const getCachedEurChfIntelligence = unstable_cache(
  async () => ({
    generatedAt: new Date().toISOString(),
    intelligence: await getCanonicalLiveEurChfIntelligence(),
  }),
  ["chronoverse", "markets", "eurchf", "intelligence"],
  {
    revalidate: ECB_FX_REFERENCE_CACHE_SECONDS_V1,
    tags: ["eurchf-intelligence"],
  },
);

/** Daily final cache aligned with the official once-daily ECB source cache. */
export async function GET() {
  try {
    const result = await getCachedEurChfIntelligence();

    return NextResponse.json({
      ok: true,
      asset: "eurchf",
      generatedAt: result.generatedAt,
      cached: true,
      stale: false,
      intelligence: result.intelligence,
    });
  } catch (error) {
    console.error("[Chronoverse EUR/CHF Intelligence API]", error);

    return NextResponse.json(
      {
        ok: false,
        asset: "eurchf",
        generatedAt: new Date().toISOString(),
        error: "EUR/CHF intelligence is temporarily unavailable.",
      },
      { status: 500 },
    );
  }
}
