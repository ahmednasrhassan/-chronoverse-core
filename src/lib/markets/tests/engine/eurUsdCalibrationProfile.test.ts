import { eurusdProfile } from "../../assets/eurusd/profile";
import { goldProfile } from "../../assets/gold/profile";
import { oilProfile } from "../../assets/oil/profile";
import type { EngineCrossAssetSectionV3 } from "../../engine/contracts";
import { runGenericAssetRuntimeV1 } from "../../engine/genericAssetRuntime";
import type { PreparedAssetEvaluationInputV1 } from
  "../../engine/preparedAssetEvaluation";

const expectedSignal = {
  bullishThreshold: 0.8,
  bearishThreshold: -0.75,
  neutralThreshold: 0.3,
  calibration: {
    weights: { ema: 0.25, rsi: 0.25, macd: 0.25, roc: 0.25 },
    ema: {
      toleranceRatio: 0.0001,
      minimumTolerance: 0.000001,
      allAveragesMultiplier: 0.55,
      moderateBiasMultiplier: 0.25,
    },
    rsi: { extremeMultiplier: 0.75 },
    macd: { epsilon: 0.0001, zeroBiasMultiplier: 0.6 },
    roc: {
      strongThreshold: 2.7,
      directionalThreshold: 1.1,
      strongMultiplier: 1,
      directionalMultiplier: 0.75,
      mildMultiplier: 0.35,
    },
    strength: { moderateThreshold: 0.65, strongThreshold: 0.9 },
    confidence: { base: 0.4, directional: 0.6, riskPenalty: 0.35 },
  },
} as const;

const expectedRisk = {
  low: 0.2,
  moderate: 0.25,
  high: 0.5,
  calibration: {
    weights: {
      volatility: 0.2,
      rsi: 0.15,
      roc: 0.2,
      macd: 0.15,
      emaMedium: 0.15,
      emaSlow: 0.15,
    },
    volatility: {
      moderateThreshold: 10.5,
      highThreshold: 14,
      severity: { low: 0.2, moderate: 0.6, high: 1 },
    },
    rsi: {
      stretchedLow: 40,
      stretchedHigh: 62,
      severity: { low: 0.2, moderate: 0.6, high: 1 },
    },
    roc: {
      moderateThreshold: 2,
      highThreshold: 3.4,
      severity: { low: 0.2, moderate: 0.6, high: 1 },
    },
    macd: { highThreshold: 0.0035, lowSeverity: 0.2, highSeverity: 1 },
    emaMedium: {
      moderateThreshold: 2.2,
      highThreshold: 3.8,
      severity: { low: 0.2, moderate: 0.6, high: 1 },
    },
    emaSlow: {
      moderateThreshold: 4.7,
      highThreshold: 8,
      severity: { low: 0.2, moderate: 0.6, high: 1 },
    },
  },
} as const;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

const goldBefore = JSON.stringify(goldProfile);
const oilBefore = JSON.stringify(oilProfile);

assertDeepEqual(eurusdProfile.signal, expectedSignal, "frozen Signal calibration");
assertDeepEqual(eurusdProfile.risk, expectedRisk, "frozen Risk calibration");

const crossAsset: EngineCrossAssetSectionV3 = Object.freeze({
  availability: "not-applicable",
  reason: "No approved relationship is configured.",
});
const prepared: PreparedAssetEvaluationInputV1 = Object.freeze({
  availability: "ready",
  assetId: "eurusd",
  computedAt: "2026-09-10T12:00:00.000Z",
  targetHistory: Object.freeze({
    assetId: "eurusd",
    symbol: eurusdProfile.symbol,
    interval: eurusdProfile.defaultInterval,
    observations: Object.freeze(Array.from({ length: 650 }, (_, index) =>
      Object.freeze({
        timestamp: 1_700_000_000 + index * 86_400,
        close: 1.08 + index * 0.00001 + Math.sin(index / 9) * 0.002,
      }))),
    status: "end_of_day",
  }),
  macro: Object.freeze({
    applicability: "not-applicable",
    reason: "No canonical Macro model is configured.",
  }),
  crossAsset,
});

const first = runGenericAssetRuntimeV1(prepared);
const second = runGenericAssetRuntimeV1(prepared);

if (first.availability !== "available" || second.availability !== "available") {
  throw new Error("expected available prepared EUR/USD runtime");
}

assertEqual(first.calibration.productionCalibrated, true,
  "explicit Risk and Signal calibration readiness");
assertEqual(first.calibration.missingExplicitCalibration.length, 0,
  "no explicit calibration missing");
assertEqual(first.engineResult.marketData.provider, null,
  "calibration readiness does not imply provider readiness");
assertDeepEqual(second, first, "deterministic calibrated EUR/USD runtime");
assertEqual(JSON.stringify(goldProfile), goldBefore, "Gold profile unchanged");
assertEqual(JSON.stringify(oilProfile), oilBefore, "WTI profile unchanged");

console.log("PASS: calibrated EUR/USD profile and generic runtime");
