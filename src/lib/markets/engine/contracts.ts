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

export type EngineConfidenceInputV3 =
  | EngineDataSection<number>
  | EngineDeferredSection;

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
  readonly contradiction: EngineDeferredSection;
  readonly confidence: EngineConfidenceSectionV3;
  readonly decision: EngineDeferredSection;
  readonly recommendation: EngineDeferredSection;
}
