import type { MarketRiskResult } from "../core/riskEngine";
import type {
  EngineConfidenceSectionV3,
  EngineContradictionSectionV3,
  EngineDecisionSectionV3,
  EngineDecisionStanceV3,
  EngineEvidenceReferenceV1,
  EngineInvalidationSectionV1,
  EngineMarketDataV3,
  EngineRecommendationContradictionBandV1,
  EngineRecommendationDataQualityBandV1,
  EngineRecommendationDominantReasonV1,
  EngineRecommendationInvalidationProjectionV1,
  EngineRecommendationMissingCodeV1,
  EngineRecommendationOpposingReasonV1,
  EngineRecommendationPostureV1,
  EngineRecommendationRestraintReasonV1,
  EngineRecommendationScenarioProjectionV1,
  EngineRecommendationSectionV1,
  EngineRecommendationStrengthBandV1,
  EngineRecommendationSupportingReasonV1,
  EngineScenarioSectionV1,
} from "./contracts";

export const RECOMMENDATION_V1_POLICY = Object.freeze({
  conviction: Object.freeze({
    moderateMinimum: 0.4,
    strongMinimum: 0.7,
  }),
  contradiction: Object.freeze({
    materialMinimum: 0.25,
    highMinimum: 0.5,
    severeMinimum: 0.75,
  }),
  dataQuality: Object.freeze({
    adequateMinimum: 0.7,
  }),
} as const);

export interface CalculateRecommendationV1Input {
  readonly decision: EngineDecisionSectionV3;
  readonly confidence: EngineConfidenceSectionV3;
  readonly contradiction: EngineContradictionSectionV3;
  readonly risk: MarketRiskResult;
  readonly marketData: EngineMarketDataV3;
  readonly scenario: EngineScenarioSectionV1;
  readonly invalidation: EngineInvalidationSectionV1;
}

/**
 * Projects canonical Engine truth into a bounded analytical posture. This is
 * not a forecasting, execution, suitability, or personalized-advice model.
 */
export function calculateRecommendationV1(
  input: CalculateRecommendationV1Input,
): EngineRecommendationSectionV1 {
  if (hasForbiddenCircularInput(input) || !hasValidCanonicalInput(input)) {
    return { availability: "unavailable", reasonCode: "INVALID_CANONICAL_INPUT" };
  }
  if (input.decision.availability === "not-computed") {
    return { availability: "unavailable", reasonCode: "DECISION_NOT_COMPUTED" };
  }
  if (input.decision.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: "DECISION_UNAVAILABLE" };
  }
  if (input.confidence.availability === "not-computed") {
    return { availability: "unavailable", reasonCode: "CONFIDENCE_NOT_COMPUTED" };
  }
  if (input.confidence.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: "CONFIDENCE_UNAVAILABLE" };
  }
  if (input.confidence.data.conviction.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: "CONVICTION_UNAVAILABLE" };
  }
  if (input.confidence.data.data.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: "DATA_CONFIDENCE_UNAVAILABLE" };
  }
  if (input.contradiction.availability === "not-computed") {
    return { availability: "unavailable", reasonCode: "CONTRADICTION_NOT_COMPUTED" };
  }
  if (input.contradiction.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: "CONTRADICTION_UNAVAILABLE" };
  }

  const stance = input.decision.data.stance;
  const convictionScore = input.confidence.data.conviction.data.score;
  const dataQualityScore = input.confidence.data.data.data.score;
  const contradictionScore = input.contradiction.availability === "not-applicable"
    ? null
    : input.contradiction.data.score;
  const strengthBand = strengthBandFor(convictionScore);
  const contradictionBand = contradictionBandFor(contradictionScore);
  const dataQualityBand = dataQualityScore >= RECOMMENDATION_V1_POLICY.dataQuality.adequateMinimum
    ? "adequate"
    : "limited";
  const scenario = projectScenario(input.scenario, stance);
  const invalidation = projectInvalidation(input.invalidation);
  const dominantSupportingEvidence = scenarioDominantSupportingEvidence(input.scenario);
  const opposingEvidence = scenarioOpposingEvidence(input.scenario);
  const supportingReasons = buildSupportingReasons(stance, strengthBand, contradictionBand);
  const opposingReasons = buildOpposingReasons(contradictionBand, opposingEvidence);
  const dominantReason: EngineRecommendationDominantReasonV1 = stance === "neutral"
    ? { code: "DECISION_NEUTRAL", source: "decision" }
    : { code: "DECISION_DIRECTIONAL", source: "decision" };
  const restraintReasons = buildRestraintReasons(
    input,
    strengthBand,
    contradictionBand,
    dataQualityBand,
    opposingEvidence,
  );
  const data = {
    semantic: "canonical-operational-synthesis-v1",
    stance,
    posture: calculatePosture(
      input,
      convictionScore,
      contradictionBand,
      dataQualityBand,
      opposingEvidence,
    ),
    strength: {
      source: "confidence.conviction",
      canonicalScore: convictionScore,
      band: strengthBand,
    },
    contradiction: {
      source: "contradiction",
      canonicalScore: contradictionScore,
      band: contradictionBand,
    },
    dataQuality: {
      source: "confidence.data",
      canonicalScore: dataQualityScore,
      band: dataQualityBand,
    },
    dominantReason,
    supportingReasons,
    opposingReasons,
    restraintReasons,
    dominantSupportingEvidence,
    opposingEvidence,
    scenario,
    invalidation,
  } as const;
  const missing = collectMissing(input);

  return missing.length === 0
    ? { availability: "available", data }
    : { availability: "partial", data, missing };
}

function strengthBandFor(score: number): EngineRecommendationStrengthBandV1 {
  if (score >= RECOMMENDATION_V1_POLICY.conviction.strongMinimum) return "strong";
  if (score >= RECOMMENDATION_V1_POLICY.conviction.moderateMinimum) return "moderate";
  return "weak";
}

function contradictionBandFor(score: number | null): EngineRecommendationContradictionBandV1 {
  if (score === null) return "not-applicable";
  if (score >= RECOMMENDATION_V1_POLICY.contradiction.severeMinimum) return "severe";
  if (score >= RECOMMENDATION_V1_POLICY.contradiction.highMinimum) return "high";
  if (score >= RECOMMENDATION_V1_POLICY.contradiction.materialMinimum) return "material";
  return "low";
}

function calculatePosture(
  input: CalculateRecommendationV1Input,
  convictionScore: number,
  contradictionBand: EngineRecommendationContradictionBandV1,
  dataQualityBand: EngineRecommendationDataQualityBandV1,
  opposingEvidence: readonly EngineEvidenceReferenceV1[],
): EngineRecommendationPostureV1 {
  if (input.decision.availability === "unavailable" || input.decision.availability === "not-computed") {
    return "stand-aside";
  }

  let posture: EngineRecommendationPostureV1 = input.decision.data.stance === "neutral"
    ? "stand-aside"
    : convictionScore >= RECOMMENDATION_V1_POLICY.conviction.strongMinimum
      ? "act"
      : convictionScore >= RECOMMENDATION_V1_POLICY.conviction.moderateMinimum
        ? "selective"
        : "watch";

  if (contradictionBand === "severe" || input.risk.level === "high" || input.marketData.availability === "unavailable") {
    posture = capPosture(posture, "stand-aside");
  } else if (contradictionBand === "high" || dataQualityBand === "limited") {
    posture = capPosture(posture, "watch");
  } else if (contradictionBand === "material" || contradictionBand === "not-applicable") {
    posture = capPosture(posture, "selective");
  }

  if (
    input.scenario.availability === "not-computed" ||
    input.scenario.availability === "unavailable" ||
    input.invalidation.availability === "not-computed" ||
    input.invalidation.availability === "unavailable" ||
    input.marketData.availability === "partial" && input.marketData.status === "stale"
  ) {
    posture = capPosture(posture, "watch");
  }

  if (
    input.decision.availability === "partial" ||
    input.confidence.availability === "available" && (
      input.confidence.data.conviction.availability === "partial" ||
      input.confidence.data.data.availability === "partial"
    ) ||
    input.contradiction.availability === "partial" ||
    input.marketData.availability === "partial" ||
    input.scenario.availability === "partial" ||
    input.invalidation.availability === "partial" ||
    input.risk.level === "moderate" ||
    opposingEvidence.length > 0 ||
    hasInvalidationFragilities(input.invalidation)
  ) {
    posture = capPosture(posture, "selective");
  }

  return posture;
}

function capPosture(
  posture: EngineRecommendationPostureV1,
  maximum: EngineRecommendationPostureV1,
): EngineRecommendationPostureV1 {
  const order: readonly EngineRecommendationPostureV1[] = [
    "stand-aside",
    "watch",
    "selective",
    "act",
  ];
  return order.indexOf(posture) <= order.indexOf(maximum) ? posture : maximum;
}

function buildSupportingReasons(
  stance: EngineDecisionStanceV3,
  strength: EngineRecommendationStrengthBandV1,
  contradiction: EngineRecommendationContradictionBandV1,
): readonly EngineRecommendationSupportingReasonV1[] {
  if (stance === "neutral") return [];
  const reasons: EngineRecommendationSupportingReasonV1[] = [
    { code: "DECISION_DIRECTIONAL", source: "decision" },
  ];
  if (strength === "strong") reasons.push({ code: "CONVICTION_STRONG", source: "confidence.conviction" });
  if (strength === "moderate") reasons.push({ code: "CONVICTION_MODERATE", source: "confidence.conviction" });
  if (contradiction === "low") {
    reasons.push({ code: "CONTRADICTION_LOW", source: "contradiction" });
  }
  return reasons;
}

function buildOpposingReasons(
  contradiction: EngineRecommendationContradictionBandV1,
  opposingEvidence: readonly EngineEvidenceReferenceV1[],
): readonly EngineRecommendationOpposingReasonV1[] {
  const reasons: EngineRecommendationOpposingReasonV1[] = [];
  if (contradiction === "material") reasons.push({ code: "CONTRADICTION_MATERIAL", source: "contradiction" });
  if (contradiction === "high") reasons.push({ code: "CONTRADICTION_HIGH", source: "contradiction" });
  if (contradiction === "severe") reasons.push({ code: "CONTRADICTION_SEVERE", source: "contradiction" });
  if (opposingEvidence.length > 0) reasons.push({ code: "SCENARIO_HAS_OPPOSING_EVIDENCE", source: "scenario" });
  return reasons;
}

function buildRestraintReasons(
  input: CalculateRecommendationV1Input,
  strength: EngineRecommendationStrengthBandV1,
  contradiction: EngineRecommendationContradictionBandV1,
  dataQuality: EngineRecommendationDataQualityBandV1,
  opposingEvidence: readonly EngineEvidenceReferenceV1[],
): readonly EngineRecommendationRestraintReasonV1[] {
  const reasons: EngineRecommendationRestraintReasonV1[] = [];
  if (input.decision.availability !== "unavailable" && input.decision.availability !== "not-computed" && input.decision.data.stance === "neutral") reasons.push({ code: "DECISION_NEUTRAL", source: "decision" });
  if (strength === "weak") reasons.push({ code: "CONVICTION_WEAK", source: "confidence.conviction" });
  if (input.decision.availability === "partial") reasons.push({ code: "DECISION_PARTIAL", source: "decision" });
  if (input.confidence.availability === "available" && input.confidence.data.conviction.availability === "partial") reasons.push({ code: "CONVICTION_PARTIAL", source: "confidence.conviction" });
  if (input.confidence.availability === "available" && input.confidence.data.data.availability === "partial") reasons.push({ code: "DATA_CONFIDENCE_PARTIAL", source: "confidence.data" });
  if (dataQuality === "limited") reasons.push({ code: "DATA_QUALITY_LIMITED", source: "confidence.data" });
  if (input.contradiction.availability === "partial") reasons.push({ code: "CONTRADICTION_PARTIAL", source: "contradiction" });
  if (contradiction === "material") reasons.push({ code: "CONTRADICTION_MATERIAL", source: "contradiction" });
  if (contradiction === "high") reasons.push({ code: "CONTRADICTION_HIGH", source: "contradiction" });
  if (contradiction === "severe") reasons.push({ code: "CONTRADICTION_SEVERE", source: "contradiction" });
  if (contradiction === "not-applicable") reasons.push({ code: "CONTRADICTION_NOT_APPLICABLE", source: "contradiction" });
  if (input.marketData.availability === "partial") reasons.push({ code: "MARKET_DATA_PARTIAL", source: "marketData" });
  if (input.marketData.availability === "unavailable") reasons.push({ code: "MARKET_DATA_UNAVAILABLE", source: "marketData" });
  if (input.marketData.availability !== "unavailable" && input.marketData.status === "stale") reasons.push({ code: "MARKET_DATA_STALE", source: "marketData" });
  if (input.risk.level === "moderate") reasons.push({ code: "RISK_MODERATE", source: "risk" });
  if (input.risk.level === "high") reasons.push({ code: "RISK_HIGH", source: "risk" });
  if (input.scenario.availability === "partial") reasons.push({ code: "SCENARIO_PARTIAL", source: "scenario" });
  if (input.scenario.availability === "not-computed") reasons.push({ code: "SCENARIO_NOT_COMPUTED", source: "scenario" });
  if (input.scenario.availability === "unavailable") reasons.push({ code: "SCENARIO_UNAVAILABLE", source: "scenario" });
  if (opposingEvidence.length > 0) reasons.push({ code: "SCENARIO_HAS_OPPOSING_EVIDENCE", source: "scenario" });
  if (input.invalidation.availability === "partial") reasons.push({ code: "INVALIDATION_PARTIAL", source: "invalidation" });
  if (input.invalidation.availability === "not-computed") reasons.push({ code: "INVALIDATION_NOT_COMPUTED", source: "invalidation" });
  if (input.invalidation.availability === "unavailable") reasons.push({ code: "INVALIDATION_UNAVAILABLE", source: "invalidation" });
  if (hasInvalidationFragilities(input.invalidation)) reasons.push({ code: "INVALIDATION_HAS_CURRENT_FRAGILITIES", source: "invalidation" });
  return reasons;
}

function projectScenario(
  scenario: EngineScenarioSectionV1,
  stance: EngineDecisionStanceV3,
): EngineRecommendationScenarioProjectionV1 {
  if (scenario.availability === "not-computed") return { availability: "not-computed" };
  if (scenario.availability === "unavailable") return { availability: "unavailable", reasonCode: scenario.reasonCode };
  const counterfactual: readonly ("bullish" | "bearish")[] = stance === "neutral"
    ? ["bullish", "bearish"]
    : [stance === "bullish" ? "bearish" : "bullish"];
  const projection = {
    base: "base",
    aligned: stance === "neutral" ? null : stance,
    counterfactual,
  } as const;
  return scenario.availability === "partial"
    ? { availability: "partial", missing: scenario.missing, ...projection }
    : { availability: "available", ...projection };
}

function projectInvalidation(
  invalidation: EngineInvalidationSectionV1,
): EngineRecommendationInvalidationProjectionV1 {
  if (invalidation.availability === "not-computed") return { availability: "not-computed" };
  if (invalidation.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: invalidation.reasonCode };
  }
  const projection = {
    invalidatesWhen: invalidation.data.invalidatesWhen,
    weakensWhen: invalidation.data.weakensWhen,
    assessmentFailsWhen: invalidation.data.assessmentFailsWhen,
  } as const;
  return invalidation.availability === "partial"
    ? { availability: "partial", missing: invalidation.missing, ...projection }
    : { availability: "available", ...projection };
}

function scenarioDominantSupportingEvidence(
  scenario: EngineScenarioSectionV1,
): readonly EngineEvidenceReferenceV1[] {
  if (scenario.availability !== "available" && scenario.availability !== "partial") return [];
  return [...scenario.data.base.dominantSupportingDrivers]
    .sort(compareEvidenceReferences);
}

function scenarioOpposingEvidence(
  scenario: EngineScenarioSectionV1,
): readonly EngineEvidenceReferenceV1[] {
  if (scenario.availability !== "available" && scenario.availability !== "partial") return [];
  return scenario.data.base.opposingEvidence
    .map(({ reference }) => reference)
    .sort(compareEvidenceReferences);
}

function compareEvidenceReferences(left: EngineEvidenceReferenceV1, right: EngineEvidenceReferenceV1): number {
  const leftKey = `${left.channel}:${left.kind}:${"id" in left ? left.id : ""}:${left.role}`;
  const rightKey = `${right.channel}:${right.kind}:${"id" in right ? right.id : ""}:${right.role}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function hasInvalidationFragilities(invalidation: EngineInvalidationSectionV1): boolean {
  return (invalidation.availability === "available" || invalidation.availability === "partial") &&
    invalidation.data.currentFragilities.length > 0;
}

function collectMissing(input: CalculateRecommendationV1Input): readonly EngineRecommendationMissingCodeV1[] {
  const missing: EngineRecommendationMissingCodeV1[] = [];
  if (input.decision.availability === "partial") missing.push("decision");
  if (input.confidence.availability === "available" && input.confidence.data.conviction.availability === "partial") missing.push("conviction");
  if (input.confidence.availability === "available" && input.confidence.data.data.availability === "partial") missing.push("dataConfidence");
  if (input.contradiction.availability === "partial") missing.push("contradiction");
  if (input.marketData.availability !== "available") missing.push("marketData");
  if (input.scenario.availability !== "available") missing.push("scenario");
  if (input.invalidation.availability !== "available") missing.push("invalidation");
  return missing;
}

function hasValidCanonicalInput(input: CalculateRecommendationV1Input): boolean {
  if (!validNormalized(input.risk.score)) return false;
  if (input.decision.availability === "available" || input.decision.availability === "partial") {
    if (!validDecision(input.decision.data.score, input.decision.data.stance)) return false;
  }
  if (input.confidence.availability === "available") {
    const conviction = input.confidence.data.conviction;
    const data = input.confidence.data.data;
    if ((conviction.availability === "available" || conviction.availability === "partial") && !validNormalized(conviction.data.score)) return false;
    if ((data.availability === "available" || data.availability === "partial") && !validNormalized(data.data.score)) return false;
    if ((input.decision.availability === "available" || input.decision.availability === "partial") &&
        (conviction.availability === "available" || conviction.availability === "partial") &&
        Math.abs(Math.abs(input.decision.data.score) - conviction.data.score) > 1e-12) return false;
  }
  if (input.contradiction.availability === "available" || input.contradiction.availability === "partial") {
    if (!validNormalized(input.contradiction.data.score)) return false;
  }
  if ((input.scenario.availability === "available" || input.scenario.availability === "partial") &&
      (input.decision.availability === "available" || input.decision.availability === "partial")) {
    const stance = input.decision.data.stance;
    if (input.scenario.data.base.targetStance !== stance ||
        input.scenario.data.base.relationToDecision !== "current" ||
        input.scenario.data.bullish.relationToDecision !== (stance === "bullish" ? "aligned" : "counterfactual") ||
        input.scenario.data.bearish.relationToDecision !== (stance === "bearish" ? "aligned" : "counterfactual")) return false;
  }
  if ((input.invalidation.availability === "available" || input.invalidation.availability === "partial") &&
      (input.decision.availability === "available" || input.decision.availability === "partial") &&
      input.invalidation.data.thesis.stance !== input.decision.data.stance) return false;
  return true;
}

function validDecision(score: number, stance: EngineDecisionStanceV3): boolean {
  return Number.isFinite(score) && score >= -1 && score <= 1 &&
    (score > 0 ? stance === "bullish" : score < 0 ? stance === "bearish" : stance === "neutral");
}

function validNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function hasForbiddenCircularInput(input: CalculateRecommendationV1Input): boolean {
  return "recommendation" in (input as CalculateRecommendationV1Input & Record<string, unknown>);
}
