import {
  integrateCanonicalDecisionLifecycleV3,
} from "../../engine/decisionLifecycleRuntime";
import {
  runGenericAssetRuntimeV1,
  type GenericAssetRuntimeOutputV1,
} from "../../engine/genericAssetRuntime";
import {
  coordinateCanonicalMarketEvaluationV1,
  type CanonicalMarketEvaluationRequestV1,
} from "../../engine/marketEvaluationCoordinator";
import {
  calculateMinimumTechnicalObservationCountV1,
  prepareAssetEvaluationV1,
} from "../../engine/preparedAssetEvaluation";
import {
  ECB_FX_REFERENCE_PRODUCTS_V1,
} from "../../providers/ecb/fxReferenceSeries";
import {
  getCanonicalEcbFxReferenceSeriesV1,
} from "../../providers/ecb/fxReferenceSeriesCache";
import {
  advanceCanonicalDecisionSnapshot,
} from "../../persistence/decisionSnapshotRedis";
import {
  createCanonicalMarketSnapshotV1,
} from "../../services/canonicalMarketSnapshot";
import type {
  CanonicalObservationSeriesMetadataV1,
  CanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";
import { eurusdProfile } from "./profile";

const EURUSD_HISTORY_RANGE = "max";
const EURUSD_HISTORY_UNAVAILABLE_MESSAGE =
  "[Chronoverse EUR/USD] Official ECB reference-rate history is unavailable.";
const EURUSD_MACRO_NOT_APPLICABLE_REASON =
  "No canonical EUR/USD Macro model is configured.";

type AvailableGenericEurUsdRuntimeV1 = Extract<
  GenericAssetRuntimeOutputV1,
  { readonly availability: "available" }
>;

export type EurUsdProductionIntelligenceV1 =
  AvailableGenericEurUsdRuntimeV1 & {
    readonly provenance: CanonicalObservationSeriesMetadataV1;
  };

export interface EurUsdProductionRuntimeDependenciesV1 {
  readonly loadCanonicalSeries?: () => Promise<CanonicalObservationSeriesV1>;
  readonly now?: () => Date;
  readonly integrateDecisionLifecycle?:
    typeof integrateCanonicalDecisionLifecycleV3;
  readonly advanceDecisionSnapshot?:
    typeof advanceCanonicalDecisionSnapshot;
}

/**
 * Fresh EUR/USD production computation. The shared result-delivery service owns
 * final-result caching, while the default loader reuses the daily ECB bundle.
 */
export async function getCanonicalLiveEurUsdIntelligence(
  dependencies: EurUsdProductionRuntimeDependenciesV1 = {},
): Promise<EurUsdProductionIntelligenceV1> {
  const loadCanonicalSeries = dependencies.loadCanonicalSeries ??
    (() => getCanonicalEcbFxReferenceSeriesV1("eurusd"));
  const series = await loadCanonicalSeries();

  assertOfficialEurUsdSeries(series);

  const minimumRequiredHistory =
    calculateMinimumTechnicalObservationCountV1(eurusdProfile);
  const evaluation = await coordinateOfficialEurUsdMarketEvaluationV1(
    {
      targetAssetIds: ["eurusd"],
      interval: eurusdProfile.defaultInterval,
      history: {
        kind: "required-observations",
        requiredObservationCount: minimumRequiredHistory,
        range: EURUSD_HISTORY_RANGE,
      },
    },
    series,
    dependencies.now,
  );
  const prepared = prepareAssetEvaluationV1(
    evaluation,
    "eurusd",
    {
      applicability: "not-applicable",
      reason: EURUSD_MACRO_NOT_APPLICABLE_REASON,
    },
  );
  const runtime = runGenericAssetRuntimeV1(prepared);

  if (runtime.availability !== "available") {
    throw new Error(EURUSD_HISTORY_UNAVAILABLE_MESSAGE);
  }

  const integrateDecisionLifecycle =
    dependencies.integrateDecisionLifecycle ??
    integrateCanonicalDecisionLifecycleV3;
  const decisionIntegration = await integrateDecisionLifecycle({
    assetId: runtime.engineResult.asset,
    computedAt: runtime.engineResult.evaluatedAt,
    currentDecision: runtime.engineResult.decision,
    advanceSnapshot:
      dependencies.advanceDecisionSnapshot ??
      advanceCanonicalDecisionSnapshot,
  });
  const engineResult = {
    ...runtime.engineResult,
    ...decisionIntegration,
  };

  return Object.freeze({
    ...runtime,
    engineResult,
    provenance: series.metadata,
  });
}

async function coordinateOfficialEurUsdMarketEvaluationV1(
  request: CanonicalMarketEvaluationRequestV1,
  series: CanonicalObservationSeriesV1,
  now: (() => Date) | undefined,
) {
  return coordinateCanonicalMarketEvaluationV1(request, {
    createSnapshot: async (snapshotRequest) => {
      if (
        snapshotRequest.assetIds.length !== 1 ||
        snapshotRequest.assetIds[0] !== "eurusd"
      ) {
        throw new TypeError(
          "Official EUR/USD production requires a EUR/USD-only market snapshot.",
        );
      }

      return createCanonicalMarketSnapshotV1(snapshotRequest, {
        loadHistoricalMarketData: async () => series,
        ...(now === undefined ? {} : { now }),
      });
    },
  });
}

function assertOfficialEurUsdSeries(
  series: CanonicalObservationSeriesV1,
): void {
  const product = ECB_FX_REFERENCE_PRODUCTS_V1.eurusd;
  const metadata = series.metadata;

  if (
    series.schemaVersion !== "canonical-observation-series-v1" ||
    product.inverted !== false ||
    product.quotation !== "EUR 1 = X USD" ||
    metadata.provider !== "ecb" ||
    metadata.source !== "European Central Bank" ||
    metadata.seriesId !== "EXR.D.USD.EUR.SP00.A" ||
    metadata.requestedProductId !== "eurusd" ||
    metadata.canonicalProductId !== "eurusd" ||
    metadata.interval !== "1d" ||
    metadata.status !== "end_of_day" ||
    metadata.unit !== "USD per EUR" ||
    metadata.seriesKind !== "reference-rate" ||
    !Number.isFinite(metadata.fetchedAt) ||
    !Number.isFinite(metadata.sourceTimestamp)
  ) {
    throw new TypeError(
      "[Chronoverse EUR/USD] Official ECB series identity is invalid.",
    );
  }
}
