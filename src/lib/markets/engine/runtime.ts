import type {
  MarketTechnicalSnapshot,
} from "../core/intelligenceEngine";
import type {
  MarketStateResult,
} from "../core/marketState";
import type {
  MarketRegimeMemoryResult,
  MarketRegimeSnapshot,
} from "../core/regimeMemory";
import type {
  MarketRiskResult,
} from "../core/riskEngine";
import type {
  MarketSignalResult,
} from "../core/signalEngine";
import {
  calculateEngineConfidenceV3,
} from "../core/confidenceEngine";
import {
  calculateEngineContradictionV3,
} from "../core/contradictionEngine";
import {
  calculateEngineDecisionV3,
} from "../core/decisionEngine";
import type {
  HistoricalDataWindow,
  MarketDataProvenance,
  MarketDataStatus,
} from "../core/types";
import {
  ENGINE_RESULT_VERSION,
  type EngineAssetId,
  type EngineMacroV3,
  type EngineMarketDataV3,
  type EngineResultV3,
  type EngineSerializable,
} from "./contracts";

export type EngineRuntimeMarketData = {
  readonly provider: string | null;
  readonly status: MarketDataStatus;
  readonly provenance?: MarketDataProvenance;
  readonly window?: HistoricalDataWindow;
  readonly candles: readonly {
    readonly time: number;
    readonly close: number;
  }[];
};

type EngineRuntimeIntelligence<
  TState extends MarketStateResult["state"],
  TRiskLevel extends string,
> = {
  readonly technical: MarketTechnicalSnapshot;
  readonly signal: MarketSignalResult;
  readonly risk: MarketRiskResult & {
    readonly level: TRiskLevel;
  };
  readonly state: TState;
  readonly confidence: number;
};

export type EngineRuntimeInput<
  TMacroInput,
  TIntelligence extends EngineRuntimeIntelligence<TState, TRiskLevel>,
  TMacroDetails,
  TMigrationDetails,
  TState extends MarketStateResult["state"],
  TRiskLevel extends string,
> = {
  readonly asset: EngineAssetId;
  readonly symbol: string;
  readonly historyLimit: number;
  readonly minimumRequiredHistory: number;
  readonly macroApplicability:
    | "applicable"
    | "not-applicable";
  readonly insufficientHistoryMessage: (
    received: number,
    minimum: number,
  ) => string;
  readonly marketData: EngineRuntimeMarketData;
  readonly macroInput: TMacroInput;
  readonly calculateIntelligence: (input: {
    readonly closes: readonly number[];
    readonly macro: TMacroInput;
  }) => TIntelligence;
  readonly buildMacro: (
    intelligence: TIntelligence,
  ) => EngineMacroV3<TMacroDetails>;
  readonly createRegimeSnapshot: (
    intelligence: TIntelligence,
    timestamp: string,
  ) => MarketRegimeSnapshot<TState, TRiskLevel>;
  readonly calculateRegimeMemory: (
    current: MarketRegimeSnapshot<TState, TRiskLevel>,
    previous: MarketRegimeSnapshot<TState, TRiskLevel> | null,
  ) => MarketRegimeMemoryResult<TState, TRiskLevel>;
  readonly getLatestRegimeSnapshot: () => Promise<
    MarketRegimeSnapshot<TState, TRiskLevel> | null
  >;
  readonly appendRegimeSnapshot: (
    current: MarketRegimeSnapshot<TState, TRiskLevel>,
    previous: MarketRegimeSnapshot<TState, TRiskLevel> | null,
  ) => Promise<void>;
  readonly migrationDetails?: EngineSerializable<TMigrationDetails>;
};

export type EngineRuntimeOutput<
  TIntelligence,
  TMacroDetails,
  TMigrationDetails,
  TState extends MarketStateResult["state"],
  TRiskLevel extends string,
> = {
  readonly intelligence: TIntelligence;
  readonly engineResult: EngineResultV3<
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >;
};

const NOT_COMPUTED = {
  availability: "not-computed",
} as const;

/**
 * Shared Engine V3 runtime boundary.
 *
 * Provider access, asset interpretation and persistence details are injected.
 * The boundary performs one analytical pass and constructs the canonical V3
 * result from that same pass.
 */
export async function runEngineRuntimeV3<
  TMacroInput,
  TIntelligence extends EngineRuntimeIntelligence<TState, TRiskLevel>,
  TMacroDetails = never,
  TMigrationDetails = never,
  TState extends MarketStateResult["state"] = MarketStateResult["state"],
  TRiskLevel extends string = MarketRiskResult["level"],
>(
  input: EngineRuntimeInput<
    TMacroInput,
    TIntelligence,
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >,
): Promise<
  EngineRuntimeOutput<
    TIntelligence,
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >
> {
  const closes = input.marketData.candles
    .map((candle) => candle.close)
    .filter((close) => Number.isFinite(close) && close > 0)
    .slice(-input.historyLimit);

  if (closes.length < input.minimumRequiredHistory) {
    throw new Error(
      input.insufficientHistoryMessage(
        closes.length,
        input.minimumRequiredHistory,
      ),
    );
  }

  const intelligence = input.calculateIntelligence({
    closes,
    macro: input.macroInput,
  });
  const previousSnapshot = await input.getLatestRegimeSnapshot();
  const evaluatedAt = new Date().toISOString();
  const currentSnapshot = input.createRegimeSnapshot(
    intelligence,
    evaluatedAt,
  );
  const regimeMemory = input.calculateRegimeMemory(
    currentSnapshot,
    previousSnapshot,
  );

  await input.appendRegimeSnapshot(
    currentSnapshot,
    previousSnapshot,
  );

  const latestTimestampSeconds =
    input.marketData.window?.lastTimestamp ??
    input.marketData.candles.at(-1)?.time;
  const provider = input.marketData.provider;
  const status = input.marketData.status;
  const marketData: EngineMarketDataV3 =
    provider === null || status === "unavailable"
      ? {
          availability: "unavailable",
          provider,
          status: "unavailable",
          provenance: input.marketData.provenance,
          historicalWindow: input.marketData.window,
          latestTimestampSeconds,
        }
      : {
          availability:
            status === "realtime" ? "available" : "partial",
          provider,
          status,
          provenance: input.marketData.provenance,
          historicalWindow: input.marketData.window,
          latestTimestampSeconds,
        };
  const technical = {
    availability: "available",
    data: intelligence.technical,
  } as const;
  const signal = {
    availability: "available",
    data: intelligence.signal,
  } as const;
  const macro = input.buildMacro(intelligence);
  const confidenceMacroInput =
    input.macroApplicability === "not-applicable"
      ? {
          applicability: "not-applicable" as const,
        }
      : {
          applicability: "applicable" as const,
          section: macro,
        };
  const contradiction =
    calculateEngineContradictionV3({
      signal,
      macro: confidenceMacroInput,
    });
  const calculatedConfidence =
    calculateEngineConfidenceV3({
      marketData,
      minimumRequiredHistory:
        input.minimumRequiredHistory,
      technical,
      signal,
      macro: confidenceMacroInput,
      contradiction,
    });
  const confidence = {
    availability: "available",
    data: calculatedConfidence,
  } as const;
  const decision =
    calculateEngineDecisionV3({
      signal,
      macro: confidenceMacroInput,
      confidence,
    });

  const engineResult: EngineResultV3<
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  > = {
    version: ENGINE_RESULT_VERSION,
    asset: input.asset,
    symbol: input.symbol,
    evaluatedAt,
    marketData,
    technical,
    macro,
    signal: intelligence.signal,
    risk: intelligence.risk,
    state: {
      state: intelligence.state,
      confidence: intelligence.confidence,
    },
    regime: {
      availability: "available",
      memory: regimeMemory,
    },
    migrationDetails: input.migrationDetails,
    crossAsset: NOT_COMPUTED,
    positioning: NOT_COMPUTED,
    scenario: NOT_COMPUTED,
    contradiction,
    confidence,
    decision,
    recommendation: NOT_COMPUTED,
  };

  return {
    intelligence,
    engineResult,
  };
}
