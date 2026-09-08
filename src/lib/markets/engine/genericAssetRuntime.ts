import { calculateMarketIntelligence, type MarketIntelligenceResult } from
  "../core/marketIntelligence";
import {
  calculateMarketState,
  type MarketIntelligenceState,
} from "../core/marketState";
import type { MarketRiskResult } from "../core/riskEngine";
import type { MarketDataProvenance } from "../core/types";
import {
  calculateEngineResultV3,
} from "./calculateEngineResult";
import type {
  EngineMacroSectionV3,
  EngineResultV3,
} from "./contracts";
import {
  validateReadyPreparedAssetEvaluationV1,
  type PreparedAssetEvaluationInputV1,
  type PreparedMacroEvidenceV1,
} from "./preparedAssetEvaluation";

export interface GenericAssetRuntimeIntelligenceV1
  extends MarketIntelligenceResult {
  readonly state: MarketIntelligenceState;
  readonly confidence: number;
}

export interface GenericAssetCalibrationStatusV1 {
  readonly genericComputable: true;
  readonly productionCalibrated: boolean;
  readonly missingExplicitCalibration: readonly ("risk" | "signal")[];
}

export type GenericAssetRuntimeOutputV1<TDetails = never> =
  | {
      readonly availability: "unavailable";
      readonly assetId: PreparedAssetEvaluationInputV1["assetId"];
      readonly computedAt: string;
      readonly reason: string;
    }
  | {
      readonly availability: "available";
      readonly calibration: GenericAssetCalibrationStatusV1;
      readonly intelligence: GenericAssetRuntimeIntelligenceV1;
      readonly engineResult: EngineResultV3<
        TDetails,
        never,
        MarketIntelligenceState,
        MarketRiskResult["level"]
      >;
    };

/** Pure provider-free computation over one prepared canonical target. */
export function runGenericAssetRuntimeV1<TDetails = never>(
  prepared: PreparedAssetEvaluationInputV1<TDetails>,
): GenericAssetRuntimeOutputV1<TDetails> {
  if (prepared.availability === "unavailable") {
    return Object.freeze({ ...prepared });
  }

  const { profile, minimumRequiredHistory } =
    validateReadyPreparedAssetEvaluationV1(prepared);
  const observations = prepared.targetHistory.observations.slice(
    -profile.historyLimit,
  );
  const closes = observations.map((observation) => observation.close);
  const market = calculateMarketIntelligence({ profile, closes });
  const marketState = calculateMarketState({
    signal: market.signal,
    risk: market.risk,
    macro: resolveMarketStateMacro(prepared.macro),
  });
  const intelligence: GenericAssetRuntimeIntelligenceV1 = {
    ...market,
    state: marketState.state,
    confidence: marketState.confidence,
  };
  const macro = resolveEngineMacro(prepared.macro);
  const engineResult = calculateEngineResultV3<
    GenericAssetRuntimeIntelligenceV1,
    TDetails,
    never,
    MarketIntelligenceState,
    MarketRiskResult["level"]
  >({
    asset: prepared.assetId,
    symbol: profile.symbol,
    evaluatedAt: prepared.computedAt,
    minimumRequiredHistory,
    marketData: {
      provider: prepared.targetHistory.provenance?.provider ?? null,
      status: prepared.targetHistory.status,
      interval: prepared.targetHistory.interval,
      ...mapMarketDataProvenance(prepared.targetHistory.provenance),
      window: {
        firstTimestamp: prepared.targetHistory.observations.at(0)?.timestamp,
        lastTimestamp: prepared.targetHistory.observations.at(-1)?.timestamp,
        receivedPoints: prepared.targetHistory.observations.length,
      },
      candles: observations.map((observation) => ({
        time: observation.timestamp,
        close: observation.close,
      })),
    },
    intelligence,
    macro,
    crossAsset: prepared.crossAsset,
  });

  return Object.freeze({
    availability: "available",
    calibration: resolveCalibrationStatus(profile),
    intelligence,
    engineResult,
  });
}

function resolveEngineMacro<TDetails>(
  macro: PreparedMacroEvidenceV1<TDetails>,
): EngineMacroSectionV3<TDetails> {
  return macro.applicability === "not-applicable"
    ? Object.freeze({
        availability: "not-applicable",
        reason: macro.reason,
      })
    : macro.section;
}

function resolveMarketStateMacro<TDetails>(
  macro: PreparedMacroEvidenceV1<TDetails>,
) {
  if (
    macro.applicability === "not-applicable" ||
    macro.section.availability === "unavailable" ||
    macro.section.availability === "not-computed"
  ) {
    return null;
  }

  const { direction, score, coverage } = macro.section.data;

  if (
    !Number.isFinite(score) ||
    !Number.isFinite(coverage) ||
    coverage <= 0
  ) {
    return null;
  }

  return { bias: direction, score, coverage };
}

function mapMarketDataProvenance(
  provenance: ReadyProvenance | undefined,
): { readonly provenance?: MarketDataProvenance } {
  if (
    provenance?.provider === null ||
    provenance?.provider === undefined ||
    provenance.fetchedAt === undefined
  ) {
    return {};
  }

  return {
    provenance: {
      provider: provenance.provider,
      fetchedAt: provenance.fetchedAt,
      ...(provenance.sourceTimestamp === undefined
        ? {}
        : { sourceTimestamp: provenance.sourceTimestamp }),
    },
  };
}

type ReadyProvenance = Extract<
  PreparedAssetEvaluationInputV1,
  { readonly availability: "ready" }
>["targetHistory"]["provenance"];

function resolveCalibrationStatus(
  profile: ReturnType<typeof validateReadyPreparedAssetEvaluationV1>["profile"],
): GenericAssetCalibrationStatusV1 {
  const missing = [
    ...(profile.risk.calibration === undefined ? ["risk" as const] : []),
    ...(profile.signal.calibration === undefined ? ["signal" as const] : []),
  ];

  return Object.freeze({
    genericComputable: true,
    productionCalibrated: missing.length === 0,
    missingExplicitCalibration: Object.freeze(missing),
  });
}
