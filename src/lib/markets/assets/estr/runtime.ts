import type { CanonicalObservationSeriesMetadataV1 } from
  "../../services/canonicalObservationSeries";
import {
  ECB_ESTR_DATAFLOW_V1,
  ECB_ESTR_SERIES_ID_V1,
  ECB_ESTR_SERIES_KEY_V1,
} from "../../providers/ecb/estrContract";
import { getCanonicalEcbEstrSourceV1 } from
  "../../providers/ecb/estrSeriesCache";
import type {
  EcbEstrObservationMetadataV1,
  EcbEstrSeriesV1,
} from "../../providers/ecb/estrTypes";
import {
  calculateRateFeaturesV1,
  type RateFeatureSnapshotV1,
} from "../../indicators/rateFeatures";

import {
  adaptEstrRateMarketStateToEngineV3,
  type EstrRateEngineV3AdapterResultV1,
} from "./engineAdapter";
import {
  calculateEstrRateMarketStateV1,
  type EstrRateMarketStateResultV1,
} from "./marketState";
import {
  calculateEstrRateRiskV1,
  type EstrRateRiskResultV1,
} from "./risk";
import {
  calculateEstrRateSignalV1,
  type EstrRateSignalResultV1,
} from "./signal";

export const ESTR_RUNTIME_MINIMUM_HISTORY_V1 = 200;

export type EstrProductionRuntimeMissingFieldV1 =
  | "source"
  | "sourceIdentity"
  | "history"
  | "features"
  | "signal"
  | "risk"
  | "marketState"
  | "engineAdapter";

type AvailableEstrSignal = Extract<
  EstrRateSignalResultV1,
  { readonly availability: "available" }
>;
type AvailableEstrRisk = Extract<
  EstrRateRiskResultV1,
  { readonly availability: "available" }
>;
type AvailableEstrMarketState = Extract<
  EstrRateMarketStateResultV1,
  { readonly availability: "available" }
>;
type AvailableEstrEngineAdapter = Extract<
  EstrRateEngineV3AdapterResultV1,
  { readonly availability: "available" }
>;

export interface EstrProductionRuntimeSourceV1 {
  readonly dataflow: typeof ECB_ESTR_DATAFLOW_V1;
  readonly seriesKey: typeof ECB_ESTR_SERIES_KEY_V1;
  readonly provenance: CanonicalObservationSeriesMetadataV1;
  readonly latestObservationMetadata: EcbEstrObservationMetadataV1;
}

export interface EstrProductionRuntimeDataV1 {
  readonly productId: "estr";
  readonly product: "€STR";
  /** Latest official reference-rate level in percentage points. */
  readonly currentRatePercent: number;
  readonly latestReferenceDate: string;
  /** Latest official ECB reference date encoded as UTC midnight. */
  readonly sourceTimestamp: number;
  readonly fetchedAt: number;
  readonly source: EstrProductionRuntimeSourceV1;
  readonly features: RateFeatureSnapshotV1;
  readonly signal: AvailableEstrSignal;
  readonly risk: AvailableEstrRisk;
  readonly marketState: AvailableEstrMarketState;
  readonly engineAdapter: AvailableEstrEngineAdapter;
}

export type EstrProductionRuntimeResultV1 =
  | {
      readonly availability: "available";
      readonly data: EstrProductionRuntimeDataV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
      readonly missing: readonly EstrProductionRuntimeMissingFieldV1[];
    };

export interface EstrProductionRuntimeDependenciesV1 {
  readonly loadSource?: () => Promise<EcbEstrSeriesV1>;
}

/**
 * Runs the server-side €STR production pipeline from one cached official source.
 * The default loader is the shared daily ECB full-history cache.
 */
export async function getEstrProductionRuntimeV1(
  dependencies: EstrProductionRuntimeDependenciesV1 = {},
): Promise<EstrProductionRuntimeResultV1> {
  let source: EcbEstrSeriesV1;

  try {
    source = await (dependencies.loadSource ?? getCanonicalEcbEstrSourceV1)();
  } catch {
    return unavailable(
      "Official ECB €STR source is unavailable.",
      "source",
    );
  }

  if (!isCanonicalEstrSource(source)) {
    return unavailable(
      "Official ECB €STR source identity or observations are invalid.",
      "sourceIdentity",
    );
  }

  const observations = source.canonicalSeries.observations;

  if (observations.length < ESTR_RUNTIME_MINIMUM_HISTORY_V1) {
    return unavailable(
      `Official ECB €STR history requires at least ${ESTR_RUNTIME_MINIMUM_HISTORY_V1} observations.`,
      "history",
    );
  }

  let features: RateFeatureSnapshotV1;

  try {
    features = calculateRateFeaturesV1(observations);
  } catch {
    return unavailable(
      "Official ECB €STR rate features are unavailable.",
      "features",
    );
  }

  const signal = calculateEstrRateSignalV1(features);
  if (signal.availability === "unavailable") {
    return unavailable(signal.reason, "signal");
  }

  const risk = calculateEstrRateRiskV1(features);
  if (risk.availability === "unavailable") {
    return unavailable(risk.reason, "risk");
  }

  const marketState = calculateEstrRateMarketStateV1(features, {
    signal,
    risk,
  });
  if (marketState.availability === "unavailable") {
    return unavailable(marketState.reason, "marketState");
  }

  const engineAdapter = adaptEstrRateMarketStateToEngineV3({ marketState });
  if (engineAdapter.availability === "unavailable") {
    return unavailable(engineAdapter.reason, "engineAdapter");
  }

  const provenance = source.canonicalSeries.metadata;
  const latestObservationMetadata = source.observationMetadata.at(-1)!;

  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      productId: "estr",
      product: "€STR",
      currentRatePercent: features.currentRate,
      latestReferenceDate: latestObservationMetadata.referenceDate,
      sourceTimestamp: provenance.sourceTimestamp!,
      fetchedAt: provenance.fetchedAt,
      source: Object.freeze({
        dataflow: source.dataflow,
        seriesKey: source.seriesKey,
        provenance,
        latestObservationMetadata,
      }),
      features,
      signal,
      risk,
      marketState,
      engineAdapter,
    }),
  });
}

function isCanonicalEstrSource(source: EcbEstrSeriesV1): boolean {
  const series = source.canonicalSeries;
  const metadata = series?.metadata;
  const observations = series?.observations;
  const observationMetadata = source.observationMetadata;

  if (
    source.schemaVersion !== "ecb-estr-series-v1" ||
    source.dataflow !== ECB_ESTR_DATAFLOW_V1 ||
    source.seriesKey !== ECB_ESTR_SERIES_KEY_V1 ||
    series.schemaVersion !== "canonical-observation-series-v1" ||
    metadata.provider !== "ecb" ||
    metadata.source !== "European Central Bank" ||
    metadata.seriesId !== ECB_ESTR_SERIES_ID_V1 ||
    metadata.requestedProductId !== "estr" ||
    metadata.canonicalProductId !== "estr" ||
    metadata.interval !== "1d" ||
    metadata.status !== "end_of_day" ||
    metadata.unit !== "percent" ||
    metadata.seriesKind !== "reference-rate" ||
    !Number.isFinite(metadata.fetchedAt) ||
    !Number.isFinite(metadata.sourceTimestamp) ||
    observations.length === 0 ||
    observations.length !== observationMetadata.length
  ) {
    return false;
  }

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index]!;
    const sidecar = observationMetadata[index]!;

    if (
      !Number.isFinite(observation.timestamp) ||
      !Number.isFinite(observation.value) ||
      sidecar.timestamp !== observation.timestamp ||
      (index > 0 && observation.timestamp <= observations[index - 1]!.timestamp)
    ) {
      return false;
    }
  }

  const latestObservation = observations.at(-1)!;
  const latestMetadata = observationMetadata.at(-1)!;

  return metadata.sourceTimestamp === latestObservation.timestamp &&
    Date.parse(`${latestMetadata.referenceDate}T00:00:00.000Z`) / 1000 ===
      latestObservation.timestamp;
}

function unavailable(
  reason: string,
  missing: EstrProductionRuntimeMissingFieldV1,
): EstrProductionRuntimeResultV1 {
  return Object.freeze({
    availability: "unavailable",
    reason,
    missing: Object.freeze([missing]),
  });
}
