import type {
  EngineConfidenceSectionV3,
  EngineContradictionSectionV3,
  EngineDecisionStanceV3,
  EngineInvalidationSectionV1,
  EngineRecommendationPostureV1,
  EngineScenarioSectionV1,
} from "../../engine/contracts";
import { calculateInvalidationV1 } from "../../engine/invalidation";
import {
  calculateRecommendationV1,
  RECOMMENDATION_V1_POLICY,
  type CalculateRecommendationV1Input,
} from "../../engine/recommendation";
import { calculateScenarioV1 } from "../../engine/scenario";

const POSTURE_ORDER: readonly EngineRecommendationPostureV1[] = [
  "stand-aside",
  "watch",
  "selective",
  "act",
];

function input(options: {
  readonly stance?: EngineDecisionStanceV3;
  readonly conviction?: number;
  readonly contradiction?: number;
  readonly dataQuality?: number;
  readonly risk?: "low" | "moderate" | "high";
  readonly decisionPartial?: boolean;
  readonly convictionPartial?: boolean;
  readonly dataPartial?: boolean;
  readonly contradictionPartial?: boolean;
  readonly scenario?: EngineScenarioSectionV1;
  readonly invalidation?: EngineInvalidationSectionV1;
} = {}): CalculateRecommendationV1Input {
  const stance = options.stance ?? "bullish";
  const conviction = options.conviction ?? 0.8;
  const contradiction = options.contradiction ?? 0.1;
  const dataQuality = options.dataQuality ?? 0.9;
  const risk = options.risk ?? "low";
  const decisionScore = stance === "bullish" ? conviction : stance === "bearish" ? -conviction : 0;
  const decision = options.decisionPartial
    ? { availability: "partial" as const, data: { score: decisionScore, stance }, missing: ["macro"] }
    : { availability: "available" as const, data: { score: decisionScore, stance } };
  const signalDirection = stance;
  const signalScore = stance === "bullish" ? 0.8 : stance === "bearish" ? -0.8 : 0;
  const signal = {
    availability: "available" as const,
    data: { score: signalScore, direction: signalDirection, strength: "strong" as const, confidence: 0.9, reasons: [] },
  };
  const marketData = {
    availability: "available" as const,
    provider: "fixture",
    status: "realtime" as const,
    interval: "1d" as const,
    freshness: "within-cadence" as const,
  };
  const macro = { availability: "not-applicable" as const, reason: "No canonical model" };
  const crossAsset = { availability: "not-applicable" as const, reason: "No canonical model" };
  const dataConfidence = { availability: "available" as const, data: dataQuality };
  const riskData = { score: risk === "high" ? 0.8 : risk === "moderate" ? 0.5 : 0.2, level: risk, reasons: [] };
  const scenario = options.scenario ?? calculateScenarioV1({
    decision,
    signal,
    macro,
    crossAsset,
    marketData,
    dataConfidence,
    risk: riskData,
  });
  const invalidation = options.invalidation ?? calculateInvalidationV1({
    decision,
    signal,
    macro,
    crossAsset,
    marketData,
    dataConfidence,
    risk: riskData,
  });

  return {
    decision,
    confidence: confidence(conviction, dataQuality, options.convictionPartial, options.dataPartial),
    contradiction: contradictionSection(contradiction, options.contradictionPartial),
    risk: riskData,
    marketData,
    scenario,
    invalidation,
  };
}

function confidence(
  conviction: number,
  dataQuality: number,
  convictionPartial = false,
  dataPartial = false,
): EngineConfidenceSectionV3 {
  const component = { availability: "available" as const, data: 1 };
  const notComputed = { availability: "not-computed" as const };
  const dataSnapshot = {
    score: dataQuality,
    components: {
      marketData: component,
      technical: component,
      macro: component,
      crossAsset: component,
      positioning: notComputed,
    },
  };
  const convictionSnapshot = {
    score: conviction,
    components: {
      signal: component,
      macro: component,
      state: component,
      regime: component,
      crossAsset: component,
      positioning: notComputed,
      scenario: notComputed,
      contradiction: component,
    },
  };
  return {
    availability: "available",
    data: {
      data: dataPartial
        ? { availability: "partial", data: dataSnapshot, missing: ["marketData"] }
        : { availability: "available", data: dataSnapshot },
      conviction: convictionPartial
        ? { availability: "partial", data: convictionSnapshot, missing: ["macro"] }
        : { availability: "available", data: convictionSnapshot },
    },
  };
}

function contradictionSection(score: number, partial = false): EngineContradictionSectionV3 {
  const data = {
    score,
    evidence: [],
    conflicts: [],
    strongestConflict: null,
  };
  return partial
    ? { availability: "partial", data, missing: ["crossAsset"] }
    : { availability: "available", data };
}

function usable(inputValue: CalculateRecommendationV1Input) {
  const result = calculateRecommendationV1(inputValue);
  if (result.availability !== "available" && result.availability !== "partial") {
    throw new Error(`Expected usable Recommendation, received ${result.availability}.`);
  }
  return result;
}

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function assertPostureAtMost(
  actual: EngineRecommendationPostureV1,
  maximum: EngineRecommendationPostureV1,
  label: string,
): void {
  assert(POSTURE_ORDER.indexOf(actual) <= POSTURE_ORDER.indexOf(maximum), label);
}

const bullish = usable(input({ stance: "bullish" }));
assert(bullish.data.stance === "bullish", "bullish Decision remains bullish");
assert(bullish.data.posture === "act", "strong clean bullish evidence reaches act");
assert(bullish.data.strength.canonicalScore === 0.8, "Recommendation projects conviction exactly");

const bearish = usable(input({ stance: "bearish" }));
assert(bearish.data.stance === "bearish", "bearish Decision remains bearish");
assert(bearish.data.posture === "act", "strong clean bearish evidence reaches act");

const neutral = usable(input({ stance: "neutral", conviction: 0 }));
assert(neutral.data.stance === "neutral", "neutral Decision remains neutral");
assert(neutral.data.posture === "stand-aside", "neutral Decision is non-directional restraint");

const highContradiction = usable(input({ contradiction: 0.5 }));
assert(highContradiction.data.posture === "watch", "high contradiction reduces actionability");
assert(
  highContradiction.data.opposingReasons[0]?.code === "CONTRADICTION_HIGH",
  "material opposition remains visible",
);
assertPostureAtMost(highContradiction.data.posture, bullish.data.posture, "higher contradiction never improves posture");

const weak = usable(input({ conviction: 0.39 }));
assert(weak.data.posture === "watch", "weak conviction causes restraint");
assert(weak.data.strength.canonicalScore === 0.39, "Recommendation never boosts weak conviction");

const partial = usable(input({ convictionPartial: true }));
assert(partial.availability === "partial", "partial canonical confidence propagates");
assert(partial.data.posture === "selective", "partial evidence degrades actionability");
assertPostureAtMost(partial.data.posture, bullish.data.posture, "missing evidence never improves posture");

const noScenario = usable(input({ scenario: { availability: "not-computed" } }));
assert(noScenario.availability === "partial", "NOT_COMPUTED Scenario is explicit missing context");
assert(noScenario.data.scenario.availability === "not-computed", "Scenario is not treated as confirmation");
assert(noScenario.data.posture === "watch", "missing Scenario caps actionability at watch");

const noInvalidation = usable(input({ invalidation: { availability: "not-computed" } }));
assert(noInvalidation.availability === "partial", "NOT_COMPUTED Invalidation is explicit missing context");
assert(noInvalidation.data.invalidation.availability === "not-computed", "Invalidation is not treated as confirmation");
assert(noInvalidation.data.posture === "watch", "missing Invalidation caps actionability at watch");

assert(bullish.data.scenario.availability === "available", "computed Scenario is projected");
assert(bullish.data.scenario.aligned === "bullish", "Scenario cannot reverse Decision stance");
assert(bullish.data.invalidation.availability === "available", "computed Invalidation is projected");
assert(bullish.data.invalidation.invalidatesWhen.length > 0, "canonical invalidation predicates are exposed");

const moderateBoundary = usable(input({ conviction: RECOMMENDATION_V1_POLICY.conviction.moderateMinimum }));
assert(moderateBoundary.data.strength.band === "moderate", "moderate conviction boundary is inclusive");
assert(moderateBoundary.data.posture === "selective", "moderate boundary posture");
const strongBoundary = usable(input({ conviction: RECOMMENDATION_V1_POLICY.conviction.strongMinimum }));
assert(strongBoundary.data.strength.band === "strong", "strong conviction boundary is inclusive");
assert(strongBoundary.data.posture === "act", "strong boundary posture");
assert(usable(input({ contradiction: 0.25 })).data.posture === "selective", "material contradiction boundary");
assert(usable(input({ contradiction: 0.5 })).data.posture === "watch", "high contradiction boundary");
assert(usable(input({ contradiction: 0.75 })).data.posture === "stand-aside", "severe contradiction boundary");
assert(usable(input({ dataQuality: 0.7 })).data.dataQuality.band === "adequate", "adequate quality boundary");
assert(usable(input({ dataQuality: 0.699999 })).data.posture === "watch", "limited quality boundary degrades posture");

const original = input();
const before = JSON.stringify(original);
const first = calculateRecommendationV1(original);
const second = calculateRecommendationV1(original);
assert(JSON.stringify(first) === JSON.stringify(second), "identical canonical inputs are deterministic");
assert(JSON.stringify(original) === before, "calculator does not mutate inputs");
assert(
  usable(original).data.restraintReasons.map(({ code }) => code).join(",") === "",
  "reason ordering is stable and clean inputs add no restraint",
);

assert(
  calculateRecommendationV1({
    ...input(),
    confidence: confidence(Number.NaN, 0.9),
  }).availability === "unavailable",
  "non-finite canonical conviction is rejected",
);
assert(
  calculateRecommendationV1({ ...input(), recommendation: bullish } as CalculateRecommendationV1Input).availability === "unavailable",
  "Recommendation circular input is rejected",
);
assert(
  calculateRecommendationV1({
    ...input({ stance: "bullish" }),
    scenario: input({ stance: "bearish" }).scenario,
  }).availability === "unavailable",
  "Scenario cannot reverse or contradict the canonical Decision",
);
assert(
  calculateRecommendationV1({
    ...input({ stance: "bullish" }),
    invalidation: input({ stance: "bearish" }).invalidation,
  }).availability === "unavailable",
  "Invalidation cannot create a different directional thesis",
);

const reasonOrder = usable(input({
  contradiction: 0.5,
  risk: "moderate",
  scenario: { availability: "not-computed" },
  invalidation: { availability: "not-computed" },
})).data.restraintReasons.map(({ code }) => code).join(",");
assert(
  reasonOrder === "CONTRADICTION_HIGH,RISK_MODERATE,SCENARIO_NOT_COMPUTED,INVALIDATION_NOT_COMPUTED",
  "restraint reasons use stable semantic ordering",
);

const serialized = JSON.stringify(bullish);
for (const forbidden of ["probability", "forecast", "priceTarget", "horizon", "entryPrice", "stopLoss", "positionSize", "leverage"] ) {
  assert(!serialized.includes(forbidden), `Recommendation excludes ${forbidden}`);
}

type ForbiddenInputKey = Extract<keyof CalculateRecommendationV1Input, "recommendation">;
type AssertNever<T extends never> = T;
export type RecommendationInputHasNoCircularLayer = AssertNever<ForbiddenInputKey>;

console.log("PASS: Recommendation Synthesis V1 pure foundation");
