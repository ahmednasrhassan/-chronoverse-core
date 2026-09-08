// TODO: Move these result types to a pure core contract/type module and re-export them from their calculation modules.
import type { MarketTechnicalSnapshot } from "../core/intelligenceEngine";
import type { MarketDirection } from "../core/intelligenceTypes";
import type { MarketStateResult } from "../core/marketState";
import type { MarketAssetId } from "../core/assets";
import type {
  MarketRegimeMemoryResult,
  MarketRegimeSnapshot,
} from "../core/regimeMemory";
import type { MarketRiskResult } from "../core/riskEngine";
import type { MarketSignalResult } from "../core/signalEngine";
import type {
  HistoricalDataWindow,
  MarketDataProvenance,
  MarketDataStatus,
} from "../core/types";

export const ENGINE_RESULT_VERSION = "3" as const;
export type EngineResultVersion = typeof ENGINE_RESULT_VERSION;

export type EngineAssetId =
  MarketAssetId;

export type EngineSerializable<T> =
  T extends string | number | boolean | null
    ? T
    : T extends readonly (infer TItem)[]
      ? readonly EngineSerializable<TItem>[]
      : T extends object
        ? { readonly [TKey in keyof T]: EngineSerializable<T[TKey]> }
        : never;

export type EngineDataSection<T> =
  | { readonly availability: "available"; readonly data: T }
  | {
      readonly availability: "partial";
      readonly data: T;
      readonly missing: readonly string[];
    }
  | { readonly availability: "unavailable"; readonly reason?: string };

export type EngineDeferredSection =
  | { readonly availability: "not-computed" }
  | { readonly availability: "unavailable"; readonly reason?: string };

export type EngineNotApplicableSection = {
  readonly availability: "not-applicable";
  readonly reason?: string;
};

export type EngineConfidenceInputV3 =
  | EngineDataSection<number>
  | EngineDeferredSection
  | EngineNotApplicableSection;

export interface EngineDataConfidenceSnapshotV3 {
  /** Score intended to be normalized to the inclusive range 0..1. */
  readonly score: number;
  readonly components: {
    readonly marketData: EngineConfidenceInputV3;
    readonly technical: EngineConfidenceInputV3;
    readonly macro: EngineConfidenceInputV3;
    readonly crossAsset: EngineConfidenceInputV3;
    readonly positioning: EngineConfidenceInputV3;
  };
}

export interface EngineMarketConvictionSnapshotV3 {
  /** Score intended to be normalized to the inclusive range 0..1. */
  readonly score: number;
  readonly components: {
    readonly signal: EngineConfidenceInputV3;
    readonly macro: EngineConfidenceInputV3;
    readonly state: EngineConfidenceInputV3;
    readonly regime: EngineConfidenceInputV3;
    readonly crossAsset: EngineConfidenceInputV3;
    readonly positioning: EngineConfidenceInputV3;
    readonly scenario: EngineConfidenceInputV3;
    readonly contradiction: EngineConfidenceInputV3;
  };
}

export interface EngineConfidenceV3 {
  readonly data:
    EngineDataSection<EngineDataConfidenceSnapshotV3>;

  readonly conviction:
    EngineDataSection<EngineMarketConvictionSnapshotV3>;
}

export type EngineConfidenceSectionV3 =
  | {
      readonly availability: "not-computed";
    }
  | {
      readonly availability: "available";
      readonly data: EngineConfidenceV3;
    }
  | {
      readonly availability: "unavailable";
      readonly reason?: string;
    };

export type EngineDecisionStanceV3 =
  | "bullish"
  | "bearish"
  | "neutral";

export interface EngineDecisionV3 {
  /**
   * Signed analytical stance.
   *
   * Intended normalized range: -1..1.
   * Absolute value must equal canonical Market Conviction.
   *
   * Positive => bullish
   * Negative => bearish
   * Zero     => neutral
   */
  readonly score: number;

  readonly stance: EngineDecisionStanceV3;
}

export type EngineDecisionSectionV3 =
  | {
      readonly availability: "not-computed";
    }
  | {
      readonly availability: "available";
      readonly data: EngineDecisionV3;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineDecisionV3;
      readonly missing: readonly string[];
    }
  | {
      readonly availability: "unavailable";
      readonly reason?: string;
    };

export type EngineScenarioStanceV1 = EngineDecisionStanceV3;

export type EngineScenarioRelationToDecisionV1 =
  | "current"
  | "aligned"
  | "counterfactual";

export type EngineEvidenceRelationV1 =
  | "supports"
  | "opposes"
  | "neutral"
  | "unknown"
  | "not-applicable";

export type EngineScenarioEvidenceRelationV1 = EngineEvidenceRelationV1;

export type EngineScenarioConditionStatusV1 =
  | "met"
  | "unmet"
  | "unknown"
  | "not-applicable";

export type EngineEvidenceReferenceV1 =
  | {
      readonly kind: "channel";
      readonly channel: "signal" | "macro";
      readonly role: "primary";
    }
  | {
      readonly kind: "channel";
      readonly channel: "crossAsset";
      readonly role: "corroborative";
    }
  | {
      readonly kind: "driver";
      readonly channel: "macro";
      readonly id: string;
      readonly role: "explanatory";
    }
  | {
      readonly kind: "relationship";
      readonly channel: "crossAsset";
      readonly id: string;
      readonly role: "explanatory";
    };

export type EngineScenarioEvidenceReferenceV1 = EngineEvidenceReferenceV1;

export type EngineCanonicalSignalSectionV1 =
  | { readonly availability: "available"; readonly data: MarketSignalResult }
  | {
      readonly availability: "partial";
      readonly data: MarketSignalResult;
      readonly missing: readonly string[];
    }
  | { readonly availability: "unavailable"; readonly reason?: string }
  | { readonly availability: "not-computed" };

export type EngineScenarioConditionReferenceV1 =
  | EngineScenarioEvidenceReferenceV1
  | {
      readonly kind: "risk";
      readonly section: "risk";
    }
  | {
      readonly kind: "dataQuality";
      readonly section: "confidence.data";
    }
  | {
      readonly kind: "marketData";
      readonly section: "marketData";
    };

export interface EngineScenarioEvidenceObservationV1 {
  readonly reference: EngineScenarioEvidenceReferenceV1;
  readonly relation: EngineScenarioEvidenceRelationV1;
}

export type EngineScenarioConditionCodeV1 =
  | "TARGET_DIRECTION_SUPPORTED"
  | "EVIDENCE_BECOMES_SUPPORTIVE"
  | "PRIMARY_SIGNAL_CEASES_SUPPORT"
  | "SUPPORTING_MACRO_DRIVER_CEASES_SUPPORT"
  | "SUPPORTING_MACRO_DRIVER_REVERSES"
  | "CORROBORATIVE_RELATIONSHIP_CEASES_SUPPORT"
  | "CORROBORATIVE_RELATIONSHIP_REVERSES"
  | "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE"
  | "RELEVANT_DATA_CONFIDENCE_PARTIAL"
  | "RELEVANT_DATA_CONFIDENCE_UNAVAILABLE"
  | "MARKET_DATA_STALE"
  | "RISK_LEVEL_HIGH";

export interface EngineScenarioConditionV1 {
  readonly code: EngineScenarioConditionCodeV1;
  readonly reference: EngineScenarioConditionReferenceV1;
  readonly expectedRelation?: "supports" | "opposes" | "neutral";
  readonly status: EngineScenarioConditionStatusV1;
}

export interface EngineScenarioCaseV1 {
  readonly id: "base" | "bullish" | "bearish";
  readonly targetStance: EngineScenarioStanceV1;
  readonly relationToDecision: EngineScenarioRelationToDecisionV1;
  readonly supportingEvidence:
    readonly EngineScenarioEvidenceObservationV1[];
  readonly opposingEvidence:
    readonly EngineScenarioEvidenceObservationV1[];
  readonly neutralEvidence:
    readonly EngineScenarioEvidenceObservationV1[];
  readonly notApplicableEvidence:
    readonly EngineScenarioEvidenceObservationV1[];
  readonly unknownEvidence:
    readonly EngineScenarioEvidenceObservationV1[];
  readonly dominantSupportingDrivers:
    readonly EngineScenarioEvidenceReferenceV1[];
  readonly strengtheningConditions:
    readonly EngineScenarioConditionV1[];
  readonly weakeningConditions:
    readonly EngineScenarioConditionV1[];
}

type EngineDirectionalScenarioCaseV1<
  TId extends "bullish" | "bearish",
> = Omit<
  EngineScenarioCaseV1,
  "id" | "targetStance" | "relationToDecision"
> & {
  readonly id: TId;
  readonly targetStance: TId;
  readonly relationToDecision: "aligned" | "counterfactual";
};

export interface EngineScenarioV1 {
  readonly semantic: "conditional-evidence-configurations-v1";
  readonly base: EngineScenarioCaseV1 & {
    readonly id: "base";
    readonly relationToDecision: "current";
  };
  readonly bullish: EngineDirectionalScenarioCaseV1<"bullish">;
  readonly bearish: EngineDirectionalScenarioCaseV1<"bearish">;
}

export type EngineFoundationMissingCodeV1 =
  | "decision"
  | "signal"
  | "macro"
  | "crossAsset"
  | "marketData"
  | "dataConfidence"
  | "macroDataQuality"
  | "crossAssetDataQuality";

export type EngineScenarioMissingCodeV1 = EngineFoundationMissingCodeV1;

export type EngineScenarioUnavailableReasonCodeV1 =
  | "DECISION_NOT_COMPUTED"
  | "DECISION_UNAVAILABLE"
  | "SIGNAL_NOT_COMPUTED"
  | "SIGNAL_UNAVAILABLE"
  | "INVALID_CANONICAL_INPUT";

export type EngineScenarioSectionV1 =
  | { readonly availability: "not-computed" }
  | {
      readonly availability: "unavailable";
      readonly reasonCode: EngineScenarioUnavailableReasonCodeV1;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineScenarioV1;
      readonly missing: readonly EngineScenarioMissingCodeV1[];
    }
  | {
      readonly availability: "available";
      readonly data: EngineScenarioV1;
    };

export type EngineInvalidationPredicateV1 =
  | {
      readonly kind: "decision-stance-not-equal";
      readonly stance: EngineDecisionStanceV3;
    }
  | {
      readonly kind: "decision-availability-equal";
      readonly availability: "unavailable";
    }
  | {
      readonly kind: "evidence-relation-not-equal";
      readonly reference: EngineEvidenceReferenceV1;
      readonly relation: "supports";
    }
  | {
      readonly kind: "evidence-relation-equal";
      readonly reference: EngineEvidenceReferenceV1;
      readonly relation: "opposes";
    }
  | {
      readonly kind: "evidence-availability-equal";
      readonly reference: EngineEvidenceReferenceV1;
      readonly availability: "unavailable";
    }
  | {
      readonly kind: "risk-level-equal";
      readonly level: "high";
    }
  | {
      readonly kind: "data-confidence-availability-equal";
      readonly availability: "partial" | "unavailable";
    }
  | {
      readonly kind: "market-data-status-equal";
      readonly status: "stale";
    };

export type EngineInvalidationTriggerCodeV1 =
  | "DECISION_STANCE_NO_LONGER_MATCHES_THESIS"
  | "DECISION_BECOMES_UNAVAILABLE"
  | "PRIMARY_SIGNAL_CEASES_SUPPORT"
  | "SUPPORTING_MACRO_DRIVER_CEASES_SUPPORT"
  | "SUPPORTING_MACRO_DRIVER_REVERSES"
  | "CORROBORATIVE_RELATIONSHIP_CEASES_SUPPORT"
  | "CORROBORATIVE_RELATIONSHIP_REVERSES"
  | "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE"
  | "RELEVANT_DATA_CONFIDENCE_PARTIAL"
  | "RELEVANT_DATA_CONFIDENCE_UNAVAILABLE"
  | "MARKET_DATA_STALE"
  | "RISK_LEVEL_HIGH";

interface EngineInvalidationTriggerBaseV1 {
  readonly predicate: EngineInvalidationPredicateV1;
}

export type EngineInvalidatingTriggerV1 = EngineInvalidationTriggerBaseV1 & {
  readonly code:
    | "DECISION_STANCE_NO_LONGER_MATCHES_THESIS"
    | "PRIMARY_SIGNAL_CEASES_SUPPORT";
  readonly effect: "invalidates";
};

export type EngineWeakeningTriggerV1 = EngineInvalidationTriggerBaseV1 & {
  readonly code:
    | "SUPPORTING_MACRO_DRIVER_CEASES_SUPPORT"
    | "SUPPORTING_MACRO_DRIVER_REVERSES"
    | "CORROBORATIVE_RELATIONSHIP_CEASES_SUPPORT"
    | "CORROBORATIVE_RELATIONSHIP_REVERSES"
    | "RELEVANT_DATA_CONFIDENCE_PARTIAL"
    | "MARKET_DATA_STALE"
    | "RISK_LEVEL_HIGH";
  readonly effect: "weakens";
};

export type EngineAssessmentUnavailableTriggerV1 = EngineInvalidationTriggerBaseV1 & {
  readonly code:
    | "DECISION_BECOMES_UNAVAILABLE"
    | "SUPPORTING_EVIDENCE_BECOMES_UNAVAILABLE"
    | "RELEVANT_DATA_CONFIDENCE_UNAVAILABLE";
  readonly effect: "assessment-unavailable";
};

export type EngineInvalidationTriggerV1 =
  | EngineInvalidatingTriggerV1
  | EngineWeakeningTriggerV1
  | EngineAssessmentUnavailableTriggerV1;

export interface EngineInvalidationV1 {
  readonly semantic: "decision-anchored-transition-predicates-v1";
  readonly thesis: {
    readonly stance: EngineDecisionStanceV3;
    readonly source: "decision";
  };
  readonly invalidatesWhen:
    readonly [EngineInvalidatingTriggerV1, ...EngineInvalidatingTriggerV1[]];
  readonly weakensWhen:
    readonly EngineWeakeningTriggerV1[];
  readonly assessmentFailsWhen:
    readonly EngineAssessmentUnavailableTriggerV1[];
  readonly currentFragilities:
    readonly EngineEvidenceReferenceV1[];
}

export type EngineInvalidationUnavailableReasonCodeV1 =
  | "DECISION_NOT_COMPUTED"
  | "DECISION_UNAVAILABLE"
  | "SIGNAL_NOT_COMPUTED"
  | "SIGNAL_UNAVAILABLE"
  | "INVALID_CANONICAL_INPUT";

export type EngineInvalidationSectionV1 =
  | { readonly availability: "not-computed" }
  | {
      readonly availability: "unavailable";
      readonly reasonCode: EngineInvalidationUnavailableReasonCodeV1;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineInvalidationV1;
      readonly missing: readonly EngineFoundationMissingCodeV1[];
    }
  | {
      readonly availability: "available";
      readonly data: EngineInvalidationV1;
    };

export type EngineRecommendationPostureV1 =
  | "act"
  | "selective"
  | "watch"
  | "stand-aside";

export type EngineRecommendationStrengthBandV1 =
  | "strong"
  | "moderate"
  | "weak";

export type EngineRecommendationContradictionBandV1 =
  | "low"
  | "material"
  | "high"
  | "severe"
  | "not-applicable";

export type EngineRecommendationDataQualityBandV1 =
  | "adequate"
  | "limited";

export type EngineRecommendationDominantReasonV1 =
  | { readonly code: "DECISION_DIRECTIONAL"; readonly source: "decision" }
  | { readonly code: "DECISION_NEUTRAL"; readonly source: "decision" };

export type EngineRecommendationSupportingReasonV1 =
  | { readonly code: "DECISION_DIRECTIONAL"; readonly source: "decision" }
  | { readonly code: "CONVICTION_STRONG"; readonly source: "confidence.conviction" }
  | { readonly code: "CONVICTION_MODERATE"; readonly source: "confidence.conviction" }
  | { readonly code: "CONTRADICTION_LOW"; readonly source: "contradiction" };

export type EngineRecommendationOpposingReasonV1 =
  | { readonly code: "CONTRADICTION_MATERIAL"; readonly source: "contradiction" }
  | { readonly code: "CONTRADICTION_HIGH"; readonly source: "contradiction" }
  | { readonly code: "CONTRADICTION_SEVERE"; readonly source: "contradiction" }
  | { readonly code: "SCENARIO_HAS_OPPOSING_EVIDENCE"; readonly source: "scenario" };

export type EngineRecommendationRestraintReasonV1 =
  | { readonly code: "DECISION_NEUTRAL"; readonly source: "decision" }
  | { readonly code: "CONVICTION_WEAK"; readonly source: "confidence.conviction" }
  | { readonly code: "CONTRADICTION_NOT_APPLICABLE"; readonly source: "contradiction" }
  | { readonly code: "CONTRADICTION_MATERIAL"; readonly source: "contradiction" }
  | { readonly code: "CONTRADICTION_HIGH"; readonly source: "contradiction" }
  | { readonly code: "CONTRADICTION_SEVERE"; readonly source: "contradiction" }
  | { readonly code: "DATA_QUALITY_LIMITED"; readonly source: "confidence.data" }
  | { readonly code: "DATA_CONFIDENCE_PARTIAL"; readonly source: "confidence.data" }
  | { readonly code: "DECISION_PARTIAL"; readonly source: "decision" }
  | { readonly code: "CONVICTION_PARTIAL"; readonly source: "confidence.conviction" }
  | { readonly code: "CONTRADICTION_PARTIAL"; readonly source: "contradiction" }
  | { readonly code: "MARKET_DATA_PARTIAL"; readonly source: "marketData" }
  | { readonly code: "MARKET_DATA_UNAVAILABLE"; readonly source: "marketData" }
  | { readonly code: "MARKET_DATA_STALE"; readonly source: "marketData" }
  | { readonly code: "RISK_MODERATE"; readonly source: "risk" }
  | { readonly code: "RISK_HIGH"; readonly source: "risk" }
  | { readonly code: "SCENARIO_PARTIAL"; readonly source: "scenario" }
  | { readonly code: "SCENARIO_NOT_COMPUTED"; readonly source: "scenario" }
  | { readonly code: "SCENARIO_UNAVAILABLE"; readonly source: "scenario" }
  | { readonly code: "SCENARIO_HAS_OPPOSING_EVIDENCE"; readonly source: "scenario" }
  | { readonly code: "INVALIDATION_PARTIAL"; readonly source: "invalidation" }
  | { readonly code: "INVALIDATION_NOT_COMPUTED"; readonly source: "invalidation" }
  | { readonly code: "INVALIDATION_UNAVAILABLE"; readonly source: "invalidation" }
  | { readonly code: "INVALIDATION_HAS_CURRENT_FRAGILITIES"; readonly source: "invalidation" };

export type EngineRecommendationReasonV1 =
  | EngineRecommendationDominantReasonV1
  | EngineRecommendationSupportingReasonV1
  | EngineRecommendationOpposingReasonV1
  | EngineRecommendationRestraintReasonV1;

export type EngineRecommendationScenarioProjectionV1 =
  | { readonly availability: "not-computed" }
  | {
      readonly availability: "unavailable";
      readonly reasonCode: EngineScenarioUnavailableReasonCodeV1;
    }
  | {
      readonly availability: "available";
      readonly base: "base";
      readonly aligned: "bullish" | "bearish" | null;
      readonly counterfactual: readonly ("bullish" | "bearish")[];
    }
  | {
      readonly availability: "partial";
      readonly missing: readonly EngineScenarioMissingCodeV1[];
      readonly base: "base";
      readonly aligned: "bullish" | "bearish" | null;
      readonly counterfactual: readonly ("bullish" | "bearish")[];
    };

export type EngineRecommendationInvalidationProjectionV1 =
  | { readonly availability: "not-computed" }
  | {
      readonly availability: "unavailable";
      readonly reasonCode: EngineInvalidationUnavailableReasonCodeV1;
    }
  | {
      readonly availability: "available";
      readonly invalidatesWhen: EngineInvalidationV1["invalidatesWhen"];
      readonly weakensWhen: EngineInvalidationV1["weakensWhen"];
      readonly assessmentFailsWhen: EngineInvalidationV1["assessmentFailsWhen"];
    }
  | {
      readonly availability: "partial";
      readonly missing: readonly EngineFoundationMissingCodeV1[];
      readonly invalidatesWhen: EngineInvalidationV1["invalidatesWhen"];
      readonly weakensWhen: EngineInvalidationV1["weakensWhen"];
      readonly assessmentFailsWhen: EngineInvalidationV1["assessmentFailsWhen"];
    };

export interface EngineRecommendationV1 {
  readonly semantic: "canonical-operational-synthesis-v1";
  readonly stance: EngineDecisionStanceV3;
  readonly posture: EngineRecommendationPostureV1;
  readonly strength: {
    readonly source: "confidence.conviction";
    readonly canonicalScore: number;
    readonly band: EngineRecommendationStrengthBandV1;
  };
  readonly contradiction: {
    readonly source: "contradiction";
    readonly canonicalScore: number | null;
    readonly band: EngineRecommendationContradictionBandV1;
  };
  readonly dataQuality: {
    readonly source: "confidence.data";
    readonly canonicalScore: number;
    readonly band: EngineRecommendationDataQualityBandV1;
  };
  readonly dominantReason: EngineRecommendationDominantReasonV1;
  readonly supportingReasons: readonly EngineRecommendationSupportingReasonV1[];
  readonly opposingReasons: readonly EngineRecommendationOpposingReasonV1[];
  readonly restraintReasons: readonly EngineRecommendationRestraintReasonV1[];
  readonly dominantSupportingEvidence: readonly EngineEvidenceReferenceV1[];
  readonly opposingEvidence: readonly EngineEvidenceReferenceV1[];
  readonly scenario: EngineRecommendationScenarioProjectionV1;
  readonly invalidation: EngineRecommendationInvalidationProjectionV1;
}

export type EngineRecommendationMissingCodeV1 =
  | "decision"
  | "conviction"
  | "dataConfidence"
  | "contradiction"
  | "marketData"
  | "scenario"
  | "invalidation";

export type EngineRecommendationUnavailableReasonCodeV1 =
  | "DECISION_NOT_COMPUTED"
  | "DECISION_UNAVAILABLE"
  | "CONFIDENCE_NOT_COMPUTED"
  | "CONFIDENCE_UNAVAILABLE"
  | "CONVICTION_UNAVAILABLE"
  | "DATA_CONFIDENCE_UNAVAILABLE"
  | "CONTRADICTION_NOT_COMPUTED"
  | "CONTRADICTION_UNAVAILABLE"
  | "INVALID_CANONICAL_INPUT";

export type EngineRecommendationSectionV1 =
  | { readonly availability: "not-computed" }
  | {
      readonly availability: "unavailable";
      readonly reasonCode: EngineRecommendationUnavailableReasonCodeV1;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineRecommendationV1;
      readonly missing: readonly EngineRecommendationMissingCodeV1[];
    }
  | {
      readonly availability: "available";
      readonly data: EngineRecommendationV1;
    };

export type EngineDecisionConvictionChangeV3 =
  | "increased"
  | "decreased"
  | "unchanged";

export type EngineDecisionTransitionV3 =
  | {
      readonly kind: "maintained";
      readonly stance: EngineDecisionStanceV3;
    }
  | {
      readonly kind: "neutralized";
      readonly from: "bullish" | "bearish";
    }
  | {
      readonly kind: "emerged";
      readonly to: "bullish" | "bearish";
    }
  | {
      readonly kind: "reversed";
      readonly from: "bullish";
      readonly to: "bearish";
    }
  | {
      readonly kind: "reversed";
      readonly from: "bearish";
      readonly to: "bullish";
    };

export type EngineDecisionLifecycleV3 =
  | {
      readonly comparison: "initialized";
      readonly current: EngineDecisionV3;
    }
  | {
      readonly comparison: "compared";
      readonly previous: EngineDecisionV3;
      readonly current: EngineDecisionV3;
      readonly transition: EngineDecisionTransitionV3;

      /**
       * Current signed Decision score minus previous signed Decision score.
       * Intended normalized range: -2..2.
       */
      readonly decisionScoreDelta: number;

      /**
       * Current absolute Decision score minus previous absolute Decision score.
       * Intended normalized range: -1..1.
       */
      readonly convictionDelta: number;

      readonly convictionChange: EngineDecisionConvictionChangeV3;
    };

export type EngineDecisionLifecycleSectionV3 =
  | {
      readonly availability: "not-computed";
    }
  | {
      readonly availability: "available";
      readonly data: EngineDecisionLifecycleV3;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineDecisionLifecycleV3;
      readonly missing: readonly string[];
    }
  | {
      readonly availability: "unavailable";
      readonly reason?: string;
    };

export type EngineContradictionEvidenceSourceV3 =
  | "signal"
  | "macro"
  | "crossAsset"
  | "positioning"
  | "scenario";

export interface EngineContradictionEvidenceV3 {
  readonly source: EngineContradictionEvidenceSourceV3;

  /**
   * Signed directional evidence.
   * Intended normalized range: -1..1.
   */
  readonly signedScore: number;

  /**
   * Optional usable evidence coverage.
   * Intended normalized range: 0..1.
   */
  readonly coverage?: number;
}

export interface EngineContradictionConflictV3 {
  readonly sources: readonly [
    EngineContradictionEvidenceSourceV3,
    EngineContradictionEvidenceSourceV3,
  ];

  /**
   * Conflict magnitude.
   * Intended normalized range: 0..1.
   */
  readonly score: number;
}

export interface EngineContradictionV3 {
  /**
   * Aggregate contradiction magnitude.
   * Intended normalized range: 0..1.
   */
  readonly score: number;

  /** Primary-only contradiction before optional corroborative evidence. */
  readonly primaryContradiction?: number;

  /** Cross-Asset agreement diagnostic; never added to conviction. */
  readonly corroborativeConfirmation?: number;

  /** Cross-Asset disagreement included in the aggregate score. */
  readonly corroborativeContradiction?: number;

  readonly evidence:
    readonly EngineContradictionEvidenceV3[];

  readonly conflicts:
    readonly EngineContradictionConflictV3[];

  readonly strongestConflict:
    EngineContradictionConflictV3 | null;
}

export type EngineContradictionSectionV3 =
  | {
      readonly availability: "not-computed";
    }
  | {
      readonly availability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly availability: "available";
      readonly data: EngineContradictionV3;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineContradictionV3;
      readonly missing: readonly string[];
    }
  | {
      readonly availability: "unavailable";
      readonly reason?: string;
    };

type AvailableMarketDataStatus = Exclude<MarketDataStatus, "unavailable">;

type EngineAvailableMarketDataV3 = {
  readonly availability: "available" | "partial";
  readonly provider: string;
  readonly status: AvailableMarketDataStatus;
  readonly provenance?: MarketDataProvenance;
  readonly historicalWindow?: HistoricalDataWindow;
  /** Unix timestamp in seconds for the newest normalized market observation. */
  readonly latestTimestampSeconds?: number;
};

type EngineUnavailableMarketDataV3 = {
  readonly availability: "unavailable";
  readonly provider: string | null;
  readonly status: "unavailable";
  readonly reason?: string;
  readonly provenance?: MarketDataProvenance;
  readonly historicalWindow?: HistoricalDataWindow;
  /** Unix timestamp in seconds for the newest normalized market observation, when known. */
  readonly latestTimestampSeconds?: number;
};

export type EngineMarketDataV3 =
  | EngineAvailableMarketDataV3
  | EngineUnavailableMarketDataV3;

export type EngineMacroStrength = "weak" | "moderate" | "strong";

export interface EngineMacroDriverV3 {
  /** Stable canonical identifier for this normalized macro driver. */
  readonly id: string;
  readonly available: boolean;
  /** Configured positive share of required macro evidence. */
  readonly weight?: number;
  readonly direction?: MarketDirection;
  /** Signed normalized driver evidence before weighting. */
  readonly score?: number | null;
  /** Source observation date/period when supplied upstream. */
  readonly observedAt?: string;
  /** (weight * score) / total configured required weight. */
  readonly weightedContribution?: number | null;
  /**
   * @deprecated Compatibility field with asset-specific semantics.
   * Canonical driver score/weight semantics are owned by macroFeatures.
   */
  readonly contribution?: number | null;
  readonly reason?: string;
}

export type EngineMacroDataQualitySectionV3 =
  | EngineDataSection<number>
  | { readonly availability: "not-computed" };

export interface EngineMacroSnapshotV3<TDetails = never> {
  readonly direction: MarketDirection;
  /** Signed conditional evidence strength normalized to -1..1. */
  readonly score: number;
  /** Absolute conditional evidence strength normalized to 0..1. */
  readonly strengthMagnitude: number;
  readonly strength?: EngineMacroStrength;
  /**
   * @deprecated Compatibility only. This value is not canonical confidence
   * and must not be consumed by Engine V3 calculations.
   */
  readonly confidence?: number;
  /** Required weighted evidence completeness normalized to 0..1. */
  readonly coverage: number;
  /** Data quality/freshness is independent from score and coverage. */
  readonly dataQuality: EngineMacroDataQualitySectionV3;
  readonly drivers: readonly EngineMacroDriverV3[];
  readonly reasons: readonly string[];
  readonly migrationDetails?: EngineSerializable<TDetails>;
}

export type EngineMacroV3<TDetails = never> = EngineDataSection<
  EngineMacroSnapshotV3<TDetails>
>;

/**
 * Canonical Macro lifecycle carried by EngineResultV3.
 * Not-applicable is excluded from evidence requirements; not-computed remains
 * a distinct deferred state for otherwise applicable future work.
 */
export type EngineMacroSectionV3<TDetails = never> =
  | EngineMacroV3<TDetails>
  | {
      readonly availability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly availability: "not-computed";
    };

export type EngineCrossAssetExpectedSignV3 =
  | "direct"
  | "inverse";

export interface EngineCrossAssetHorizonV3 {
  readonly interval: "daily";
  /** Number of one-day intervals in the horizon move. */
  readonly observations: number;
}

export type EngineCrossAssetRelationshipV3 =
  | {
      readonly id: string;
      readonly targetAssetId: MarketAssetId;
      readonly referenceAssetId: MarketAssetId;
      readonly expectedSign: EngineCrossAssetExpectedSignV3;
      /** Positive configured model weight; this is not a correlation coefficient. */
      readonly weight: number;
      readonly horizon: EngineCrossAssetHorizonV3;
      readonly availability: "available";
      readonly referenceMoveScore: number;
      readonly signedEvidence: number;
      /** (weight * signedEvidence) / total configured target weight. */
      readonly weightedContribution: number;
      readonly observedAt?: string;
      readonly latestTimestamp?: number;
    }
  | {
      readonly id: string;
      readonly targetAssetId: MarketAssetId;
      readonly referenceAssetId: MarketAssetId;
      readonly expectedSign: EngineCrossAssetExpectedSignV3;
      readonly weight: number;
      readonly horizon: EngineCrossAssetHorizonV3;
      readonly availability: "unavailable";
      readonly reason?: string;
      readonly observedAt?: string;
      readonly latestTimestamp?: number;
    };

export type EngineCrossAssetDataQualitySectionV3 =
  | EngineDataSection<number>
  | { readonly availability: "not-computed" };

export interface EngineCrossAssetSnapshotV3 {
  /** Signed conditional Cross-Asset evidence normalized to -1..1. */
  readonly score: number;
  /** Absolute conditional evidence strength normalized to 0..1. */
  readonly strengthMagnitude: number;
  /** Configured required relationship weight actually available, normalized to 0..1. */
  readonly coverage: number;
  readonly relationships: readonly EngineCrossAssetRelationshipV3[];
  /** Data quality/freshness is independent from score and coverage. */
  readonly dataQuality: EngineCrossAssetDataQualitySectionV3;
}

export type EngineCrossAssetSectionV3 =
  | {
      readonly availability: "available";
      readonly data: EngineCrossAssetSnapshotV3;
    }
  | {
      readonly availability: "partial";
      readonly data: EngineCrossAssetSnapshotV3;
      readonly missing: readonly string[];
    }
  | {
      readonly availability: "unavailable";
      readonly reason?: string;
    }
  | {
      readonly availability: "not-applicable";
      readonly reason?: string;
    }
  | {
      readonly availability: "not-computed";
    };

export type EngineRegimeV3<
  TState extends string = MarketStateResult["state"],
  TRiskLevel extends string = MarketRiskResult["level"],
> =
  | {
      readonly availability: "available";
      readonly memory: MarketRegimeMemoryResult<TState, TRiskLevel>;
      readonly current?: never;
    }
  | {
      readonly availability: "partial";
      readonly current: MarketRegimeSnapshot<TState, TRiskLevel>;
      readonly memory?: never;
      readonly missing: readonly string[];
    }
  | {
      readonly availability: "unavailable";
      readonly current?: never;
      readonly memory?: never;
      readonly reason?: string;
    };

export interface EngineResultV3<
  TMacroDetails = never,
  TMigrationDetails = never,
  TState extends string = MarketStateResult["state"],
  TRiskLevel extends string = MarketRiskResult["level"],
> {
  readonly version: EngineResultVersion;
  readonly asset: EngineAssetId;
  readonly symbol: string;
  readonly evaluatedAt: string;
  readonly marketData: EngineMarketDataV3;
  readonly technical: EngineDataSection<MarketTechnicalSnapshot>;
  readonly macro: EngineMacroSectionV3<TMacroDetails>;
  readonly signal: MarketSignalResult;
  readonly risk: MarketRiskResult;
  readonly state: MarketStateResult;
  readonly regime: EngineRegimeV3<TState, TRiskLevel>;
  readonly migrationDetails?: EngineSerializable<TMigrationDetails>;
  readonly crossAsset: EngineCrossAssetSectionV3;
  readonly positioning: EngineDeferredSection;
  readonly scenario: EngineScenarioSectionV1;
  readonly invalidation: EngineInvalidationSectionV1;
  readonly contradiction: EngineContradictionSectionV3;
  readonly confidence: EngineConfidenceSectionV3;
  readonly decision: EngineDecisionSectionV3;
  readonly decisionLifecycle: EngineDecisionLifecycleSectionV3;
  readonly recommendation: EngineRecommendationSectionV1;
}
