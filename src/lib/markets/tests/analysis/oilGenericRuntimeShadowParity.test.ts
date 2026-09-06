import { calculatePrimaryEvidenceAlgebraV3, ENGINE_V3_EVIDENCE_POLICY } from "../../engine/evidenceAlgebra";
import type { EngineCrossAssetSectionV3, EngineMacroV3, EngineResultV3 } from "../../engine/contracts";
import { runGenericAssetRuntimeV1 } from "../../engine/genericAssetRuntime";
import type { CanonicalMarketEvaluationV1 } from "../../engine/marketEvaluationCoordinator";
import {
  calculateMinimumTechnicalObservationCountV1,
  prepareAssetEvaluationV1,
} from "../../engine/preparedAssetEvaluation";
import { runEngineRuntimeV3 } from "../../engine/runtime";
import { calculateOilIntelligence, type OilIntelligenceResult } from "../../assets/oil/intelligence";
import { calculateOilMacro, OIL_MACRO_WEIGHTS, type OilMacroInput, type OilMacroResult } from "../../assets/oil/macro";
import { oilProfile } from "../../assets/oil/profile";
import { calculateOilRegimeMemory, createOilRegimeSnapshot } from "../../assets/oil/regimeMemory";
import type { CanonicalMarketObservationV1 } from "../../services/canonicalMarketSnapshot";

const computedAt = "2026-09-07T12:00:00.000Z";
const crossAsset: EngineCrossAssetSectionV3 = Object.freeze({
  availability: "not-applicable",
  reason: "No approved canonical Cross-Asset relationship is configured for Oil.",
});
const observedAt = Object.freeze({
  inventories: "2026-W34",
  production: "2026-W33",
  globalDemand: "2026-Q2",
  usd: null,
});
const bullishMacro: OilMacroInput = Object.freeze({
  inventoriesChangePct: -4,
  productionChangePct: -2,
  globalDemandChangePct: 2,
  usdChangePct: null,
  observedAt,
});
const bearishMacro: OilMacroInput = Object.freeze({
  inventoriesChangePct: 4,
  productionChangePct: 2,
  globalDemandChangePct: -2,
  usdChangePct: null,
  observedAt,
});
const partialMacro: OilMacroInput = Object.freeze({
  ...bullishMacro,
  productionChangePct: null,
});
const unavailableMacro: OilMacroInput = Object.freeze({
  inventoriesChangePct: null,
  productionChangePct: null,
  globalDemandChangePct: null,
  usdChangePct: null,
  observedAt,
});

type OilMacroCompatibility = Pick<OilMacroResult, "drivers">;
type ComparableEngine = EngineResultV3<
  OilMacroCompatibility,
  never,
  OilIntelligenceResult["state"],
  OilIntelligenceResult["risk"]["level"]
>;

interface ParityReport {
  readonly case: string;
  readonly technical: "exact";
  readonly risk: "exact";
  readonly signal: "exact";
  readonly macro: "exact";
  readonly marketState: "exact";
  readonly dataConfidence: "exact";
  readonly rawEvidenceStrength: "exact" | "not-comparable";
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
    close: 62 + index * 0.08 + Math.sin(index / 9) * 0.2 + Math.cos(index / 21) * 0.08,
  })));
}

function buildOilEngineMacro(macro: OilMacroResult): EngineMacroV3<OilMacroCompatibility> {
  const canonical = macro.canonical;
  if (canonical.availability !== "available" && canonical.availability !== "partial") {
    return {
      availability: "unavailable",
      reason: canonical.availability === "unavailable"
        ? canonical.reason
        : "Canonical Oil macro evidence is unavailable.",
    };
  }

  const data = {
    direction: macro.direction,
    score: canonical.data.score,
    strengthMagnitude: canonical.data.strengthMagnitude,
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
    migrationDetails: { drivers: macro.drivers },
  };

  return canonical.availability === "available"
    ? { availability: "available", data }
    : { availability: "partial", data, missing: canonical.missing };
}

function reconstructOilMacroCompatibility(
  macro: Extract<EngineMacroV3<OilMacroCompatibility>, { readonly availability: "available" | "partial" }>,
): OilMacroResult {
  const drivers = macro.data.migrationDetails?.drivers;
  if (drivers === undefined) throw new Error("Oil compatibility drivers are unavailable");
  const canonicalData = {
    score: macro.data.score,
    strengthMagnitude: macro.data.strengthMagnitude,
    coverage: macro.data.coverage,
    drivers: macro.data.drivers.map((driver) => driver.available
      ? {
          id: driver.id,
          weight: driver.weight!,
          availability: "available" as const,
          score: driver.score!,
          ...(driver.observedAt === undefined ? {} : { observedAt: driver.observedAt }),
          direction: driver.direction!,
          weightedContribution: driver.weightedContribution!,
        }
      : {
          id: driver.id,
          weight: driver.weight!,
          availability: "unavailable" as const,
          ...(driver.reason === undefined ? {} : { reason: driver.reason }),
        }),
  };

  return {
    score: Number(macro.data.score.toFixed(4)),
    direction: macro.data.direction,
    confidence: Number((macro.data.confidence ?? 0).toFixed(4)),
    coverage: Number(macro.data.coverage.toFixed(4)),
    drivers,
    reasons: [...macro.data.reasons],
    canonical: macro.availability === "available"
      ? { availability: "available", data: canonicalData }
      : { availability: "partial", data: canonicalData, missing: macro.missing },
  };
}

function evaluation(
  observations: readonly CanonicalMarketObservationV1[],
): CanonicalMarketEvaluationV1 {
  const asset = Object.freeze({
    assetId: "oil" as const,
    symbol: oilProfile.symbol,
    assetClass: oilProfile.assetClass,
    interval: oilProfile.defaultInterval,
    observations,
    observationCount: observations.length,
    earliestTimestamp: observations.at(0)?.timestamp,
    latestTimestamp: observations.at(-1)?.timestamp,
    provenance: Object.freeze({
      source: "chronoverse" as const,
      provider: "offline-oil-shadow-fixture",
      requestedSymbol: oilProfile.symbol,
      interval: oilProfile.defaultInterval,
      fetchedAt: 1_780_000_000,
    }),
    availability: "available" as const,
    status: "end_of_day" as const,
  });

  return Object.freeze({
    schemaVersion: "canonical-market-evaluation-v1",
    availability: "available",
    computedAt,
    requestedTargetAssetIds: Object.freeze(["oil" as const]),
    requiredObservationAssetIds: Object.freeze(["oil" as const]),
    historyPolicy: Object.freeze({
      targetTechnicalMinimumObservationCount: 200,
      crossAssetReferenceMinimumObservationCount: null,
      sharedMinimumObservationCount: 200,
      targetProfileHistoryLimit: oilProfile.historyLimit,
      recommendedObservationCount: oilProfile.historyLimit,
    }),
    snapshot: Object.freeze({
      schemaVersion: "canonical-market-snapshot-v1",
      computedAt,
      requestedAssetIds: Object.freeze(["oil" as const]),
      assets: Object.freeze([asset]),
      availability: "available",
    }),
    crossAssetSections: Object.freeze({
      targetAssetIds: Object.freeze(["oil" as const]),
      sections: Object.freeze([Object.freeze({ targetAssetId: "oil" as const, crossAsset })]),
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

function usableData<T>(section: { readonly availability: string; readonly data?: T }): T | null {
  return section.availability === "available" || section.availability === "partial"
    ? section.data ?? null
    : null;
}

function rawEvidenceStrength(result: ComparableEngine): number | null {
  const contradiction = usableData(result.contradiction);
  const confidence = result.confidence.availability === "available"
    ? usableData(result.confidence.data.conviction)
    : null;
  if (confidence === null) return null;
  if (result.macro.availability !== "available" && result.macro.availability !== "partial") {
    return confidence.score;
  }
  if (contradiction === null) return null;

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

function normalizedMarketStateConfidence(result: ComparableEngine): number {
  const signal = Math.min(1, Math.max(0, result.signal.confidence));
  const risk = Math.min(1, Math.max(0, 1 - result.risk.score));
  if (result.macro.availability !== "available" && result.macro.availability !== "partial") {
    return Number(((0.6 * signal + 0.2 * risk) / 0.8).toFixed(4));
  }
  const coverage = Math.min(1, Math.max(0, result.macro.data.coverage));
  const magnitude = Math.min(1, Math.max(0, Math.abs(result.macro.data.score)));
  return Number((
    (0.6 * signal + 0.2 * risk + 0.2 * coverage * magnitude) /
    (0.8 + 0.2 * coverage)
  ).toFixed(4));
}

function oldMarketStateConfidence(result: ComparableEngine): number {
  const signal = Math.min(1, Math.max(0, result.signal.confidence));
  const risk = Math.min(1, Math.max(0, 1 - result.risk.score));
  if (result.macro.availability !== "available" && result.macro.availability !== "partial") {
    return Number((0.75 * signal + 0.25 * risk).toFixed(4));
  }
  const coverage = Math.min(1, Math.max(0, result.macro.data.coverage));
  const magnitude = Math.min(1, Math.max(0, Math.abs(result.macro.data.score)));
  return Number((0.6 * signal + 0.2 * risk + 0.2 * coverage * magnitude).toFixed(4));
}

async function compareCase(
  name: string,
  sourceObservations: readonly CanonicalMarketObservationV1[],
  macroInput: OilMacroInput,
): Promise<{
  readonly report: ParityReport;
  readonly generic: ComparableEngine;
  readonly legacy: ComparableEngine;
}> {
  const sourceBefore = JSON.stringify({ sourceObservations, macroInput });
  const closes = sourceObservations
    .slice(-oilProfile.historyLimit)
    .map((observation) => observation.close);
  const legacyIntelligence = calculateOilIntelligence({ closes, macro: macroInput });
  if (legacyIntelligence.macro === null) throw new Error(`${name}: expected Oil Macro`);
  const engineMacro = buildOilEngineMacro(legacyIntelligence.macro);
  const prepared = prepareAssetEvaluationV1(
    evaluation(sourceObservations),
    "oil",
    Object.freeze({ applicability: "applicable", section: engineMacro }),
  );
  if (prepared.availability !== "ready") throw new Error(`${name}: expected ready prepared input`);

  let appendCalls = 0;
  const legacy = await runEngineRuntimeV3({
    asset: "oil",
    symbol: oilProfile.symbol,
    historyLimit: oilProfile.historyLimit,
    minimumRequiredHistory: calculateMinimumTechnicalObservationCountV1(oilProfile),
    macroApplicability: "applicable",
    insufficientHistoryMessage: (received, minimum) => `${received}/${minimum}`,
    marketData: {
      provider: prepared.targetHistory.provenance?.provider ?? null,
      status: prepared.targetHistory.status,
      provenance: {
        provider: prepared.targetHistory.provenance!.provider!,
        fetchedAt: prepared.targetHistory.provenance!.fetchedAt!,
      },
      window: {
        firstTimestamp: sourceObservations.at(0)?.timestamp,
        lastTimestamp: sourceObservations.at(-1)?.timestamp,
        receivedPoints: sourceObservations.length,
      },
      candles: sourceObservations.map((observation) => ({ time: observation.timestamp, close: observation.close })),
    },
    macroInput,
    calculateIntelligence: ({ closes: runtimeCloses, macro }) => {
      assertEqual(macro, macroInput, `${name} identical Macro input identity`);
      assertDeep(runtimeCloses, closes, `${name} identical legacy window`);
      return legacyIntelligence;
    },
    buildMacro: (intelligence) => {
      if (intelligence.macro === null) throw new Error(`${name}: missing legacy Macro`);
      return buildOilEngineMacro(intelligence.macro);
    },
    createRegimeSnapshot: createOilRegimeSnapshot,
    calculateRegimeMemory: calculateOilRegimeMemory,
    getLatestRegimeSnapshot: async () => null,
    appendRegimeSnapshot: async () => { appendCalls += 1; },
    crossAsset,
  });
  const genericOutput = runGenericAssetRuntimeV1(prepared);
  if (genericOutput.availability !== "available") throw new Error(`${name}: generic unavailable`);
  const generic = genericOutput.engineResult as ComparableEngine;
  const legacyResult = legacy.engineResult;

  assertEqual(appendCalls, 1, `${name} in-memory legacy regime append`);
  assertDeep(generic.technical, legacyResult.technical, `${name} Technical`);
  assertDeep(generic.risk, legacyResult.risk, `${name} Risk`);
  assertDeep(generic.signal, legacyResult.signal, `${name} Signal`);
  assertDeep(generic.macro, legacyResult.macro, `${name} Macro`);
  if (generic.macro.availability === "available" || generic.macro.availability === "partial") {
    assertDeep(
      reconstructOilMacroCompatibility(generic.macro),
      legacyIntelligence.macro,
      `${name} Oil public Macro compatibility reconstruction`,
    );
  }
  assertDeep(generic.state, legacyResult.state, `${name} Market State`);
  assertDeep(generic.confidence, legacyResult.confidence, `${name} Confidence`);
  assertDeep(generic.contradiction, legacyResult.contradiction, `${name} Contradiction`);
  assertDeep(generic.decision, legacyResult.decision, `${name} Decision`);
  assertDeep(generic.crossAsset, legacyResult.crossAsset, `${name} Cross-Asset`);
  assertEqual(generic.crossAsset.availability, "not-applicable", `${name} Oil Cross-Asset policy`);
  assertEqual(generic.regime.availability, "unavailable", `${name} pure Regime lifecycle`);
  assertEqual(legacyResult.regime.availability, "available", `${name} legacy Regime lifecycle`);
  assertEqual(generic.decisionLifecycle.availability, "not-computed", `${name} generic raw lifecycle`);
  assertEqual(legacyResult.decisionLifecycle.availability, "not-computed", `${name} legacy raw lifecycle`);
  assertEqual(rawEvidenceStrength(generic), rawEvidenceStrength(legacyResult), `${name} raw evidence strength`);
  assertEqual(JSON.stringify({ sourceObservations, macroInput }), sourceBefore, `${name} inputs unmodified`);

  return {
    report: {
      case: name,
      technical: "exact",
      risk: "exact",
      signal: "exact",
      macro: "exact",
      marketState: "exact",
      dataConfidence: "exact",
      rawEvidenceStrength: rawEvidenceStrength(generic) === null ? "not-comparable" : "exact",
      contradiction: "exact",
      conviction: "exact",
      decision: "exact",
      regime: "intentional-difference",
      decisionLifecycle: "exact-raw-not-computed",
      evaluatedAt: "intentional-owner-difference",
    },
    generic,
    legacy: legacyResult,
  };
}

async function run(): Promise<void> {
  assertEqual(OIL_MACRO_WEIGHTS.inventories, 0.35, "inventories weight");
  assertEqual(OIL_MACRO_WEIGHTS.production, 0.25, "production weight");
  assertEqual(OIL_MACRO_WEIGHTS.globalDemand, 0.25, "global-demand weight");
  assertEqual(OIL_MACRO_WEIGHTS.usd, 0.15, "USD weight");
  const minimum = calculateMinimumTechnicalObservationCountV1(oilProfile);
  assertEqual(minimum, 200, "derived Oil Technical minimum");

  const normalHistory = history(260);
  const normalMacro = calculateOilMacro(bullishMacro);
  assertEqual(normalMacro.coverage, 0.85, "maximum usable current Oil Macro coverage");
  assertEqual(normalMacro.canonical.availability, "partial", "USD-unavailable Macro lifecycle");
  const normal = await compareCase("CASE 1 NORMAL", normalHistory, bullishMacro);
  const partial = await compareCase("CASE 2 PARTIAL MACRO", normalHistory, partialMacro);
  const agreement = await compareCase("CASE 3 AGREEMENT", normalHistory, bullishMacro);
  const opposition = await compareCase("CASE 4 OPPOSITION", normalHistory, bearishMacro);
  const minimumCase = await compareCase("CASE 5 MINIMUM HISTORY", history(minimum), bullishMacro);
  const excessHistory = history(oilProfile.historyLimit + 75);
  const excess = await compareCase("CASE 6 EXCESS HISTORY", excessHistory, bullishMacro);
  const unavailable = await compareCase("CASE 7 MACRO UNAVAILABLE", normalHistory, unavailableMacro);

  const partialCalculated = calculateOilMacro(partialMacro);
  assertEqual(partialCalculated.coverage, 0.6, "additional unavailable driver coverage");
  assertEqual(partialCalculated.canonical.availability, "partial", "partial Macro lifecycle");
  if (agreement.generic.macro.availability !== "available" && agreement.generic.macro.availability !== "partial") throw new Error("expected agreement Macro");
  assertEqual(agreement.generic.signal.direction, agreement.generic.macro.data.direction, "agreement direction");
  if (opposition.generic.macro.availability !== "available" && opposition.generic.macro.availability !== "partial") throw new Error("expected opposition Macro");
  assertEqual(opposition.generic.signal.direction !== opposition.generic.macro.data.direction, true, "opposing primary directions");
  const oppositionData = usableData(opposition.generic.contradiction);
  if (oppositionData === null) throw new Error("expected opposition contradiction");
  assertEqual(oppositionData.score > 0, true, "opposition contradiction positive");
  assertEqual(minimumCase.generic.marketData.historicalWindow?.receivedPoints, minimum, "minimum history count");
  assertEqual(excess.generic.marketData.historicalWindow?.receivedPoints, oilProfile.historyLimit + 75, "excess source count preserved");
  assertEqual(unavailable.generic.macro.availability, "unavailable", "applicable unavailable Macro remains unavailable");
  assertEqual(unavailable.generic.state.confidence, 0.7513, "canonical unavailable-Macro state confidence");
  assertEqual(normal.generic.state.confidence, normalizedMarketStateConfidence(normal.generic), "normal Oil normalized confidence");
  assertEqual(partial.generic.state.confidence, normalizedMarketStateConfidence(partial.generic), "partial Oil normalized confidence");

  const deterministicPrepared = prepareAssetEvaluationV1(
    evaluation(excessHistory), "oil",
    { applicability: "applicable", section: buildOilEngineMacro(calculateOilMacro(bullishMacro)) },
  );
  const first = runGenericAssetRuntimeV1(deterministicPrepared);
  const second = runGenericAssetRuntimeV1(deterministicPrepared);
  assertEqual(JSON.stringify(first), JSON.stringify(second), "CASE 8 deterministic generic output");
  const deterministicReport: ParityReport = {
    ...normal.report,
    case: "CASE 8 DETERMINISM",
  };

  console.log(JSON.stringify([
    normal.report,
    partial.report,
    agreement.report,
    opposition.report,
    minimumCase.report,
    excess.report,
    unavailable.report,
    deterministicReport,
  ], null, 2));
  console.log(JSON.stringify({
    oilMarketStateConfidence: {
      normal: { old: oldMarketStateConfidence(normal.generic), normalized: normal.generic.state.confidence },
      partial: { old: oldMarketStateConfidence(partial.generic), normalized: partial.generic.state.confidence },
      unavailable: { old: 0.601, normalized: unavailable.generic.state.confidence },
    },
  }));
  console.log("PASS: Oil Generic Runtime Shadow Parity V1 — canonical analytical parity");
}

void run();
