import { NextResponse } from "next/server";

import {
  getCanonicalProductResultV1,
} from "@/lib/markets/services/canonicalProductResults";

/** Reads the shared daily canonical result; this route owns no result cache. */
export async function GET() {
  try {
    const intelligence = await getCanonicalProductResultV1("eurjpy");
    const freshness = intelligence.engineResult.marketData.freshness;

    return NextResponse.json({
      ok: true,
      asset: "eurjpy",
      generatedAt: intelligence.engineResult.evaluatedAt,
      cached: true,
      stale: freshness === "stale"
        ? true
        : freshness === "within-cadence" ? false : null,
      intelligence,
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
