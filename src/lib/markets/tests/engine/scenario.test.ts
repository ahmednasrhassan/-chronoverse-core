import type { CalculateScenarioV1Input } from "../../engine/scenario";
import { calculateScenarioV1 } from "../../engine/scenario";

function input(reverse = false): CalculateScenarioV1Input {
  const drivers = [
    { id: "growth", available: true, direction: "bullish" as const, score: 0.4 },
    { id: "inflation", available: true, direction: "bearish" as const, score: -0.3 },
    { id: "missing-driver", available: false },
  ];
  const relationships = [
    {
      id: "dxy",
      targetAssetId: "gold" as const,
      referenceAssetId: "dxy" as const,
      expectedSign: "inverse" as const,
      weight: 1,
      horizon: { interval: "daily" as const, observations: 1 },
      availability: "available" as const,
      referenceMoveScore: -0.2,
      signedEvidence: 0.2,
      weightedContribution: 0.2,
    },
    {
      id: "rates",
      targetAssetId: "gold" as const,
      referenceAssetId: "us10y" as const,
      expectedSign: "inverse" as const,
      weight: 1,
      horizon: { interval: "daily" as const, observations: 1 },
      availability: "unavailable" as const,
    },
  ];

  return {
    decision: { availability: "available", data: { score: 0.6, stance: "bullish" } },
    signal: {
      availability: "available",
      data: { score: 0.7, direction: "bullish", strength: "strong", confidence: 0.8, reasons: [] },
    },
    macro: {
      availability: "available",
      data: {
        direction: "bullish",
        score: 0.4,
        strengthMagnitude: 0.4,
        coverage: 1,
        dataQuality: { availability: "available", data: 1 },
        drivers: reverse ? [...drivers].reverse() : drivers,
        reasons: [],
      },
    },
    crossAsset: {
      availability: "available",
      data: {
        score: 0.2,
        strengthMagnitude: 0.2,
        coverage: 1,
        relationships: reverse ? [...relationships].reverse() : relationships,
        dataQuality: { availability: "available", data: 1 },
      },
    },
    marketData: { availability: "available", provider: "fixture", status: "realtime" },
    dataConfidence: { availability: "available", data: 1 },
    risk: { score: 0.2, level: "low", reasons: [] },
  };
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

const original = input();
const before = JSON.stringify(original);
const result = calculateScenarioV1(original);
assert(result.availability === "available", "complete canonical input is available");
assert(result.data.base.id === "base", "base id");
assert(result.data.base.relationToDecision === "current", "base is the current configuration");
assert(result.data.base.targetStance === "bullish", "base is anchored to Decision stance");
assert(result.data.bullish.relationToDecision === "aligned", "matching directional case is aligned");
assert(result.data.bearish.relationToDecision === "counterfactual", "opposite case is counterfactual");
assert(
  result.data.base.supportingEvidence.some(({ reference }) => reference.kind === "channel" && reference.channel === "signal"),
  "base contains current primary Signal support",
);
assert(
  result.data.base.opposingEvidence.some(({ reference }) => reference.kind === "driver" && reference.id === "inflation"),
  "base preserves opposing canonical evidence",
);
assert(
  result.data.base.unknownEvidence.some(({ reference }) => reference.kind === "driver" && reference.id === "missing-driver"),
  "base preserves unknown canonical evidence",
);
assert(
  result.data.bearish.supportingEvidence.every(({ relation }) => relation === "supports"),
  "directional counterfactual contains a structured supportive configuration",
);
assert(
  result.data.bearish.strengtheningConditions.some(({ status }) => status === "unmet"),
  "counterfactual records unmet transitions from current evidence",
);
assert(JSON.stringify(original) === before, "calculator does not mutate input");
assert(
  JSON.stringify(result) === JSON.stringify(calculateScenarioV1(input(true))),
  "canonical sorting makes output deterministic across evidence input order",
);

const partial = calculateScenarioV1({
  ...input(),
  crossAsset: { availability: "not-computed" },
  dataConfidence: { availability: "partial", data: 0.5, missing: ["crossAsset"] },
});
assert(partial.availability === "partial", "missing optional evidence produces partial Scenario");
assert(partial.missing.join(",") === "crossAsset,dataConfidence", "missing codes use canonical order");

assert(
  calculateScenarioV1({ ...input(), decision: { availability: "not-computed" } }).availability === "unavailable",
  "deferred Decision makes Scenario unavailable",
);
assert(
  calculateScenarioV1({ ...input(), signal: { availability: "unavailable" } }).availability === "unavailable",
  "unavailable primary Signal makes Scenario unavailable",
);
assert(
  calculateScenarioV1({ ...input(), scenario: result } as CalculateScenarioV1Input).availability === "unavailable",
  "Scenario circular input is rejected",
);
assert(
  calculateScenarioV1({
    ...input(),
    decision: { availability: "available", data: { score: -0.4, stance: "bullish" } },
  }).availability === "unavailable",
  "inconsistent canonical Decision is rejected",
);
assert(
  calculateScenarioV1({
    ...input(),
    signal: {
      availability: "available",
      data: { score: 0.1, direction: "neutral", strength: "weak", confidence: 0.5, reasons: [] },
    },
  }).availability === "available",
  "canonical neutral Signal bands do not require a zero score",
);

const serialized = JSON.stringify(result);
for (const forbidden of ["probability", "forecast", "priceTarget", "horizon", "numericScore"]) {
  assert(!serialized.includes(forbidden), `Scenario excludes ${forbidden}`);
}

type ForbiddenInputKey = Extract<keyof CalculateScenarioV1Input, "scenario" | "invalidation" | "recommendation">;
type AssertNever<T extends never> = T;
export type ScenarioInputHasNoCircularLayer = AssertNever<ForbiddenInputKey>;

console.log("PASS: Scenario V1 pure conditional evidence foundation");
