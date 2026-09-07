import { readFileSync } from "node:fs";

import {
  getGoldMacroSnapshot,
  GOLD_MACRO_SERIES,
} from "../../assets/gold/macro";
import {
  calculateGoldMacroScore,
} from "../../assets/gold/macroScore";
import {
  evaluatePreparedGoldV1,
  mapGoldCompatibilityV1,
} from "../../assets/gold/productionCutover";
import {
  getCanonicalLiveGoldIntelligence,
  type GoldProductionRuntimeDependenciesV1,
} from "../../assets/gold/productionRuntime";
import {
  integrateCanonicalDecisionLifecycleV3,
} from "../../engine/decisionLifecycleRuntime";
import {
  buildCanonicalDecisionSnapshot,
  type AdvanceDecisionSnapshotResult,
} from "../../engine/decisionPersistence";
import type {
  CanonicalMarketEvaluationV1,
} from "../../engine/marketEvaluationCoordinator";
import type {
  EconomicSeriesProvider,
  FredObservation,
  FredSeries,
} from "../../providers/fred/types";
import {
  CUTOVER_COMPUTED_AT,
  assertDeep,
  assertEqual,
  cutoverEvaluation,
  cutoverHistory,
} from "../productionCutoverFixtures";

type FredBehavior = FredObservation | null | Error;
type LifecycleMode =
  | "initialized"
  | "advanced"
  | "unchanged"
  | "stale"
  | "failure";
type RegimeFailure = "none" | "read" | "append";

const observations = Object.freeze({
  DFII10: Object.freeze({ date: "2026-09-04", value: 1.5 }),
  DGS10: Object.freeze({ date: "2026-09-03", value: 4 }),
  DTWEXBGS: Object.freeze({ date: "2026-09-02", value: 103 }),
  T10YIE: Object.freeze({ date: "2026-09-01", value: 2.6 }),
});

interface Counts {
  coordinator: number;
  history: number;
  fredGroup: number;
  fredAttempts: number;
  macroCalculation: number;
  genericRuntime: number;
  regimeRead: number;
  regimeAppend: number;
  lifecycle: number;
  decisionPersistence: number;
  mapper: number;
  generatedAt: number;
}

interface Capture {
  rawDecision: string | null;
  regimeTimestamp: string | null;
  decisionTimestamp: string | null;
  events: string[];
}

class FakeFredProvider implements EconomicSeriesProvider {
  readonly id = "fake-fred";

  constructor(
    private readonly behavior: Readonly<Record<string, FredBehavior>>,
    private readonly counts: Counts,
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async getSeries(): Promise<FredSeries> {
    throw new Error("Gold acquisition must use getLatestValue.");
  }

  async getLatestValue(
    seriesId: string,
  ): Promise<FredObservation | null> {
    this.counts.fredAttempts += 1;
    const result = this.behavior[seriesId];

    if (result instanceof Error) {
      throw result;
    }

    return result ?? null;
  }
}

function createCounts(): Counts {
  return {
    coordinator: 0,
    history: 0,
    fredGroup: 0,
    fredAttempts: 0,
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

function createCapture(): Capture {
  return {
    rawDecision: null,
    regimeTimestamp: null,
    decisionTimestamp: null,
    events: [],
  };
}

function fullFredBehavior(): Record<string, FredBehavior> {
  return {
    [GOLD_MACRO_SERIES.realYield10Y]: observations.DFII10,
    [GOLD_MACRO_SERIES.nominalYield10Y]: observations.DGS10,
    [GOLD_MACRO_SERIES.dollarIndexProxy]: observations.DTWEXBGS,
    [GOLD_MACRO_SERIES.inflationExpectation10Y]: observations.T10YIE,
  };
}

function dependencies(input: {
  evaluation: CanonicalMarketEvaluationV1;
  counts: Counts;
  capture: Capture;
  fred?: Readonly<Record<string, FredBehavior>>;
  regimeFailure?: RegimeFailure;
  lifecycleMode?: LifecycleMode;
}): GoldProductionRuntimeDependenciesV1 {
  const regimeFailure = input.regimeFailure ?? "none";
  const lifecycleMode = input.lifecycleMode ?? "initialized";

  return {
    coordinateMarketEvaluation: async (request) => {
      input.counts.coordinator += 1;
      input.counts.history += 1;
      input.capture.events.push("history");
      assertDeep(request.targetAssetIds, ["gold"], "Gold coordinator target");
      assertEqual(request.interval, "1d", "Gold coordinator interval");
      assertEqual(request.history.kind, "required-observations", "Gold history kind");
      if (request.history.kind !== "required-observations") {
        throw new Error("Expected required-observations history.");
      }
      assertEqual(request.history.requiredObservationCount, 200, "Gold history minimum");
      assertEqual(request.history.range, "5y", "Gold history range");
      return input.evaluation;
    },
    loadMacroSnapshot: async () => {
      input.counts.fredGroup += 1;
      input.capture.events.push("fred");
      return getGoldMacroSnapshot(
        new FakeFredProvider(
          {
            ...fullFredBehavior(),
            ...input.fred,
          },
          input.counts,
        ),
      );
    },
    calculateMacro: (snapshot) => {
      input.counts.macroCalculation += 1;
      input.capture.events.push("macro");
      return calculateGoldMacroScore(snapshot);
    },
    evaluatePrepared: (evaluation, macro) => {
      input.counts.genericRuntime += 1;
      input.capture.events.push("generic-runtime");
      const result = evaluatePreparedGoldV1(evaluation, macro);
      if (result.availability === "available") {
        input.capture.rawDecision = JSON.stringify(result.engineResult.decision);
      }
      return result;
    },
    readLatestRegime: async () => {
      input.counts.regimeRead += 1;
      input.capture.events.push("regime-read");
      if (regimeFailure === "read") {
        throw new Error("Injected Gold Regime read failure.");
      }
      return null;
    },
    appendRegime: async (current) => {
      input.counts.regimeAppend += 1;
      input.capture.regimeTimestamp = current.timestamp;
      input.capture.events.push("regime-append");
      if (regimeFailure === "append") {
        throw new Error("Injected Gold Regime append failure.");
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
        throw new Error("Injected Gold Decision persistence failure.");
      }
      if (lifecycleMode === "initialized") {
        return { status: "initialized", previous: null };
      }

      return {
        status: lifecycleMode,
        previous: buildCanonicalDecisionSnapshot({
          assetId: "gold",
          computedAt: "2026-09-07T11:00:00.000Z",
          decision: snapshot.decision,
        }),
      } satisfies AdvanceDecisionSnapshotResult;
    },
    mapCompatibility: (mappingInput) => {
      input.counts.mapper += 1;
      input.capture.events.push("mapper");
      return mapGoldCompatibilityV1(mappingInput);
    },
  };
}

function cacheSimulation(
  runtimeDependencies: GoldProductionRuntimeDependenciesV1,
  counts: Counts,
  capture: Capture,
) {
  let cached:
    | Promise<{
        readonly generatedAt: string;
        readonly intelligence: Awaited<
          ReturnType<typeof getCanonicalLiveGoldIntelligence>
        >;
      }>
    | undefined;

  return () => {
    cached ??= (async () => {
      const intelligence = await getCanonicalLiveGoldIntelligence(
        runtimeDependencies,
      );
      counts.generatedAt += 1;
      capture.events.push("generated-at");
      return {
        generatedAt: "2026-09-07T12:00:01.000Z",
        intelligence,
      };
    })();
    return cached;
  };
}

async function historyFailure(count: number): Promise<void> {
  const counts = createCounts();
  const capture = createCapture();
  let message = "";

  try {
    await getCanonicalLiveGoldIntelligence(
      dependencies({
        evaluation: cutoverEvaluation("gold", cutoverHistory(count, 1_800)),
        counts,
        capture,
      }),
    );
  } catch (error) {
    message = error instanceof Error ? error.message : "unknown";
  }

  assertEqual(
    message,
    "[Chronoverse Gold] No live gold price history available.",
    `${count} history error compatibility`,
  );
  assertDeep(counts, {
    coordinator: 1,
    history: 1,
    fredGroup: 0,
    fredAttempts: 0,
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

async function runtimeCase(input: {
  fred?: Readonly<Record<string, FredBehavior>>;
  regimeFailure?: RegimeFailure;
  lifecycleMode?: LifecycleMode;
}) {
  const counts = createCounts();
  const capture = createCapture();
  const result = await getCanonicalLiveGoldIntelligence(
    dependencies({
      evaluation: cutoverEvaluation("gold", cutoverHistory(200, 1_800)),
      counts,
      capture,
      ...input,
    }),
  );

  assertEqual(counts.fredAttempts, 4, "runtime FRED attempts");
  assertEqual(counts.decisionPersistence, 1, "runtime Decision persistence");
  assertEqual(
    JSON.stringify(result.engineResult.decision),
    capture.rawDecision,
    "runtime Decision preservation",
  );
  return { result, counts, capture };
}

function assertRouteContract(): void {
  const route = readFileSync(
    "src/app/api/markets/gold/intelligence/route.ts",
    "utf8",
  );
  const production = readFileSync(
    "src/lib/markets/assets/gold/productionRuntime.ts",
    "utf8",
  );

  assertEqual(route.includes("assets/gold/productionRuntime"), true, "active Gold import");
  assertEqual(route.includes("assets/gold/liveFull"), false, "legacy Gold import inactive");
  assertEqual(route.match(/unstable_cache/g)?.length, 2, "single Gold final cache");
  assertEqual(route.includes("revalidate: 3600"), true, "Gold cache cadence");
  assertEqual(
    route.indexOf("await getCanonicalLiveGoldIntelligence()") <
      route.indexOf("new Date().toISOString()"),
    true,
    "Gold generatedAt after mapping",
  );
  assertEqual(production.includes("getHistoricalMarketData"), false, "no direct Gold history");
  assertEqual(production.includes("cacheMode"), false, "no caller-owned history");
  assertEqual(production.includes("runEngineRuntimeV3"), false, "no legacy Engine call");
  assertEqual(production.includes("calculateGoldIntelligence"), false, "no analytical recalculation");

  const success = route.slice(route.indexOf("ok: true"), route.indexOf("status: 200"));
  const failure = route.slice(route.indexOf("ok: false"), route.indexOf("status: 500"));
  for (const key of ["ok", "asset", "generatedAt", "cached", "stale", "intelligence"]) {
    assertEqual(success.includes(`${key}:`), true, `Gold success key ${key}`);
  }
  for (const key of ["ok", "asset", "generatedAt", "error"]) {
    assertEqual(failure.includes(`${key}:`), true, `Gold error key ${key}`);
  }
}

async function main(): Promise<void> {
  assertRouteContract();
  await historyFailure(0);
  await historyFailure(1);
  await historyFailure(199);

  const counts = createCounts();
  const capture = createCapture();
  const cached = cacheSimulation(
    dependencies({
      evaluation: cutoverEvaluation("gold", cutoverHistory(200, 1_800)),
      counts,
      capture,
    }),
    counts,
    capture,
  );
  const filled = await cached();
  assertDeep(counts, {
    coordinator: 1,
    history: 1,
    fredGroup: 1,
    fredAttempts: 4,
    macroCalculation: 1,
    genericRuntime: 1,
    regimeRead: 1,
    regimeAppend: 1,
    lifecycle: 1,
    decisionPersistence: 1,
    mapper: 1,
    generatedAt: 1,
  }, "Gold cache-fill counters");
  assertDeep(capture.events, [
    "history",
    "fred",
    "macro",
    "generic-runtime",
    "regime-read",
    "regime-append",
    "lifecycle",
    "decision-persistence",
    "mapper",
    "generated-at",
  ], "Gold production order");
  assertEqual(filled.intelligence.engineResult.evaluatedAt, CUTOVER_COMPUTED_AT, "Gold Engine timestamp");
  assertEqual(capture.regimeTimestamp, CUTOVER_COMPUTED_AT, "Gold Regime timestamp");
  assertEqual(capture.decisionTimestamp, CUTOVER_COMPUTED_AT, "Gold Decision timestamp");
  assertEqual(filled.generatedAt, "2026-09-07T12:00:01.000Z", "Gold generatedAt");
  assertEqual(filled.intelligence.engineResult.crossAsset.availability, "not-applicable", "Gold Cross-Asset");
  assertDeep(Object.keys(filled.intelligence).sort(), [
    "confidence",
    "engineResult",
    "indicators",
    "macro",
    "price",
    "regimeMemory",
    "risk",
    "signal",
    "state",
    "summary",
    "warnings",
  ], "Gold public keys");
  assertEqual("technical" in filled.intelligence, false, "no public generic Technical");
  const afterFill = JSON.stringify(counts);
  const hit = await cached();
  assertEqual(hit, filled, "Gold cache-hit identity");
  assertEqual(JSON.stringify(counts), afterFill, "Gold cache-hit zero work");

  const excessCounts = createCounts();
  const excessCapture = createCapture();
  const history601 = cutoverHistory(601, 1_800);
  const excess = await getCanonicalLiveGoldIntelligence(
    dependencies({
      evaluation: cutoverEvaluation("gold", history601),
      counts: excessCounts,
      capture: excessCapture,
    }),
  );
  const latestCounts = createCounts();
  const latestCapture = createCapture();
  const latest600 = await getCanonicalLiveGoldIntelligence(
    dependencies({
      evaluation: cutoverEvaluation("gold", history601.slice(-600)),
      counts: latestCounts,
      capture: latestCapture,
    }),
  );
  assertEqual(excess.engineResult.marketData.historicalWindow?.receivedPoints, 601, "Gold 601 metadata");
  assertDeep(excess.indicators, latest600.indicators, "Gold 601 latest-600 indicators");
  assertDeep(excess.risk, latest600.risk, "Gold 601 latest-600 Risk");
  assertDeep(excess.signal, latest600.signal, "Gold 601 latest-600 Signal");
  assertEqual(excessCounts.history, 1, "Gold 601 history count");

  const oneRejection = await runtimeCase({
    fred: { DGS10: new Error("nominal rejected") },
  });
  assertEqual(oneRejection.result.macro.canonical.availability, "partial", "one rejection Macro");
  assertEqual(oneRejection.result.macro.coverage, 0.9, "one rejection coverage");

  const multipleRejections = await runtimeCase({
    fred: {
      DGS10: new Error("nominal rejected"),
      T10YIE: new Error("inflation rejected"),
    },
  });
  assertEqual(multipleRejections.result.macro.coverage, 0.7, "multiple rejection coverage");

  const allRejected = await runtimeCase({
    fred: {
      DFII10: new Error("real rejected"),
      DGS10: new Error("nominal rejected"),
      DTWEXBGS: new Error("USD rejected"),
      T10YIE: new Error("inflation rejected"),
    },
  });
  assertEqual(allRejected.result.macro.canonical.availability, "unavailable", "all-rejected Macro");
  assertDeep(allRejected.result.macro.factors, {
    realYield10Y: null,
    nominalYield10Y: null,
    dollarIndexProxy: null,
    inflationExpectation10Y: null,
  }, "all-rejected factors");

  const mixed = await runtimeCase({
    fred: {
      DGS10: null,
      T10YIE: new Error("inflation rejected"),
    },
  });
  assertEqual(mixed.result.macro.canonical.availability, "partial", "mixed Macro");
  assertEqual(mixed.result.macro.coverage, 0.7, "mixed Macro coverage");

  const readFailure = await runtimeCase({ regimeFailure: "read" });
  assertEqual(readFailure.result.engineResult.regime.availability, "partial", "read failure Regime");
  assertEqual(readFailure.counts.regimeRead, 1, "read failure read count");
  assertEqual(readFailure.counts.regimeAppend, 0, "read failure append skipped");

  const appendFailure = await runtimeCase({ regimeFailure: "append" });
  assertEqual(appendFailure.result.engineResult.regime.availability, "partial", "append failure Regime");
  assertEqual(appendFailure.counts.regimeRead, 1, "append failure read count");
  assertEqual(appendFailure.counts.regimeAppend, 1, "append failure append count");

  const initialized = await runtimeCase({ lifecycleMode: "initialized" });
  const advanced = await runtimeCase({ lifecycleMode: "advanced" });
  const unchanged = await runtimeCase({ lifecycleMode: "unchanged" });
  const stale = await runtimeCase({ lifecycleMode: "stale" });
  const failure = await runtimeCase({ lifecycleMode: "failure" });
  for (const usable of [initialized, advanced, unchanged]) {
    assertEqual(
      ["available", "partial"].includes(
        usable.result.engineResult.decisionLifecycle.availability,
      ),
      true,
      "Gold usable lifecycle",
    );
  }
  assertEqual(stale.result.engineResult.decisionLifecycle.availability, "unavailable", "Gold stale lifecycle");
  assertEqual(failure.result.engineResult.decisionLifecycle.availability, "unavailable", "Gold failed lifecycle");

  console.log("PASS: Gold Production Runtime V1");
}

void main();
