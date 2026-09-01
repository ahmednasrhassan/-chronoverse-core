import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

import {
  getLiveOilIntelligence,
} from "@/lib/markets/assets/oil/runtime";

const OIL_INTELLIGENCE_CACHE_SECONDS =
  60 * 60;

const getCachedOilIntelligence =
  unstable_cache(
    async () => {
      const intelligence =
        await getLiveOilIntelligence();

      return {
        generatedAt:
          new Date().toISOString(),

        intelligence,
      };
    },

    [
      "chronoverse",
      "markets",
      "oil",
      "intelligence",
    ],

    {
      revalidate:
        OIL_INTELLIGENCE_CACHE_SECONDS,

      tags: [
        "oil-intelligence",
      ],
    },
  );

/**
 * Chronoverse Capital
 * Oil Intelligence API
 *
 * Final intelligence result is cached for
 * one hour.
 *
 * Underlying data layers maintain their own
 * independent cache cadence:
 *
 * - Historical market data: 15 minutes
 * - EIA fundamentals: 6 hours
 * - Oil intelligence result: 1 hour
 */
export async function GET() {
  try {
    const result =
      await getCachedOilIntelligence();

    return NextResponse.json(
      {
        ok: true,
        asset: "oil",

        generatedAt:
          result.generatedAt,

        cached: true,
        stale: false,

        intelligence:
          result.intelligence,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[Chronoverse Oil] Intelligence runtime failed.",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        asset: "oil",
        error:
          "Oil intelligence is temporarily unavailable.",
      },
      {
        status: 500,
      },
    );
  }
}