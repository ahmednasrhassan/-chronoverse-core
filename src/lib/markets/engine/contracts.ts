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
  readonly direction?: MarketDirection;
  /** Signed contribution normalized to the inclusive range -1..1. */
  readonly contribution?: number | null;
  readonly reason?: string;
}

export interface EngineMacroSnapshotV3<TDetails = never> {
  readonly direction: MarketDirection;
  readonly score: number;
  readonly strength?: EngineMacroStrength;
  /** Confidence normalized to the inclusive range 0..1. */
  readonly confidence: number;
  /** Available-input coverage normalized to the inclusive range 0..1. */
  readonly coverage?: number;
  readonly drivers: readonly EngineMacroDriverV3[];
  readonly reasons: readonly string[];
  readonly migrationDetails?: EngineSerializable<TDetails>;
}

export type EngineMacroV3<TDetails = never> = EngineDataSection<
  EngineMacroSnapshotV3<TDetails>
>;

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
  readonly macro: EngineMacroV3<TMacroDetails>;
  readonly signal: MarketSignalResult;
  readonly risk: MarketRiskResult;
  readonly state: MarketStateResult;
  readonly regime: EngineRegimeV3<TState, TRiskLevel>;
  readonly migrationDetails?: EngineSerializable<TMigrationDetails>;
  readonly crossAsset: EngineDeferredSection;
  readonly positioning: EngineDeferredSection;
  readonly scenario: EngineDeferredSection;
  readonly contradiction: EngineContradictionSectionV3;
  readonly confidence: EngineConfidenceSectionV3;
  readonly decision: EngineDecisionSectionV3;
  readonly recommendation: EngineDeferredSection;
}
