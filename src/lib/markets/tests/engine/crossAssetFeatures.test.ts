import {
  calculateCanonicalCrossAssetFeaturesV1,
  calculateCrossAssetReferenceMoveV1,
  CROSS_ASSET_MINIMUM_CLOSES_V1,
  type CrossAssetCloseObservationV1,
  type CrossAssetRelationshipObservationInputV1,
} from "../../engine/crossAssetFeatures";
import type { EngineCrossAssetSectionV3 } from "../../engine/contracts";

const horizon = { interval: "daily", observations: 20 } as const;

function observationsFromReturns(
  returns: readonly number[],
): readonly CrossAssetCloseObservationV1[] {
  const closes = [100];

  for (const value of returns) {
    closes.push(closes.at(-1)! * Math.exp(value));
  }

  return closes.map((close, index) => ({ close, timestamp: 1_700_000_000 + index * 86_400 }));
}

function availableMove(observations: readonly CrossAssetCloseObservationV1[]) {
  const result = calculateCrossAssetReferenceMoveV1({ observations });

  if (result.availability !== "available") {
    throw new Error(`reference move: expected available, received ${result.reason}`);
  }

  return result;
}

function edge(
  id: string,
  weight: number,
  score: number | null,
  expectedSign: "direct" | "inverse" = "direct",
): CrossAssetRelationshipObservationInputV1 {
  const common = {
    id,
    targetAssetId: "silver" as const,
    referenceAssetId:
      id.includes("bitcoin")
        ? "bitcoin" as const
        : id.startsWith("a-")
          ? "dxy" as const
          : id.startsWith("z-")
            ? "us10y" as const
            : "gold" as const,
    expectedSign,
    weight,
    horizon,
  };

  return score === null
    ? { ...common, availability: "unavailable", reason: "Missing reference history" }
    : { ...common, availability: "available", referenceMoveScore: score };
}

function usable(section: EngineCrossAssetSectionV3, label: string) {
  if (section.availability !== "available" && section.availability !== "partial") {
    throw new Error(`${label}: expected usable, received ${section.availability}`);
  }
  return section;
}

function aggregate(relationships: readonly CrossAssetRelationshipObservationInputV1[]) {
  return calculateCanonicalCrossAssetFeaturesV1({
    availability: "applicable",
    targetAssetId: "silver",
    relationships,
  });
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 1e-12): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const positiveReturns = Array.from(
  { length: 60 },
  (_, index) => 0.004 + (index % 3 - 1) * 0.006,
);
const positiveObservations = observationsFromReturns(positiveReturns);
const negativeObservations = observationsFromReturns(positiveReturns.map((value) => -value));
const positive = availableMove(positiveObservations);
const negative = availableMove(negativeObservations);

assertEqual(CROSS_ASSET_MINIMUM_CLOSES_V1, 61, "V1 minimum closes");
assertEqual(positive.referenceMoveScore > 0, true, "positive normalized move");
assertEqual(negative.referenceMoveScore < 0, true, "negative normalized move");
assertClose(positive.referenceMoveScore, -negative.referenceMoveScore, "odd symmetry");
assertEqual(Math.abs(positive.referenceMoveScore) < 1, true, "bounded output");
assertEqual(
  availableMove(positiveObservations).referenceMoveScore,
  positive.referenceMoveScore,
  "deterministic reference move",
);
assertEqual(positive.latestTimestamp, positiveObservations.at(-1)?.timestamp, "latest timestamp");

const zeroHorizonReturns = Array.from(
  { length: 60 },
  (_, index) => index >= 40 ? (index % 2 === 0 ? 0.01 : -0.01) : (index % 3 - 1) * 0.005,
);
assertClose(
  availableMove(observationsFromReturns(zeroHorizonReturns)).referenceMoveScore,
  0,
  "zero horizon move",
  1e-13,
);

for (const [observations, label] of [
  [positiveObservations.slice(0, 60), "insufficient history"],
  [Array.from({ length: 61 }, (_, index) => ({ close: 100, timestamp: index })), "zero volatility"],
  [positiveObservations.map((value, index) => index === 4 ? { ...value, close: 0 } : value), "non-positive close"],
  [positiveObservations.map((value, index) => index === 4 ? { ...value, close: Number.NaN } : value), "non-finite close"],
  [positiveObservations.map((value, index) => index === 4 ? { ...value, timestamp: 0 } : value), "invalid timestamp order"],
] as const) {
  assertEqual(
    calculateCrossAssetReferenceMoveV1({ observations }).availability,
    "unavailable",
    label,
  );
}
assertEqual(
  calculateCrossAssetReferenceMoveV1({
    observations: positiveObservations,
    horizonObservations: 0,
  }).availability,
  "unavailable",
  "invalid horizon configuration",
);
assertEqual(
  calculateCrossAssetReferenceMoveV1({ observations: positiveObservations }).availability,
  "available",
  "exact H and L boundary",
);

const single = usable(aggregate([edge("gold", 1, 0.4)]), "single edge");
assertEqual(single.availability, "available", "single full availability");
assertClose(single.data.score, 0.4, "single score");
assertClose(single.data.coverage, 1, "single coverage");
assertClose(single.data.strengthMagnitude, 0.4, "single strength");
assertEqual(single.data.dataQuality.availability, "not-computed", "data quality lifecycle");

const multiple = usable(
  aggregate([edge("gold", 1, 0.6), edge("bitcoin-reference", 3, -0.2)]),
  "multiple edges",
);
assertClose(multiple.data.score, 0, "multiple weighted score");
assertClose(multiple.data.coverage, 1, "multiple full coverage");
assertClose(
  multiple.data.relationships.reduce(
    (sum, relationship) => sum +
      (relationship.availability === "available" ? relationship.weightedContribution : 0),
    0,
  ),
  multiple.data.coverage * multiple.data.score,
  "contribution invariant",
);

const partial = usable(
  aggregate([edge("z-missing", 1, null), edge("gold", 2, 0.5), edge("a-missing", 1, null)]),
  "partial",
);
assertEqual(partial.availability, "partial", "partial availability");
assertClose(partial.data.score, 0.5, "coverage excluded from score");
assertClose(partial.data.coverage, 0.5, "partial coverage");
assertEqual(
  partial.availability === "partial" ? partial.missing.join(",") : null,
  "a-missing,z-missing",
  "sorted missing IDs",
);
assertClose(
  partial.data.relationships.reduce(
    (sum, relationship) => sum +
      (relationship.availability === "available" ? relationship.weightedContribution : 0),
    0,
  ),
  partial.data.coverage * partial.data.score,
  "partial contribution invariant",
);

const cancellation = usable(
  aggregate([edge("gold", 1, 0.8), edge("bitcoin-reference", 1, -0.8)]),
  "cancellation",
);
assertClose(cancellation.data.score, 0, "observed cancellation score");
assertClose(cancellation.data.coverage, 1, "observed cancellation coverage");

const inverse = usable(aggregate([edge("gold", 1, 0.3, "inverse")]), "inverse");
assertClose(inverse.data.score, -0.3, "inverse relationship sign");
assertClose(
  inverse.data.relationships[0]?.availability === "available"
    ? inverse.data.relationships[0].weightedContribution
    : Number.NaN,
  -0.3,
  "inverse weighted contribution",
);

assertEqual(aggregate([edge("gold", 1, null)]).availability, "unavailable", "no usable evidence");
assertEqual(aggregate([]).availability, "not-applicable", "no configured model");
assertEqual(
  calculateCanonicalCrossAssetFeaturesV1({ availability: "not-computed" }).availability,
  "not-computed",
  "not-computed pass-through",
);
assertEqual(
  aggregate([edge("gold", 0, 0.5)]).availability,
  "unavailable",
  "invalid aggregate configuration",
);

const ordered = aggregate([edge("gold", 1, 0.2), edge("bitcoin-reference", 2, -0.1)]);
const permuted = aggregate([edge("bitcoin-reference", 2, -0.1), edge("gold", 1, 0.2)]);
assertEqual(JSON.stringify(ordered), JSON.stringify(permuted), "permutation invariance");

console.log("PASS: Cross-Asset V1 reference move and aggregation");
