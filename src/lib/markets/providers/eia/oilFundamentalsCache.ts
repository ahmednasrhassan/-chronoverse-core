import { unstable_cache } from "next/cache";

import {
  eiaOilFundamentalsProvider,
} from "./provider";

const EIA_OIL_FUNDAMENTALS_CACHE_SECONDS =
  6 * 60 * 60;

/**
 * Chronoverse Capital
 * Cached EIA Oil Fundamentals
 *
 * Caches the normalized provider snapshot,
 * not individual raw EIA requests.
 *
 * EIA inventories and production update
 * relatively slowly, while global demand
 * updates even less frequently.
 *
 * A six-hour cache keeps official data
 * reasonably fresh without repeatedly
 * requesting unchanged upstream data.
 */
const getCachedEiaOilFundamentals =
  unstable_cache(
    async () =>
      eiaOilFundamentalsProvider
        .getOilFundamentals(),

    [
      "chronoverse",
      "providers",
      "eia",
      "oil-fundamentals",
    ],

    {
      revalidate:
        EIA_OIL_FUNDAMENTALS_CACHE_SECONDS,

      tags: [
        "eia-oil-fundamentals",
      ],
    },
  );

export async function getEiaOilFundamentals() {
  return getCachedEiaOilFundamentals();
}