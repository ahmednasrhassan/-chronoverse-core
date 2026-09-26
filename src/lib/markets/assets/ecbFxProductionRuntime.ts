import type { MarketAssetProfile } from "../core/assetProfile";
import type { MarketAssetId } from "../core/assets";
import {
  integrateCanonicalDecisionLifecycleV3,
} from "../engine/decisionLifecycleRuntime";
import {
  runGenericAssetRuntimeV1,
  type GenericAssetRuntimeOutputV1,
} from "../engine/genericAssetRuntime";
import {
  coordinateCanonicalMarketEvaluationV1,
  type CanonicalMarketEvaluationRequestV1,
} from "../engine/marketEvaluationCoordinator";
import {
  calculateMinimumTechnicalObservationCountV1,
  prepareAssetEvaluationV1,
} from "../engine/preparedAssetEvaluation";
import {
  ECB_FX_REFERENCE_PRODUCTS_V1,
} from "../providers/ecb/fxReferenceSeries";
import {
  getCanonicalEcbFxReferenceSeriesV1,
} from "../providers/ecb/fxReferenceSeriesCache";
import type { EcbFxReferenceProductIdV1 } from "../providers/ecb/types";
import {
  advanceCanonicalDecisionSnapshot,
} from "../persistence/decisionSnapshotRedis";
import {
  createCanonicalMarketSnapshotV1,
} from "../services/canonicalMarketSnapshot";
import type {
  CanonicalObservationSeriesMetadataV1,
  CanonicalObservationSeriesV1,
} from "../services/canonicalObservationSeries";

const ECB_FX_HISTORY_RANGE = "max";

type ProductionEcbFxProductId = Extract<
  MarketAssetId,
  EcbFxReferenceProductIdV1
>;
type AvailableGenericEcbFxRuntimeV1 = Extract<
  GenericAssetRuntimeOutputV1,
  { readonly availability: "available" }
>;

export type EcbFxProductionIntelligenceV1 =
  AvailableGenericEcbFxRuntimeV1 & {
    readonly provenance: CanonicalObservationSeriesMetadataV1;
  };

export interface EcbFxProductionRuntimeDependenciesV1 {
  readonly loadCanonicalSeries?: () => Promise<CanonicalObservationSeriesV1>;
  readonly now?: () => Date;
  readonly integrateDecisionLifecycle?:
    typeof integrateCanonicalDecisionLifecycleV3;
  readonly advanceDecisionSnapshot?:
    typeof advanceCanonicalDecisionSnapshot;
}

export async function runCanonicalLiveEcbFxIntelligenceV1(
  productId: ProductionEcbFxProductId,
  profile: MarketAssetProfile,
  displayName: string,
  dependencies: EcbFxProductionRuntimeDependenciesV1 = {},
): Promise<EcbFxProductionIntelligenceV1> {
  if (profile.id !== productId) {
    throw new TypeError("ECB FX production profile identity is invalid.");
  }

  const loadCanonicalSeries = dependencies.loadCanonicalSeries ??
    (() => getCanonicalEcbFxReferenceSeriesV1(productId));
  const series = await loadCanonicalSeries();

  assertOfficialEcbFxSeries(productId, displayName, series);

  const minimumRequiredHistory =
    calculateMinimumTechnicalObservationCountV1(profile);
  const evaluation = await coordinateOfficialEcbFxMarketEvaluationV1(
    {
      targetAssetIds: [productId],
      interval: profile.defaultInterval,
      history: {
        kind: "required-observations",
        requiredObservationCount: minimumRequiredHistory,
        range: ECB_FX_HISTORY_RANGE,
      },
    },
    productId,
    displayName,
    series,
    dependencies.now,
  );
  const prepared = prepareAssetEvaluationV1(
    evaluation,
    productId,
    {
      applicability: "not-applicable",
      reason: `No canonical ${displayName} Macro model is configured.`,
    },
  );
  const runtime = runGenericAssetRuntimeV1(prepared);

  if (runtime.availability !== "available") {
    throw new Error(
      `[Chronoverse ${displayName}] Official ECB reference-rate history is unavailable.`,
    );
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

async function coordinateOfficialEcbFxMarketEvaluationV1(
  request: CanonicalMarketEvaluationRequestV1,
  productId: ProductionEcbFxProductId,
  displayName: string,
  series: CanonicalObservationSeriesV1,
  now: (() => Date) | undefined,
) {
  return coordinateCanonicalMarketEvaluationV1(request, {
    createSnapshot: async (snapshotRequest) => {
      if (
        snapshotRequest.assetIds.length !== 1 ||
        snapshotRequest.assetIds[0] !== productId
      ) {
        throw new TypeError(
          `Official ${displayName} production requires a ${displayName}-only market snapshot.`,
        );
      }

      return createCanonicalMarketSnapshotV1(snapshotRequest, {
        loadHistoricalMarketData: async () => series,
        ...(now === undefined ? {} : { now }),
      });
    },
  });
}

function assertOfficialEcbFxSeries(
  productId: ProductionEcbFxProductId,
  displayName: string,
  series: CanonicalObservationSeriesV1,
): void {
  const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
  const metadata = series.metadata;

  if (
    series.schemaVersion !== "canonical-observation-series-v1" ||
    product.inverted !== false ||
    metadata.provider !== "ecb" ||
    metadata.source !== "European Central Bank" ||
    metadata.seriesId !== product.seriesId ||
    metadata.requestedProductId !== productId ||
    metadata.canonicalProductId !== productId ||
    metadata.interval !== "1d" ||
    metadata.status !== "end_of_day" ||
    metadata.unit !== product.unit ||
    metadata.seriesKind !== "reference-rate" ||
    !Number.isFinite(metadata.fetchedAt) ||
    !Number.isFinite(metadata.sourceTimestamp)
  ) {
    throw new TypeError(
      `[Chronoverse ${displayName}] Official ECB series identity is invalid.`,
    );
  }
}
