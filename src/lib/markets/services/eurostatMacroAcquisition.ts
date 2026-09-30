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

/** Only recognized source/schema/canonical errors at the normalization boundary. */
export class EurostatMacroSeriesValidationError extends Error {
  readonly originalError: TypeError;

  constructor(error: TypeError) {
    super(error.message);
    this.name = "EurostatMacroSeriesValidationError";
    this.originalError = error;
  }
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

  let series: CanonicalStatisticalSeriesV1;
  try {
    series = await loadEurostatEuroAreaMacroSeriesV1(family, {
      fetchedAt,
      loadDataset: async () => fetched,
    });
  } catch (error) {
    if (error instanceof TypeError &&
        /^(?:Eurostat |Canonical statistical(?:-series| series) )/.test(
          error.message,
        )) {
      throw new EurostatMacroSeriesValidationError(error);
    }
    throw error;
  }
  return dependencies.appendVintage(family, series);
}
