import { readFileSync } from "node:fs";

import {
  calculateOilMacro,
  type OilMacroInput,
} from "../../assets/oil/macro";
import {
  OIL_CANONICAL_PRODUCT_ID,
  oilProfile,
} from "../../assets/oil/profile";
import {
  evaluatePreparedOilV1,
  mapOilCompatibilityV1,
} from "../../assets/oil/productionCutover";
import {
  getCanonicalLiveOilIntelligence,
  type OilProductionRuntimeDependenciesV1,
} from "../../assets/oil/productionRuntime";
import {
  integrateCanonicalDecisionLifecycleV3,
} from "../../engine/decisionLifecycleRuntime";
import {
  buildCanonicalDecisionSnapshot,
} from "../../engine/decisionPersistence";
import type {
  CanonicalMarketEvaluationV1,
  CanonicalMarketEvaluationRequestV1,
} from "../../engine/marketEvaluationCoordinator";
import {
  normalizeCanonicalObservationSeriesV1,
} from "../../services/canonicalObservationSeries";
import {
  CUTOVER_COMPUTED_AT,
  assertDeep,
  assertEqual,
  cutoverEvaluation,
  cutoverHistory,
} from "../productionCutoverFixtures";

const availableMacroInput: OilMacroInput = Object.freeze({
  inventoriesChangePct: -4,
  productionChangePct: -2,
  globalDemandChangePct: 2,
  usdChangePct: null,
  observedAt: Object.freeze({
    inventories: "2026-W34",
    production: "2026-W33",
    globalDemand: "2026-Q2",
    usd: null,
  }),
});
const partialMacroInput: OilMacroInput = Object.freeze({
  ...availableMacroInput,
  productionChangePct: null,
});
const unavailableMacroInput: OilMacroInput = Object.freeze({
  inventoriesChangePct: null,
  productionChangePct: null,
  globalDemandChangePct: null,
  usdChangePct: null,
});

function officialWtiSeries(count: number) {
  const history = cutoverHistory(count, 65);

  return normalizeCanonicalObservationSeriesV1({
    observations: history.map((observation) => ({
      timestamp: observation.timestamp,
      value: observation.close,
    })),
    metadata: {
      provider: "eia",
      source: "U.S. Energy Information Administration",
      seriesId: "PET.RWTC.D",
      requestedProductId: "RWTC",
      canonicalProductId: "oil",
      interval: "1d",
      fetchedAt: 1_800_000_000,
      sourceTimestamp: history.at(-1)?.timestamp,
      status: "end_of_day",
      unit: "USD/barrel",
      seriesKind: "spot-price",
    },
  });
}

interface Counters {
  coordinator: number;
  macroLoader: number;
  macroCalculation: number;
  genericRuntime: number;
  regimeRead: number;
  regimeAppend: number;
  lifecycle: number;
  decisionPersistence: number;
  mapper: number;
}

function counters(): Counters {
  return {
    coordinator: 0,
    macroLoader: 0,
    macroCalculation: 0,
    genericRuntime: 0,
    regimeRead: 0,
    regimeAppend: 0,
    lifecycle: 0,
    decisionPersistence: 0,
    mapper: 0,
  };
}

function productionDependencies(
  evaluation: CanonicalMarketEvaluationV1,
  macroInput: OilMacroInput,
  calls: Counters,
): OilProductionRuntimeDependenciesV1 {
  return {
    coordinateMarketEvaluation: async (
      request: CanonicalMarketEvaluationRequestV1,
    ) => {
      calls.coordinator += 1;
      assertDeep(request.targetAssetIds, ["oil"], "coordinator target");
      assertEqual(request.interval, "1d", "coordinator interval");
      assertEqual(request.history.kind, "required-observations", "history policy");
      if (request.history.kind !== "required-observations") {
        throw new Error("Expected required-observations history policy.");
      }
      assertEqual(request.history.requiredObservationCount, 200, "history minimum");
      assertEqual(request.history.range, "5y", "history range");
      return evaluation;
    },
    loadMacroInput: async () => {
      calls.macroLoader += 1;
      return macroInput;
    },
    calculateMacro: (input) => {
      calls.macroCalculation += 1;
      return calculateOilMacro(input);
    },
    evaluatePrepared: (canonicalEvaluation, macro) => {
      calls.genericRuntime += 1;
      return evaluatePreparedOilV1(canonicalEvaluation, macro);
    },
    readLatestRegime: async () => {
      calls.regimeRead += 1;
      return null;
    },
    appendRegime: async () => {
      calls.regimeAppend += 1;
    },
    integrateDecisionLifecycle: async (input) => {
      calls.lifecycle += 1;
      return integrateCanonicalDecisionLifecycleV3(input);
    },
    advanceDecisionSnapshot: async () => {
      calls.decisionPersistence += 1;
      return { status: "initialized", previous: null };
    },
    mapCompatibility: (input) => {
      calls.mapper += 1;
      return mapOilCompatibilityV1(input);
    },
  };
}

function unavailableEvaluation(): CanonicalMarketEvaluationV1 {
  const base = cutoverEvaluation("oil", cutoverHistory(200, 65));
  const source = base.snapshot.assets[0]!;
  const asset = Object.freeze({
    ...source,
    observations: Object.freeze([]),
    observationCount: 0,
    availability: "unavailable" as const,
    status: "unavailable" as const,
    reason: "Offline history unavailable.",
  });

  return Object.freeze({
    ...base,
    availability: "unavailable" as const,
    snapshot: Object.freeze({
      ...base.snapshot,
      assets: Object.freeze([asset]),
      availability: "unavailable" as const,
      reason: "Offline history unavailable.",
    }),
  });
}

async function expectFailure(
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> {
  let failed = false;

  try {
    await operation();
  } catch {
    failed = true;
  }

  assertEqual(failed, true, label);
}

function assertHistoryShortCircuit(calls: Counters, label: string): void {
  assertEqual(calls.coordinator, 1, `${label} coordinator`);
  assertEqual(calls.macroLoader, 0, `${label} Macro loader`);
  assertEqual(calls.macroCalculation, 0, `${label} Macro calculation`);
  assertEqual(calls.genericRuntime, 0, `${label} Generic Runtime`);
  assertEqual(calls.regimeRead, 0, `${label} Regime read`);
  assertEqual(calls.regimeAppend, 0, `${label} Regime append`);
  assertEqual(calls.lifecycle, 0, `${label} lifecycle`);
  assertEqual(calls.decisionPersistence, 0, `${label} Decision persistence`);
  assertEqual(calls.mapper, 0, `${label} mapper`);
}

function assertOfficialSourceContract(): void {
  const production = readFileSync(
    "src/lib/markets/assets/oil/productionRuntime.ts",
    "utf8",
  );
  const cache = readFileSync(
    "src/lib/markets/providers/eia/wtiPriceSeriesCache.ts",
    "utf8",
  );

  assertEqual(production.includes("getEiaWtiPriceSeriesV1"), true, "official WTI loader active");
  assertEqual(production.includes("createCanonicalMarketSnapshotV1"), true, "observation snapshot active");
  assertEqual(production.includes("historicalMarketData"), false, "historical service absent");
  assertEqual(production.includes("getHistoricalMarketData"), false, "historical loader absent");
  assertEqual(production.includes("Yahoo"), false, "Yahoo absent from Oil production");
  assertEqual(production.includes("CL=F"), false, "CL=F absent from Oil production");
  assertEqual(cache.includes("unstable_cache"), true, "shared server cache configured");
  assertEqual(cache.includes("6 * 60 * 60"), true, "six-hour EIA WTI cache cadence");
  assertEqual(
    cache.match(/loadEiaWtiPriceSeriesV1\(\)/g)?.length,
    1,
    "one upstream adapter call per cache fill",
  );
}

async function main(): Promise<void> {
  assertOfficialSourceContract();

  const officialCalls = counters();
  let primarySeriesCalls = 0;
  const officialResult = await getCanonicalLiveOilIntelligence({
    ...productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(200, 65)),
      availableMacroInput,
      officialCalls,
    ),
    coordinateMarketEvaluation: undefined,
    loadPrimaryMarketSeries: async () => {
      primarySeriesCalls += 1;
      return officialWtiSeries(200);
    },
  });
  assertEqual(primarySeriesCalls, 1, "official primary series loaded once");
  assertEqual(officialCalls.coordinator, 0, "test coordinator bypassed by production path");
  assertEqual(officialResult.engineResult.symbol, OIL_CANONICAL_PRODUCT_ID, "canonical WTI product identity");
  assertEqual(officialResult.marketData.provider, "eia", "production EIA provider");
  assertEqual(officialResult.marketData.status, "end_of_day", "production daily delivery status");
  assertEqual(officialResult.marketData.provenance?.provider, "eia", "production EIA provenance");
  assertEqual(officialResult.macro.coverage, 0.85, "official path Macro coverage unchanged");
  assertEqual(officialResult.macro.canonical.availability, "partial", "official path Macro partiality");
  if (officialResult.macro.canonical.availability !== "partial") {
    throw new Error("Expected partial Oil Macro on the official WTI path.");
  }
  assertEqual(officialResult.macro.canonical.missing.join(","), "usd", "official path USD remains missing");
  assertEqual(
    officialResult.engineResult.confidence.availability === "unavailable",
    false,
    "genuine partial Macro retains usable Data Confidence",
  );

  const primaryFailureCalls = counters();
  let failedPrimaryCalls = 0;
  await expectFailure(
    () => getCanonicalLiveOilIntelligence({
      ...productionDependencies(
        cutoverEvaluation("oil", cutoverHistory(200, 65)),
        availableMacroInput,
        primaryFailureCalls,
      ),
      coordinateMarketEvaluation: undefined,
      loadPrimaryMarketSeries: async () => {
        failedPrimaryCalls += 1;
        throw new Error("Injected EIA WTI failure.");
      },
    }),
    "EIA WTI failure rejects without fallback",
  );
  assertEqual(failedPrimaryCalls, 1, "failed EIA primary attempted once");
  assertEqual(primaryFailureCalls.coordinator, 0, "no alternate coordinator fallback");
  assertEqual(primaryFailureCalls.macroLoader, 0, "primary failure short-circuits Macro");
  assertEqual(primaryFailureCalls.genericRuntime, 0, "primary failure short-circuits Engine");

  const unavailableCalls = counters();
  await expectFailure(
    () => getCanonicalLiveOilIntelligence(
      productionDependencies(
        unavailableEvaluation(),
        availableMacroInput,
        unavailableCalls,
      ),
    ),
    "unavailable history rejects",
  );
  assertHistoryShortCircuit(unavailableCalls, "unavailable history");

  const insufficientCalls = counters();
  await expectFailure(
    () => getCanonicalLiveOilIntelligence(
      productionDependencies(
        cutoverEvaluation("oil", cutoverHistory(199, 65)),
        availableMacroInput,
        insufficientCalls,
      ),
    ),
    "199 observations reject",
  );
  assertHistoryShortCircuit(insufficientCalls, "199 observations");

  const invalidCalls = counters();
  const invalidHistory = [...cutoverHistory(200, 65)];
  invalidHistory[199] = Object.freeze({
    ...invalidHistory[199]!,
    timestamp: invalidHistory[198]!.timestamp,
  });
  await expectFailure(
    () => getCanonicalLiveOilIntelligence(
      productionDependencies(
        cutoverEvaluation("oil", invalidHistory),
        availableMacroInput,
        invalidCalls,
      ),
    ),
    "invalid observations reject",
  );
  assertHistoryShortCircuit(invalidCalls, "invalid observations");

  const minimumCalls = counters();
  const minimumResult = await getCanonicalLiveOilIntelligence(
    productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(200, 65)),
      availableMacroInput,
      minimumCalls,
    ),
  );
  assertEqual(minimumResult.marketData.window?.receivedPoints, 200, "minimum history retained");
  assertEqual(minimumResult.engineResult.evaluatedAt, CUTOVER_COMPUTED_AT, "canonical evaluatedAt");
  assertEqual(minimumResult.regimeMemory.current.timestamp, CUTOVER_COMPUTED_AT, "Regime timestamp");
  assertEqual(minimumResult.engineResult.crossAsset.availability, "not-applicable", "Oil Cross-Asset");
  assertEqual(minimumResult.engineResult.scenario.availability, "partial", "Oil Scenario synthesis");
  assertEqual(minimumResult.engineResult.invalidation.availability, "partial", "Oil Invalidation synthesis");
  assertEqual(minimumResult.engineResult.recommendation.availability, "partial", "Oil Recommendation synthesis");

  const excessCalls = counters();
  const excessResult = await getCanonicalLiveOilIntelligence(
    productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(675, 65)),
      availableMacroInput,
      excessCalls,
    ),
  );
  assertEqual(excessResult.marketData.window?.receivedPoints, 675, "excess history metadata");
  assertEqual(excessResult.engineResult.marketData.historicalWindow?.receivedPoints, 675, "excess Engine history metadata");

  const partialCalls = counters();
  const partialResult = await getCanonicalLiveOilIntelligence(
    productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(260, 65)),
      partialMacroInput,
      partialCalls,
    ),
  );
  assertEqual(partialResult.macro.canonical.availability, "partial", "partial Macro sidecar");
  assertEqual(partialResult.macro.coverage, 0.6, "partial Macro coverage");
  assertEqual(partialResult.macro.drivers.usd.available, false, "USD explicitly unavailable");

  const macroUnavailableCalls = counters();
  const macroUnavailableResult = await getCanonicalLiveOilIntelligence(
    productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(260, 65)),
      unavailableMacroInput,
      macroUnavailableCalls,
    ),
  );
  assertEqual(macroUnavailableResult.macro.canonical.availability, "unavailable", "unavailable Macro sidecar");
  assertEqual(macroUnavailableResult.engineResult.macro.availability, "unavailable", "unavailable Engine Macro");

  const readFailureCalls = counters();
  let readFailureDecision = "";
  const readFailureDependencies: OilProductionRuntimeDependenciesV1 = {
    ...productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(260, 65)),
      availableMacroInput,
      readFailureCalls,
    ),
    readLatestRegime: async () => {
      readFailureCalls.regimeRead += 1;
      throw new Error("Regime read failed.");
    },
    evaluatePrepared: (evaluation, macro) => {
      readFailureCalls.genericRuntime += 1;
      const result = evaluatePreparedOilV1(evaluation, macro);
      if (result.availability === "available") {
        readFailureDecision = JSON.stringify(result.engineResult.decision);
      }
      return result;
    },
  };
  const readFailureResult = await getCanonicalLiveOilIntelligence(readFailureDependencies);
  assertEqual(readFailureResult.engineResult.regime.availability, "partial", "read failure Regime");
  assertEqual(readFailureCalls.regimeRead, 1, "read failure reads once");
  assertEqual(readFailureCalls.regimeAppend, 0, "read failure does not append");
  assertEqual(JSON.stringify(readFailureResult.engineResult.decision), readFailureDecision, "read failure Decision preserved");

  const appendFailureCalls = counters();
  let appendFailureDecision = "";
  const appendFailureDependencies: OilProductionRuntimeDependenciesV1 = {
    ...productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(260, 65)),
      availableMacroInput,
      appendFailureCalls,
    ),
    appendRegime: async () => {
      appendFailureCalls.regimeAppend += 1;
      throw new Error("Regime append failed.");
    },
    evaluatePrepared: (evaluation, macro) => {
      appendFailureCalls.genericRuntime += 1;
      const result = evaluatePreparedOilV1(evaluation, macro);
      if (result.availability === "available") {
        appendFailureDecision = JSON.stringify(result.engineResult.decision);
      }
      return result;
    },
  };
  const appendFailureResult = await getCanonicalLiveOilIntelligence(appendFailureDependencies);
  assertEqual(appendFailureResult.engineResult.regime.availability, "partial", "append failure Regime");
  assertEqual(appendFailureCalls.regimeRead, 1, "append failure reads once");
  assertEqual(appendFailureCalls.regimeAppend, 1, "append failure appends once");
  assertEqual(JSON.stringify(appendFailureResult.engineResult.decision), appendFailureDecision, "append failure Decision preserved");

  const decisionFailureCalls = counters();
  let decisionFailureRaw = "";
  const decisionFailureDependencies: OilProductionRuntimeDependenciesV1 = {
    ...productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(260, 65)),
      availableMacroInput,
      decisionFailureCalls,
    ),
    evaluatePrepared: (evaluation, macro) => {
      decisionFailureCalls.genericRuntime += 1;
      const result = evaluatePreparedOilV1(evaluation, macro);
      if (result.availability === "available") {
        decisionFailureRaw = JSON.stringify(result.engineResult.decision);
      }
      return result;
    },
    advanceDecisionSnapshot: async () => {
      decisionFailureCalls.decisionPersistence += 1;
      throw new Error("Decision persistence failed.");
    },
  };
  const decisionFailureResult = await getCanonicalLiveOilIntelligence(decisionFailureDependencies);
  assertEqual(decisionFailureResult.engineResult.decisionLifecycle.availability, "unavailable", "Decision failure lifecycle");
  assertEqual(JSON.stringify(decisionFailureResult.engineResult.decision), decisionFailureRaw, "Decision failure preserves Decision");

  const staleCalls = counters();
  let staleCurrentDecision = "";
  const staleDependencies: OilProductionRuntimeDependenciesV1 = {
    ...productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(260, 65)),
      availableMacroInput,
      staleCalls,
    ),
    evaluatePrepared: (evaluation, macro) => {
      staleCalls.genericRuntime += 1;
      const result = evaluatePreparedOilV1(evaluation, macro);
      if (result.availability === "available") {
        staleCurrentDecision = JSON.stringify(result.engineResult.decision);
      }
      return result;
    },
    advanceDecisionSnapshot: async (snapshot) => {
      staleCalls.decisionPersistence += 1;
      return {
        status: "stale",
        previous: buildCanonicalDecisionSnapshot({
          assetId: "oil",
          computedAt: snapshot.computedAt,
          decision: snapshot.decision,
        }),
      };
    },
  };
  const staleResult = await getCanonicalLiveOilIntelligence(staleDependencies);
  assertEqual(staleResult.engineResult.decisionLifecycle.availability, "unavailable", "stale lifecycle");
  assertEqual(JSON.stringify(staleResult.engineResult.decision), staleCurrentDecision, "stale preserves Decision");

  const genericUnavailableCalls = counters();
  const genericUnavailableDependencies: OilProductionRuntimeDependenciesV1 = {
    ...productionDependencies(
      cutoverEvaluation("oil", cutoverHistory(260, 65)),
      availableMacroInput,
      genericUnavailableCalls,
    ),
    evaluatePrepared: (evaluation) => {
      genericUnavailableCalls.genericRuntime += 1;
      return {
        availability: "unavailable",
        assetId: "oil",
        computedAt: evaluation.computedAt,
        reason: "Forced Generic Runtime unavailability.",
      };
    },
  };
  await expectFailure(
    () => getCanonicalLiveOilIntelligence(genericUnavailableDependencies),
    "Generic Runtime unavailable rejects",
  );
  assertEqual(genericUnavailableCalls.genericRuntime, 1, "unavailable Generic Runtime once");
  assertEqual(genericUnavailableCalls.regimeRead, 0, "unavailable Generic skips Regime");
  assertEqual(genericUnavailableCalls.lifecycle, 0, "unavailable Generic skips lifecycle");
  assertEqual(genericUnavailableCalls.mapper, 0, "unavailable Generic skips mapper");

  const cacheCalls = counters();
  const cacheDependencies = productionDependencies(
    cutoverEvaluation("oil", cutoverHistory(260, 65)),
    availableMacroInput,
    cacheCalls,
  );
  let cachedBodyResult: ReturnType<typeof getCanonicalLiveOilIntelligence> | undefined;
  const simulatedCachedBody = () => {
    cachedBodyResult ??= getCanonicalLiveOilIntelligence(cacheDependencies);
    return cachedBodyResult;
  };
  const filled = await simulatedCachedBody();
  assertDeep(cacheCalls, {
    coordinator: 1,
    macroLoader: 1,
    macroCalculation: 1,
    genericRuntime: 1,
    regimeRead: 1,
    regimeAppend: 1,
    lifecycle: 1,
    decisionPersistence: 1,
    mapper: 1,
  }, "cache-fill counters");
  const callsAfterFill = JSON.stringify(cacheCalls);
  const hit = await simulatedCachedBody();
  assertEqual(hit, filled, "cache hit reuses result identity");
  assertEqual(JSON.stringify(cacheCalls), callsAfterFill, "cache hit performs no repeated work");

  assertEqual(oilProfile.historyLimit, 600, "Oil calculation window remains 600");
  console.log("PASS: Oil Production Runtime V1");
}

void main();
