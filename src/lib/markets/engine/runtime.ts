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
import {
  type EngineAssetId,
  type EngineCrossAssetSectionV3,
  type EngineMacroV3,
  type EngineResultV3,
  type EngineSerializable,
} from "./contracts";
import {
  calculateEngineResultV3,
  type EngineCalculationIntelligenceV3,
  type EngineCalculationMarketDataV3,
} from "./calculateEngineResult";

export type EngineRuntimeMarketData = EngineCalculationMarketDataV3;

type EngineRuntimeIntelligence<
  TState extends MarketStateResult["state"],
  TRiskLevel extends string,
> = EngineCalculationIntelligenceV3<TState, TRiskLevel>;

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
  /** Optional already-computed evidence. This runtime never fetches or calculates it. */
  readonly crossAsset?: EngineCrossAssetSectionV3;
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

/**
 * Legacy-compatible Engine V3 runtime boundary.
 *
 * Gold/Oil Regime-history I/O remains here until those callers are migrated.
 * Canonical result algebra is delegated to the pure calculation boundary.
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
  const macro = input.macroApplicability === "not-applicable"
    ? {
        availability: "not-applicable" as const,
        reason: "Macro evidence is not applicable to this asset.",
      }
    : input.buildMacro(intelligence);
  const engineResult = calculateEngineResultV3({
    asset: input.asset,
    symbol: input.symbol,
    evaluatedAt,
    minimumRequiredHistory: input.minimumRequiredHistory,
    marketData: input.marketData,
    intelligence,
    macro,
    regime: {
      availability: "available",
      memory: regimeMemory,
    },
    migrationDetails: input.migrationDetails,
    ...(input.crossAsset === undefined ? {} : { crossAsset: input.crossAsset }),
  });

  return {
    intelligence,
    engineResult,
  };
}
