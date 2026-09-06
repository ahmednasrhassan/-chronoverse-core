import {
  assetRegistry,
  type MarketAssetId,
} from "../core/assets";
import type { MarketAssetProfile } from "../core/assetProfile";
import { marketAssetProfiles } from "../core/assetProfiles";
import type {
  CandleInterval,
  MarketDataStatus,
} from "../core/types";
import type {
  CanonicalMarketObservationV1,
  CanonicalMarketSnapshotProvenanceV1,
} from "../services/canonicalMarketSnapshot";
import type {
  EngineCrossAssetSectionV3,
  EngineMacroSectionV3,
} from "./contracts";
import type { CanonicalMarketEvaluationV1 } from "./marketEvaluationCoordinator";
import { getPrecomputedCrossAssetForTargetV1 } from "./marketEvaluationHandoff";

const CANONICAL_SNAPSHOT_SCHEMA_V1 =
  "canonical-market-snapshot-v1" as const;

export type PreparedMacroEvidenceV1<TDetails = never> =
  | {
      readonly applicability: "not-applicable";
      readonly reason: string;
    }
  | {
      readonly applicability: "applicable";
      readonly section: Exclude<
        EngineMacroSectionV3<TDetails>,
        { readonly availability: "not-applicable" }
      >;
    };

export interface PreparedTargetHistoryV1 {
  readonly assetId: MarketAssetId;
  readonly symbol: string;
  readonly interval: CandleInterval;
  readonly observations: readonly CanonicalMarketObservationV1[];
  readonly status: MarketDataStatus;
  readonly provenance?: CanonicalMarketSnapshotProvenanceV1;
}

export interface ReadyPreparedAssetEvaluationInputV1<TDetails = never> {
  readonly availability: "ready";
  readonly assetId: MarketAssetId;
  readonly computedAt: string;
  readonly targetHistory: PreparedTargetHistoryV1;
  readonly macro: PreparedMacroEvidenceV1<TDetails>;
  readonly crossAsset: EngineCrossAssetSectionV3;
}

export type PreparedAssetEvaluationInputV1<TDetails = never> =
  | {
      readonly availability: "unavailable";
      readonly assetId: MarketAssetId;
      readonly computedAt: string;
      readonly reason: string;
    }
  | ReadyPreparedAssetEvaluationInputV1<TDetails>;

export interface ValidatedPreparedAssetEvaluationV1 {
  readonly profile: MarketAssetProfile;
  readonly minimumRequiredHistory: number;
}

/**
 * Purely extracts one target's canonical observation/evidence boundary.
 * Ordinary target-data failure is returned as unavailable; malformed
 * coordinator or profile state is rejected as contract corruption.
 */
export function prepareAssetEvaluationV1<TDetails = never>(
  evaluation: CanonicalMarketEvaluationV1,
  targetAssetId: MarketAssetId,
  macro: PreparedMacroEvidenceV1<TDetails>,
): PreparedAssetEvaluationInputV1<TDetails> {
  if (!evaluation.requestedTargetAssetIds.includes(targetAssetId)) {
    throw new TypeError("Prepared asset target was not requested by this evaluation.");
  }

  if (evaluation.snapshot.schemaVersion !== CANONICAL_SNAPSHOT_SCHEMA_V1) {
    throw new TypeError("Prepared asset snapshot schema is unsupported.");
  }

  if (!evaluation.snapshot.requestedAssetIds.includes(targetAssetId)) {
    throw new TypeError("Prepared asset target is absent from snapshot membership.");
  }

  const matches = evaluation.snapshot.assets.filter(
    (asset) => asset.assetId === targetAssetId,
  );

  if (matches.length !== 1) {
    throw new TypeError("Prepared asset target history is inconsistent.");
  }

  const asset = matches[0]!;
  const profile = resolveCanonicalProfile(targetAssetId);
  validateCanonicalAssetBoundary(profile, asset.symbol, asset.interval);
  validateMacroApplicability(profile, macro);

  if (asset.availability === "unavailable") {
    return Object.freeze({
      availability: "unavailable",
      assetId: targetAssetId,
      computedAt: evaluation.computedAt,
      reason: asset.reason ?? "Canonical target history is unavailable.",
    });
  }

  const targetHistory = Object.freeze({
    assetId: asset.assetId,
    symbol: asset.symbol,
    interval: asset.interval,
    observations: asset.observations,
    status: asset.status,
    ...(asset.provenance === undefined ? {} : { provenance: asset.provenance }),
  });
  const minimumRequiredHistory =
    calculateMinimumTechnicalObservationCountV1(profile);

  validateCanonicalObservations(targetHistory.observations);

  if (targetHistory.observations.length < minimumRequiredHistory) {
    return Object.freeze({
      availability: "unavailable",
      assetId: targetAssetId,
      computedAt: evaluation.computedAt,
      reason:
        `Canonical target history requires at least ${minimumRequiredHistory} observations.`,
    });
  }

  const prepared = Object.freeze({
    availability: "ready" as const,
    assetId: targetAssetId,
    computedAt: evaluation.computedAt,
    targetHistory,
    macro,
    crossAsset: getPrecomputedCrossAssetForTargetV1(evaluation, targetAssetId),
  });

  validateReadyPreparedAssetEvaluationV1(prepared);
  return prepared;
}

/** Validates a ready boundary even when constructed without the helper. */
export function validateReadyPreparedAssetEvaluationV1<TDetails>(
  prepared: ReadyPreparedAssetEvaluationInputV1<TDetails>,
): ValidatedPreparedAssetEvaluationV1 {
  const profile = resolveCanonicalProfile(prepared.assetId);

  if (prepared.targetHistory.assetId !== prepared.assetId) {
    throw new TypeError("Prepared target history asset ID is inconsistent.");
  }

  validateCanonicalAssetBoundary(
    profile,
    prepared.targetHistory.symbol,
    prepared.targetHistory.interval,
  );
  validateMacroApplicability(profile, prepared.macro);
  validateCanonicalObservations(prepared.targetHistory.observations);

  if (prepared.targetHistory.status === "unavailable") {
    throw new TypeError("Ready prepared target history cannot be unavailable.");
  }

  const minimumRequiredHistory =
    calculateMinimumTechnicalObservationCountV1(profile);

  if (prepared.targetHistory.observations.length < minimumRequiredHistory) {
    throw new TypeError("Ready prepared target history is insufficient.");
  }

  return Object.freeze({ profile, minimumRequiredHistory });
}

/** Minimum observations needed for every current mandatory Technical output. */
export function calculateMinimumTechnicalObservationCountV1(
  profile: MarketAssetProfile,
): number {
  return Math.max(
    profile.technical.ema.fast,
    profile.technical.ema.medium,
    profile.technical.ema.slow,
    profile.technical.rsi.period + 1,
    profile.technical.macd.slowPeriod +
      profile.technical.macd.signalPeriod - 1,
    profile.technical.momentum.period + 1,
    profile.technical.volatility.period + 1,
  );
}

function resolveCanonicalProfile(assetId: MarketAssetId): MarketAssetProfile {
  if (!Object.prototype.hasOwnProperty.call(assetRegistry, assetId)) {
    throw new TypeError("Prepared asset ID is invalid.");
  }

  const profile = marketAssetProfiles[assetId];

  if (profile.id !== assetId) {
    throw new TypeError("Prepared asset profile is inconsistent.");
  }

  return profile;
}

function validateCanonicalAssetBoundary(
  profile: MarketAssetProfile,
  symbol: string,
  interval: CandleInterval,
): void {
  const registrySymbol = assetRegistry[profile.id].providerSymbols.yahoo;

  if (
    symbol !== profile.symbol ||
    registrySymbol === undefined ||
    symbol !== registrySymbol
  ) {
    throw new TypeError("Prepared target symbol is inconsistent with canonical configuration.");
  }

  if (interval !== profile.defaultInterval) {
    throw new TypeError("Prepared target interval is inconsistent with its profile.");
  }
}

function validateMacroApplicability<TDetails>(
  profile: MarketAssetProfile,
  macro: PreparedMacroEvidenceV1<TDetails>,
): void {
  if (macro.applicability === "not-applicable") {
    if (profile.macro.enabled || macro.reason.trim().length === 0) {
      throw new TypeError("Prepared Macro applicability is inconsistent with its profile.");
    }

    return;
  }

  if (!profile.macro.enabled) {
    throw new TypeError("Prepared Macro applicability is inconsistent with its profile.");
  }
}

function validateCanonicalObservations(
  observations: readonly CanonicalMarketObservationV1[],
): void {
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    const previous = observations[index - 1];

    if (
      observation === undefined ||
      !Number.isFinite(observation.timestamp) ||
      !Number.isFinite(observation.close) ||
      observation.close <= 0 ||
      (previous !== undefined && observation.timestamp <= previous.timestamp)
    ) {
      throw new TypeError("Prepared target observations are not canonical.");
    }
  }
}
