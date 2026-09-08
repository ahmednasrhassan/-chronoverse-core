import type {
  EngineCrossAssetSectionV3,
  EngineMacroSectionV3,
  EngineMacroV3,
} from "../../engine/contracts";
import {
  calculateEngineResultV3,
  type CalculateEngineResultV3Input,
} from "../../engine/calculateEngineResult";
import type { MarketSignalResult } from "../../core/signalEngine";

const evaluatedAt = "2026-09-06T12:00:00.000Z";
const technical = Object.freeze({
  price: 100,
  emaFast: 99,
  emaMedium: 98,
  emaSlow: 97,
  rsi: 55,
  macd: 1,
  macdSignal: 0.8,
  macdHistogram: 0.2,
  momentum: 1,
  roc: 1,
  annualizedVolatility: 20,
  priceVsEmaMedium: 2,
  priceVsEmaSlow: 3,
});

function signal(score = 0.8): MarketSignalResult {
  return Object.freeze({
    score,
    direction: score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral",
    strength: "strong",
    confidence: 0.8,
    reasons: ["Prepared canonical Signal"],
  });
}

function macro(score = 0.4, coverage = 1): EngineMacroV3 {
  return Object.freeze({
    availability: "available",
    data: Object.freeze({
      direction: score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral",
      score,
      strengthMagnitude: Math.abs(score),
      coverage,
      dataQuality: Object.freeze({ availability: "not-computed" }),
      drivers: Object.freeze([]),
      reasons: Object.freeze(["Prepared canonical Macro"]),
    }),
  });
}

function crossAsset(
  score: number,
  coverage: number,
  missing?: readonly string[],
): EngineCrossAssetSectionV3 {
  const data = Object.freeze({
    score,
    strengthMagnitude: Math.abs(score),
    coverage,
    relationships: Object.freeze([]),
    dataQuality: Object.freeze({ availability: "not-computed" as const }),
  });

  return missing === undefined
    ? Object.freeze({ availability: "available", data })
    : Object.freeze({ availability: "partial", data, missing: Object.freeze([...missing]) });
}

const marketData = Object.freeze({
  provider: "prepared-fixture",
  status: "realtime" as const,
  window: Object.freeze({ receivedPoints: 200, lastTimestamp: 1_700_000_199 }),
  candles: Object.freeze(
    Array.from({ length: 200 }, (_, index) => Object.freeze({
      time: 1_700_000_000 + index,
      close: 100 + index / 100,
    })),
  ),
});

type PreparedIntelligence = {
  readonly technical: typeof technical;
  readonly signal: MarketSignalResult;
  readonly risk: {
    readonly score: number;
    readonly level: "low";
    readonly reasons: string[];
  };
  readonly state: "opportunity";
  readonly confidence: number;
};

function calculate(
  options: {
    readonly signalScore?: number;
    readonly macro?: EngineMacroSectionV3;
    readonly crossAsset?: EngineCrossAssetSectionV3;
    readonly includeCrossAsset?: boolean;
  } = {},
) {
  const intelligence: PreparedIntelligence = Object.freeze({
    technical,
    signal: signal(options.signalScore),
    risk: Object.freeze({ score: 0.2, level: "low", reasons: ["Prepared risk"] }),
    state: "opportunity",
    confidence: 0.8,
  });
  const input: CalculateEngineResultV3Input<
    PreparedIntelligence,
    never,
    never,
    "opportunity",
    "low"
  > = Object.freeze({
    asset: "silver",
    symbol: "SI=F",
    evaluatedAt,
    minimumRequiredHistory: 200,
    marketData,
    intelligence,
    macro: options.macro ?? Object.freeze({
      availability: "not-applicable",
      reason: "No canonical Macro model is configured for Silver.",
    }),
    ...(options.includeCrossAsset || options.crossAsset !== undefined
      ? { crossAsset: options.crossAsset }
      : {}),
  });

  return {
    input,
    result: calculateEngineResultV3<
      PreparedIntelligence,
      never,
      never,
      "opportunity",
      "low"
    >(input),
  };
}

function conviction(result: ReturnType<typeof calculate>["result"]): number {
  const confidence = result.confidence;

  if (
    confidence.availability !== "available" ||
    confidence.data.conviction.availability === "unavailable"
  ) {
    throw new Error("Expected usable Market Conviction.");
  }

  return confidence.data.conviction.data.score;
}

function dataConfidence(result: ReturnType<typeof calculate>["result"]) {
  const confidence = result.confidence;

  if (
    confidence.availability !== "available" ||
    confidence.data.data.availability === "unavailable"
  ) {
    throw new Error("Expected usable Data Confidence.");
  }

  return confidence.data.data;
}

function contradiction(result: ReturnType<typeof calculate>["result"]) {
  const section = result.contradiction;

  if (section.availability !== "available" && section.availability !== "partial") {
    throw new Error(`Expected usable contradiction, received ${section.availability}.`);
  }

  return section.data;
}

function decision(result: ReturnType<typeof calculate>["result"]) {
  const section = result.decision;

  if (section.availability !== "available" && section.availability !== "partial") {
    throw new Error(`Expected usable Decision, received ${section.availability}.`);
  }

  return section.data;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const signalOnly = calculate({
  crossAsset: Object.freeze({ availability: "not-applicable", reason: "No model" }),
});
assertEqual(signalOnly.result.evaluatedAt, evaluatedAt, "explicit evaluation time");
assertEqual(signalOnly.result.macro, signalOnly.input.macro, "exact Macro section");
assertEqual(signalOnly.result.macro.availability, "not-applicable", "Macro lifecycle");
assertEqual(signalOnly.result.crossAsset.availability, "not-applicable", "Cross-Asset lifecycle");
assertClose(conviction(signalOnly.result), 0.8, "signal-only conviction");
assertEqual(decision(signalOnly.result).stance, "bullish", "signal-only Decision stance");
assertClose(decision(signalOnly.result).score, 0.8, "signal-only Decision score");
const signalOnlyData = dataConfidence(signalOnly.result);
assertEqual(signalOnlyData.data.components.macro.availability, "not-applicable", "Macro exclusion");
assertEqual(
  signalOnlyData.availability === "partial" && signalOnlyData.missing.includes("macro"),
  false,
  "Macro does not become missing",
);
assertEqual(signalOnly.result.contradiction.availability, "not-applicable", "signal-only contradiction");
assertEqual(signalOnly.result.regime.availability, "unavailable", "pure Regime lifecycle");
assertEqual(signalOnly.result.decisionLifecycle.availability, "not-computed", "raw lifecycle");
assertEqual(signalOnly.result.scenario.availability, "partial", "Scenario is calculated conservatively");
assertEqual(signalOnly.result.invalidation.availability, "partial", "Invalidation is calculated conservatively");
assertEqual(signalOnly.result.recommendation.availability, "partial", "Recommendation is calculated conservatively");

if (
  signalOnly.result.scenario.availability !== "partial" ||
  signalOnly.result.invalidation.availability !== "partial" ||
  signalOnly.result.recommendation.availability !== "partial" ||
  signalOnly.result.confidence.availability !== "available" ||
  signalOnly.result.confidence.data.conviction.availability === "unavailable"
) {
  throw new Error("Expected usable partial synthesis and Conviction sections.");
}

assertEqual(
  signalOnly.result.scenario.data.base.targetStance,
  decision(signalOnly.result).stance,
  "Scenario remains anchored to Decision",
);
assertEqual(
  signalOnly.result.invalidation.data.thesis.stance,
  decision(signalOnly.result).stance,
  "Invalidation remains anchored to Decision",
);
assertEqual(
  signalOnly.result.recommendation.data.scenario.availability,
  signalOnly.result.scenario.availability,
  "Recommendation receives computed Scenario lifecycle",
);
assertEqual(
  signalOnly.result.recommendation.data.invalidation.availability,
  signalOnly.result.invalidation.availability,
  "Recommendation receives computed Invalidation lifecycle",
);
assertEqual(
  signalOnly.result.confidence.data.conviction.data.components.scenario.availability,
  "not-computed",
  "Conviction Scenario component remains deferred",
);

const applicableMacro = calculate({ macro: macro() });
assertEqual(applicableMacro.result.macro, applicableMacro.input.macro, "applicable Macro identity");
assertEqual(
  dataConfidence(applicableMacro.result).data.components.macro.availability,
  "available",
  "applicable Macro component",
);

const unavailableMacro = Object.freeze({
  availability: "unavailable" as const,
  reason: "Applicable Macro source is unavailable.",
});
const unavailableMacroResult = calculate({ macro: unavailableMacro });
assertEqual(unavailableMacroResult.result.macro, unavailableMacro, "unavailable Macro identity");
assertEqual(unavailableMacroResult.result.macro.availability, "unavailable", "unavailable Macro state");

const deferredMacro = Object.freeze({ availability: "not-computed" as const });
const deferredMacroResult = calculate({ macro: deferredMacro });
assertEqual(deferredMacroResult.result.macro, deferredMacro, "deferred Macro identity");
assertEqual(deferredMacroResult.result.macro.availability, "not-computed", "deferred Macro state");

const agreement = calculate({ crossAsset: crossAsset(0.8, 1) });
assertClose(contradiction(agreement.result).corroborativeConfirmation!, 0.8, "agreement");
assertClose(conviction(agreement.result), 0.8, "agreement cannot boost conviction");

const disagreement = calculate({ crossAsset: crossAsset(-0.8, 1) });
assertClose(contradiction(disagreement.result).corroborativeContradiction!, 0.8, "disagreement");
assertClose(conviction(disagreement.result), 0, "disagreement reduces conviction to zero");
assertEqual(decision(disagreement.result).stance, "neutral", "disagreement cannot reverse direction");

const partial = calculate({
  crossAsset: crossAsset(-0.8, 0.5, ["gold-reference"]),
});
assertClose(contradiction(partial.result).corroborativeContradiction!, 0.4, "partial coverage");
assertClose(conviction(partial.result), 0.4, "partial conviction");
assertClose(dataConfidence(partial.result).data.score, 0.5, "partial Data Confidence");

const unavailableCrossAsset = calculate({
  crossAsset: Object.freeze({ availability: "unavailable", reason: "Missing reference" }),
});
assertEqual(unavailableCrossAsset.result.crossAsset.availability, "unavailable", "unavailable Cross-Asset");
const unavailableCrossAssetData = dataConfidence(unavailableCrossAsset.result);
assertEqual(
  unavailableCrossAssetData.availability === "partial" &&
    unavailableCrossAssetData.missing.includes("crossAsset"),
  true,
  "unavailable Cross-Asset remains missing",
);

const explicitDeferred = calculate({
  crossAsset: Object.freeze({ availability: "not-computed" }),
});
assertEqual(explicitDeferred.result.crossAsset.availability, "not-computed", "explicit deferred Cross-Asset");
assertEqual(calculate().result.crossAsset.availability, "not-computed", "omitted Cross-Asset default");

const deterministicFirst = calculate({ macro: macro(), crossAsset: crossAsset(0.2, 1) });
const deterministicSecond = calculate({ macro: macro(), crossAsset: crossAsset(0.2, 1) });
assertEqual(
  JSON.stringify(deterministicFirst.result),
  JSON.stringify(deterministicSecond.result),
  "fixed-input determinism",
);

type PureInput = CalculateEngineResultV3Input<
  PreparedIntelligence,
  never,
  never,
  "opportunity",
  "low"
>;
type ForbiddenIoKey = Extract<
  keyof PureInput,
  | "providerClient"
  | "loadHistoricalMarketData"
  | "createSnapshot"
  | "getLatestRegimeSnapshot"
  | "appendRegimeSnapshot"
  | "advanceSnapshot"
>;
type AssertNever<T extends never> = T;
export type PureEngineInputHasNoIoCallbacks = AssertNever<ForbiddenIoKey>;

console.log("PASS: Pure Engine V3 calculation boundary");
