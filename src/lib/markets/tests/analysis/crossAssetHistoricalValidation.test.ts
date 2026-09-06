import {
  alignDatedCloses,
  analyzeCrossAssetRelationship,
  type DatedClose,
} from "./crossAssetHistoricalValidation";

function series(
  length: number,
  returnForIndex: (index: number) => number,
): readonly DatedClose[] {
  const result: DatedClose[] = [];
  let close = 100;

  for (let index = 0; index < length; index += 1) {
    if (index > 0) close *= Math.exp(returnForIndex(index));
    result.push({ date: `2020-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`, close });
  }
  return result;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const reference = series(
  120,
  (index) => 0.002 + ((index * index) % 17 - 8) * 0.001,
);
const target = reference.map((observation) => ({ ...observation }));
const result = analyzeCrossAssetRelationship("target", "reference", target, reference);

assertEqual(result.overlappingObservationCount, 120, "aligned count");
assertEqual(result.validationSampleSize, 40, "20-forward sample boundary");
assertEqual(result.forward[5].sampleSize, 55, "5-forward sample boundary");
assertEqual(result.contemporaneous20.pearsonCorrelation, 1, "perfect contemporaneous correlation");
assertEqual(result.contemporaneous20.spearmanCorrelation, 1, "perfect rank correlation");

const targetWithMissingDate = target.filter((_, index) => index !== 10);
const aligned = alignDatedCloses(targetWithMissingDate, reference);
assertEqual(aligned.target.length, 119, "intersection only");
assertEqual(
  aligned.target.some((observation) => observation.date === target[10]!.date),
  false,
  "no forward fill",
);

console.log("PASS: Cross-Asset historical validation analysis math");
