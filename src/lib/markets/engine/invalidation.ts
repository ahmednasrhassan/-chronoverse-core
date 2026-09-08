import type { MarketRiskResult } from "../core/riskEngine";
import type {
  EngineAssessmentUnavailableTriggerV1,
  EngineCanonicalSignalSectionV1,
  EngineConfidenceInputV3,
  EngineCrossAssetSectionV3,
  EngineDecisionSectionV3,
  EngineDecisionStanceV3,
  EngineEvidenceReferenceV1,
  EngineFoundationMissingCodeV1,
  EngineInvalidatingTriggerV1,
  EngineInvalidationSectionV1,
  EngineMacroSectionV3,
  EngineMarketDataV3,
  EngineWeakeningTriggerV1,
} from "./contracts";

export interface CalculateInvalidationV1Input {
  readonly decision: EngineDecisionSectionV3;
  readonly signal: EngineCanonicalSignalSectionV1;
  readonly macro: EngineMacroSectionV3<unknown>;
  readonly crossAsset: EngineCrossAssetSectionV3;
  readonly marketData: EngineMarketDataV3;
  readonly dataConfidence: EngineConfidenceInputV3;
  readonly risk: MarketRiskResult;
}

const SIGNAL_REFERENCE = {
  kind: "channel",
  channel: "signal",
  role: "primary",
} as const;

/**
 * Derives deterministic predicates over future canonical evidence or Decision
 * state. It does not consume Scenario output and does not predict when a
 * predicate will become true.
 */
export function calculateInvalidationV1(
  input: CalculateInvalidationV1Input,
): EngineInvalidationSectionV1 {
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

  const stance = input.decision.data.stance;
  const supporting = collectSupportingEvidence(input, stance);
  const fragilities = collectFragilities(input);
  const invalidatesWhen: [EngineInvalidatingTriggerV1, ...EngineInvalidatingTriggerV1[]] = [
    {
      code: "DECISION_STANCE_NO_LONGER_MATCHES_THESIS",
      effect: "invalidates",
      predicate: { kind: "decision-stance-not-equal", stance },
    },
  ];
  if (input.signal.data.direction === stance) {
    invalidatesWhen.push({
      code: "PRIMARY_SIGNAL_CEASES_SUPPORT",
      effect: "invalidates",
      predicate: {
        kind: "evidence-relation-not-equal",
        reference: SIGNAL_REFERENCE,
        relation: "supports",
      },
    });
  }
  const weakensWhen = buildWeakeningTriggers(supporting);
  const assessmentFailsWhen = buildAssessmentTriggers(supporting);
  const data = {
    semantic: "decision-anchored-transition-predicates-v1",
    thesis: { stance, source: "decision" },
    invalidatesWhen,
    weakensWhen,
    assessmentFailsWhen,
    currentFragilities: fragilities,
  } as const;
  const missing = collectMissing(input);

  return missing.length === 0
    ? { availability: "available", data }
    : { availability: "partial", data, missing };
}

function collectSupportingEvidence(
  input: CalculateInvalidationV1Input,
  stance: EngineDecisionStanceV3,
): readonly EngineEvidenceReferenceV1[] {
  const references: EngineEvidenceReferenceV1[] =
    (input.signal.availability === "available" || input.signal.availability === "partial") &&
    input.signal.data.direction === stance
    ? [SIGNAL_REFERENCE]
    : [];

  if (input.macro.availability === "available" || input.macro.availability === "partial") {
    for (const driver of [...input.macro.data.drivers].sort(byId)) {
      if (driver.available && relationSupports(driver.direction, driver.score, stance)) {
        references.push({ kind: "driver", channel: "macro", id: driver.id, role: "explanatory" });
      }
    }
  }
  if (input.crossAsset.availability === "available" || input.crossAsset.availability === "partial") {
    for (const relationship of [...input.crossAsset.data.relationships].sort(byId)) {
      if (relationship.availability === "available" && relationSupports(undefined, relationship.signedEvidence, stance)) {
        references.push({
          kind: "relationship",
          channel: "crossAsset",
          id: relationship.id,
          role: "explanatory",
        });
      }
    }
  }
  return references;
}

function buildWeakeningTriggers(
  supporting: readonly EngineEvidenceReferenceV1[],
): readonly EngineWeakeningTriggerV1[] {
  const triggers: EngineWeakeningTriggerV1[] = [];
  for (const reference of supporting) {
    if (reference.kind === "driver") {
      triggers.push(
        {
          code: "SUPPORTING_MACRO_DRIVER_CEASES_SUPPORT",
          effect: "weakens",
          predicate: { kind: "evidence-relation-not-equal", reference, relation: "supports" },
        },
        {
          code: "SUPPORTING_MACRO_DRIVER_REVERSES",
          effect: "weakens",
          predicate: { kind: "evidence-relation-equal", reference, relation: "opposes" },
        },
      );
    } else if (reference.kind === "relationship") {
      triggers.push(
        {
          code: "CORROBORATIVE_RELATIONSHIP_CEASES_SUPPORT",
          effect: "weakens",
          predicate: { kind: "evidence-relation-not-equal", reference, relation: "supports" },
        },
        {
          code: "CORROBORATIVE_RELATIONSHIP_REVERSES",
          effect: "weakens",
          predicate: { kind: "evidence-relation-equal", reference, relation: "opposes" },
        },
      );
    }
  }
  triggers.push(
    {
      code: "RISK_LEVEL_HIGH",
      effect: "weakens",
      predicate: { kind: "risk-level-equal", level: "high" },
    },
    {
      code: "RELEVANT_DATA_CONFIDENCE_PARTIAL",
      effect: "weakens",
      predicate: { kind: "data-confidence-availability-equal", availability: "partial" },
    },
    {
      code: "MARKET_DATA_STALE",
      effect: "weakens",
      predicate: { kind: "market-data-freshness-equal", freshness: "stale" },
    },
  );
  return triggers;
}

function buildAssessmentTriggers(
  supporting: readonly EngineEvidenceReferenceV1[],
): readonly EngineAssessmentUnavailableTriggerV1[] {
  return [
    {
      code: "DECISION_BECOMES_UNAVAILABLE",
      effect: "assessment-unavailable",
      predicate: { kind: "decision-availability-equal", availability: "unavailable" },
    },
    ...supporting.map((reference): EngineAssessmentUnavailableTriggerV1 => ({
      code: "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE",
      effect: "assessment-unavailable",
      predicate: { kind: "evidence-availability-equal", reference, availability: "unavailable" },
    })),
    {
      code: "RELEVANT_DATA_CONFIDENCE_UNAVAILABLE",
      effect: "assessment-unavailable",
      predicate: { kind: "data-confidence-availability-equal", availability: "unavailable" },
    },
  ];
}

function collectFragilities(input: CalculateInvalidationV1Input): readonly EngineEvidenceReferenceV1[] {
  const references: EngineEvidenceReferenceV1[] = [];
  if ((input.decision.availability === "available" || input.decision.availability === "partial") &&
      (input.signal.availability === "available" || input.signal.availability === "partial") &&
      input.signal.data.direction !== input.decision.data.stance) {
    references.push(SIGNAL_REFERENCE);
  }
  if (input.macro.availability === "unavailable" || input.macro.availability === "not-computed") {
    references.push({ kind: "channel", channel: "macro", role: "primary" });
  } else if (input.macro.availability === "available" || input.macro.availability === "partial") {
    for (const driver of [...input.macro.data.drivers].sort(byId)) {
      if (!driver.available) references.push({ kind: "driver", channel: "macro", id: driver.id, role: "explanatory" });
    }
  }
  if (input.crossAsset.availability === "unavailable" || input.crossAsset.availability === "not-computed") {
    references.push({ kind: "channel", channel: "crossAsset", role: "corroborative" });
  } else if (input.crossAsset.availability === "available" || input.crossAsset.availability === "partial") {
    for (const relationship of [...input.crossAsset.data.relationships].sort(byId)) {
      if (relationship.availability === "unavailable") {
        references.push({ kind: "relationship", channel: "crossAsset", id: relationship.id, role: "explanatory" });
      }
    }
  }
  return references;
}

function relationSupports(
  direction: EngineDecisionStanceV3 | undefined,
  score: number | null | undefined,
  stance: EngineDecisionStanceV3,
): boolean {
  const actual = direction ?? directionFromScore(score);
  return actual === stance;
}

function directionFromScore(score: number | null | undefined): EngineDecisionStanceV3 | undefined {
  return score === undefined || score === null
    ? undefined
    : score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral";
}

function collectMissing(input: CalculateInvalidationV1Input): readonly EngineFoundationMissingCodeV1[] {
  const missing: EngineFoundationMissingCodeV1[] = [];
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

function hasValidCanonicalInput(input: CalculateInvalidationV1Input): boolean {
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

function validSignedStance(score: number, stance: EngineDecisionStanceV3): boolean {
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

function hasForbiddenCircularInput(input: CalculateInvalidationV1Input): boolean {
  const value = input as CalculateInvalidationV1Input & Record<string, unknown>;
  return "scenario" in value || "invalidation" in value || "recommendation" in value;
}
