import { unstable_cache } from "next/cache";

import type { CanonicalObservationSeriesV1 } from
  "../../services/canonicalObservationSeries";
import {
  loadEcbFxReferenceSeriesBundleV1,
  selectEcbFxReferenceSeriesV1,
  type EcbFxReferenceSeriesBundleV1,
} from "./fxReferenceSeries";
import type { EcbFxReferenceProductIdV1 } from "./types";

export const ECB_FX_REFERENCE_CACHE_SECONDS_V1 = 24 * 60 * 60;

/** One daily cache entry owns the normalized bundle for all four launch pairs. */
const getCachedEcbFxReferenceSeriesBundleV1 = unstable_cache(
  async () => loadEcbFxReferenceSeriesBundleV1(),
  ["chronoverse", "providers", "ecb", "launch-fx-reference-series-v1"],
  {
    revalidate: ECB_FX_REFERENCE_CACHE_SECONDS_V1,
    tags: ["ecb-launch-fx-reference-series-v1"],
  },
);

export async function getCanonicalEcbFxReferenceSeriesBundleV1(): Promise<
  EcbFxReferenceSeriesBundleV1
> {
  return getCachedEcbFxReferenceSeriesBundleV1();
}

export async function getCanonicalEcbFxReferenceSeriesV1(
  productId: EcbFxReferenceProductIdV1,
): Promise<CanonicalObservationSeriesV1> {
  const bundle = await getCachedEcbFxReferenceSeriesBundleV1();

  return selectEcbFxReferenceSeriesV1(bundle, productId);
}
