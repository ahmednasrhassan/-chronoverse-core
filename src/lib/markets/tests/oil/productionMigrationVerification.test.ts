import { readFileSync } from "node:fs";

import {
  calculateOilMacro,
  type OilMacroInput,
} from "../../assets/oil/macro";
import {
  evaluatePreparedOilV1,
  mapOilCompatibilityV1,
  prepareOilMacroEvidenceV1,
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
  type AdvanceDecisionSnapshotResult,
} from "../../engine/decisionPersistence";
import {
  prepareAssetEvaluationV1,
} from "../../engine/preparedAssetEvaluation";
import type {
  CanonicalMarketEvaluationV1,
} from "../../engine/marketEvaluationCoordinator";
import {
  CUTOVER_COMPUTED_AT,
  assertDeep,
  assertEqual,
  cutoverEvaluation,
  cutoverHistory,
} from "../productionCutoverFixtures";

const fullMacroInput: OilMacroInput = Object.freeze({
  inventoriesChangePct: -4,
  productionChangePct: -2,
  globalDemandChangePct: 2,
  usdChangePct: -1,
});
const productionMacroInput: OilMacroInput = Object.freeze({
  ...fullMacroInput,
  usdChangePct: null,
});
const unavailableMacroInput: OilMacroInput = Object.freeze({
  inventoriesChangePct: null,
  productionChangePct: null,
  globalDemandChangePct: null,
  usdChangePct: null,
});

type LifecycleMode =
  | "initialized"
  | "advanced"
  | "unchanged"
  | "stale"
  | "failure";
type RegimeFailure = "none" | "read" | "append";

interface VerificationCounts {
  coordinator: number;
  history: number;
  macroLoad: number;
  macroCalculation: number;
  genericRuntime: number;
  regimeRead: number;
  regimeAppend: number;
  lifecycle: number;
  decisionPersistence: number;
  mapper: number;
  generatedAt: number;
}

interface VerificationCapture {
  preparedComputedAt: string | null;
  rawDecision: string | null;
  regimeTimestamp: string | null;
  decisionTimestamp: string | null;
  events: string[];
}

function createCounts(): VerificationCounts {
  return {
    coordinator: 0,
    history: 0,
    macroLoad: 0,
    macroCalculation: 0,
    genericRuntime: 0,
    regimeRead: 0,
    regimeAppend: 0,
    lifecycle: 0,
    decisionPersistence: 0,
    mapper: 0,
    generatedAt: 0,
  };
}

function createCapture(): VerificationCapture {
  return {
    preparedComputedAt: null,
    rawDecision: null,
    regimeTimestamp: null,
    decisionTimestamp: null,
    events: [],
  };
}

function verificationDependencies(input: {
  evaluation: CanonicalMarketEvaluationV1;
  macroInput: OilMacroInput;
  counts: VerificationCounts;
  capture: VerificationCapture;
  lifecycleMode?: LifecycleMode;
  regimeFailure?: RegimeFailure;
}): OilProductionRuntimeDependenciesV1 {
  const lifecycleMode = input.lifecycleMode ?? "initialized";
  const regimeFailure = input.regimeFailure ?? "none";

  return {
    coordinateMarketEvaluation: async (request) => {
      input.counts.coordinator += 1;
      input.counts.history += 1;
      input.capture.events.push("history");
      assertDeep(request.targetAssetIds, ["oil"], "active target");
      assertEqual(request.interval, "1d", "active interval");
      assertEqual(request.history.kind, "required-observations", "active history kind");
      if (request.history.kind !== "required-observations") {
        throw new Error("Expected required-observations history.");
      }
      assertEqual(request.history.requiredObservationCount, 200, "active history minimum");
      assertEqual(request.history.range, "5y", "active history range");
      return input.evaluation;
    },
    loadMacroInput: async () => {
      input.counts.macroLoad += 1;
      input.capture.events.push("macro-load");
      return input.macroInput;
    },
    calculateMacro: (macroInput) => {
      input.counts.macroCalculation += 1;
      input.capture.events.push("macro-calculation");
      return calculateOilMacro(macroInput);
    },
    evaluatePrepared: (evaluation, macro) => {
      input.counts.genericRuntime += 1;
      input.capture.events.push("generic-runtime");
      const prepared = prepareAssetEvaluationV1(
        evaluation,
        "oil",
        prepareOilMacroEvidenceV1(macro),
      );
      input.capture.preparedComputedAt = prepared.computedAt;
      const result = evaluatePreparedOilV1(evaluation, macro);
      if (result.availability === "available") {
        input.capture.rawDecision = JSON.stringify(result.engineResult.decision);
      }
      return result;
    },
    readLatestRegime: async () => {
      input.counts.regimeRead += 1;
      input.capture.events.push("regime-read");
      if (regimeFailure === "read") {
        throw new Error("Injected Regime read failure.");
      }
      return null;
    },
    appendRegime: async (current) => {
      input.counts.regimeAppend += 1;
      input.capture.regimeTimestamp = current.timestamp;
      input.capture.events.push("regime-append");
      if (regimeFailure === "append") {
        throw new Error("Injected Regime append failure.");
      }
    },
    integrateDecisionLifecycle: async (lifecycleInput) => {
      input.counts.lifecycle += 1;
      input.capture.events.push("lifecycle");
      return integrateCanonicalDecisionLifecycleV3(lifecycleInput);
    },
    advanceDecisionSnapshot: async (snapshot) => {
      input.counts.decisionPersistence += 1;
      input.capture.decisionTimestamp = snapshot.computedAt;
      input.capture.events.push("decision-persistence");

      if (lifecycleMode === "failure") {
        throw new Error("Injected Decision persistence failure.");
      }
      if (lifecycleMode === "initialized") {
        return { status: "initialized", previous: null };
      }

      return {
        status: lifecycleMode,
        previous: buildCanonicalDecisionSnapshot({
          assetId: "oil",
          computedAt: "2026-09-07T11:00:00.000Z",
          decision: snapshot.decision,
        }),
      } satisfies AdvanceDecisionSnapshotResult;
    },
    mapCompatibility: (mappingInput) => {
      input.counts.mapper += 1;
      input.capture.events.push("mapper");
      return mapOilCompatibilityV1(mappingInput);
    },
  };
}

function finalCacheSimulation(
  dependencies: OilProductionRuntimeDependenciesV1,
  counts: VerificationCounts,
  capture: VerificationCapture,
) {
  let cached:
    | Promise<{
        readonly generatedAt: string;
        readonly intelligence: Awaited<
          ReturnType<typeof getCanonicalLiveOilIntelligence>
        >;
      }>
    | undefined;

  return () => {
    cached ??= (async () => {
      const intelligence = await getCanonicalLiveOilIntelligence(dependencies);
      capture.events.push("generated-at");
      counts.generatedAt += 1;
      return {
        generatedAt: "2026-09-07T12:00:01.000Z",
        intelligence,
      };
    })();
    return cached;
  };
}

async function expectHistoryFailure(count: number): Promise<void> {
  const counts = createCounts();
  const capture = createCapture();
  const getCached = finalCacheSimulation(
    verificationDependencies({
      evaluation: cutoverEvaluation("oil", cutoverHistory(count, 65)),
      macroInput: productionMacroInput,
      counts,
      capture,
    }),
    counts,
    capture,
  );
  let failed = false;

  try {
    await getCached();
  } catch {
    failed = true;
  }

  assertEqual(failed, true, `${count} history rejects`);
  assertDeep(counts, {
    coordinator: 1,
    history: 1,
    macroLoad: 0,
    macroCalculation: 0,
    genericRuntime: 0,
    regimeRead: 0,
    regimeAppend: 0,
    lifecycle: 0,
    decisionPersistence: 0,
    mapper: 0,
    generatedAt: 0,
  }, `${count} history short-circuit`);
}

async function lifecycleCase(
  lifecycleMode: LifecycleMode,
  regimeFailure: RegimeFailure = "none",
) {
  const counts = createCounts();
  const capture = createCapture();
  const result = await getCanonicalLiveOilIntelligence(
    verificationDependencies({
      evaluation: cutoverEvaluation("oil", cutoverHistory(200, 65)),
      macroInput: productionMacroInput,
      lifecycleMode,
      regimeFailure,
      counts,
      capture,
    }),
  );

  assertEqual(counts.decisionPersistence, 1, `${lifecycleMode} persistence count`);
  assertEqual(
    JSON.stringify(result.engineResult.decision),
    capture.rawDecision,
    `${lifecycleMode} current Decision identity`,
  );
  return { result, counts, capture };
}

function assertRouteAndImportSafety(): void {
  const route = readFileSync(
    "src/app/api/markets/oil/intelligence/route.ts",
    "utf8",
  );
  const production = readFileSync(
    "src/lib/markets/assets/oil/productionRuntime.ts",
    "utf8",
  );
  const generic = readFileSync(
    "src/lib/markets/engine/genericAssetRuntime.ts",
    "utf8",
  );
  const macroData = readFileSync(
    "src/lib/markets/assets/oil/macroData.ts",
    "utf8",
  );

  assertEqual(route.includes("assets/oil/productionRuntime"), true, "active route import");
  assertEqual(route.includes("assets/oil/runtime"), false, "legacy route import absent");
  assertEqual(route.match(/unstable_cache/g)?.length, 2, "single final cache import/call");
  assertEqual(route.includes("60 * 60"), true, "one-hour final cache");
  assertEqual(
    route.indexOf("await getCanonicalLiveOilIntelligence()") <
      route.indexOf("new Date().toISOString()"),
    true,
    "generatedAt follows mapped intelligence",
  );

  const success = route.slice(route.indexOf("ok: true"), route.indexOf("status: 200"));
  const failure = route.slice(route.indexOf("ok: false"), route.indexOf("status: 500"));
  for (const key of ["ok", "asset", "generatedAt", "cached", "stale", "intelligence"]) {
    assertEqual(success.includes(`${key}:`), true, `success key ${key}`);
  }
  for (const key of ["ok", "asset", "error"]) {
    assertEqual(failure.includes(`${key}:`), true, `error key ${key}`);
  }
  assertEqual(production.includes("getHistoricalMarketData"), false, "no direct history acquisition");
  assertEqual(production.includes("getEiaOilFundamentals"), false, "no direct EIA acquisition");
  assertEqual(production.includes("unstable_cache"), false, "no nested final cache");
  assertEqual(production.includes("setInterval"), false, "no polling");
  assertEqual(production.includes("cron"), false, "no cron");
  assertEqual(macroData.includes("getEiaOilFundamentals"), true, "normalized EIA handoff");
  assertEqual(generic.includes("providers/"), false, "Generic Runtime provider-free");
  assertEqual(generic.includes("redis"), false, "Generic Runtime Redis-free");
}

async function main(): Promise<void> {
  assertRouteAndImportSafety();
  await expectHistoryFailure(0);
  await expectHistoryFailure(199);

  const counts = createCounts();
  const capture = createCapture();
  const getCached = finalCacheSimulation(
    verificationDependencies({
      evaluation: cutoverEvaluation("oil", cutoverHistory(200, 65)),
      macroInput: productionMacroInput,
      counts,
      capture,
    }),
    counts,
    capture,
  );
  const filled = await getCached();
  assertDeep(counts, {
    coordinator: 1,
    history: 1,
    macroLoad: 1,
    macroCalculation: 1,
    genericRuntime: 1,
    regimeRead: 1,
    regimeAppend: 1,
    lifecycle: 1,
    decisionPersistence: 1,
    mapper: 1,
    generatedAt: 1,
  }, "fresh cache-fill counts");
  assertDeep(
    capture.events,
    [
      "history",
      "macro-load",
      "macro-calculation",
      "generic-runtime",
      "regime-read",
      "regime-append",
      "lifecycle",
      "decision-persistence",
      "mapper",
      "generated-at",
    ],
    "fresh production order",
  );
  assertEqual(capture.preparedComputedAt, CUTOVER_COMPUTED_AT, "prepared timestamp");
  assertEqual(filled.intelligence.engineResult.evaluatedAt, CUTOVER_COMPUTED_AT, "Engine timestamp");
  assertEqual(capture.regimeTimestamp, CUTOVER_COMPUTED_AT, "Regime timestamp");
  assertEqual(capture.decisionTimestamp, CUTOVER_COMPUTED_AT, "Decision timestamp");
  assertEqual(filled.generatedAt, "2026-09-07T12:00:01.000Z", "generatedAt value");
  assertEqual(filled.intelligence.engineResult.crossAsset.availability, "not-applicable", "Oil Cross-Asset");
  assertDeep(
    Object.keys(filled.intelligence).sort(),
    [
      "confidence",
      "engineResult",
      "macro",
      "marketData",
      "price",
      "profileId",
      "regimeMemory",
      "risk",
      "signal",
      "state",
      "technical",
    ],
    "public intelligence keys",
  );
  const countSnapshot = JSON.stringify(counts);
  const hit = await getCached();
  assertEqual(hit, filled, "cache hit result identity");
  assertEqual(JSON.stringify(counts), countSnapshot, "cache hit zero additional work");

  const excessCounts = createCounts();
  const excessCapture = createCapture();
  const excess = await getCanonicalLiveOilIntelligence(
    verificationDependencies({
      evaluation: cutoverEvaluation("oil", cutoverHistory(601, 65)),
      macroInput: productionMacroInput,
      counts: excessCounts,
      capture: excessCapture,
    }),
  );
  const latestCounts = createCounts();
  const latestCapture = createCapture();
  const latest600 = await getCanonicalLiveOilIntelligence(
    verificationDependencies({
      evaluation: cutoverEvaluation(
        "oil",
        cutoverHistory(601, 65).slice(-600),
      ),
      macroInput: productionMacroInput,
      counts: latestCounts,
      capture: latestCapture,
    }),
  );
  assertEqual(excess.marketData.window?.receivedPoints, 601, "601 source metadata");
  assertDeep(excess.technical, latest600.technical, "601 uses latest 600 Technical");
  assertDeep(excess.risk, latest600.risk, "601 uses latest 600 Risk");
  assertDeep(excess.signal, latest600.signal, "601 uses latest 600 Signal");
  assertEqual(excessCounts.history, 1, "601 history acquisition count");

  const available = calculateOilMacro(fullMacroInput);
  const partial = calculateOilMacro(productionMacroInput);
  const unavailable = calculateOilMacro(unavailableMacroInput);
  assertEqual(available.canonical.availability, "available", "available Macro");
  assertEqual(partial.canonical.availability, "partial", "partial Macro");
  assertEqual(partial.drivers.usd.available, false, "production USD unavailable");
  assertEqual(unavailable.canonical.availability, "unavailable", "unavailable Macro");

  const readFailure = await lifecycleCase("initialized", "read");
  assertEqual(readFailure.result.engineResult.regime.availability, "partial", "read failure Regime");
  assertEqual(readFailure.counts.regimeRead, 1, "read failure count");
  assertEqual(readFailure.counts.regimeAppend, 0, "read failure append skipped");
  assertEqual(readFailure.counts.lifecycle, 1, "read failure lifecycle continues");

  const appendFailure = await lifecycleCase("initialized", "append");
  assertEqual(appendFailure.result.engineResult.regime.availability, "partial", "append failure Regime");
  assertEqual(appendFailure.counts.regimeRead, 1, "append failure read count");
  assertEqual(appendFailure.counts.regimeAppend, 1, "append failure count");
  assertEqual(appendFailure.counts.lifecycle, 1, "append failure lifecycle continues");

  const initialized = await lifecycleCase("initialized");
  const advanced = await lifecycleCase("advanced");
  const unchanged = await lifecycleCase("unchanged");
  const stale = await lifecycleCase("stale");
  const failure = await lifecycleCase("failure");
  for (const usable of [initialized, advanced, unchanged]) {
    assertEqual(
      ["available", "partial"].includes(
        usable.result.engineResult.decisionLifecycle.availability,
      ),
      true,
      "usable lifecycle result",
    );
  }
  assertEqual(stale.result.engineResult.decisionLifecycle.availability, "unavailable", "stale lifecycle");
  assertEqual(failure.result.engineResult.decisionLifecycle.availability, "unavailable", "failure lifecycle");

  const routeSuccessEnvelope = {
    ok: true,
    asset: "oil",
    generatedAt: filled.generatedAt,
    cached: true,
    stale: false,
    intelligence: filled.intelligence,
  };
  assertDeep(
    Object.keys(routeSuccessEnvelope),
    ["ok", "asset", "generatedAt", "cached", "stale", "intelligence"],
    "route success envelope",
  );
  assertDeep(
    Object.keys({
      ok: false,
      asset: "oil",
      error: "Oil intelligence is temporarily unavailable.",
    }),
    ["ok", "asset", "error"],
    "route error envelope",
  );

  console.log("PASS: Oil Production Migration Verification");
}

void main();
