import type {
  EngineCrossAssetSectionV3,
  EngineMacroV3,
} from "../../engine/contracts";
import { runEngineRuntimeV3 } from "../../engine/runtime";
import type { MarketSignalResult } from "../../core/signalEngine";

const technical = {
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
};

const regimeSnapshot = {
  timestamp: "2026-01-01T00:00:00.000Z",
  state: "opportunity",
  confidence: 0.5,
  signalDirection: "bullish",
  signalConfidence: 0.5,
  macroBias: "neutral",
  macroConfidence: 0,
  riskLevel: "moderate",
  riskScore: 0.4,
} as const;

const regimeMemory = {
  current: regimeSnapshot,
  previous: null,
  transition: { changed: false, from: null, to: "opportunity", direction: "new" },
  conviction: { current: 50, previous: null, change: null, direction: "stable" },
  technical: {
    current: "bullish",
    previous: null,
    confidence: 50,
    previousConfidence: null,
    change: "stable",
  },
  macro: {
    current: "neutral",
    previous: null,
    confidence: 0,
    previousConfidence: null,
    change: "stable",
  },
  risk: {
    currentLevel: "moderate",
    previousLevel: null,
    currentScore: 0.4,
    previousScore: null,
    change: "stable",
  },
} as const;

function crossAsset(
  score: number,
  coverage: number,
  missing?: readonly string[],
): EngineCrossAssetSectionV3 {
  const data = {
    score,
    strengthMagnitude: Math.abs(score),
    coverage,
    relationships: [],
    dataQuality: { availability: "not-computed" as const },
  };

  return missing === undefined
    ? { availability: "available", data }
    : { availability: "partial", data, missing };
}

type RunOptions = {
  readonly signalScore: number;
  readonly crossAsset?: EngineCrossAssetSectionV3;
  readonly macro?: {
    readonly score: number;
    readonly coverage: number;
  };
};

async function runCase(options: RunOptions) {
  const signal: MarketSignalResult = {
    score: options.signalScore,
    direction: !Number.isFinite(options.signalScore) || options.signalScore === 0
      ? "neutral"
      : options.signalScore > 0
        ? "bullish"
        : "bearish",
    strength: "moderate",
    confidence: 0.5,
    reasons: ["Synthetic canonical Signal"],
  };
  const macro: EngineMacroV3 = options.macro === undefined
    ? { availability: "unavailable", reason: "Not applicable" }
    : {
        availability: "available",
        data: {
          direction: options.macro.score > 0
            ? "bullish"
            : options.macro.score < 0
              ? "bearish"
              : "neutral",
          score: options.macro.score,
          strengthMagnitude: Math.abs(options.macro.score),
          coverage: options.macro.coverage,
          dataQuality: { availability: "not-computed" },
          drivers: [],
          reasons: ["Synthetic canonical Macro"],
        },
      };
  const hasCrossAsset = Object.prototype.hasOwnProperty.call(options, "crossAsset");

  return runEngineRuntimeV3({
    asset: "silver",
    symbol: "SI=F",
    historyLimit: 600,
    minimumRequiredHistory: 1,
    macroApplicability: options.macro === undefined ? "not-applicable" : "applicable",
    insufficientHistoryMessage: () => "Insufficient history",
    marketData: {
      provider: "in-memory",
      status: "realtime",
      interval: "1d",
      window: { receivedPoints: 1 },
      candles: [{ time: Math.floor(Date.now() / 1000), close: 100 }],
    },
    macroInput: null,
    calculateIntelligence: () => ({
      technical,
      signal,
      risk: { score: 0.4, level: "moderate", reasons: ["Synthetic risk"] },
      state: "opportunity" as const,
      confidence: 0.5,
    }),
    buildMacro: () => macro,
    createRegimeSnapshot: () => regimeSnapshot,
    calculateRegimeMemory: () => regimeMemory,
    getLatestRegimeSnapshot: async () => null,
    appendRegimeSnapshot: async () => undefined,
    ...(hasCrossAsset ? { crossAsset: options.crossAsset } : {}),
  });
}

type RuntimeResult = Awaited<ReturnType<typeof runCase>>;

function conviction(result: RuntimeResult): number {
  const value = result.engineResult.confidence;

  if (
    value.availability !== "available" ||
    value.data.conviction.availability === "unavailable"
  ) {
    throw new Error("Expected usable canonical conviction.");
  }

  return value.data.conviction.data.score;
}

function contradiction(result: RuntimeResult) {
  const value = result.engineResult.contradiction;

  if (value.availability !== "available" && value.availability !== "partial") {
    throw new Error(`Expected usable contradiction, received ${value.availability}.`);
  }

  return value.data;
}

function decision(result: RuntimeResult) {
  const value = result.engineResult.decision;

  if (value.availability !== "available" && value.availability !== "partial") {
    throw new Error(`Expected usable Decision, received ${value.availability}.`);
  }

  return value.data;
}

function dataConfidence(result: RuntimeResult) {
  const value = result.engineResult.confidence;

  if (
    value.availability !== "available" ||
    value.data.data.availability === "unavailable"
  ) {
    throw new Error("Expected usable Data Confidence.");
  }

  return value.data.data;
}

function dataConfidenceMissing(result: RuntimeResult): readonly string[] {
  const data = dataConfidence(result);

  return data.availability === "partial" ? data.missing : [];
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

async function main(): Promise<void> {
  const agreement = await runCase({ signalScore: 0.8, crossAsset: crossAsset(0.8, 1) });
  const agreementContradiction = contradiction(agreement);
  assertClose(agreementContradiction.primaryContradiction!, 0, "agreement primary contradiction");
  assertClose(agreementContradiction.corroborativeConfirmation!, 0.8, "agreement confirmation");
  assertClose(agreementContradiction.corroborativeContradiction!, 0, "agreement contradiction");
  assertClose(conviction(agreement), 0.8, "agreement no boost");
  assertEqual(decision(agreement).stance, "bullish", "agreement Decision stance");
  assertClose(decision(agreement).score, 0.8, "agreement Decision score");

  const disagreement = await runCase({ signalScore: 0.8, crossAsset: crossAsset(-0.8, 1) });
  assertClose(contradiction(disagreement).corroborativeContradiction!, 0.8, "full disagreement");
  assertClose(contradiction(disagreement).score, 0.8, "full total contradiction");
  assertClose(conviction(disagreement), 0, "full disagreement conviction");
  assertEqual(decision(disagreement).stance, "neutral", "full disagreement Decision stance");
  assertClose(decision(disagreement).score, 0, "full disagreement Decision score");

  const weakAgreement = await runCase({ signalScore: 0.2, crossAsset: crossAsset(0.9, 1) });
  assertClose(conviction(weakAgreement), 0.2, "weak primary cannot be boosted");
  assertClose(contradiction(weakAgreement).corroborativeConfirmation!, 0.2, "bounded confirmation");

  const partial = await runCase({
    signalScore: 0.8,
    crossAsset: crossAsset(-0.8, 0.5, ["gold-reference"]),
  });
  assertClose(contradiction(partial).corroborativeContradiction!, 0.4, "partial contradiction");
  assertClose(conviction(partial), 0.4, "partial conviction");
  assertEqual(decision(partial).stance, "bullish", "partial cannot reverse");
  assertClose(decision(partial).score, 0.4, "partial Decision magnitude");
  assertClose(dataConfidence(partial).data.score, 0.5, "Data Confidence uses coverage");

  const zero = await runCase({ signalScore: 0.8, crossAsset: crossAsset(0, 1) });
  assertClose(conviction(zero), 0.8, "zero Cross-Asset no effect");
  assertClose(contradiction(zero).corroborativeConfirmation!, 0, "zero confirmation");

  const notApplicable = await runCase({
    signalScore: 0.8,
    crossAsset: { availability: "not-applicable", reason: "No model" },
  });
  assertClose(conviction(notApplicable), 0.8, "not-applicable conviction");
  assertEqual(
    dataConfidence(notApplicable).data.components.crossAsset.availability,
    "not-applicable",
    "not-applicable Data Confidence component",
  );
  assertEqual(dataConfidenceMissing(notApplicable).includes("crossAsset"), false, "not-applicable exclusion");

  const unavailable = await runCase({
    signalScore: 0.8,
    crossAsset: { availability: "unavailable", reason: "Missing reference" },
  });
  assertClose(conviction(unavailable), 0.8, "unavailable preserves conviction");
  assertEqual(dataConfidence(unavailable).data.components.crossAsset.availability, "unavailable", "unavailable component");
  assertEqual(dataConfidenceMissing(unavailable).includes("crossAsset"), true, "unavailable Data Confidence missing");

  const deferred = await runCase({
    signalScore: 0.8,
    crossAsset: { availability: "not-computed" },
  });
  assertClose(conviction(deferred), 0.8, "deferred preserves conviction");
  assertEqual(dataConfidence(deferred).data.components.crossAsset.availability, "not-computed", "deferred component");
  assertEqual(dataConfidenceMissing(deferred).includes("crossAsset"), true, "deferred remains missing");

  const noSignal = await runCase({ signalScore: Number.NaN, crossAsset: crossAsset(0.9, 1) });
  assertEqual(noSignal.engineResult.confidence.availability, "available", "no-Signal confidence envelope");
  assertEqual(
    noSignal.engineResult.confidence.availability === "available"
      ? noSignal.engineResult.confidence.data.conviction.availability
      : null,
    "unavailable",
    "Cross-Asset cannot create conviction",
  );
  assertEqual(noSignal.engineResult.decision.availability, "unavailable", "Cross-Asset cannot create Decision");

  const primaryMacro = await runCase({
    signalScore: 1,
    macro: { score: -0.4, coverage: 1 },
    crossAsset: crossAsset(-0.2, 1),
  });
  assertClose(contradiction(primaryMacro).primaryContradiction!, 0.4, "Signal+Macro primary contradiction");
  assertClose(contradiction(primaryMacro).corroborativeContradiction!, 0.2, "post-primary corroboration");
  assertClose(contradiction(primaryMacro).score, 0.6, "Signal+Macro total contradiction");
  assertClose(conviction(primaryMacro), 0.1, "Signal+Macro final conviction");
  assertClose(decision(primaryMacro).score, 0.1, "Signal+Macro Decision");

  const defaultRuntime = await runCase({ signalScore: 0.8 });
  assertEqual(defaultRuntime.engineResult.crossAsset.availability, "not-computed", "default Cross-Asset lifecycle");
  assertClose(conviction(defaultRuntime), 0.8, "default conviction regression");
  assertEqual(defaultRuntime.engineResult.contradiction.availability, "not-applicable", "default contradiction regression");
  assertClose(decision(defaultRuntime).score, 0.8, "default Decision regression");

  const invalid = await runCase({ signalScore: 0.8, crossAsset: crossAsset(Number.NaN, 1) });
  assertEqual(invalid.engineResult.crossAsset.availability, "unavailable", "invalid canonical input classification");
  assertClose(conviction(invalid), 0.8, "invalid Cross-Asset does not lower conviction");

  assertClose(dataConfidence(partial).data.score, dataConfidence(
    await runCase({ signalScore: 0.8, crossAsset: crossAsset(0.8, 0.5, ["gold-reference"]) }),
  ).data.score, "Data Confidence direction independence");

  for (const result of [agreement, disagreement, weakAgreement, partial, zero, primaryMacro]) {
    const finalConviction = conviction(result);
    const totalContradiction = contradiction(result).score;
    const primaryContradiction = contradiction(result).primaryContradiction!;
    const primaryConviction = finalConviction +
      (contradiction(result).corroborativeContradiction ?? 0);
    const rawEvidenceStrength = primaryConviction + primaryContradiction;

    assertEqual(finalConviction >= 0 && finalConviction <= primaryConviction, true, "conviction bounds");
    assertClose(finalConviction, rawEvidenceStrength - totalContradiction, "conviction invariant");
    assertEqual(totalContradiction <= rawEvidenceStrength, true, "contradiction bound");
    assertClose(Math.abs(decision(result).score), finalConviction, "Decision magnitude invariant");
  }

  const bearish = await runCase({
    signalScore: -0.8,
    crossAsset: crossAsset(0.8, 0.5, ["gold-reference"]),
  });
  assertClose(conviction(bearish), conviction(partial), "sign symmetry conviction");
  assertClose(decision(bearish).score, -decision(partial).score, "sign symmetry Decision");

  console.log("PASS: Cross-Asset-aware Engine runtime boundary V1");
}

void main();
