import type { MarketAssetId } from "../../core/assets";
import { marketAssetProfiles } from "../../core/assetProfiles";
import type { EngineCrossAssetSectionV3, EngineMacroV3 } from "../../engine/contracts";
import type { CanonicalMarketEvaluationV1 } from "../../engine/marketEvaluationCoordinator";
import {
  calculateMinimumTechnicalObservationCountV1,
  prepareAssetEvaluationV1,
  type PreparedMacroEvidenceV1,
} from "../../engine/preparedAssetEvaluation";
import type {
  CanonicalMarketObservationV1,
  CanonicalMarketSnapshotAssetV1,
  CanonicalMarketSnapshotProvenanceV1,
} from "../../services/canonicalMarketSnapshot";

const computedAt = "2026-09-07T12:00:00.000Z";
const notApplicable = Object.freeze({
  applicability: "not-applicable" as const,
  reason: "No canonical Macro model is configured for this asset.",
});
const crossAsset = Object.freeze({
  availability: "not-applicable" as const,
  reason: "No approved relationship is configured.",
});
const provenance: CanonicalMarketSnapshotProvenanceV1 = Object.freeze({
  source: "chronoverse",
  provider: "Yahoo Finance",
  requestedSymbol: "^GSPC",
  interval: "1d",
  fetchedAt: 1_780_000_000,
  sourceTimestamp: 1_779_999_000,
});

function observations(count: number): readonly CanonicalMarketObservationV1[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    timestamp: 1_700_000_000 + index * 86_400,
    close: 100 + index * 0.15 + Math.sin(index / 7),
  })));
}

function asset(
  assetId: MarketAssetId,
  count: number,
  overrides: Partial<CanonicalMarketSnapshotAssetV1> = {},
): CanonicalMarketSnapshotAssetV1 {
  const profile = marketAssetProfiles[assetId];
  const series = observations(count);

  return {
    assetId,
    symbol: profile.symbol,
    assetClass: profile.assetClass,
    interval: profile.defaultInterval,
    observations: series,
    observationCount: series.length,
    earliestTimestamp: series.at(0)?.timestamp,
    latestTimestamp: series.at(-1)?.timestamp,
    provenance,
    availability: "available",
    status: "end_of_day",
    ...overrides,
  };
}

function evaluation(
  targetAssetId: MarketAssetId,
  targetAsset: CanonicalMarketSnapshotAssetV1,
  suppliedCrossAsset: EngineCrossAssetSectionV3 = crossAsset,
): CanonicalMarketEvaluationV1 {
  return {
    schemaVersion: "canonical-market-evaluation-v1",
    availability: targetAsset.availability === "available" ? "available" : "unavailable",
    computedAt,
    requestedTargetAssetIds: Object.freeze([targetAssetId]),
    requiredObservationAssetIds: Object.freeze([targetAssetId]),
    historyPolicy: Object.freeze({
      targetTechnicalMinimumObservationCount: 200,
      crossAssetReferenceMinimumObservationCount: null,
      sharedMinimumObservationCount: 200,
      targetProfileHistoryLimit: 600,
      recommendedObservationCount: 600,
    }),
    snapshot: {
      schemaVersion: "canonical-market-snapshot-v1",
      computedAt,
      requestedAssetIds: Object.freeze([targetAssetId]),
      assets: Object.freeze([targetAsset]),
      availability: targetAsset.availability === "available" ? "available" : "unavailable",
    },
    crossAssetSections: {
      targetAssetIds: Object.freeze([targetAssetId]),
      sections: Object.freeze([Object.freeze({ targetAssetId, crossAsset: suppliedCrossAsset })]),
    },
  };
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function assertThrows(run: () => unknown, fragment: string, label: string): void {
  let error: unknown;
  try { run(); } catch (caught) { error = caught; }
  if (!(error instanceof Error) || !error.message.includes(fragment)) {
    throw new Error(`${label}: expected error containing ${fragment}`);
  }
}

const profile = marketAssetProfiles.sp500;
const minimum = calculateMinimumTechnicalObservationCountV1(profile);
assertEqual(minimum, Math.max(
  profile.technical.ema.fast,
  profile.technical.ema.medium,
  profile.technical.ema.slow,
  profile.technical.rsi.period + 1,
  profile.technical.macd.slowPeriod + profile.technical.macd.signalPeriod - 1,
  profile.technical.momentum.period + 1,
  profile.technical.volatility.period + 1,
), "minimum derived from all mandatory Technical windows");

const source = evaluation("sp500", asset("sp500", minimum));
const sourceBefore = JSON.stringify(source);
const prepared = prepareAssetEvaluationV1(source, "sp500", notApplicable);
if (prepared.availability !== "ready") throw new Error("expected ready preparation");
assertEqual(prepared.computedAt, computedAt, "computedAt preserved");
assertEqual(prepared.targetHistory.observations, source.snapshot.assets[0]!.observations, "observations preserved");
assertEqual(prepared.targetHistory.provenance, provenance, "provenance preserved");
assertEqual(prepared.crossAsset, crossAsset, "exact Cross-Asset object preserved");
assertEqual(prepared.macro, notApplicable, "not-applicable Macro preserved");
assertEqual(JSON.stringify(source), sourceBefore, "input not mutated");

assertThrows(() => prepareAssetEvaluationV1(source, "silver", notApplicable), "not requested", "target not requested");
assertThrows(() => prepareAssetEvaluationV1(
  evaluation("sp500", asset("sp500", minimum, { symbol: "SPX" })), "sp500", notApplicable,
), "symbol", "symbol mismatch");
assertThrows(() => prepareAssetEvaluationV1(
  evaluation("sp500", asset("gold", minimum)), "sp500", notApplicable,
), "history is inconsistent", "asset mismatch");
assertThrows(() => prepareAssetEvaluationV1(
  evaluation("sp500", asset("sp500", minimum, { interval: "1h" })), "sp500", notApplicable,
), "interval", "interval mismatch");

const unavailable = prepareAssetEvaluationV1(evaluation("sp500", asset("sp500", 0, {
  availability: "unavailable", status: "unavailable", reason: "No target data.",
})), "sp500", notApplicable);
assertEqual(unavailable.availability, "unavailable", "ordinary target unavailability");
if (unavailable.availability === "unavailable") assertEqual(unavailable.reason, "No target data.", "unavailability reason");

assertEqual(
  prepareAssetEvaluationV1(evaluation("sp500", asset("sp500", minimum - 1)), "sp500", notApplicable).availability,
  "unavailable", "insufficient history",
);
assertEqual(prepared.availability, "ready", "exact minimum ready");
assertEqual(
  prepareAssetEvaluationV1(evaluation("sp500", asset("sp500", profile.historyLimit + 25)), "sp500", notApplicable).availability,
  "ready", "history beyond profile limit accepted",
);

const macroSection: EngineMacroV3<{ readonly fixture: true }> = Object.freeze({
  availability: "available",
  data: Object.freeze({
    direction: "bullish", score: 0.4, strengthMagnitude: 0.4, coverage: 1,
    dataQuality: Object.freeze({ availability: "not-computed" }),
    drivers: Object.freeze([]), reasons: Object.freeze(["Prepared fixture"]),
    migrationDetails: Object.freeze({ fixture: true }),
  }),
});
const applicable: PreparedMacroEvidenceV1<{ readonly fixture: true }> = Object.freeze({
  applicability: "applicable", section: macroSection,
});
const goldPrepared = prepareAssetEvaluationV1(evaluation("gold", asset("gold", minimum)), "gold", applicable);
if (goldPrepared.availability !== "ready") throw new Error("expected Gold preparation ready");
assertEqual(goldPrepared.macro, applicable, "applicable Macro preserved");
if (goldPrepared.macro.applicability !== "applicable") throw new Error("expected applicable Macro");
assertEqual(goldPrepared.macro.section, macroSection, "exact applicable Macro section preserved");

console.log("PASS: Prepared Asset Evaluation V1");
