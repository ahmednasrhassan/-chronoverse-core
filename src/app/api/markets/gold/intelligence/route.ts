import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

import {
  getFullLiveGoldIntelligence,
} from "@/lib/markets/assets/gold/liveFull";

/**
 * Chronoverse Capital
 * Gold Intelligence API
 *
 * Production cache:
 * - caches successful intelligence result
 * - revalidates every 60 minutes
 * - shared through Next.js cache layer
 */

const getCachedGoldIntelligence =
  unstable_cache(
    async () => {
      const intelligence =
        await getFullLiveGoldIntelligence();

      return {
        generatedAt:
          new Date().toISOString(),
        intelligence,
      };
    },
    [
      "chronoverse",
      "markets",
      "gold",
      "intelligence",
    ],
    {
      revalidate: 3600,
      tags: [
        "gold-intelligence",
      ],
    },
  );

export async function GET() {
  try {
    const result =
      await getCachedGoldIntelligence();

    return NextResponse.json(
      {
        ok: true,
        asset: "gold",
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
      "[Chronoverse Gold Intelligence API]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        asset: "gold",
        generatedAt:
          new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Unknown gold intelligence error.",
      },
      {
        status: 500,
      },
    );
  }
}