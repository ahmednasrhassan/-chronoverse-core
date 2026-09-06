import { marketAssetProfiles } from "../../core/assetProfiles";
import { calculateMarketIntelligence } from "../../core/marketIntelligence";
import type { EngineCrossAssetSectionV3, EngineMacroV3 } from "../../engine/contracts";
import { runGenericAssetRuntimeV1 } from "../../engine/genericAssetRuntime";
import type {
  PreparedAssetEvaluationInputV1,
  PreparedMacroEvidenceV1,
} from "../../engine/preparedAssetEvaluation";

const computedAt = "2026-09-07T12:00:00.000Z";
const notApplicableMacro = Object.freeze({
  applicability: "not-applicable" as const,
  reason: "No canonical Macro model is configured.",
});
const notApplicableCross = Object.freeze({
  availability: "not-applicable" as const,
  reason: "No approved relationship is configured.",
});

function prepared(
  assetId: "sp500" | "silver" | "gold",
  crossAsset: EngineCrossAssetSectionV3 = notApplicableCross,
  macro: PreparedMacroEvidenceV1<{ readonly fixture: true }> = notApplicableMacro,
  count = 650,
): PreparedAssetEvaluationInputV1<{ readonly fixture: true }> {
  const profile = marketAssetProfiles[assetId];
  return {
    availability: "ready",
    assetId,
    computedAt,
    targetHistory: {
      assetId,
      symbol: profile.symbol,
      interval: profile.defaultInterval,
      observations: Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
        timestamp: 1_700_000_000 + index * 86_400,
        close: 80 + index * 0.08 + Math.sin(index / 8) * 0.35,
      }))),
      status: "end_of_day",
      provenance: Object.freeze({
        source: "chronoverse", provider: "Yahoo Finance", requestedSymbol: profile.symbol,
        interval: profile.defaultInterval, fetchedAt: 1_780_000_000,
      }),
    },
    macro,
    crossAsset,
  };
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function conviction(output: ReturnType<typeof runGenericAssetRuntimeV1>): number {
  if (output.availability !== "available") throw new Error("expected available runtime");
  const section = output.engineResult.confidence;
  if (section.availability !== "available" || section.data.conviction.availability === "unavailable") {
    throw new Error("expected conviction");
  }
  return section.data.conviction.data.score;
}

const signalOnlyInput = prepared("sp500");
const before = JSON.stringify(signalOnlyInput);
const signalOnly = runGenericAssetRuntimeV1(signalOnlyInput);
if (signalOnly.availability !== "available") throw new Error("expected available signal-only runtime");
assertEqual(signalOnly.engineResult.evaluatedAt, computedAt, "prepared time owned evaluation");
assertEqual(signalOnly.engineResult.technical.availability, "available", "Technical calculated");
assertEqual(Number.isFinite(signalOnly.intelligence.risk.score), true, "Risk calculated");
assertEqual(Number.isFinite(signalOnly.intelligence.signal.score), true, "Signal calculated");
assertEqual(typeof signalOnly.intelligence.state, "string", "Market State calculated");
assertEqual(signalOnly.engineResult.macro.availability, "not-applicable", "Macro not applicable");
assertEqual(signalOnly.engineResult.crossAsset, notApplicableCross, "exact Cross-Asset retained");
assertEqual(signalOnly.engineResult.regime.availability, "unavailable", "pure Regime state");
assertEqual(signalOnly.engineResult.decisionLifecycle.availability, "not-computed", "raw lifecycle state");
assertEqual(signalOnly.engineResult.decision.availability === "available" || signalOnly.engineResult.decision.availability === "partial", true, "Decision calculated");
assertEqual(signalOnly.calibration.genericComputable, true, "generic computable");
assertEqual(signalOnly.calibration.productionCalibrated, false, "fallback calibration not production calibrated");
assertEqual(signalOnly.calibration.missingExplicitCalibration.join(","), "risk,signal", "missing calibrations explicit");
assertEqual(JSON.stringify(signalOnlyInput), before, "runtime input not mutated");

if (signalOnly.engineResult.confidence.availability !== "available" ||
    signalOnly.engineResult.confidence.data.data.availability === "unavailable") {
  throw new Error("expected Data Confidence");
}
const components = signalOnly.engineResult.confidence.data.data.data.components;
assertEqual(components.macro.availability, "not-applicable", "Macro excluded from Data Confidence");
assertEqual(components.crossAsset.availability, "not-applicable", "Cross-Asset excluded from Data Confidence");

const profile = marketAssetProfiles.sp500;
const slicedCloses = signalOnlyInput.availability === "ready"
  ? signalOnlyInput.targetHistory.observations.slice(-profile.historyLimit).map((item) => item.close)
  : [];
const expected = calculateMarketIntelligence({ profile, closes: slicedCloses });
assertEqual(
  JSON.stringify({ technical: signalOnly.intelligence.technical, risk: signalOnly.intelligence.risk, signal: signalOnly.intelligence.signal }),
  JSON.stringify({ technical: expected.technical, risk: expected.risk, signal: expected.signal }),
  "most recent historyLimit in ascending order",
);
assertEqual(signalOnly.engineResult.marketData.historicalWindow?.receivedPoints, 650, "source observation count retained");

const baseline = runGenericAssetRuntimeV1(prepared("silver"));
if (baseline.availability !== "available") throw new Error("expected Silver baseline");
const direction = baseline.intelligence.signal.score >= 0 ? 1 : -1;
const agreeing: EngineCrossAssetSectionV3 = Object.freeze({
  availability: "available",
  data: Object.freeze({ score: direction * 0.7, strengthMagnitude: 0.7, coverage: 1,
    relationships: Object.freeze([]), dataQuality: Object.freeze({ availability: "not-computed" }) }),
});
const disagreeing: EngineCrossAssetSectionV3 = Object.freeze({
  availability: "available",
  data: Object.freeze({ score: -direction * 0.7, strengthMagnitude: 0.7, coverage: 1,
    relationships: Object.freeze([]), dataQuality: Object.freeze({ availability: "not-computed" }) }),
});
const agreement = runGenericAssetRuntimeV1(prepared("silver", agreeing));
const disagreement = runGenericAssetRuntimeV1(prepared("silver", disagreeing));
if (agreement.availability !== "available" || disagreement.availability !== "available") throw new Error("expected Cross-Asset runtimes");
assertEqual(agreement.engineResult.crossAsset, agreeing, "exact available Cross-Asset supplied");
assertEqual(conviction(agreement), conviction(baseline), "agreement does not boost conviction");
assertEqual(conviction(disagreement) < conviction(baseline), true, "disagreement reduces conviction");
if (disagreement.engineResult.decision.availability === "available" || disagreement.engineResult.decision.availability === "partial") {
  const stance = disagreement.engineResult.decision.data.stance;
  assertEqual(stance === "neutral" || stance === baseline.intelligence.signal.direction, true, "Cross-Asset cannot reverse direction");
}

const macroSection: EngineMacroV3<{ readonly fixture: true }> = Object.freeze({
  availability: "available",
  data: Object.freeze({ direction: "bullish", score: 0.4, strengthMagnitude: 0.4, coverage: 1,
    dataQuality: Object.freeze({ availability: "not-computed" }), drivers: Object.freeze([]),
    reasons: Object.freeze(["Already prepared Macro"]), migrationDetails: Object.freeze({ fixture: true }) }),
});
const applicable = Object.freeze({ applicability: "applicable" as const, section: macroSection });
const gold = runGenericAssetRuntimeV1(prepared("gold", notApplicableCross, applicable));
if (gold.availability !== "available") throw new Error("expected Gold-like applicable runtime");
assertEqual(gold.engineResult.macro, macroSection, "exact applicable Macro semantics retained");
assertEqual(gold.calibration.productionCalibrated, true, "Gold explicit calibration reported");

assertEqual(JSON.stringify(runGenericAssetRuntimeV1(signalOnlyInput)), JSON.stringify(signalOnly), "deterministic serialization");
const unavailable: PreparedAssetEvaluationInputV1 = Object.freeze({ availability: "unavailable", assetId: "sp500", computedAt, reason: "No history." });
assertEqual(JSON.stringify(runGenericAssetRuntimeV1(unavailable)), JSON.stringify(unavailable), "unavailable propagated transparently");

console.log("PASS: Generic Asset Runtime V1");
