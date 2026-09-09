import { unstable_cache } from "next/cache";

import { loadEiaWtiPriceSeriesV1 } from "./wtiPriceSeries";

export const EIA_WTI_PRICE_CACHE_SECONDS = 6 * 60 * 60;

/** Cache the normalized daily series once for all server-side consumers. */
const getCachedEiaWtiPriceSeriesV1 = unstable_cache(
  async () => loadEiaWtiPriceSeriesV1(),
  ["chronoverse", "providers", "eia", "wti-cushing-spot-daily"],
  {
    revalidate: EIA_WTI_PRICE_CACHE_SECONDS,
    tags: ["eia-wti-cushing-spot-daily"],
  },
);

export async function getEiaWtiPriceSeriesV1() {
  return getCachedEiaWtiPriceSeriesV1();
}
