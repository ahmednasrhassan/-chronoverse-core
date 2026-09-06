import type { MarketAssetId } from "../../core/assets";
import { marketAssetProfiles } from "../../core/assetProfiles";
import type { EngineCrossAssetSectionV3 } from "../../engine/contracts";
import {
  calculateCanonicalCrossAssetSectionsV1,
  createCanonicalCrossAssetReferenceFeatureKeyV1,
  type CanonicalCrossAssetSectionsV1,
} from "../../engine/crossAssetOrchestrator";
import type { CrossAssetRelationshipDefinitionV1 } from "../../engine/crossAssetRelationships";
import {
  CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
  type CanonicalMarketObservationV1,
  type CanonicalMarketSnapshotAssetV1,
  type CanonicalMarketSnapshotV1,
} from "../../services/canonicalMarketSnapshot";

const computedAt = "2026-09-06T12:00:00.000Z";
const horizon = { interval: "daily", observations: 20 } as const;

function observations(count = 61): readonly CanonicalMarketObservationV1[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) => Object.freeze({
      timestamp: 1_700_000_000 + index * 86_400,
      close: 100 * Math.exp(index * 0.003 + (index % 3 - 1) * 0.002),
    })),
  );
}

function availableAsset(
  assetId: MarketAssetId,
  count = 61,
): CanonicalMarketSnapshotAssetV1 {
  const profile = marketAssetProfiles[assetId];
  const series = observations(count);

  return Object.freeze({
    assetId,
    symbol: profile.symbol,
    assetClass: profile.assetClass,
    interval: "1d",
    observations: series,
    observationCount: series.length,
    earliestTimestamp: series.at(0)?.timestamp,
    latestTimestamp: series.at(-1)?.timestamp,
    availability: "available",
    status: "end_of_day",
  });
}

function unavailableAsset(assetId: MarketAssetId): CanonicalMarketSnapshotAssetV1 {
  const profile = marketAssetProfiles[assetId];

  return Object.freeze({
    assetId,
    symbol: profile.symbol,
    assetClass: profile.assetClass,
    interval: "1d",
    observations: observations(),
    observationCount: 61,
    availability: "unavailable",
    status: "unavailable",
    reason: "Sanitized upstream failure.",
  });
}

function snapshot(
  assets: readonly CanonicalMarketSnapshotAssetV1[],
  requestedAssetIds: readonly MarketAssetId[] = assets.map((asset) => asset.assetId),
): CanonicalMarketSnapshotV1 {
  const availableCount = assets.filter((asset) => asset.availability === "available").length;

  return Object.freeze({
    schemaVersion: CANONICAL_MARKET_SNAPSHOT_SCHEMA_VERSION_V1,
    computedAt,
    requestedAssetIds: Object.freeze([...requestedAssetIds]),
    assets: Object.freeze([...assets]),
    availability: availableCount === assets.length
      ? "available"
      : availableCount === 0
        ? "unavailable"
        : "partial",
  });
}

function edge(
  id: string,
  targetAssetId: MarketAssetId,
  referenceAssetId: MarketAssetId,
  expectedSign: "direct" | "inverse" = "direct",
  weight = 1,
): CrossAssetRelationshipDefinitionV1 {
  return {
    id,
    targetAssetId,
    referenceAssetId,
    expectedSign,
    weight,
    horizon,
  };
}

function section(
  batch: CanonicalCrossAssetSectionsV1,
  targetAssetId: MarketAssetId,
): EngineCrossAssetSectionV3 {
  const result = batch.sections.find((candidate) => candidate.targetAssetId === targetAssetId);

  if (result === undefined) {
    throw new Error(`Missing target section: ${targetAssetId}`);
  }

  return result.crossAsset;
}

function usable(
  value: EngineCrossAssetSectionV3,
  label: string,
): Extract<EngineCrossAssetSectionV3, { availability: "available" | "partial" }> {
  if (value.availability !== "available" && value.availability !== "partial") {
    throw new Error(`${label}: expected usable, received ${value.availability}`);
  }

  return value;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertThrows(run: () => unknown, label: string): void {
  let threw = false;

  try {
    run();
  } catch {
    threw = true;
  }

  assertEqual(threw, true, label);
}

const referenceOnlySnapshot = snapshot([
  availableAsset("bitcoin"),
  availableAsset("gold"),
]);
const beforeOrchestration = JSON.stringify(referenceOnlySnapshot);
const activeBatch = calculateCanonicalCrossAssetSectionsV1({
  targetAssetIds: ["ethereum", "silver", "ethereum"],
  snapshot: referenceOnlySnapshot,
});

assertEqual(activeBatch.targetAssetIds.join(","), "silver,ethereum", "canonical target ordering");
const silver = usable(section(activeBatch, "silver"), "Silver");
const ethereum = usable(section(activeBatch, "ethereum"), "Ethereum");

assertEqual(silver.availability, "available", "Silver availability");
assertEqual(ethereum.availability, "available", "Ethereum availability");
assertEqual(silver.data.relationships[0]?.referenceAssetId, "gold", "Silver reference");
assertEqual(ethereum.data.relationships[0]?.referenceAssetId, "bitcoin", "Ethereum reference");
assertEqual(
  silver.data.relationships[0]?.availability === "available"
    ? silver.data.relationships[0].latestTimestamp
    : null,
  observations().at(-1)?.timestamp,
  "reference latest timestamp",
);
assertEqual(
  silver.data.relationships[0]?.availability === "available"
    ? silver.data.relationships[0].observedAt
    : null,
  new Date(observations().at(-1)!.timestamp * 1_000).toISOString(),
  "market observation timestamp",
);
assertEqual(JSON.stringify(referenceOnlySnapshot), beforeOrchestration, "snapshot remains unchanged");
assertEqual(Object.isFrozen(referenceOnlySnapshot), true, "frozen snapshot accepted");

const permuted = calculateCanonicalCrossAssetSectionsV1({
  targetAssetIds: ["silver", "ethereum"],
  snapshot: referenceOnlySnapshot,
});
assertEqual(JSON.stringify(permuted), JSON.stringify(activeBatch), "target permutation invariance");

let activeFeatureCalculations = 0;
calculateCanonicalCrossAssetSectionsV1(
  {
    targetAssetIds: ["silver", "ethereum"],
    snapshot: referenceOnlySnapshot,
  },
  {
    calculateReferenceMove: () => {
      activeFeatureCalculations += 1;
      return { availability: "available", referenceMoveScore: 0.25 };
    },
  },
);
assertEqual(activeFeatureCalculations, 2, "one calculation for each active unique reference");

assertEqual(
  section(calculateCanonicalCrossAssetSectionsV1({
    targetAssetIds: ["gold"],
    snapshot: referenceOnlySnapshot,
  }), "gold").availability,
  "not-applicable",
  "target without active model",
);
assertEqual(
  section(calculateCanonicalCrossAssetSectionsV1({
    availability: "not-computed",
    targetAssetIds: ["silver"],
  }), "silver").availability,
  "not-computed",
  "explicit deferred boundary",
);

assertThrows(
  () => calculateCanonicalCrossAssetSectionsV1({
    targetAssetIds: ["invalid" as MarketAssetId],
    snapshot: referenceOnlySnapshot,
  }),
  "invalid target rejection",
);

assertEqual(
  createCanonicalCrossAssetReferenceFeatureKeyV1("gold", 20, 60),
  "cross-asset-reference-feature-v1:gold:daily:20:60",
  "deterministic feature key",
);

let reuseCalculations = 0;
const sharedReference = calculateCanonicalCrossAssetSectionsV1(
  {
    targetAssetIds: ["copper", "silver"],
    snapshot: snapshot([availableAsset("gold")]),
    relationships: [
      edge("silver-gold", "silver", "gold"),
      edge("copper-gold", "copper", "gold"),
    ],
  },
  {
    calculateReferenceMove: (input) => {
      reuseCalculations += 1;
      const latestTimestamp = input.observations.at(-1)?.timestamp;

      return {
        availability: "available",
        referenceMoveScore: 0.25,
        latestTimestamp,
        observedAt: new Date(latestTimestamp! * 1_000).toISOString(),
      };
    },
  },
);

assertEqual(reuseCalculations, 1, "shared reference calculated once");
assertEqual(section(sharedReference, "silver").availability, "available", "shared Silver result");
assertEqual(section(sharedReference, "copper").availability, "available", "shared Copper result");

const isolatedFailure = calculateCanonicalCrossAssetSectionsV1({
  targetAssetIds: ["silver", "ethereum"],
  snapshot: snapshot([availableAsset("gold")]),
});
assertEqual(section(isolatedFailure, "silver").availability, "available", "successful target survives");
assertEqual(section(isolatedFailure, "ethereum").availability, "unavailable", "missing reference result");

let unavailableCalculations = 0;
const classifiedUnavailable = calculateCanonicalCrossAssetSectionsV1(
  {
    targetAssetIds: ["silver"],
    snapshot: snapshot([unavailableAsset("gold")]),
  },
  {
    calculateReferenceMove: () => {
      unavailableCalculations += 1;
      throw new Error("must not calculate classified data");
    },
  },
);
assertEqual(section(classifiedUnavailable, "silver").availability, "unavailable", "classified unavailable");
assertEqual(unavailableCalculations, 0, "unavailable series is not recalculated");

let insufficientCalculations = 0;
const insufficient = calculateCanonicalCrossAssetSectionsV1(
  {
    targetAssetIds: ["silver"],
    snapshot: snapshot([availableAsset("gold", 60)]),
  },
  {
    calculateReferenceMove: () => {
      insufficientCalculations += 1;
      return { availability: "available", referenceMoveScore: 0.5 };
    },
  },
);
assertEqual(section(insufficient, "silver").availability, "unavailable", "insufficient history");
assertEqual(insufficientCalculations, 0, "insufficient history short-circuits calculation");

const invalidFeature = calculateCanonicalCrossAssetSectionsV1(
  {
    targetAssetIds: ["silver"],
    snapshot: snapshot([availableAsset("gold")]),
  },
  {
    calculateReferenceMove: () => ({
      availability: "available",
      referenceMoveScore: Number.NaN,
    }),
  },
);
assertEqual(section(invalidFeature, "silver").availability, "unavailable", "invalid feature result");

const inconsistentMembership = calculateCanonicalCrossAssetSectionsV1({
  targetAssetIds: ["silver"],
  snapshot: snapshot([availableAsset("gold")], []),
});
assertEqual(section(inconsistentMembership, "silver").availability, "unavailable", "snapshot membership required");

const aggregate = usable(calculateCanonicalCrossAssetSectionsV1({
  targetAssetIds: ["copper"],
  snapshot: referenceOnlySnapshot,
  relationships: [
    edge("gold-direct", "copper", "gold", "direct"),
    edge("bitcoin-inverse", "copper", "bitcoin", "inverse"),
    edge("z-missing", "copper", "dxy"),
    edge("a-missing", "copper", "us10y"),
  ],
}).sections[0]!.crossAsset, "generic aggregate");

assertEqual(aggregate.availability, "partial", "generic partial availability");
assertClose(aggregate.data.score, 0, "direct/inverse cancellation");
assertClose(aggregate.data.coverage, 0.5, "coverage unchanged");
assertEqual(
  aggregate.availability === "partial" ? aggregate.missing.join(",") : null,
  "a-missing,z-missing",
  "deterministic missing order",
);
assertClose(
  aggregate.data.relationships.reduce(
    (sum, relationship) => sum +
      (relationship.availability === "available" ? relationship.weightedContribution : 0),
    0,
  ),
  aggregate.data.coverage * aggregate.data.score,
  "weighted contribution invariant",
);
assertEqual(aggregate.data.dataQuality.availability, "not-computed", "data quality remains deferred");

console.log("PASS: Canonical Cross-Asset Feature Orchestration V1");
