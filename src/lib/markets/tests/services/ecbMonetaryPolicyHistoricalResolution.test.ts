import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import type * as historicalResolution from "../../services/ecbMonetaryPolicyHistoricalResolution";
import * as projections from "../../projections/fiveProductProjections";
import type { FiveProductCanonicalProjectionInputV1 } from "../../projections/types";
import type * as productResults from "../../services/canonicalProductResults";

const E = "2026-09-23T10:00:00.000Z";
const D = "2026-10-30T10:00:00.000Z";
const ids = ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"] as const;
const historicalSource = readFileSync(new URL("../../services/ecbMonetaryPolicyHistoricalResolution.ts", import.meta.url), "utf8");

function compileModule(source: string, requireDependency: (name: string) => unknown): unknown {
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const box = { exports: {} };
  new Function("require", "module", "exports", compiled)(requireDependency, box, box.exports);
  return box.exports;
}

// Load the actual resolver AND its pure clock dependency through the same
// fence. Denials are recorded outside production catch blocks; even swallowed
// attempts to import/read live state must fail the delivery assertions.
function observedHistory(source = historicalSource) {
  const forbiddenDependencies: string[] = [];
  const forbid = (name: string): never => {
    forbiddenDependencies.push(name);
    throw new Error("Forbidden historical dependency: " + name);
  };
  const clock = compileModule(readFileSync(new URL("../../events/eventClock.ts", import.meta.url), "utf8"), forbid);
  const resolver = compileModule(source, (name) =>
    name === "../events/eventClock" ? clock : forbid(name)) as typeof historicalResolution;
  return { resolver, forbiddenDependencies };
}

function canonicalInput(productId: typeof ids[number], evaluatedAt = E): FiveProductCanonicalProjectionInputV1 {
  const timestamp = Date.parse("2026-09-22T00:00:00.000Z") / 1_000;
  const provenance = { provider: "ecb", source: "European Central Bank", seriesId: "test-" + productId,
    requestedProductId: productId, canonicalProductId: productId, interval: "1d", status: "end_of_day",
    unit: productId === "estr" ? "percent" : "EUR reference rate", seriesKind: "reference-rate",
    observationTimestamp: timestamp, sourceTimestamp: timestamp, fetchedAt: timestamp + 60 };
  const canonical = productId === "estr" ? {
    availability: "available", data: {
      productId, temporalQualification: { evaluatedAt }, currentRatePercent: 2,
      latestReferenceDate: "2026-09-22", sourceTimestamp: timestamp, fetchedAt: timestamp + 60,
      source: { provenance, latestObservationMetadata: { publicationType: "standard" } },
      features: {}, signal: { data: {} }, risk: { data: {} },
      marketState: { data: { direction: "neutral", signalStrength: "neutral", riskLevel: "low",
        levelRegime: "positive", volatilityRegime: "low" } },
      engineAdapter: { data: { engineEvidence: {} } },
    },
  } : {
    availability: "available", provenance,
    intelligence: { price: 1.1, confidence: 0.5, signal: { direction: "neutral", strength: "neutral" },
      state: "range-bound", risk: { level: "low" }, technical: { annualizedVolatility: 0.1 } },
    calibration: { status: "not-calibrated" }, engineResult: {
      asset: productId, version: "engine-v3", evaluatedAt, decision: { retained: true },
      recommendation: { retained: true }, decisionLifecycle: { retained: true },
    },
  };
  return { productId, canonical } as unknown as FiveProductCanonicalProjectionInputV1;
}

// Isolate framework/cache boundaries as in the existing qualification-test
// harness. Production imports stay intact; there is no global loader alias or
// live persistence. The actual assembly source and fenced historical resolver execute.
function observedDelivery(historySource = historicalSource) {
  const historical = observedHistory(historySource);
  let activeEventId = "ECB:ecb-monetary-policy-decision:2026-09-10";
  const liveCalls = { imports: 0, scheduleReads: 0, pointerReads: 0, pointerWrites: 0, memoryAdvances: 0 };
  const source = readFileSync(new URL("../../services/canonicalProductResults.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const forbidden = () => { throw new Error("Unexpected acquisition or computation during delivery."); };
  const modules: Record<string, unknown> = {
    "server-only": {},
    "next/server": { connection: async () => undefined },
    "next/cache": { unstable_cache: () => forbidden },
    "./canonicalProductResultQualification": {},
    "./canonicalTemporalAdmission": {},
    "./canonicalMarketSnapshot": {},
    "./canonicalProductResultOwnership": { createCanonicalProductResultOwnerV1: () => ({
      get: async (id: typeof ids[number]) => canonicalInput(id).canonical,
    }) },
    "./ecbMonetaryPolicyHistoricalResolution": historical.resolver,
    "../projections/fiveProductProjections": projections,
    "../providers/ecb/fxReferenceSeriesCache": {},
    "../providers/ecb/estrSeriesCache": {},
    "../assets/estr/runtime": { getEstrProductionRuntimeV1: forbidden },
    // Reconnecting delivery to live progression would read the rolled pointer
    // and write state, exactly the capabilities excluded by this ownership boundary.
    "./ecbMonetaryPolicyEventRuntime": { getEcbMonetaryPolicyEventRuntimeV1: async () => {
      liveCalls.scheduleReads++; liveCalls.pointerReads++;
      liveCalls.pointerWrites++; liveCalls.memoryAdvances++;
      return { status: "available", canonicalEventId: activeEventId };
    } },
  };
  const names = { eurusd: "getCanonicalLiveEurUsdIntelligence", eurjpy: "getCanonicalLiveEurJpyIntelligence",
    eurgbp: "getCanonicalLiveEurGbpIntelligence", eurchf: "getCanonicalLiveEurChfIntelligence" };
  for (const id of ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const) {
    modules["../assets/" + id + "/productionRuntime"] = { [names[id]]: forbidden };
  }
  const requireStub = (name: string) => {
    assert.ok(Object.hasOwn(modules, name), "Unexpected assembly dependency: " + name);
    if (name === "./ecbMonetaryPolicyEventRuntime") liveCalls.imports++;
    return modules[name];
  };
  const box = { exports: {} };
  new Function("require", "module", "exports", compiled)(requireStub, box, box.exports);
  return { service: box.exports as typeof productResults, liveCalls,
    history: historical.resolver, forbiddenHistoryDependencies: historical.forbiddenDependencies,
    rollover: () => { activeEventId = "ECB:ecb-monetary-policy-decision:2026-10-29"; } };
}

const noLiveCalls = { imports: 0, scheduleReads: 0, pointerReads: 0, pointerWrites: 0, memoryAdvances: 0 };

test("historical ownership cannot be inferred from a cutoff, calendar date or clock", () => {
  const observed = observedHistory();
  const history = observed.resolver;
  const expected = { status: "historical-ownership-unavailable", reason: "ownership-not-recorded", evaluatedAt: E };
  assert.deepEqual(history.resolveHistoricalEcbMonetaryPolicyEventV1({ evaluatedAt: E }), expected);
  assert.deepEqual(history.resolveHistoricalEcbMonetaryPolicyEventV1({ evaluatedAt: "2026-09-23T12:00:00+02:00" }), expected);
  assert.equal(Object.isFrozen(history.resolveHistoricalEcbMonetaryPolicyEventV1({ evaluatedAt: E })), true);
  for (const evaluatedAt of ["", "invalid", "2026-09-23", "2026-09-23T10:00:00", "2026-02-30T10:00:00Z"]) {
    assert.throws(() => history.resolveHistoricalEcbMonetaryPolicyEventV1({ evaluatedAt }), /evaluatedAt/);
  }
  assert.deepEqual(observed.forbiddenDependencies, []);
});

async function verifyIndependentSingleDelivery(observed: ReturnType<typeof observedDelivery>): Promise<void> {
  const before = await observed.service.getFiveProductVipDeepProjectionV1("eurusd");
  observed.rollover();
  const after = await observed.service.getFiveProductVipDeepProjectionV1("eurusd");
  assert.deepEqual(observed.forbiddenHistoryDependencies, [], "Historical resolver accessed a forbidden dependency");
  assert.equal(before.availability, "available");
  assert.equal(after.availability, "available");
  if (before.availability !== "available" || after.availability !== "available") assert.fail("Expected market projections.");
  assert.deepEqual(after.details.ecbPolicyEvent, before.details.ecbPolicyEvent);
  assert.deepEqual(after.details.ecbPolicyEvent, {
    status: "historical-ownership-unavailable", reason: "ownership-not-recorded",
    evaluatedAt: E, relevance: "euro-policy-context",
  });
  assert.deepEqual(observed.liveCalls, noLiveCalls);
  for (const id of ids) {
    const free = await observed.service.getFiveProductFreeLiteProjectionV1(id);
    assert.equal(free.availability, "available");
    if (free.availability !== "available") assert.fail("Expected Free projection.");
    assert.equal("ecbPolicyEvent" in free.details, false);
  }
  assert.deepEqual(observed.forbiddenHistoryDependencies, [], "Free delivery must also leave historical dependencies untouched");
}

test("actual VIP single delivery never imports live ownership or writes event state after rollover", async () => {
  await verifyIndependentSingleDelivery(observedDelivery());
});

test("actual five-product delivery uses separate canonical cutoffs without selecting any later event", async () => {
  const observed = observedDelivery();
  observed.rollover();
  const fx = Object.fromEntries(ids.slice(0, 4).map((id) => [id, canonicalInput(id).canonical]));
  const rateInput = canonicalInput("estr", "2026-09-23T09:00:00.000Z");
  const cutoffs: string[] = [];
  const map = await observed.service.assembleFiveProductVipDeepProjectionMapV1({
    now: () => D,
    loadFxBundle: async () => fx as unknown as Pick<productResults.CanonicalProductResultMapV1, "eurusd" | "eurjpy" | "eurgbp" | "eurchf">,
    loadEstr: async () => {
      if (rateInput.productId !== "estr") throw new Error("Expected rate input.");
      return rateInput.canonical;
    },
    resolveHistoricalEvent: ({ evaluatedAt }) => {
      cutoffs.push(evaluatedAt);
      return observed.history.resolveHistoricalEcbMonetaryPolicyEventV1({ evaluatedAt });
    },
  });
  assert.deepEqual(cutoffs, [E, "2026-09-23T09:00:00.000Z"]);
  for (const id of ids) {
    const result = map[id];
    assert.equal(result?.availability, "available");
    if (result?.availability !== "available") assert.fail("Expected retained market projection.");
    assert.equal(result.currentUse.assessedAt, D);
    assert.deepEqual(result.details.ecbPolicyEvent, {
      status: "historical-ownership-unavailable", reason: "ownership-not-recorded",
      evaluatedAt: id === "estr" ? "2026-09-23T09:00:00.000Z" : E,
      relevance: id === "estr" ? "direct-euro-rate-policy-context" : "euro-policy-context",
    });
    if (result.productKind === "fx") {
      const input = canonicalInput(id);
      if (input.productId === "estr" || input.canonical.availability !== "available") assert.fail("Expected FX input.");
      assert.deepEqual(result.details.engine.decision, input.canonical.engineResult.decision);
      assert.equal(result.details.engine.evaluatedAt, E);
    }
  }
  assert.deepEqual(observed.liveCalls, noLiveCalls);
  assert.deepEqual(observed.forbiddenHistoryDependencies, [], "Historical resolver accessed a forbidden dependency");
});

test("missing canonical evaluation time withholds context without guessing or invoking a resolver", async () => {
  const observed = observedHistory();
  const history = observed.resolver;
  const input = canonicalInput("estr");
  if (input.productId !== "estr" || input.canonical.availability !== "available") assert.fail("Expected rate input.");
  const data = { ...input.canonical.data, temporalQualification: undefined };
  let calls = 0;
  const result = await history.resolveVipEcbPolicyEventForCanonicalV1({ productId: "estr",
    canonical: { availability: "available", data } }, () => {
    calls++;
    throw new Error("Must not resolve an unknown cutoff.");
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { status: "runtime-unavailable", reason: "canonical-evaluation-time-unavailable" });
  assert.deepEqual(observed.forbiddenDependencies, []);
});

test("the delivery regression detects direct calendar, pointer and memory access even when production catches it", async () => {
  const mutations = [
    ["../providers/ecb/monetaryPolicy/cache", "getEcbMonetaryPolicyScheduleSourceV1"],
    ["../persistence/ecbMonetaryPolicyActiveEventRedis", "readEcbMonetaryPolicyActiveEventRedisV1"],
    ["../persistence/ecbMonetaryPolicyActiveEventRedis", "writeEcbMonetaryPolicyActiveEventRedisV1"],
    ["../persistence/ecbMonetaryPolicyEventMemoryRedis", "readEcbMonetaryPolicyEventMemoryV1"],
    ["../persistence/ecbMonetaryPolicyEventMemoryRedis", "advanceEcbMonetaryPolicyEventMemoryRedisV1"],
  ] as const;
  const marker = '  const evaluatedAt = new Date(parseEventInstantV1(input.evaluatedAt, "evaluatedAt"))';
  assert.ok(historicalSource.includes(marker), "mutation insertion point must exist");
  for (const [dependency, operation] of mutations) {
    // This is an in-memory source mutation only. No real adapter is loaded.
    const mutated = historicalSource.replace(marker,
      `  void require("${dependency}").${operation}();\n${marker}`);
    const observed = observedDelivery(mutated);
    await assert.rejects(verifyIndependentSingleDelivery(observed),
      /Historical resolver accessed a forbidden dependency/, operation);
    assert.deepEqual(observed.forbiddenHistoryDependencies, [dependency, dependency]);
    assert.deepEqual(observed.liveCalls, noLiveCalls,
      "direct resolver access bypasses the assembly spy, so the resolver fence must detect it");
  }
  const staticImport = 'import { getEcbMonetaryPolicyScheduleSourceV1 } from "../providers/ecb/monetaryPolicy/cache";\n';
  const mutatedImport = staticImport + historicalSource.replace(marker,
    `  void getEcbMonetaryPolicyScheduleSourceV1();\n${marker}`);
  assert.throws(() => observedDelivery(mutatedImport), /Forbidden historical dependency/);
});
