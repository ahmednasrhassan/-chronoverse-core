import type {
  MarketRegimeMemoryResult,
  MarketRegimeSnapshot,
} from "../core/regimeMemory";
import type { MarketRiskResult } from "../core/riskEngine";
import type { EngineResultV3 } from "./contracts";

export const PERSISTENT_REGIME_HISTORY_MISSING_V1 =
  "persistent-regime-history" as const;

export type RegimeEnrichmentPersistenceV1 =
  | { readonly status: "persisted" }
  | {
      readonly status: "degraded";
      readonly stage: "read" | "append";
      readonly missing: typeof PERSISTENT_REGIME_HISTORY_MISSING_V1;
    };

export interface EnrichEngineRegimeInputV1<
  TMacroDetails,
  TMigrationDetails,
  TState extends string,
  TRiskLevel extends string,
> {
  readonly engineResult: EngineResultV3<
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >;
  readonly current: MarketRegimeSnapshot<TState, TRiskLevel>;
  readonly calculateMemory: (
    current: MarketRegimeSnapshot<TState, TRiskLevel>,
    previous: MarketRegimeSnapshot<TState, TRiskLevel> | null,
  ) => MarketRegimeMemoryResult<TState, TRiskLevel>;
  readonly readLatest: () => Promise<
    MarketRegimeSnapshot<TState, TRiskLevel> | null
  >;
  readonly append: (
    current: MarketRegimeSnapshot<TState, TRiskLevel>,
    previous: MarketRegimeSnapshot<TState, TRiskLevel> | null,
  ) => Promise<void>;
}

export interface EngineRegimeEnrichmentV1<
  TMacroDetails,
  TMigrationDetails,
  TState extends string,
  TRiskLevel extends string,
> {
  readonly engineResult: EngineResultV3<
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >;
  readonly regimeMemory: MarketRegimeMemoryResult<TState, TRiskLevel>;
  readonly persistence: RegimeEnrichmentPersistenceV1;
}

/**
 * Best-effort persistence boundary around pure Regime Memory.
 * It performs no provider, Redis, cache, Generic Runtime, or clock work itself.
 */
export async function enrichEngineRegimeV1<
  TMacroDetails = never,
  TMigrationDetails = never,
  TState extends string = string,
  TRiskLevel extends string = MarketRiskResult["level"],
>(
  input: EnrichEngineRegimeInputV1<
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >,
): Promise<
  EngineRegimeEnrichmentV1<
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >
> {
  if (input.current.timestamp !== input.engineResult.evaluatedAt) {
    throw new TypeError(
      "Current Regime timestamp must equal the Engine evaluation timestamp.",
    );
  }

  let previous: MarketRegimeSnapshot<TState, TRiskLevel> | null;

  try {
    previous = await input.readLatest();
  } catch {
    const regimeMemory = input.calculateMemory(input.current, null);

    return degradedResult(input.engineResult, input.current, regimeMemory, "read");
  }

  const regimeMemory = input.calculateMemory(input.current, previous);

  try {
    await input.append(input.current, previous);
  } catch {
    return degradedResult(
      input.engineResult,
      input.current,
      regimeMemory,
      "append",
    );
  }

  return Object.freeze({
    engineResult: Object.freeze({
      ...input.engineResult,
      regime: Object.freeze({
        availability: "available" as const,
        memory: regimeMemory,
      }),
    }),
    regimeMemory,
    persistence: Object.freeze({ status: "persisted" as const }),
  });
}

function degradedResult<
  TMacroDetails,
  TMigrationDetails,
  TState extends string,
  TRiskLevel extends string,
>(
  engineResult: EngineResultV3<
    TMacroDetails,
    TMigrationDetails,
    TState,
    TRiskLevel
  >,
  current: MarketRegimeSnapshot<TState, TRiskLevel>,
  regimeMemory: MarketRegimeMemoryResult<TState, TRiskLevel>,
  stage: "read" | "append",
): EngineRegimeEnrichmentV1<
  TMacroDetails,
  TMigrationDetails,
  TState,
  TRiskLevel
> {
  return Object.freeze({
    engineResult: Object.freeze({
      ...engineResult,
      regime: Object.freeze({
        availability: "partial" as const,
        current,
        missing: Object.freeze([PERSISTENT_REGIME_HISTORY_MISSING_V1]),
      }),
    }),
    regimeMemory,
    persistence: Object.freeze({
      status: "degraded" as const,
      stage,
      missing: PERSISTENT_REGIME_HISTORY_MISSING_V1,
    }),
  });
}
