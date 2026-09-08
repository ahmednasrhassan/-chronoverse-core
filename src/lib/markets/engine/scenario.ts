import type { MarketRiskResult } from "../core/riskEngine";
import type {
  EngineCanonicalSignalSectionV1,
  EngineConfidenceInputV3,
  EngineCrossAssetSectionV3,
  EngineDecisionSectionV3,
  EngineMacroSectionV3,
  EngineMarketDataV3,
  EngineScenarioCaseV1,
  EngineScenarioConditionV1,
  EngineScenarioEvidenceObservationV1,
  EngineScenarioEvidenceReferenceV1,
  EngineScenarioEvidenceRelationV1,
  EngineScenarioMissingCodeV1,
  EngineScenarioSectionV1,
  EngineScenarioStanceV1,
} from "./contracts";

export interface CalculateScenarioV1Input {
  readonly decision: EngineDecisionSectionV3;
  readonly signal: EngineCanonicalSignalSectionV1;
  readonly macro: EngineMacroSectionV3<unknown>;
  readonly crossAsset: EngineCrossAssetSectionV3;
  readonly marketData: EngineMarketDataV3;
  readonly dataConfidence: EngineConfidenceInputV3;
  readonly risk: MarketRiskResult;
}

type UsableDecision = Extract<
  EngineDecisionSectionV3,
  { readonly availability: "available" | "partial" }
>;

const SIGNAL_REFERENCE = {
  kind: "channel",
  channel: "signal",
  role: "primary",
} as const;
const MACRO_REFERENCE = {
  kind: "channel",
  channel: "macro",
  role: "primary",
} as const;
const CROSS_ASSET_REFERENCE = {
  kind: "channel",
  channel: "crossAsset",
  role: "corroborative",
} as const;

/**
 * Builds conditional evidence configurations from already-canonical evidence.
 * The result describes current and counterfactual evidence states; it is not a
 * forecast, a second Decision, or a source of probabilities or price targets.
 */
export function calculateScenarioV1(
  input: CalculateScenarioV1Input,
): EngineScenarioSectionV1 {
  if (hasForbiddenCircularInput(input) || !hasValidCanonicalInput(input)) {
    return { availability: "unavailable", reasonCode: "INVALID_CANONICAL_INPUT" };
  }

  if (input.decision.availability === "not-computed") {
    return { availability: "unavailable", reasonCode: "DECISION_NOT_COMPUTED" };
  }
  if (input.decision.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: "DECISION_UNAVAILABLE" };
  }
  if (input.signal.availability === "not-computed") {
    return { availability: "unavailable", reasonCode: "SIGNAL_NOT_COMPUTED" };
  }
  if (input.signal.availability === "unavailable") {
    return { availability: "unavailable", reasonCode: "SIGNAL_UNAVAILABLE" };
  }

  const decision = input.decision as UsableDecision;
  const evidence = collectCurrentEvidence(input, decision.data.stance);
  const bullish = buildDirectionalCase("bullish", decision.data.stance, collectCurrentEvidence(input, "bullish"), input);
  const bearish = buildDirectionalCase("bearish", decision.data.stance, collectCurrentEvidence(input, "bearish"), input);
  const data = {
    semantic: "conditional-evidence-configurations-v1",
    base: buildBaseCase(decision.data.stance, evidence, input),
    bullish,
    bearish,
  } as const;
  const missing = collectMissing(input);

  return missing.length === 0
    ? { availability: "available", data }
    : { availability: "partial", data, missing };
}

function buildBaseCase(
  stance: EngineScenarioStanceV1,
  currentEvidence: readonly EngineScenarioEvidenceObservationV1[],
  input: CalculateScenarioV1Input,
): EngineScenarioCaseV1 & { readonly id: "base"; readonly relationToDecision: "current" } {
  return buildCase("base", stance, "current", currentEvidence, currentEvidence, input) as
    EngineScenarioCaseV1 & { readonly id: "base"; readonly relationToDecision: "current" };
}

function buildDirectionalCase<TStance extends "bullish" | "bearish">(
  stance: TStance,
  decisionStance: EngineScenarioStanceV1,
  currentEvidence: readonly EngineScenarioEvidenceObservationV1[],
  input: CalculateScenarioV1Input,
) {
  const counterfactualEvidence = currentEvidence.map((observation) => ({
    reference: observation.reference,
    relation:
      observation.relation === "unknown" || observation.relation === "not-applicable"
        ? observation.relation
        : "supports",
  }) satisfies EngineScenarioEvidenceObservationV1);

  return buildCase(
    stance,
    stance,
    stance === decisionStance ? "aligned" : "counterfactual",
    counterfactualEvidence,
    currentEvidence,
    input,
  ) as Omit<EngineScenarioCaseV1, "id" | "targetStance" | "relationToDecision"> & {
    readonly id: TStance;
    readonly targetStance: TStance;
    readonly relationToDecision: "aligned" | "counterfactual";
  };
}

function buildCase(
  id: EngineScenarioCaseV1["id"],
  targetStance: EngineScenarioStanceV1,
  relationToDecision: EngineScenarioCaseV1["relationToDecision"],
  configuredEvidence: readonly EngineScenarioEvidenceObservationV1[],
  currentEvidenceRelativeToTarget: readonly EngineScenarioEvidenceObservationV1[],
  input: CalculateScenarioV1Input,
): EngineScenarioCaseV1 {
  const byRelation = (relation: EngineScenarioEvidenceRelationV1) =>
    configuredEvidence.filter((observation) => observation.relation === relation);
  const dominantSupportingDrivers = byRelation("supports")
    .map((observation) => observation.reference)
    .filter((reference) => reference.role === "explanatory");

  return {
    id,
    targetStance,
    relationToDecision,
    supportingEvidence: byRelation("supports"),
    opposingEvidence: byRelation("opposes"),
    neutralEvidence: [
      ...byRelation("neutral"),
    ],
    notApplicableEvidence: byRelation("not-applicable"),
    unknownEvidence: byRelation("unknown"),
    dominantSupportingDrivers,
    strengtheningConditions: currentEvidenceRelativeToTarget.map((observation) => ({
      code: observation.relation === "supports"
        ? "TARGET_DIRECTION_SUPPORTED"
        : "EVIDENCE_BECOMES_SUPPORTIVE",
      reference: observation.reference,
      expectedRelation: "supports",
      status: observation.relation === "supports"
        ? "met"
        : observation.relation === "unknown"
          ? "unknown"
          : observation.relation === "not-applicable"
            ? "not-applicable"
            : "unmet",
    })),
    weakeningConditions: buildWeakeningConditions(configuredEvidence, input),
  };
}

function buildWeakeningConditions(
  evidence: readonly EngineScenarioEvidenceObservationV1[],
  input: CalculateScenarioV1Input,
): readonly EngineScenarioConditionV1[] {
  const conditions: EngineScenarioConditionV1[] = evidence
    .filter((observation) => observation.relation === "supports")
    .flatMap((observation) => weakeningEvidenceConditions(observation.reference));

  conditions.push(
    {
      code: "RELEVANT_DATA_CONFIDENCE_PARTIAL",
      reference: { kind: "dataQuality", section: "confidence.data" },
      status: input.dataConfidence.availability === "partial" ? "met" : "unmet",
    },
    {
      code: "RELEVANT_DATA_CONFIDENCE_UNAVAILABLE",
      reference: { kind: "dataQuality", section: "confidence.data" },
      status: input.dataConfidence.availability === "unavailable" || input.dataConfidence.availability === "not-computed"
        ? "met"
        : input.dataConfidence.availability === "not-applicable" ? "not-applicable" : "unmet",
    },
    {
      code: "MARKET_DATA_STALE",
      reference: { kind: "marketData", section: "marketData" },
      status: input.marketData.availability !== "unavailable" && input.marketData.freshness === "stale"
        ? "met"
        : "unmet",
    },
    {
      code: "RISK_LEVEL_HIGH",
      reference: { kind: "risk", section: "risk" },
      status: input.risk.level === "high" ? "met" : "unmet",
    },
  );

  return conditions;
}

function weakeningEvidenceConditions(
  reference: EngineScenarioEvidenceReferenceV1,
): readonly EngineScenarioConditionV1[] {
  if (reference.kind === "channel" && reference.channel === "signal") {
    return [{
      code: "PRIMARY_SIGNAL_CEASES_SUPPORT",
      reference,
      expectedRelation: "neutral",
      status: "unmet",
    }];
  }
  if (reference.kind === "driver") {
    return [
      {
        code: "SUPPORTING_MACRO_DRIVER_CEASES_SUPPORT",
        reference,
        expectedRelation: "neutral",
        status: "unmet",
      },
      {
        code: "SUPPORTING_MACRO_DRIVER_REVERSES",
        reference,
        expectedRelation: "opposes",
        status: "unmet",
      },
    ];
  }
  if (reference.kind === "relationship") {
    return [
      {
        code: "CORROBORATIVE_RELATIONSHIP_CEASES_SUPPORT",
        reference,
        expectedRelation: "neutral",
        status: "unmet",
      },
      {
        code: "CORROBORATIVE_RELATIONSHIP_REVERSES",
        reference,
        expectedRelation: "opposes",
        status: "unmet",
      },
    ];
  }
  return [{
    code: "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE",
    reference,
    status: "unmet",
  }];
}

function collectCurrentEvidence(
  input: CalculateScenarioV1Input,
  decisionStance: EngineScenarioStanceV1,
): readonly EngineScenarioEvidenceObservationV1[] {
  const observations: EngineScenarioEvidenceObservationV1[] = [
    input.signal.availability === "available" || input.signal.availability === "partial"
      ? observation(SIGNAL_REFERENCE, input.signal.data.direction, decisionStance)
      : { reference: SIGNAL_REFERENCE, relation: "unknown" },
  ];

  if (input.macro.availability === "available" || input.macro.availability === "partial") {
    observations.push(observation(MACRO_REFERENCE, input.macro.data.direction, decisionStance));
    for (const driver of [...input.macro.data.drivers].sort(byId)) {
      const reference = { kind: "driver", channel: "macro", id: driver.id, role: "explanatory" } as const;
      observations.push(driver.available
        ? observation(reference, driver.direction ?? directionFromScore(driver.score), decisionStance)
        : { reference, relation: "unknown" });
    }
  } else {
    observations.push({
      reference: MACRO_REFERENCE,
      relation: input.macro.availability === "not-applicable" ? "not-applicable" : "unknown",
    });
  }

  if (input.crossAsset.availability === "available" || input.crossAsset.availability === "partial") {
    observations.push(observation(CROSS_ASSET_REFERENCE, directionFromScore(input.crossAsset.data.score), decisionStance));
    for (const relationship of [...input.crossAsset.data.relationships].sort(byId)) {
      const reference = {
        kind: "relationship",
        channel: "crossAsset",
        id: relationship.id,
        role: "explanatory",
      } as const;
      observations.push(relationship.availability === "available"
        ? observation(reference, directionFromScore(relationship.signedEvidence), decisionStance)
        : { reference, relation: "unknown" });
    }
  } else {
    observations.push({
      reference: CROSS_ASSET_REFERENCE,
      relation: input.crossAsset.availability === "not-applicable" ? "not-applicable" : "unknown",
    });
  }

  return observations;
}

function observation(
  reference: EngineScenarioEvidenceReferenceV1,
  direction: EngineScenarioStanceV1 | undefined,
  target: EngineScenarioStanceV1,
): EngineScenarioEvidenceObservationV1 {
  return {
    reference,
    relation: direction === undefined
      ? "unknown"
      : direction === target
        ? "supports"
        : direction === "neutral"
          ? target === "neutral" ? "supports" : "neutral"
          : target === "neutral" ? "opposes" : "opposes",
  };
}

function directionFromScore(score: number | null | undefined): EngineScenarioStanceV1 | undefined {
  return score === undefined || score === null
    ? undefined
    : score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral";
}

function collectMissing(input: CalculateScenarioV1Input): readonly EngineScenarioMissingCodeV1[] {
  const missing: EngineScenarioMissingCodeV1[] = [];
  if (input.decision.availability === "partial") missing.push("decision");
  if (input.signal.availability === "partial") missing.push("signal");
  if (input.macro.availability === "partial" || input.macro.availability === "unavailable" || input.macro.availability === "not-computed") missing.push("macro");
  if ((input.macro.availability === "available" || input.macro.availability === "partial") && input.macro.data.dataQuality.availability !== "available") missing.push("macroDataQuality");
  if (input.crossAsset.availability === "partial" || input.crossAsset.availability === "unavailable" || input.crossAsset.availability === "not-computed") missing.push("crossAsset");
  if ((input.crossAsset.availability === "available" || input.crossAsset.availability === "partial") && input.crossAsset.data.dataQuality.availability !== "available") missing.push("crossAssetDataQuality");
  if (input.marketData.availability !== "available") missing.push("marketData");
  if (input.dataConfidence.availability !== "available") missing.push("dataConfidence");
  return missing;
}

function hasValidCanonicalInput(input: CalculateScenarioV1Input): boolean {
  if ((input.decision.availability === "available" || input.decision.availability === "partial") &&
      !validSignedStance(input.decision.data.score, input.decision.data.stance)) return false;
  if ((input.signal.availability === "available" || input.signal.availability === "partial") &&
      !validNormalized(input.signal.data.score, -1, 1)) return false;
  if (!Number.isFinite(input.risk.score) || input.risk.score < 0 || input.risk.score > 1) return false;
  if (input.macro.availability === "available" || input.macro.availability === "partial") {
    if (!validSignedStance(input.macro.data.score, input.macro.data.direction) ||
        !validIdentifiers(input.macro.data.drivers.map((driver) => driver.id))) return false;
  }
  if (input.crossAsset.availability === "available" || input.crossAsset.availability === "partial") {
    if (!validNormalized(input.crossAsset.data.score, -1, 1) ||
        !validIdentifiers(input.crossAsset.data.relationships.map((relationship) => relationship.id))) return false;
  }
  return true;
}

function validSignedStance(score: number, stance: EngineScenarioStanceV1): boolean {
  return validNormalized(score, -1, 1) && directionFromScore(score) === stance;
}

function validNormalized(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validIdentifiers(ids: readonly string[]): boolean {
  return ids.every((id) => id.trim().length > 0) && new Set(ids).size === ids.length;
}

function byId(left: { readonly id: string }, right: { readonly id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function hasForbiddenCircularInput(input: CalculateScenarioV1Input): boolean {
  const value = input as CalculateScenarioV1Input & Record<string, unknown>;
  return "scenario" in value || "invalidation" in value || "recommendation" in value;
}
