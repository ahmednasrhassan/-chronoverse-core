import {
  appendEurostatMacroSeriesVintageRedisV1,
  type AppendEurostatMacroSeriesVintageRedisResultV1,
} from "../persistence/eurostatMacroSeriesVintageRedis";
import {
  eurostatClientV1,
  type EurostatDatasetLoaderV1,
} from "../providers/eurostat/client";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  loadEurostatEuroAreaMacroSeriesV1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../providers/eurostat/macroSeries";
import type { CanonicalStatisticalSeriesV1 } from "./canonicalObservationSeries";

export interface EurostatMacroAcquisitionDependenciesV1 {
  readonly loadDataset: EurostatDatasetLoaderV1;
  /** Trusted server clock, returning Unix seconds after the response is parsed. */
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly appendVintage: (
    family: EurostatEuroAreaMacroFamilyV1,
    series: CanonicalStatisticalSeriesV1,
  ) => Promise<AppendEurostatMacroSeriesVintageRedisResultV1>;
}

const productionDependencies: EurostatMacroAcquisitionDependenciesV1 = {
  loadDataset: (sourceUrl) => eurostatClientV1.getDataset(sourceUrl),
  nowUnixSeconds: () => Math.floor(Date.now() / 1_000),
  appendVintage: appendEurostatMacroSeriesVintageRedisV1,
};

/** Inactive until explicitly called; no polling or runtime registration. */
export async function acquireEurostatMacroSeriesV1(
  family: EurostatEuroAreaMacroFamilyV1,
  dependencies: EurostatMacroAcquisitionDependenciesV1 = productionDependencies,
): Promise<AppendEurostatMacroSeriesVintageRedisResultV1> {
  if (!Object.prototype.hasOwnProperty.call(
    EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
    family,
  )) {
    throw new TypeError("Eurostat macro family is invalid.");
  }

  const sourceUrl = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1[family].sourceUrl;
  const fetched = await dependencies.loadDataset(sourceUrl);
  const fetchedAt = await dependencies.nowUnixSeconds();
  if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0) {
    throw new TypeError("Eurostat macro acquisition clock is invalid.");
  }

  const series = await loadEurostatEuroAreaMacroSeriesV1(family, {
    fetchedAt,
    loadDataset: async () => fetched,
  });
  return dependencies.appendVintage(family, series);
}
