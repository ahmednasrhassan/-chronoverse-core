import type { MarketRiskResult } from "../../core/riskEngine";
import type {
  EngineCrossAssetSectionV3,
  EngineDeferredSection,
  EngineMacroSectionV3,
} from "../../engine/contracts";
import {
  ENGINE_V3_EVIDENCE_POLICY,
  type PrimaryEvidenceChannelV3,
} from "../../engine/evidenceAlgebra";

import {
  type EstrRateMarketStateDataV1,
  type EstrRateMarketStateMissingFieldV1,
  type EstrRateMarketStateResultV1,
} from "./marketState";
import { estrRateCalibrationProfileV1 } from "./profile";

export interface EstrRateEngineV3AdapterInputV1 {
  readonly marketState: EstrRateMarketStateResultV1;
}

export type EstrRateEngineV3AdapterMissingFieldV1 =
  | "marketState"
  | "signalConsistency"
  | "riskConsistency"
  | EstrRateMarketStateMissingFieldV1;

type MacroNotApplicable = Extract<
  EngineMacroSectionV3,
  { readonly availability: "not-applicable" }
>;

type CrossAssetNotApplicable = Extract<
  EngineCrossAssetSectionV3,
  { readonly availability: "not-applicable" }
>;

type DeferredNotComputed = Extract<
  EngineDeferredSection,
  { readonly availability: "not-computed" }
>;

export interface EstrRateEngineV3EvidenceV1 {
  /** Direct input for Engine V3 primary-evidence algebra. */
  readonly signal: PrimaryEvidenceChannelV3;
  /** Normalized instability fields consumed by downstream Engine safeguards. */
  readonly risk: MarketRiskResult;
  readonly macro: MacroNotApplicable;
  readonly crossAsset: CrossAssetNotApplicable;
  readonly positioning: DeferredNotComputed;
  readonly dataQuality: DeferredNotComputed;
}

export interface EstrRateEngineV3AdapterDataV1 {
  /** Canonical public rate semantics remain owned by the rate Market State. */
  readonly rateMarketState: EstrRateMarketStateDataV1;
  readonly engineEvidence: EstrRateEngineV3EvidenceV1;
}

export type EstrRateEngineV3AdapterResultV1 =
  | {
      readonly availability: "available";
      readonly data: EstrRateEngineV3AdapterDataV1;
    }
  | {
      readonly availability: "unavailable";
      readonly reason: string;
      readonly missing: readonly EstrRateEngineV3AdapterMissingFieldV1[];
    };

const NOT_COMPUTED = Object.freeze({ availability: "not-computed" } as const);
const MACRO_NOT_APPLICABLE: MacroNotApplicable = Object.freeze({
  availability: "not-applicable",
  reason: "No canonical rate Macro model is configured for launch.",
});
const CROSS_ASSET_NOT_APPLICABLE: CrossAssetNotApplicable = Object.freeze({
  availability: "not-applicable",
  reason: "No canonical rate Cross-Asset model is configured for launch.",
});

/**
 * Adapts only semantically neutral, already-computed rate evidence.
 * Full Engine assembly remains outside this pure compatibility boundary.
 */
export function adaptEstrRateMarketStateToEngineV3(
  input: EstrRateEngineV3AdapterInputV1,
): EstrRateEngineV3AdapterResultV1 {
  const marketState = input.marketState;

  if (marketState.availability === "unavailable") {
    return Object.freeze({
      availability: "unavailable",
      reason: marketState.reason,
      missing: Object.freeze([
        "marketState" as const,
        ...marketState.missing,
      ]),
    });
  }

  const state = marketState.data;
  const stateConsistent = Number.isFinite(state.currentRatePercent);
  const signalConsistent = isSignalConsistent(state);
  const riskConsistent = isRiskConsistent(state);

  if (!stateConsistent || !signalConsistent || !riskConsistent) {
    const missing = [
      ...(!stateConsistent ? ["marketState" as const] : []),
      ...(!signalConsistent ? ["signalConsistency" as const] : []),
      ...(!riskConsistent ? ["riskConsistency" as const] : []),
    ];

    return Object.freeze({
      availability: "unavailable",
      reason: "Canonical rate Market State evidence is inconsistent.",
      missing: Object.freeze(missing),
    });
  }

  // Engine primary algebra treats every non-zero scalar as directional.
  // Preserve the canonical public range classification at this boundary.
  const signalScore = state.direction === "range-bound"
    ? 0
    : state.signalScore;
  const signal = Object.freeze({
    id: "signal",
    evidenceRole: ENGINE_V3_EVIDENCE_POLICY.signal.evidenceRole,
    score: signalScore,
    architecturePrior: ENGINE_V3_EVIDENCE_POLICY.signal.architecturePrior,
    coverage: estrRateCalibrationProfileV1.signal.confidence.requiredCoverage,
  } satisfies PrimaryEvidenceChannelV3);
  const risk: MarketRiskResult = {
    score: state.riskScore,
    level: state.riskLevel,
    reasons: [
      `Rate-market instability is classified as ${state.riskLevel}.`,
    ],
  };
  Object.freeze(risk.reasons);
  Object.freeze(risk);

  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      rateMarketState: state,
      engineEvidence: Object.freeze({
        signal,
        risk,
        macro: MACRO_NOT_APPLICABLE,
        crossAsset: CROSS_ASSET_NOT_APPLICABLE,
        positioning: NOT_COMPUTED,
        dataQuality: NOT_COMPUTED,
      }),
    }),
  });
}

function isSignalConsistent(state: EstrRateMarketStateDataV1): boolean {
  if (
    !Number.isFinite(state.signalScore) ||
    state.signalScore < -1 ||
    state.signalScore > 1
  ) {
    return false;
  }

  const absoluteScore = Math.abs(state.signalScore);
  const thresholds = estrRateCalibrationProfileV1.signal.aggregate;
  const expectedDirection = absoluteScore < thresholds.neutralAbsoluteScore
    ? "range-bound"
    : state.signalScore > 0
      ? "rising-rate"
      : "falling-rate";
  const expectedStrength = absoluteScore < thresholds.neutralAbsoluteScore
    ? "range-bound"
    : absoluteScore >= thresholds.strongAbsoluteScore
      ? "strong"
      : "directional";

  return state.direction === expectedDirection &&
    state.signalStrength === expectedStrength;
}

function isRiskConsistent(state: EstrRateMarketStateDataV1): boolean {
  if (
    !Number.isFinite(state.riskScore) ||
    state.riskScore < 0 ||
    state.riskScore > 1
  ) {
    return false;
  }

  const thresholds = estrRateCalibrationProfileV1.risk.aggregate;
  const expectedLevel = state.riskScore >= thresholds.highMinimum
    ? "high"
    : state.riskScore >= thresholds.moderateMinimum
      ? "moderate"
      : "low";

  return state.riskLevel === expectedLevel;
}
