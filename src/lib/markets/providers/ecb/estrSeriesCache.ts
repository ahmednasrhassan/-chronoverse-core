import { unstable_cache } from "next/cache";

import type {
  CanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";
import { loadEcbEstrHistoryV1 } from "./estrSeries";
import type { EcbEstrSeriesV1 } from "./estrTypes";

export const ECB_ESTR_CACHE_SECONDS_V1 = 24 * 60 * 60;

/** Dedicated daily full-history cache for production feature warmup. */
const getCachedEcbEstrSeriesV1 = unstable_cache(
  async () => loadEcbEstrHistoryV1(),
  ["chronoverse", "providers", "ecb", "estr-series-v1"],
  {
    revalidate: ECB_ESTR_CACHE_SECONDS_V1,
    tags: ["ecb-estr-series-v1"],
  },
);

export async function getCanonicalEcbEstrSourceV1(): Promise<EcbEstrSeriesV1> {
  return getCachedEcbEstrSeriesV1();
}

export async function getCanonicalEcbEstrSeriesV1(): Promise<
  CanonicalObservationSeriesV1
> {
  return (await getCachedEcbEstrSeriesV1()).canonicalSeries;
}
