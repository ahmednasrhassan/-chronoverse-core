import { NextResponse } from "next/server";

import {
  getFullLiveGoldIntelligence,
} from "@/lib/markets/assets/gold/liveFull";

/**
 * Chronoverse Capital
 * Gold Intelligence API
 *
 * GET /api/markets/gold/intelligence
 *
 * Server-side only.
 */
export async function GET() {
  try {
    const intelligence =
      await getFullLiveGoldIntelligence();

    return NextResponse.json(
      {
        ok: true,
        asset: "gold",
        generatedAt: new Date().toISOString(),
        intelligence,
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
        generatedAt: new Date().toISOString(),
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