import {
  assetRegistry,
  type MarketAssetId,
} from "../core/assets";
import {
  CANONICAL_MARKET_ASSET_IDS,
  CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
  type CanonicalMarketSnapshotAssetV1,
  type CanonicalMarketSnapshotV1,
} from "../services/canonicalMarketSnapshot";
import type { EngineCrossAssetSectionV3 } from "./contracts";
import {
  calculateCanonicalCrossAssetFeaturesV1,
  calculateCrossAssetReferenceMoveV1,
  CROSS_ASSET_VOLATILITY_RETURNS_V1,
  type CalculateCrossAssetReferenceMoveInputV1,
  type CrossAssetReferenceMoveResultV1,
  type CrossAssetRelationshipObservationInputV1,
} from "./crossAssetFeatures";
import {
  activeCrossAssetRelationshipsV1,
  defineCrossAssetRelationshipsV1,
  type CrossAssetRelationshipDefinitionV1,
} from "./crossAssetRelationships";

export interface CanonicalCrossAssetTargetSectionV1 {
  readonly targetAssetId: MarketAssetId;
  readonly crossAsset: EngineCrossAssetSectionV3;
}

export interface CanonicalCrossAssetSectionsV1 {
  readonly targetAssetIds: readonly MarketAssetId[];
  readonly sections: readonly CanonicalCrossAssetTargetSectionV1[];
}

export type CalculateCanonicalCrossAssetSectionsInputV1 =
  | {
      readonly availability: "not-computed";
      readonly targetAssetIds: readonly MarketAssetId[];
      readonly snapshot?: never;
      readonly relationships?: never;
    }
  | {
      readonly availability?: "applicable";
      readonly targetAssetIds: readonly MarketAssetId[];
      readonly snapshot: CanonicalMarketSnapshotV1;
      readonly relationships?: readonly CrossAssetRelationshipDefinitionV1[];
    };

export interface CanonicalCrossAssetOrchestratorDependenciesV1 {
  /** Pure test seam; production uses the locked V1 reference-move calculator. */
  readonly calculateReferenceMove?: (
    input: CalculateCrossAssetReferenceMoveInputV1,
  ) => CrossAssetReferenceMoveResultV1;
}

export function createCanonicalCrossAssetReferenceFeatureKeyV1(
  referenceAssetId: MarketAssetId,
  horizonObservations: number,
  volatilityReturnCount: number,
): string {
  return [
    "cross-asset-reference-feature-v1",
    referenceAssetId,
    "daily",
    horizonObservations,
    volatilityReturnCount,
  ].join(":");
}

/**
 * Converts one supplied canonical snapshot into deterministic target sections.
 * Target price history is intentionally unnecessary: Cross-Asset evidence is
 * calculated solely from each target's configured external reference series.
 */
export function calculateCanonicalCrossAssetSectionsV1(
  input: CalculateCanonicalCrossAssetSectionsInputV1,
  dependencies: CanonicalCrossAssetOrchestratorDependenciesV1 = {},
): CanonicalCrossAssetSectionsV1 {
  const targetAssetIds = normalizeTargetAssetIds(input.targetAssetIds);

  if (input.availability === "not-computed") {
    return freezeBatch(
      targetAssetIds,
      targetAssetIds.map((targetAssetId) => ({
        targetAssetId,
        crossAsset: { availability: "not-computed" },
      })),
    );
  }

  validateSnapshotBoundary(input.snapshot);

  const relationships = defineCrossAssetRelationshipsV1(
    input.relationships ?? activeCrossAssetRelationshipsV1,
  );
  const calculateReferenceMove = dependencies.calculateReferenceMove ??
    calculateCrossAssetReferenceMoveV1;
  const featureMap = new Map<string, CrossAssetReferenceMoveResultV1>();
  const sections = targetAssetIds.map((targetAssetId) => {
    const targetRelationships = relationships.filter(
      (relationship) => relationship.targetAssetId === targetAssetId,
    );
    const observations = targetRelationships.map((relationship) =>
      createRelationshipObservation(
        relationship,
        input.snapshot,
        featureMap,
        calculateReferenceMove,
      )
    );

    return {
      targetAssetId,
      crossAsset: calculateCanonicalCrossAssetFeaturesV1({
        availability: "applicable",
        targetAssetId,
        relationships: observations,
      }),
    };
  });

  return freezeBatch(targetAssetIds, sections);
}

function createRelationshipObservation(
  relationship: CrossAssetRelationshipDefinitionV1,
  snapshot: CanonicalMarketSnapshotV1,
  featureMap: Map<string, CrossAssetReferenceMoveResultV1>,
  calculateReferenceMove: (
    input: CalculateCrossAssetReferenceMoveInputV1,
  ) => CrossAssetReferenceMoveResultV1,
): CrossAssetRelationshipObservationInputV1 {
  const common = {
    ...relationship,
    horizon: { ...relationship.horizon },
  };
  const reference = findSnapshotReference(snapshot, relationship.referenceAssetId);

  if (reference.availability === "unavailable") {
    return {
      ...common,
      availability: "unavailable",
      reason: reference.reason,
    };
  }

  const volatilityReturnCount = CROSS_ASSET_VOLATILITY_RETURNS_V1;
  const minimumObservationCount = Math.max(
    relationship.horizon.observations + 1,
    volatilityReturnCount + 1,
  );

  if (reference.asset.interval !== "1d") {
    return {
      ...common,
      availability: "unavailable",
      reason: `Reference asset ${relationship.referenceAssetId} requires daily observations.`,
    };
  }

  if (reference.asset.observations.length < minimumObservationCount) {
    return {
      ...common,
      availability: "unavailable",
      reason: `Reference asset ${relationship.referenceAssetId} requires at least ${minimumObservationCount} observations.`,
    };
  }

  const featureKey = createCanonicalCrossAssetReferenceFeatureKeyV1(
    relationship.referenceAssetId,
    relationship.horizon.observations,
    volatilityReturnCount,
  );
  let feature = featureMap.get(featureKey);

  if (feature === undefined) {
    try {
      feature = calculateReferenceMove({
        observations: reference.asset.observations,
        horizonObservations: relationship.horizon.observations,
        volatilityReturnCount,
      });
    } catch {
      feature = {
        availability: "unavailable",
        reason: "Cross-Asset reference feature calculation failed.",
      };
    }

    if (
      feature.availability === "available" &&
      (
        !Number.isFinite(feature.referenceMoveScore) ||
        feature.referenceMoveScore <= -1 ||
        feature.referenceMoveScore >= 1
      )
    ) {
      feature = {
        availability: "unavailable",
        reason: "Cross-Asset reference feature is invalid.",
      };
    }

    featureMap.set(featureKey, feature);
  }

  const latestTimestamp = reference.asset.observations.at(-1)?.timestamp;

  return feature.availability === "available"
    ? {
        ...common,
        availability: "available",
        referenceMoveScore: feature.referenceMoveScore,
        ...(latestTimestamp === undefined
          ? {}
          : {
              latestTimestamp,
              observedAt: new Date(latestTimestamp * 1_000).toISOString(),
            }),
      }
    : {
        ...common,
        availability: "unavailable",
        reason: feature.reason,
      };
}

type SnapshotReferenceResult =
  | {
      readonly availability: "available";
      readonly asset: CanonicalMarketSnapshotAssetV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
    };

function findSnapshotReference(
  snapshot: CanonicalMarketSnapshotV1,
  referenceAssetId: MarketAssetId,
): SnapshotReferenceResult {
  if (!snapshot.requestedAssetIds.includes(referenceAssetId)) {
    return {
      availability: "unavailable",
      reason: `Reference asset ${referenceAssetId} is absent from the supplied snapshot.`,
    };
  }

  const matches = snapshot.assets.filter((asset) => asset.assetId === referenceAssetId);

  if (matches.length !== 1) {
    return {
      availability: "unavailable",
      reason: `Reference asset ${referenceAssetId} is inconsistent in the supplied snapshot.`,
    };
  }

  const asset = matches[0]!;

  if (asset.availability !== "available") {
    return {
      availability: "unavailable",
      reason: `Reference asset ${referenceAssetId} is unavailable in the supplied snapshot.`,
    };
  }

  return { availability: "available", asset };
}

function validateSnapshotBoundary(snapshot: CanonicalMarketSnapshotV1): void {
  if (snapshot.schemaVersion !== CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1) {
    throw new TypeError("Canonical Cross-Asset snapshot schema is unsupported.");
  }
}

function normalizeTargetAssetIds(
  targetAssetIds: readonly MarketAssetId[],
): readonly MarketAssetId[] {
  const requested = new Set<MarketAssetId>();

  for (const targetAssetId of targetAssetIds) {
    if (
      typeof targetAssetId !== "string" ||
      !Object.prototype.hasOwnProperty.call(assetRegistry, targetAssetId)
    ) {
      throw new TypeError("Canonical Cross-Asset target asset ID is invalid.");
    }

    requested.add(targetAssetId);
  }

  return Object.freeze(
    CANONICAL_MARKET_ASSET_IDS.filter((assetId) => requested.has(assetId)),
  );
}

function freezeBatch(
  targetAssetIds: readonly MarketAssetId[],
  sections: readonly CanonicalCrossAssetTargetSectionV1[],
): CanonicalCrossAssetSectionsV1 {
  return Object.freeze({
    targetAssetIds,
    sections: Object.freeze(
      sections.map((section) => Object.freeze(section)),
    ),
  });
}
