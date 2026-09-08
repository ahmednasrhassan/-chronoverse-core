import { calculatePrimaryEvidenceAlgebraV3, ENGINE_V3_EVIDENCE_POLICY } from "../../engine/evidenceAlgebra";
import type { EngineCrossAssetSectionV3, EngineMacroV3, EngineResultV3 } from "../../engine/contracts";
import { runGenericAssetRuntimeV1 } from "../../engine/genericAssetRuntime";
import type { CanonicalMarketEvaluationV1 } from "../../engine/marketEvaluationCoordinator";
import {
  calculateMinimumTechnicalObservationCountV1,
  prepareAssetEvaluationV1,
} from "../../engine/preparedAssetEvaluation";
import { runEngineRuntimeV3 } from "../../engine/runtime";
import { calculateGoldIntelligence, type GoldIntelligenceResult } from "../../assets/gold/intelligence";
import type { GoldMacroSnapshot } from "../../assets/gold/macro";
import {
  calculateGoldMacroScore,
  GOLD_MACRO_WEIGHTS,
  type GoldMacroScoreResult,
} from "../../assets/gold/macroScore";
import { goldProfile } from "../../assets/gold/profile";
import { calculateGoldRegimeMemory, createGoldRegimeSnapshot } from "../../assets/gold/regimeMemory";
import type { MarketTechnicalSnapshot } from "../../core/intelligenceEngine";
import type { CanonicalMarketObservationV1 } from "../../services/canonicalMarketSnapshot";

const computedAt = "2026-09-07T12:00:00.000Z";
const crossAsset: EngineCrossAssetSectionV3 = Object.freeze({
  availability: "not-applicable",
  reason: "No approved canonical Cross-Asset relationship is configured for Gold.",
});
const fullBullishSnapshot: GoldMacroSnapshot = Object.freeze({
  realYield10Y: Object.freeze({ date: "2026-09-04", value: 0 }),
  nominalYield10Y: Object.freeze({ date: "2026-09-03", value: 2.4 }),
  dollarIndexProxy: Object.freeze({ date: "2026-09-02", value: 99 }),
  inflationExpectation10Y: Object.freeze({ date: "2026-09-01", value: 3.1 }),
});
const fullBearishSnapshot: GoldMacroSnapshot = Object.freeze({
  realYield10Y: Object.freeze({ date: "2026-09-04", value: 3.2 }),
  nominalYield10Y: Object.freeze({ date: "2026-09-03", value: 5.2 }),
  dollarIndexProxy: Object.freeze({ date: "2026-09-02", value: 121 }),
  inflationExpectation10Y: Object.freeze({ date: "2026-09-01", value: 1.4 }),
});
const partialSnapshot: GoldMacroSnapshot = Object.freeze({
  ...fullBullishSnapshot,
  nominalYield10Y: null,
});
const unavailableSnapshot: GoldMacroSnapshot = Object.freeze({
  realYield10Y: null,
  nominalYield10Y: null,
  dollarIndexProxy: null,
  inflationExpectation10Y: null,
});
const neutralSnapshot: GoldMacroSnapshot = Object.freeze({
  realYield10Y: Object.freeze({ date: "2026-09-04", value: 1.5 }),
  nominalYield10Y: Object.freeze({ date: "2026-09-03", value: 5.2 }),
  dollarIndexProxy: Object.freeze({ date: "2026-09-02", value: 112 }),
  inflationExpectation10Y: Object.freeze({ date: "2026-09-01", value: 2.2 }),
});

type GoldMacroCompatibility = Pick<GoldMacroScoreResult, "factors">;
type LegacyGoldIntelligence = GoldIntelligenceResult & { readonly technical: MarketTechnicalSnapshot };
type ComparableEngine = EngineResultV3<
  GoldMacroCompatibility,
  never,
  GoldIntelligenceResult["state"],
  GoldIntelligenceResult["risk"]["level"]
>;

interface ParityReport {
  readonly case: string;
  readonly technical: "exact";
  readonly risk: "exact";
  readonly signal: "exact";
  readonly macro: "exact";
  readonly marketState: "exact";
  readonly dataConfidence: "exact";
  readonly rawEvidenceStrength: "exact";
  readonly contradiction: "exact";
  readonly conviction: "exact";
  readonly decision: "exact";
  readonly regime: "intentional-difference";
  readonly decisionLifecycle: "exact-raw-not-computed";
  readonly evaluatedAt: "intentional-owner-difference";
}

function history(count: number): readonly CanonicalMarketObservationV1[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    timestamp: 1_650_000_000 + index * 86_400,
    close: 1_800 + index * 0.65 + Math.sin(index / 10) * 0.25,
  })));
}

function mapGoldTechnical(intelligence: GoldIntelligenceResult): MarketTechnicalSnapshot {
  const indicators = intelligence.indicators;
  return {
    price: intelligence.price,
    emaFast: indicators.ema20,
    emaMedium: indicators.ema50,
    emaSlow: indicators.ema200,
    rsi: indicators.rsi,
    macd: indicators.macd,
    macdSignal: indicators.macdSignal,
    macdHistogram: indicators.macdHistogram,
    momentum: indicators.momentum,
    roc: indicators.roc,
    annualizedVolatility: indicators.annualizedVolatility,
    priceVsEmaMedium: indicators.priceVsEma50,
    priceVsEmaSlow: indicators.priceVsEma200,
  };
}

function buildGoldEngineMacro(macro: GoldMacroScoreResult): EngineMacroV3<GoldMacroCompatibility> {
  const canonical = macro.canonical;
  if (canonical.availability !== "available" && canonical.availability !== "partial") {
    return {
      availability: "unavailable",
      reason: canonical.availability === "unavailable"
        ? canonical.reason
        : "Canonical Gold macro evidence is unavailable.",
    };
  }
  const data = {
    direction: macro.bias,
    score: canonical.data.score,
    strengthMagnitude: canonical.data.strengthMagnitude,
    strength: macro.strength,
    confidence: macro.confidence,
    coverage: canonical.data.coverage,
    dataQuality: { availability: "not-computed" as const },
    drivers: canonical.data.drivers.map((driver) => driver.availability === "available"
      ? {
          id: driver.id, weight: driver.weight, available: true, score: driver.score,
          direction: driver.direction, observedAt: driver.observedAt,
          weightedContribution: driver.weightedContribution,
        }
      : {
          id: driver.id, weight: driver.weight, available: false, score: null,
          weightedContribution: null, reason: driver.reason,
        }),
    reasons: macro.reasons,
    migrationDetails: { factors: macro.factors },
  };
  return canonical.availability === "available"
    ? { availability: "available", data }
    : { availability: "partial", data, missing: canonical.missing };
}

function reconstructGoldMacro(
  macro: Extract<EngineMacroV3<GoldMacroCompatibility>, { readonly availability: "available" | "partial" }>,
): GoldMacroScoreResult {
  const factors = macro.data.migrationDetails?.factors;
  if (factors === undefined || macro.data.strength === undefined) {
    throw new Error("Gold compatibility details are unavailable");
  }
  const canonicalData = {
    score: macro.data.score,
    strengthMagnitude: macro.data.strengthMagnitude,
    coverage: macro.data.coverage,
    drivers: macro.data.drivers.map((driver) => driver.available
      ? {
          id: driver.id, weight: driver.weight!, availability: "available" as const,
          score: driver.score!,
          ...(driver.observedAt === undefined ? {} : { observedAt: driver.observedAt }),
          direction: driver.direction!, weightedContribution: driver.weightedContribution!,
        }
      : {
          id: driver.id, weight: driver.weight!, availability: "unavailable" as const,
          ...(driver.reason === undefined ? {} : { reason: driver.reason }),
        }),
  };
  return {
    score: Number(macro.data.score.toFixed(4)),
    bias: macro.data.direction,
    strength: macro.data.strength,
    confidence: Number((macro.data.confidence ?? 0).toFixed(4)),
    coverage: Number(macro.data.coverage.toFixed(4)),
    factors,
    reasons: [...macro.data.reasons],
    canonical: macro.availability === "available"
      ? { availability: "available", data: canonicalData }
      : { availability: "partial", data: canonicalData, missing: macro.missing },
  };
}

function evaluation(observations: readonly CanonicalMarketObservationV1[]): CanonicalMarketEvaluationV1 {
  const asset = Object.freeze({
    assetId: "gold" as const,
    symbol: goldProfile.symbol,
    assetClass: goldProfile.assetClass,
    interval: goldProfile.defaultInterval,
    observations,
    observationCount: observations.length,
    earliestTimestamp: observations.at(0)?.timestamp,
    latestTimestamp: observations.at(-1)?.timestamp,
    provenance: Object.freeze({
      source: "chronoverse" as const,
      provider: "offline-gold-shadow-fixture",
      requestedSymbol: goldProfile.symbol,
      interval: goldProfile.defaultInterval,
      fetchedAt: 1_780_000_000,
    }),
    availability: "available" as const,
    status: "end_of_day" as const,
  });
  return Object.freeze({
    schemaVersion: "canonical-market-evaluation-v1",
    availability: "available",
    computedAt,
    requestedTargetAssetIds: Object.freeze(["gold" as const]),
    requiredObservationAssetIds: Object.freeze(["gold" as const]),
    historyPolicy: Object.freeze({
      targetTechnicalMinimumObservationCount: 200,
      crossAssetReferenceMinimumObservationCount: null,
      sharedMinimumObservationCount: 200,
      targetProfileHistoryLimit: goldProfile.historyLimit,
      recommendedObservationCount: goldProfile.historyLimit,
    }),
    snapshot: Object.freeze({
      schemaVersion: "canonical-market-snapshot-v1",
      computedAt,
      requestedAssetIds: Object.freeze(["gold" as const]),
      assets: Object.freeze([asset]),
      availability: "available",
    }),
    crossAssetSections: Object.freeze({
      targetAssetIds: Object.freeze(["gold" as const]),
      sections: Object.freeze([Object.freeze({ targetAssetId: "gold" as const, crossAsset })]),
    }),
  });
}

function assertDeep(actual: unknown, expected: unknown, label: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch\nexpected ${expectedJson}\nreceived ${actualJson}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > Number.EPSILON * 8) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function usableData<T>(section: { readonly availability: string; readonly data?: T }): T | null {
  return section.availability === "available" || section.availability === "partial"
    ? section.data ?? null
    : null;
}

function rawEvidenceStrength(result: ComparableEngine): number {
  const conviction = result.confidence.availability === "available"
    ? usableData(result.confidence.data.conviction)
    : null;
  if (conviction === null) throw new Error("Expected Gold conviction");
  if (result.macro.availability !== "available" && result.macro.availability !== "partial") {
    return conviction.score;
  }
  return calculatePrimaryEvidenceAlgebraV3([
    {
      id: "signal", evidenceRole: ENGINE_V3_EVIDENCE_POLICY.signal.evidenceRole,
      score: result.signal.score, architecturePrior: ENGINE_V3_EVIDENCE_POLICY.signal.architecturePrior,
      coverage: 1,
    },
    {
      id: "macro", evidenceRole: ENGINE_V3_EVIDENCE_POLICY.macro.evidenceRole,
      score: result.macro.data.score, architecturePrior: ENGINE_V3_EVIDENCE_POLICY.macro.architecturePrior,
      coverage: result.macro.data.coverage,
    },
  ]).rawEvidenceStrength;
}

async function compareCase(
  name: string,
  sourceObservations: readonly CanonicalMarketObservationV1[],
  macroSnapshot: GoldMacroSnapshot,
): Promise<{ readonly report: ParityReport; readonly generic: ComparableEngine }> {
  const before = JSON.stringify({ sourceObservations, macroSnapshot });
  const closes = sourceObservations.slice(-goldProfile.historyLimit).map((item) => item.close);
  const macro = calculateGoldMacroScore(macroSnapshot);
  const legacyBase = calculateGoldIntelligence({ closes, macro });
  const legacyIntelligence: LegacyGoldIntelligence = {
    ...legacyBase,
    technical: mapGoldTechnical(legacyBase),
  };
  const engineMacro = buildGoldEngineMacro(macro);
  const prepared = prepareAssetEvaluationV1(
    evaluation(sourceObservations),
    "gold",
    Object.freeze({ applicability: "applicable", section: engineMacro }),
  );
  if (prepared.availability !== "ready") throw new Error(`${name}: expected ready input`);

  let appendCalls = 0;
  const legacy = await runEngineRuntimeV3<
    GoldMacroScoreResult,
    LegacyGoldIntelligence,
    GoldMacroCompatibility,
    never,
    GoldIntelligenceResult["state"],
    GoldIntelligenceResult["risk"]["level"]
  >({
    asset: "gold",
    symbol: goldProfile.symbol,
    historyLimit: goldProfile.historyLimit,
    minimumRequiredHistory: 1,
    macroApplicability: "applicable",
    insufficientHistoryMessage: () => "Gold history unavailable",
    marketData: {
      provider: prepared.targetHistory.provenance?.provider ?? null,
      status: prepared.targetHistory.status,
      interval: prepared.targetHistory.interval,
      provenance: {
        provider: prepared.targetHistory.provenance!.provider!,
        fetchedAt: prepared.targetHistory.provenance!.fetchedAt!,
      },
      window: {
        firstTimestamp: sourceObservations.at(0)?.timestamp,
        lastTimestamp: sourceObservations.at(-1)?.timestamp,
        receivedPoints: sourceObservations.length,
      },
      candles: sourceObservations.map((item) => ({ time: item.timestamp, close: item.close })),
    },
    macroInput: macro,
    calculateIntelligence: ({ closes: runtimeCloses, macro: runtimeMacro }) => {
      assertEqual(runtimeMacro, macro, `${name} identical Macro identity`);
      assertDeep(runtimeCloses, closes, `${name} identical history window`);
      return legacyIntelligence;
    },
    buildMacro: (intelligence) => {
      if (intelligence.macro === null) throw new Error(`${name}: missing Gold Macro`);
      return buildGoldEngineMacro(intelligence.macro);
    },
    createRegimeSnapshot: createGoldRegimeSnapshot,
    calculateRegimeMemory: calculateGoldRegimeMemory,
    getLatestRegimeSnapshot: async () => null,
    appendRegimeSnapshot: async () => { appendCalls += 1; },
    crossAsset,
  });
  const genericOutput = runGenericAssetRuntimeV1(prepared);
  if (genericOutput.availability !== "available") throw new Error(`${name}: generic unavailable`);
  const generic = genericOutput.engineResult as ComparableEngine;
  const legacyResult = legacy.engineResult;

  assertEqual(appendCalls, 1, `${name} in-memory Regime append`);
  assertDeep(generic.technical, legacyResult.technical, `${name} Technical`);
  assertDeep(generic.risk, legacyResult.risk, `${name} Risk`);
  assertDeep(generic.signal, legacyResult.signal, `${name} Signal`);
  assertDeep(generic.macro, legacyResult.macro, `${name} Macro`);
  assertDeep(generic.state, legacyResult.state, `${name} Market State`);
  assertDeep(generic.confidence, legacyResult.confidence, `${name} Confidence`);
  assertDeep(generic.contradiction, legacyResult.contradiction, `${name} Contradiction`);
  assertDeep(generic.decision, legacyResult.decision, `${name} Decision`);
  assertDeep(generic.crossAsset, legacyResult.crossAsset, `${name} Cross-Asset`);
  assertEqual(generic.crossAsset.availability, "not-applicable", `${name} Cross-Asset policy`);
  assertEqual(rawEvidenceStrength(generic), rawEvidenceStrength(legacyResult), `${name} raw strength`);
  assertEqual(generic.regime.availability, "unavailable", `${name} pure Regime`);
  assertEqual(legacyResult.regime.availability, "available", `${name} legacy Regime`);
  assertEqual(generic.decisionLifecycle.availability, "not-computed", `${name} generic lifecycle`);
  assertEqual(legacyResult.decisionLifecycle.availability, "not-computed", `${name} legacy lifecycle`);
  if (generic.macro.availability === "available" || generic.macro.availability === "partial") {
    assertDeep(reconstructGoldMacro(generic.macro), macro, `${name} Macro compatibility mapping`);
  }
  assertEqual(JSON.stringify({ sourceObservations, macroSnapshot }), before, `${name} inputs unchanged`);

  return {
    report: {
      case: name,
      technical: "exact",
      risk: "exact",
      signal: "exact",
      macro: "exact",
      marketState: "exact",
      dataConfidence: "exact",
      rawEvidenceStrength: "exact",
      contradiction: "exact",
      conviction: "exact",
      decision: "exact",
      regime: "intentional-difference",
      decisionLifecycle: "exact-raw-not-computed",
      evaluatedAt: "intentional-owner-difference",
    },
    generic,
  };
}

async function run(): Promise<void> {
  assertEqual(GOLD_MACRO_WEIGHTS.realYields, 0.4, "real-yields weight");
  assertEqual(GOLD_MACRO_WEIGHTS.nominalYields, 0.1, "nominal-yields weight");
  assertEqual(GOLD_MACRO_WEIGHTS.usd, 0.3, "USD weight");
  assertEqual(GOLD_MACRO_WEIGHTS.inflationExpectations, 0.2, "inflation weight");
  const minimum = calculateMinimumTechnicalObservationCountV1(goldProfile);
  assertEqual(minimum, 200, "derived Gold Technical minimum");

  const normalHistory = history(260);
  const normal = await compareCase("CASE 1 NORMAL", normalHistory, fullBullishSnapshot);
  const partial = await compareCase("CASE 2 PARTIAL MACRO", normalHistory, partialSnapshot);
  const agreement = await compareCase("CASE 3 AGREEMENT", normalHistory, fullBullishSnapshot);
  const opposition = await compareCase("CASE 4 OPPOSITION", normalHistory, fullBearishSnapshot);
  const minimumCase = await compareCase("CASE 5 MINIMUM HISTORY", history(minimum), fullBullishSnapshot);
  const excessHistory = history(goldProfile.historyLimit + 75);
  const excess = await compareCase("CASE 6 EXCESS HISTORY", excessHistory, fullBullishSnapshot);
  const unavailable = await compareCase("CASE 7 MACRO UNAVAILABLE", normalHistory, unavailableSnapshot);
  const neutral = await compareCase("CASE 8 MACRO NEUTRAL", normalHistory, neutralSnapshot);

  const partialMacro = calculateGoldMacroScore(partialSnapshot);
  assertEqual(partialMacro.canonical.availability, "partial", "partial Macro lifecycle");
  if (partialMacro.canonical.availability !== "partial") throw new Error("Expected partial Macro");
  assertClose(partialMacro.canonical.data.coverage, 0.9, "partial Macro coverage");
  const neutralMacro = calculateGoldMacroScore(neutralSnapshot);
  assertEqual(neutralMacro.canonical.availability, "available", "neutral Macro lifecycle");
  if (neutralMacro.canonical.availability !== "available") throw new Error("Expected neutral Macro");
  assertClose(neutralMacro.canonical.data.score, 0, "near-zero canonical neutral Macro score");
  assertEqual(neutralMacro.score, 0, "compatibility-normalized neutral Macro score");
  assertEqual(neutralMacro.bias, "neutral", "neutral Macro bias");
  assertEqual(neutralMacro.canonical.data.coverage, 1, "neutral Macro coverage");
  assertEqual(unavailable.generic.macro.availability, "unavailable", "unavailable stays applicable-unavailable");
  assertEqual(agreement.generic.signal.direction, "bullish", "agreement Signal direction");
  if (
    (agreement.generic.macro.availability !== "available" && agreement.generic.macro.availability !== "partial") ||
    (opposition.generic.macro.availability !== "available" && opposition.generic.macro.availability !== "partial")
  ) {
    throw new Error("Expected usable directional Macro");
  }
  assertEqual(agreement.generic.macro.data.direction, "bullish", "agreement Macro direction");
  assertEqual(opposition.generic.macro.data.direction, "bearish", "opposition Macro direction");
  const oppositionContradiction = usableData(opposition.generic.contradiction);
  if (oppositionContradiction === null) throw new Error("Expected opposition contradiction");
  assertEqual(oppositionContradiction.score > 0, true, "opposition contradiction positive");
  assertEqual(minimumCase.generic.marketData.historicalWindow?.receivedPoints, minimum, "minimum count");
  assertEqual(excess.generic.marketData.historicalWindow?.receivedPoints, goldProfile.historyLimit + 75, "excess count");

  const oneCloseMacro = calculateGoldMacroScore(fullBullishSnapshot);
  const oneClose = calculateGoldIntelligence({ closes: [1_900], macro: oneCloseMacro });
  assertEqual(oneClose.price, 1_900, "legacy one-close price");
  assertEqual(oneClose.indicators.ema200, null, "legacy one-close EMA200 unavailable");
  assertEqual(oneClose.indicators.rsi, null, "legacy one-close RSI unavailable");
  assertEqual(oneClose.indicators.macd, null, "legacy one-close MACD unavailable");
  assertEqual(oneClose.indicators.momentum, null, "legacy one-close Momentum unavailable");
  assertEqual(oneClose.indicators.annualizedVolatility, null, "legacy one-close Volatility unavailable");
  assertEqual(
    prepareAssetEvaluationV1(
      evaluation(history(minimum - 1)),
      "gold",
      { applicability: "applicable", section: buildGoldEngineMacro(oneCloseMacro) },
    ).availability,
    "unavailable",
    "canonical sub-minimum history rejected",
  );

  const deterministicPrepared = prepareAssetEvaluationV1(
    evaluation(excessHistory),
    "gold",
    { applicability: "applicable", section: buildGoldEngineMacro(calculateGoldMacroScore(fullBullishSnapshot)) },
  );
  assertEqual(
    JSON.stringify(runGenericAssetRuntimeV1(deterministicPrepared)),
    JSON.stringify(runGenericAssetRuntimeV1(deterministicPrepared)),
    "CASE 9 deterministic output",
  );
  const deterministicReport: ParityReport = { ...normal.report, case: "CASE 9 DETERMINISM" };

  console.log(JSON.stringify([
    normal.report,
    partial.report,
    agreement.report,
    opposition.report,
    minimumCase.report,
    excess.report,
    unavailable.report,
    neutral.report,
    deterministicReport,
  ], null, 2));
  console.log("PASS: Gold Generic Runtime Shadow Parity V1 — canonical analytical parity");
}

void run();
