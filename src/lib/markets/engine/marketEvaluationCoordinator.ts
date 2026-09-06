import type { MarketAssetId } from "../core/assets";
import { marketAssetProfiles } from "../core/assetProfiles";
import type { CandleInterval } from "../core/types";
import {
  createCanonicalMarketSnapshotV1,
  normalizeCanonicalMarketSnapshotRequestV1,
  planCanonicalMarketSnapshotDependenciesV1,
  type CanonicalMarketSnapshotHistoryV1,
  type CanonicalMarketSnapshotRequestV1,
  type CanonicalMarketSnapshotV1,
} from "../services/canonicalMarketSnapshot";
import {
  calculateCanonicalCrossAssetSectionsV1,
  type CalculateCanonicalCrossAssetSectionsInputV1,
  type CanonicalCrossAssetSectionsV1,
} from "./crossAssetOrchestrator";
import { CROSS_ASSET_MINIMUM_CLOSES_V1 } from "./crossAssetFeatures";
import { activeCrossAssetRelationshipsV1 } from "./crossAssetRelationships";

export { getPrecomputedCrossAssetForTargetV1 } from "./marketEvaluationHandoff";

export const CANONICAL_MARKET_EVALUATION_SCHEMA_VERSION_V1 =
  "canonical-market-evaluation-v1" as const;

export interface CanonicalMarketEvaluationRequestV1 {
  readonly targetAssetIds: readonly MarketAssetId[];
  readonly interval: CandleInterval;
  readonly history: CanonicalMarketSnapshotHistoryV1;
}

export interface CanonicalMarketEvaluationHistoryPolicyV1 {
  readonly targetTechnicalMinimumObservationCount: number;
  readonly crossAssetReferenceMinimumObservationCount: number | null;
  readonly sharedMinimumObservationCount: number;
  readonly targetProfileHistoryLimit: number;
  readonly recommendedObservationCount: number;
}

export interface CanonicalMarketEvaluationV1 {
  readonly schemaVersion: typeof CANONICAL_MARKET_EVALUATION_SCHEMA_VERSION_V1;
  readonly availability: CanonicalMarketSnapshotV1["availability"];
  readonly computedAt: string;
  readonly requestedTargetAssetIds: readonly MarketAssetId[];
  readonly requiredObservationAssetIds: readonly MarketAssetId[];
  readonly historyPolicy: CanonicalMarketEvaluationHistoryPolicyV1;
  readonly snapshot: CanonicalMarketSnapshotV1;
  readonly crossAssetSections: CanonicalCrossAssetSectionsV1;
}

export interface CanonicalMarketEvaluationCoordinatorDependenciesV1 {
  readonly createSnapshot?: (
    request: CanonicalMarketSnapshotRequestV1,
  ) => Promise<CanonicalMarketSnapshotV1>;
  readonly calculateCrossAssetSections?: (
    input: CalculateCanonicalCrossAssetSectionsInputV1,
  ) => CanonicalCrossAssetSectionsV1;
}

/**
 * Creates one observational boundary and derives Cross-Asset evidence from it.
 * It intentionally does not execute target Engine runtimes or persistence.
 */
export async function coordinateCanonicalMarketEvaluationV1(
  request: CanonicalMarketEvaluationRequestV1,
  dependencies: CanonicalMarketEvaluationCoordinatorDependenciesV1 = {},
): Promise<CanonicalMarketEvaluationV1> {
  const normalizedTargetRequest = normalizeCanonicalMarketSnapshotRequestV1({
    assetIds: request.targetAssetIds,
    interval: request.interval,
    history: request.history,
  });

  if (normalizedTargetRequest.assetIds.length === 0) {
    throw new TypeError("Canonical market evaluation requires at least one target asset.");
  }

  const requestedTargetAssetIds = normalizedTargetRequest.assetIds;
  const requiredObservationAssetIds = planCanonicalMarketSnapshotDependenciesV1(
    requestedTargetAssetIds,
  );
  const historyPolicy = resolveCanonicalMarketEvaluationHistoryPolicyV1(
    requestedTargetAssetIds,
  );
  const snapshotRequest: CanonicalMarketSnapshotRequestV1 = Object.freeze({
    assetIds: requiredObservationAssetIds,
    interval: normalizedTargetRequest.interval,
    history: Object.freeze({
      kind: "range",
      range: normalizedTargetRequest.range,
      minimumObservationCount: normalizedTargetRequest.minimumObservationCount,
    }),
  });
  const createSnapshot = dependencies.createSnapshot ?? createCanonicalMarketSnapshotV1;
  const calculateCrossAssetSections = dependencies.calculateCrossAssetSections ??
    calculateCanonicalCrossAssetSectionsV1;

  try {
    const snapshot = await createSnapshot(snapshotRequest);
    const crossAssetSections = calculateCrossAssetSections({
      targetAssetIds: requestedTargetAssetIds,
      snapshot,
    });

    return Object.freeze({
      schemaVersion: CANONICAL_MARKET_EVALUATION_SCHEMA_VERSION_V1,
      availability: snapshot.availability,
      computedAt: snapshot.computedAt,
      requestedTargetAssetIds,
      requiredObservationAssetIds,
      historyPolicy,
      snapshot,
      crossAssetSections,
    });
  } catch {
    throw new Error("Canonical market evaluation coordination failed.");
  }
}

export function resolveCanonicalMarketEvaluationHistoryPolicyV1(
  targetAssetIds: readonly MarketAssetId[],
): CanonicalMarketEvaluationHistoryPolicyV1 {
  const normalized = normalizeCanonicalMarketSnapshotRequestV1({
    assetIds: targetAssetIds,
    interval: "1d",
    history: { kind: "range", range: "max" },
  }).assetIds;

  if (normalized.length === 0) {
    throw new TypeError("Canonical market evaluation history policy requires a target.");
  }

  const targetTechnicalMinimumObservationCount = Math.max(
    ...normalized.map((assetId) => marketAssetProfiles[assetId].technical.ema.slow),
  );
  const targetProfileHistoryLimit = Math.max(
    ...normalized.map((assetId) => marketAssetProfiles[assetId].historyLimit),
  );
  const targetSet = new Set(normalized);
  const hasCrossAssetReference = activeCrossAssetRelationshipsV1.some(
    (relationship) => targetSet.has(relationship.targetAssetId),
  );
  const crossAssetReferenceMinimumObservationCount = hasCrossAssetReference
    ? CROSS_ASSET_MINIMUM_CLOSES_V1
    : null;
  const sharedMinimumObservationCount = Math.max(
    targetTechnicalMinimumObservationCount,
    crossAssetReferenceMinimumObservationCount ?? 0,
  );

  return Object.freeze({
    targetTechnicalMinimumObservationCount,
    crossAssetReferenceMinimumObservationCount,
    sharedMinimumObservationCount,
    targetProfileHistoryLimit,
    recommendedObservationCount: Math.max(
      targetProfileHistoryLimit,
      crossAssetReferenceMinimumObservationCount ?? 0,
    ),
  });
}
