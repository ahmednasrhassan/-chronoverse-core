import type { MarketAssetId } from "../core/assets";
import type {
  EngineCrossAssetRelationshipV3,
  EngineCrossAssetSectionV3,
} from "./contracts";
import {
  defineCrossAssetRelationshipsV1,
  type CrossAssetRelationshipDefinitionV1,
} from "./crossAssetRelationships";

export const CROSS_ASSET_REFERENCE_HORIZON_V1 = 20;
export const CROSS_ASSET_VOLATILITY_RETURNS_V1 = 60;
export const CROSS_ASSET_MINIMUM_CLOSES_V1 = Math.max(
  CROSS_ASSET_REFERENCE_HORIZON_V1 + 1,
  CROSS_ASSET_VOLATILITY_RETURNS_V1 + 1,
);

export interface CrossAssetCloseObservationV1 {
  readonly close: number;
  /** Unix timestamp in seconds. If supplied, every observation must supply one. */
  readonly timestamp?: number;
}

export type CrossAssetReferenceMoveResultV1 =
  | {
      readonly availability: "available";
      readonly referenceMoveScore: number;
      readonly observedAt?: string;
      readonly latestTimestamp?: number;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
    };

export interface CalculateCrossAssetReferenceMoveInputV1 {
  readonly observations: readonly CrossAssetCloseObservationV1[];
  readonly horizonObservations?: number;
  readonly volatilityReturnCount?: number;
}

export function calculateCrossAssetReferenceMoveV1(
  input: CalculateCrossAssetReferenceMoveInputV1,
): CrossAssetReferenceMoveResultV1 {
  const horizon = input.horizonObservations ?? CROSS_ASSET_REFERENCE_HORIZON_V1;
  const volatilityReturnCount =
    input.volatilityReturnCount ?? CROSS_ASSET_VOLATILITY_RETURNS_V1;

  if (
    !Number.isInteger(horizon) ||
    horizon <= 0 ||
    !Number.isInteger(volatilityReturnCount) ||
    volatilityReturnCount < 2
  ) {
    return unavailable("Invalid Cross-Asset reference move configuration.");
  }

  const minimumCloses = Math.max(horizon + 1, volatilityReturnCount + 1);

  if (input.observations.length < minimumCloses) {
    return unavailable(`At least ${minimumCloses} ordered daily closes are required.`);
  }

  const hasAnyTimestamp = input.observations.some(
    (observation) => observation.timestamp !== undefined,
  );

  for (let index = 0; index < input.observations.length; index += 1) {
    const observation = input.observations[index];

    if (
      observation === undefined ||
      !Number.isFinite(observation.close) ||
      observation.close <= 0
    ) {
      return unavailable("Every Cross-Asset close must be finite and positive.");
    }

    if (hasAnyTimestamp) {
      const timestamp = observation.timestamp;
      const previousTimestamp = input.observations[index - 1]?.timestamp;

      if (
        timestamp === undefined ||
        !Number.isFinite(timestamp) ||
        (previousTimestamp !== undefined && timestamp <= previousTimestamp)
      ) {
        return unavailable("Cross-Asset timestamps must be finite and strictly increasing.");
      }
    }
  }

  const closes = input.observations.map((observation) => observation.close);
  const latestIndex = closes.length - 1;
  const horizonMove = Math.log(
    closes[latestIndex]! / closes[latestIndex - horizon]!,
  );
  const returnsStart = closes.length - volatilityReturnCount - 1;
  const returns: number[] = [];

  for (let index = returnsStart + 1; index < closes.length; index += 1) {
    returns.push(Math.log(closes[index]! / closes[index - 1]!));
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / (returns.length - 1);
  const dailyVolatility = Math.sqrt(variance);

  if (!Number.isFinite(dailyVolatility) || dailyVolatility <= 0) {
    return unavailable("Cross-Asset daily volatility must be finite and positive.");
  }

  const z = horizonMove / (dailyVolatility * Math.sqrt(horizon));
  const referenceMoveScore = (2 / Math.PI) * Math.atan(z);

  if (!Number.isFinite(referenceMoveScore)) {
    return unavailable("Cross-Asset reference move is non-finite.");
  }

  const latestTimestamp = input.observations.at(-1)?.timestamp;

  return {
    availability: "available",
    referenceMoveScore,
    ...(latestTimestamp === undefined
      ? {}
      : {
          latestTimestamp,
          observedAt: new Date(latestTimestamp * 1_000).toISOString(),
        }),
  };
}

export type CrossAssetRelationshipObservationInputV1 =
  | (CrossAssetRelationshipDefinitionV1 & {
      readonly availability: "available";
      readonly referenceMoveScore: number;
      readonly observedAt?: string;
      readonly latestTimestamp?: number;
    })
  | (CrossAssetRelationshipDefinitionV1 & {
      readonly availability: "unavailable";
      readonly reason?: string;
      readonly observedAt?: string;
      readonly latestTimestamp?: number;
    });

export type CanonicalCrossAssetFeaturesInputV1 =
  | {
      readonly availability: "applicable";
      readonly targetAssetId: MarketAssetId;
      readonly relationships: readonly CrossAssetRelationshipObservationInputV1[];
    }
  | { readonly availability: "not-computed" };

const INVALID_CONFIGURATION_REASON =
  "Canonical Cross-Asset relationship configuration is invalid.";
const NO_USABLE_EVIDENCE_REASON =
  "No usable canonical Cross-Asset evidence is available.";
const NO_CONFIGURED_MODEL_REASON =
  "No active approved Cross-Asset relationships are configured for this target.";

/** Pure aggregation of already normalized reference moves. */
export function calculateCanonicalCrossAssetFeaturesV1(
  input: CanonicalCrossAssetFeaturesInputV1,
): EngineCrossAssetSectionV3 {
  if (input.availability === "not-computed") {
    return input;
  }

  if (input.relationships.length === 0) {
    return {
      availability: "not-applicable",
      reason: NO_CONFIGURED_MODEL_REASON,
    };
  }

  let definitions: readonly CrossAssetRelationshipDefinitionV1[];

  try {
    definitions = defineCrossAssetRelationshipsV1(input.relationships);
  } catch {
    return { availability: "unavailable", reason: INVALID_CONFIGURATION_REASON };
  }

  if (definitions.some((relationship) => relationship.targetAssetId !== input.targetAssetId)) {
    return { availability: "unavailable", reason: INVALID_CONFIGURATION_REASON };
  }

  const normalized = input.relationships
    .map(normalizeObservation)
    .sort((left, right) => compareText(left.id, right.id));

  if (normalized.some((relationship) =>
    relationship.availability === "available" &&
    (!Number.isFinite(relationship.referenceMoveScore) ||
      relationship.referenceMoveScore <= -1 ||
      relationship.referenceMoveScore >= 1)
  )) {
    return { availability: "unavailable", reason: INVALID_CONFIGURATION_REASON };
  }

  const totalWeight = definitions.reduce(
    (sum, relationship) => sum + relationship.weight,
    0,
  );
  const usable = normalized.filter(
    (relationship): relationship is Extract<
      CrossAssetRelationshipObservationInputV1,
      { readonly availability: "available" }
    > => relationship.availability === "available",
  );
  const availableWeight = usable.reduce(
    (sum, relationship) => sum + relationship.weight,
    0,
  );

  if (usable.length === 0 || !Number.isFinite(availableWeight) || availableWeight <= 0) {
    return { availability: "unavailable", reason: NO_USABLE_EVIDENCE_REASON };
  }

  const weightedEvidence = usable.reduce(
    (sum, relationship) =>
      sum + relationship.weight * signMultiplier(relationship.expectedSign) *
        relationship.referenceMoveScore,
    0,
  );
  const score = weightedEvidence / availableWeight;
  const coverage = availableWeight / totalWeight;
  const relationships = normalized.map(
    (relationship): EngineCrossAssetRelationshipV3 => {
      if (relationship.availability === "unavailable") {
        return relationship;
      }

      const signedEvidence =
        signMultiplier(relationship.expectedSign) * relationship.referenceMoveScore;

      return {
        ...relationship,
        signedEvidence,
        weightedContribution:
          (relationship.weight * signedEvidence) / totalWeight,
      };
    },
  );
  const data = {
    score,
    strengthMagnitude: Math.abs(score),
    coverage,
    relationships,
    dataQuality: { availability: "not-computed" },
  } as const;
  const missing = relationships
    .filter((relationship) => relationship.availability === "unavailable")
    .map((relationship) => relationship.id);

  return missing.length === 0
    ? { availability: "available", data }
    : { availability: "partial", data, missing };
}

function normalizeObservation(
  relationship: CrossAssetRelationshipObservationInputV1,
): CrossAssetRelationshipObservationInputV1 {
  const common = {
    id: relationship.id.trim(),
    targetAssetId: relationship.targetAssetId,
    referenceAssetId: relationship.referenceAssetId,
    expectedSign: relationship.expectedSign,
    weight: relationship.weight,
    horizon: { ...relationship.horizon },
  };
  const observedAt = relationship.observedAt?.trim();
  const timestamps = {
    ...(observedAt ? { observedAt } : {}),
    ...(relationship.latestTimestamp === undefined
      ? {}
      : { latestTimestamp: relationship.latestTimestamp }),
  };

  return relationship.availability === "available"
    ? {
        ...common,
        availability: "available",
        referenceMoveScore: relationship.referenceMoveScore,
        ...timestamps,
      }
    : {
        ...common,
        availability: "unavailable",
        ...(relationship.reason?.trim()
          ? { reason: relationship.reason.trim() }
          : {}),
        ...timestamps,
      };
}

function signMultiplier(expectedSign: "direct" | "inverse"): 1 | -1 {
  return expectedSign === "direct" ? 1 : -1;
}

function unavailable(reason: string): CrossAssetReferenceMoveResultV1 {
  return { availability: "unavailable", reason };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
