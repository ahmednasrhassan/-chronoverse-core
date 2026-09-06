import {
  assetRegistry,
  type MarketAssetId,
} from "../core/assets";
import type {
  EngineCrossAssetExpectedSignV3,
  EngineCrossAssetHorizonV3,
} from "./contracts";

export interface CrossAssetRelationshipDefinitionV1 {
  readonly id: string;
  readonly targetAssetId: MarketAssetId;
  readonly referenceAssetId: MarketAssetId;
  readonly expectedSign: EngineCrossAssetExpectedSignV3;
  readonly weight: number;
  readonly horizon: EngineCrossAssetHorizonV3;
}

const ACTIVE_RELATIONSHIP_CANDIDATES = [
  {
    id: "ethereum-bitcoin-20d",
    targetAssetId: "ethereum",
    referenceAssetId: "bitcoin",
    expectedSign: "direct",
    weight: 1,
    horizon: { interval: "daily", observations: 20 },
  },
  {
    id: "silver-gold-20d",
    targetAssetId: "silver",
    referenceAssetId: "gold",
    expectedSign: "direct",
    weight: 1,
    horizon: { interval: "daily", observations: 20 },
  },
] as const satisfies readonly CrossAssetRelationshipDefinitionV1[];

/**
 * Validates and deterministically orders a complete active relationship model.
 * Invalid definitions throw so they cannot silently enter an aggregation denominator.
 */
export function defineCrossAssetRelationshipsV1(
  relationships: readonly CrossAssetRelationshipDefinitionV1[],
): readonly CrossAssetRelationshipDefinitionV1[] {
  const normalized = relationships
    .map((relationship) => ({
      ...relationship,
      id: relationship.id.trim(),
      horizon: { ...relationship.horizon },
    }))
    .sort(compareRelationships);
  const ids = new Set<string>();
  const pairs = new Set<string>();

  for (const relationship of normalized) {
    if (
      relationship.id.length === 0 ||
      !isMarketAssetId(relationship.targetAssetId) ||
      !isMarketAssetId(relationship.referenceAssetId) ||
      relationship.targetAssetId === relationship.referenceAssetId ||
      (relationship.expectedSign !== "direct" &&
        relationship.expectedSign !== "inverse") ||
      !Number.isFinite(relationship.weight) ||
      relationship.weight <= 0 ||
      relationship.horizon.interval !== "daily" ||
      !Number.isInteger(relationship.horizon.observations) ||
      relationship.horizon.observations <= 0
    ) {
      throw new TypeError("Cross-Asset relationship configuration is invalid.");
    }

    const pair = `${relationship.targetAssetId}\u0000${relationship.referenceAssetId}`;

    if (ids.has(relationship.id) || pairs.has(pair)) {
      throw new TypeError("Cross-Asset relationship configuration contains a duplicate.");
    }

    ids.add(relationship.id);
    pairs.add(pair);
  }

  return normalized;
}

export const activeCrossAssetRelationshipsV1 =
  defineCrossAssetRelationshipsV1(ACTIVE_RELATIONSHIP_CANDIDATES);

export function getActiveCrossAssetRelationshipsV1(
  targetAssetId: MarketAssetId,
): readonly CrossAssetRelationshipDefinitionV1[] {
  return activeCrossAssetRelationshipsV1.filter(
    (relationship) => relationship.targetAssetId === targetAssetId,
  );
}

function isMarketAssetId(value: unknown): value is MarketAssetId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(assetRegistry, value)
  );
}

function compareRelationships(
  left: CrossAssetRelationshipDefinitionV1,
  right: CrossAssetRelationshipDefinitionV1,
): number {
  return compareText(left.targetAssetId, right.targetAssetId) ||
    compareText(left.referenceAssetId, right.referenceAssetId) ||
    compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
