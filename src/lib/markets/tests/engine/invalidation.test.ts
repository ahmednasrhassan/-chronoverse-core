import type { CalculateInvalidationV1Input } from "../../engine/invalidation";
import { calculateInvalidationV1 } from "../../engine/invalidation";

function input(reverse = false): CalculateInvalidationV1Input {
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
const result = calculateInvalidationV1(original);
assert(result.availability === "available", "complete canonical input is available");
assert(result.data.thesis.stance === "bullish", "thesis is anchored to current Decision");
assert(result.data.thesis.source === "decision", "Decision is the sole thesis source");
assert(result.data.invalidatesWhen.length === 2, "invalidation has Decision and primary Signal predicates");
assert(
  result.data.invalidatesWhen.every(({ effect }) => effect === "invalidates"),
  "invalidating trigger effects are strict",
);
assert(
  result.data.weakensWhen.some(({ code }) => code === "SUPPORTING_MACRO_DRIVER_REVERSES"),
  "supporting Macro driver reversal weakens thesis",
);
assert(
  result.data.weakensWhen.some(({ code }) => code === "CORROBORATIVE_RELATIONSHIP_REVERSES"),
  "corroborative relationship reversal weakens thesis",
);
assert(
  !result.data.weakensWhen.some(({ predicate }) =>
    "reference" in predicate && predicate.reference.kind === "driver" && predicate.reference.id === "inflation"),
  "currently opposing evidence is not mislabeled as thesis support",
);
assert(
  result.data.currentFragilities.map((reference) => "id" in reference ? reference.id : reference.channel).join(",") === "missing-driver,rates",
  "current fragilities are canonical and sorted",
);
assert(JSON.stringify(original) === before, "calculator does not mutate input");
assert(
  JSON.stringify(result) === JSON.stringify(calculateInvalidationV1(input(true))),
  "canonical sorting makes output deterministic across evidence input order",
);

const partial = calculateInvalidationV1({ ...input(), crossAsset: { availability: "not-computed" } });
assert(partial.availability === "partial" && partial.missing.join(",") === "crossAsset", "partial evidence is explicit");
assert(
  calculateInvalidationV1({ ...input(), decision: { availability: "unavailable" } }).availability === "unavailable",
  "unavailable Decision makes Invalidation unavailable",
);
assert(
  calculateInvalidationV1({ ...input(), invalidation: result } as CalculateInvalidationV1Input).availability === "unavailable",
  "Invalidation self-input is rejected",
);
assert(
  calculateInvalidationV1({ ...input(), scenario: { availability: "available" } } as CalculateInvalidationV1Input).availability === "unavailable",
  "Scenario dependency is rejected",
);
const neutralSignal = calculateInvalidationV1({
  ...input(),
  signal: {
    availability: "available",
    data: { score: 0.1, direction: "neutral", strength: "weak", confidence: 0.5, reasons: [] },
  },
});
assert(neutralSignal.availability === "available", "canonical neutral Signal bands accept a nonzero score");
assert(neutralSignal.data.invalidatesWhen.length === 1, "non-supporting Signal is not emitted as a future ceases-support predicate");
assert(neutralSignal.data.currentFragilities[0]?.channel === "signal", "non-supporting primary Signal is a current fragility");

const serialized = JSON.stringify(result);
for (const forbidden of ["scenario", "probability", "forecast", "priceTarget", "horizon", "targetDate"]) {
  assert(!serialized.includes(forbidden), `Invalidation excludes ${forbidden}`);
}
for (const trigger of [
  ...result.data.invalidatesWhen,
  ...result.data.weakensWhen,
  ...result.data.assessmentFailsWhen,
]) {
  assert(
    trigger.predicate.kind.startsWith("decision-") ||
      trigger.predicate.kind.startsWith("evidence-") ||
      trigger.predicate.kind.startsWith("risk-") ||
      trigger.predicate.kind.startsWith("data-confidence-") ||
      trigger.predicate.kind.startsWith("market-data-"),
    "every predicate is over future canonical evidence or Decision state",
  );
}

type ForbiddenInputKey = Extract<keyof CalculateInvalidationV1Input, "scenario" | "invalidation" | "recommendation">;
type AssertNever<T extends never> = T;
export type InvalidationInputHasNoCircularLayer = AssertNever<ForbiddenInputKey>;

console.log("PASS: Invalidation V1 pure transition-predicate foundation");
