import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { test } from "node:test";
import ts from "typescript";
import * as cacheQualification from "../../services/canonicalProductResultQualification";
import * as canonicalSnapshot from "../../services/canonicalMarketSnapshot";
import * as ownership from "../../services/canonicalProductResultOwnership";
import * as projections from "../../projections/fiveProductProjections";
import * as productResults from "../../services/canonicalProductResults";
import { getCanonicalLiveEurUsdIntelligence } from "../../assets/eurusd/productionRuntime";
import { getCanonicalLiveEurJpyIntelligence } from "../../assets/eurjpy/productionRuntime";
import { getCanonicalLiveEurGbpIntelligence } from "../../assets/eurgbp/productionRuntime";
import { getCanonicalLiveEurChfIntelligence } from "../../assets/eurchf/productionRuntime";
import { getEstrProductionRuntimeV1 } from "../../assets/estr/runtime";
import { ECB_FX_REFERENCE_PRODUCTS_V1, type EcbFxReferenceSeriesBundleV1 } from "../../providers/ecb/fxReferenceSeries";
import * as estrContract from "../../providers/ecb/estrContract";
import type { EcbEstrSeriesV1 } from "../../providers/ecb/estrTypes";
import { CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 as POLICY } from "../../services/canonicalTemporalAdmission";

const { encodeCanonicalProductResultCacheV2: encode, decodeCanonicalProductResultCacheV2: decode,
  CanonicalProductResultQualificationErrorV2: QualificationError, CANONICAL_PRODUCT_RESULT_CACHE_VERSION_V2: VERSION } = cacheQualification;
const E = "2026-10-10T12:00:00.123Z";
const LATEST = Date.parse("2026-10-09T00:00:00.000Z") / 1000;
const ACQUIRED = Date.parse("2026-10-10T10:00:00.000Z") / 1000;
const ids = ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const;
type FxId = typeof ids[number];
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
const realFx = { eurusd: getCanonicalLiveEurUsdIntelligence, eurjpy: getCanonicalLiveEurJpyIntelligence,
  eurgbp: getCanonicalLiveEurGbpIntelligence, eurchf: getCanonicalLiveEurChfIntelligence };
let lifecycleCalls = 0;

function fxSources(): EcbFxReferenceSeriesBundleV1 {
  const source = (productId: FxId) => {
    const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
    const observations = Array.from({ length: 900 }, (_, index) => ({ timestamp: LATEST - (899 - index) * 86400,
      value: (productId === "eurjpy" ? 150 : 1.1) * (1 + index * 0.00001 + Math.sin(index / 9) * 0.002) }));
    return { schemaVersion: "canonical-observation-series-v1" as const, observations,
      metadata: { provider: "ecb", source: "European Central Bank", seriesId: product.seriesId,
        requestedProductId: productId, canonicalProductId: productId, interval: "1d" as const,
        fetchedAt: ACQUIRED, sourceTimestamp: LATEST, observationTimestamp: LATEST,
        status: "end_of_day" as const, unit: product.unit, seriesKind: "reference-rate" as const },
      extension: { optional: undefined, signedZero: -0, nan: NaN, positiveInfinity: Infinity,
        negativeInfinity: -Infinity, nullRecord: Object.assign(Object.create(null), { note: "owned" }) } };
  };
  return { eurusd: source("eurusd"), eurjpy: source("eurjpy"), eurgbp: source("eurgbp"), eurchf: source("eurchf") };
}
function estrSource(rate = 1.5, republication = false, contingency = false): EcbEstrSeriesV1 {
  const observations = Array.from({ length: 220 }, (_, index) => ({ timestamp: LATEST - (219 - index) * 86400, value: rate }));
  return { schemaVersion: "ecb-estr-series-v1", dataflow: estrContract.ECB_ESTR_DATAFLOW_V1,
    seriesKey: estrContract.ECB_ESTR_SERIES_KEY_V1,
    canonicalSeries: { schemaVersion: "canonical-observation-series-v1", observations,
      metadata: { provider: "ecb", source: "European Central Bank", seriesId: estrContract.ECB_ESTR_SERIES_ID_V1,
        requestedProductId: "estr", canonicalProductId: "estr", interval: "1d", fetchedAt: ACQUIRED,
        sourceTimestamp: LATEST, observationTimestamp: LATEST, status: "end_of_day", unit: "percent", seriesKind: "reference-rate" } },
    observationMetadata: observations.map(({ timestamp }) => ({ timestamp,
      referenceDate: new Date(timestamp * 1000).toISOString().slice(0, 10),
      publicationType: republication ? "republication" : "standard", calculationMethod: contingency ? "contingency" : "normal",
      observationStatus: { headline: "A", publicationType: "A", calculationMethod: "A" },
      confidentialityStatus: { headline: "F", publicationType: "F", calculationMethod: "F" } })) };
}
const runFx = (id: FxId, deps: Parameters<typeof getCanonicalLiveEurUsdIntelligence>[0]) => realFx[id]({
  ...deps, advanceDecisionSnapshot: async () => { lifecycleCalls++; return { status: "initialized", previous: null }; },
});
let fxFixture: Promise<cacheQualification.CanonicalFxResultCachePayloadV2> | undefined;
function fxPayload() {
  return fxFixture ??= (async () => {
    const sourceContext = fxSources();
    const result = await productResults.computeCanonicalFxResultBundleV1({ loadSourceBundle: async () => sourceContext, evaluatedAt: E,
      runtimes: { eurusd: (deps) => runFx("eurusd", deps), eurjpy: (deps) => runFx("eurjpy", deps),
        eurgbp: (deps) => runFx("eurgbp", deps), eurchf: (deps) => runFx("eurchf", deps) } });
    if (result.availability !== "available") assert.fail(result.reason);
    return { schemaVersion: VERSION, policyVersion: POLICY, family: "launch-fx", evaluatedAt: E, sourceContext, result: result.bundle };
  })();
}
async function estrPayload(rate = 1.5, rp = false, cm = false): Promise<cacheQualification.CanonicalEstrResultCachePayloadV2> {
  const sourceContext = estrSource(rate, rp, cm);
  Reflect.set(sourceContext, "extension", { missing: undefined, zero: -0, rows: [{ value: "interior" }] });
  const result = await getEstrProductionRuntimeV1({ loadSource: async () => sourceContext, evaluatedAt: E });
  if (result.availability !== "available") assert.fail(result.reason);
  return { schemaVersion: VERSION, policyVersion: POLICY, family: "estr", evaluatedAt: E, sourceContext, result };
}
function roundTrip<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function rejected(operation: () => unknown, reason?: string) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof QualificationError);
    if (reason) assert.equal(error.result.reason, reason);
    assert.equal(error.result.policyVersion, POLICY);
    assert.deepEqual(error.result.missing, ["temporal"]);
    assert.ok(Object.isFrozen(error.result));
    return true;
  });
}
function field(node: unknown, path: readonly string[]): unknown[] {
  let current = node as unknown[];
  for (const key of path) {
    assert.equal(current[0], "record");
    const entry = (current[2] as [string, unknown[]][]).find(([name]) => name === key);
    assert.ok(entry, `wire field ${key}`);
    current = entry[1];
  }
  return current;
}
function tamper(transport: cacheQualification.CanonicalResultCacheTransportV2, change: (wire: unknown[]) => void) {
  const wire = JSON.parse(inflateRawSync(Buffer.from(transport.body, "base64")).toString("utf8")) as unknown[];
  change(wire);
  const body = deflateRawSync(Buffer.from(JSON.stringify(wire)), { level: 9 }).toString("base64");
  // Recompute the unsigned checksum so contradictions reach semantic validation.
  const digest = createHash("sha256").update(`${transport.schemaVersion}\n`).update(body).digest("hex");
  return { ...transport, body, digest };
}

test("complete FX context survives Next JSON and preserves calculations and lifecycle", async () => {
  const payload = await fxPayload();
  const before = lifecycleCalls;
  const transport = roundTrip(encode("launch-fx", payload));
  const first = decode("launch-fx", transport);
  const second = decode("launch-fx", transport);
  assert.deepEqual(first, payload);
  assert.deepEqual(second, first);
  assert.notEqual(first.result, second.result);
  for (const id of ids) {
    assert.equal(first.sourceContext[id].observations.length, 900);
    assert.deepEqual(first.result[id].intelligence, payload.result[id].intelligence);
    assert.deepEqual(first.result[id].engineResult, payload.result[id].engineResult);
    assert.deepEqual(first.result[id].calibration, payload.result[id].calibration);
    assert.equal(first.result[id].temporalQualification?.availabilityEvidence, "unverified");
    assert.equal(first.result[id].temporalQualification?.publicationTime, "unknown");
    assert.ok(Object.isFrozen(first.result[id].engineResult));
    assert.ok(Object.isFrozen(first.sourceContext[id].observations[10]));
  }
  assert.equal(lifecycleCalls, before, "retrieval performs no runtime/lifecycle work");
});
test("transport is deterministic, lossless and independently owned", async () => {
  const payload = await fxPayload();
  const reversed = { ...payload, sourceContext: { eurchf: payload.sourceContext.eurchf, eurgbp: payload.sourceContext.eurgbp,
    eurjpy: payload.sourceContext.eurjpy, eurusd: payload.sourceContext.eurusd } };
  assert.deepEqual(encode("launch-fx", reversed), encode("launch-fx", payload));
  const first = decode("launch-fx", roundTrip(encode("launch-fx", payload)));
  const copy = structuredClone(payload) as Mutable<typeof payload>;
  const owned = decode("launch-fx", encode("launch-fx", copy));
  copy.sourceContext.eurusd.observations[10].value = 99;
  copy.result.eurusd.intelligence.price = 99;
  assert.deepEqual(owned.result, first.result);
  assert.equal(owned.sourceContext.eurusd.observations[10].value, first.sourceContext.eurusd.observations[10].value);
  assert.equal(Reflect.defineProperty(owned.result.eurusd.intelligence, "price", { value: 99 }), false);
  const extension = Reflect.get(first.sourceContext.eurusd, "extension");
  assert.ok(Object.hasOwn(extension, "optional"));
  assert.equal(extension.optional, undefined);
  assert.ok(Object.is(extension.signedZero, -0));
  assert.ok(Number.isNaN(extension.nan));
  assert.equal(extension.positiveInfinity, Infinity);
  assert.equal(extension.negativeInfinity, -Infinity);
  assert.equal(Object.getPrototypeOf(extension.nullRecord), null);
});
test("all WT/RP/CM combinations and positive, zero, signed zero and negative rate mathematics round-trip", async () => {
  for (const rate of [1.5, 0, -0, -0.5]) for (const rp of [false, true]) for (const cm of [false, true]) {
    const payload = await estrPayload(rate, rp, cm);
    const result = decode("estr", roundTrip(encode("estr", payload)));
    assert.deepEqual(result, payload);
    assert.equal(result.sourceContext.observationMetadata.length, 220);
    assert.ok(Object.is(result.result.data.currentRatePercent, rate));
    assert.deepEqual(result.result.data.features, payload.result.data.features);
    assert.deepEqual(result.result.data.signal, payload.result.data.signal);
    assert.deepEqual(result.result.data.risk, payload.result.data.risk);
    assert.deepEqual(result.result.data.marketState, payload.result.data.marketState);
    assert.deepEqual(result.result.data.engineAdapter, payload.result.data.engineAdapter);
  }
});
test("legacy, missing context/receipt, policy, E, identity and digest changes reject atomically", async () => {
  const payload = await fxPayload();
  rejected(() => decode("launch-fx", payload.result), "invalid-cache-transport");
  const transport = encode("launch-fx", payload);
  for (const path of [["schemaVersion"], ["policyVersion"], ["evaluatedAt"],
    ["result", "eurjpy", "temporalQualification", "policyVersion"],
    ["result", "eurjpy", "temporalQualification", "productId"],
    ["result", "eurjpy", "temporalQualification", "sourceBinding", "digest"],
    ["sourceContext", "eurjpy", "metadata", "source"],
    ["sourceContext", "eurjpy", "metadata", "seriesId"]]) {
    rejected(() => decode("launch-fx", tamper(transport, (wire) => { field(wire, path)[1] = "mismatched"; })));
  }
  for (const path of [["sourceContext"], ["result", "eurjpy", "temporalQualification"]]) {
    rejected(() => decode("launch-fx", tamper(transport, (wire) => {
      const parent = field(wire, path.slice(0, -1));
      parent[2] = (parent[2] as [string, unknown][]).filter(([key]) => key !== path.at(-1));
    })));
  }
  rejected(() => decode("launch-fx", tamper(transport, (wire) => {
    field(wire, ["result", "eurchf", "intelligence", "price"])[1] = "9";
  })), "result-source-mismatch");
});
test("ESTR interior rows, provenance and sidecars cannot be substituted with latest-only context", async () => {
  const payload = await estrPayload();
  const transport = encode("estr", payload);
  for (const path of [["result", "data", "source", "latestObservationMetadata", "calculationMethod"],
    ["result", "data", "source", "provenance", "source"], ["result", "data", "source", "seriesKey"],
    ["result", "data", "temporalQualification", "sourceBinding", "digest"]]) {
    rejected(() => decode("estr", tamper(transport, (wire) => { field(wire, path)[1] = "changed"; })));
  }
  const truncated = structuredClone(payload) as Mutable<typeof payload>;
  truncated.sourceContext.observationMetadata.splice(0, 1);
  rejected(() => encode("estr", truncated));
  const interior = structuredClone(payload) as Mutable<typeof payload>;
  interior.sourceContext.canonicalSeries.observations[10].value = -99;
  rejected(() => encode("estr", interior), "qualification-mismatch");
  const reordered = structuredClone(payload) as Mutable<typeof payload>;
  reordered.sourceContext.canonicalSeries.observations.reverse();
  rejected(() => encode("estr", reordered));
  rejected(() => decode("estr", tamper(transport, (wire) => {
    field(wire, ["result", "data", "currentRatePercent"])[1] = "9";
  })), "result-source-mismatch");
});
test("original acquisition ordering and same-second uncertainty survive independently of delivery time", async () => {
  const payload = await estrPayload();
  const after = structuredClone(payload) as Mutable<typeof payload>;
  after.sourceContext.canonicalSeries.metadata.fetchedAt = Math.floor(Date.parse(E) / 1000) + 1;
  for (const deliveryTime of [E, "2030-01-01T00:00:00.000Z"]) {
    assert.ok(Date.parse(deliveryTime));
    rejected(() => encode("estr", after), "acquisition-after-evaluation");
  }
  const source = estrSource();
  Reflect.set(source.canonicalSeries.metadata, "fetchedAt", Math.floor(Date.parse(E) / 1000));
  const result = await getEstrProductionRuntimeV1({ loadSource: async () => source, evaluatedAt: E });
  const decoded = decode("estr", encode("estr", { ...payload, sourceContext: source, result }));
  assert.equal(decoded.result.data.temporalQualification?.sameSecondPrecisionAmbiguity, true);
  assert.equal(decoded.result.data.temporalQualification?.availabilityEvidence, "unverified");
  assert.equal(decoded.result.data.temporalQualification?.evaluatedAt, E);
});
test("sparse/accessor/executable/prototype/iterator shapes reject without getter execution", async () => {
  const payload = await estrPayload();
  let getters = 0;
  const shapes: ((copy: Mutable<typeof payload>) => void)[] = [
    (copy) => { delete (copy.sourceContext.canonicalSeries.observations as unknown[])[10]; },
    (copy) => { Object.defineProperty(copy.result.data, "currentRatePercent", { enumerable: true, get: () => { getters++; return 1.5; } }); },
    (copy) => { Object.defineProperty(copy.sourceContext.canonicalSeries.metadata, "provider", { enumerable: true, get: () => { getters++; return "ecb"; } }); },
    (copy) => { Object.defineProperty(copy.sourceContext.observationMetadata, Symbol.iterator, { get: () => { getters++; throw new Error("iterator"); } }); },
    (copy) => { Reflect.set(copy.result, "toJSON", () => { getters++; return {}; }); },
    (copy) => { Object.setPrototypeOf(copy.sourceContext, { inherited: true }); },
    (copy) => { Reflect.set(copy.sourceContext, "function", () => 1); },
    (copy) => { Reflect.set(copy.sourceContext, "bigint", BigInt(1)); },
    (copy) => { Reflect.set(copy.sourceContext, "symbol", Symbol("bad")); },
    (copy) => { Reflect.set(copy.sourceContext, "cycle", copy); },
    (copy) => { Object.defineProperty(copy.result, "hidden", { value: 1 }); },
  ];
  for (const change of shapes) {
    const copy = structuredClone(payload) as Mutable<typeof payload>;
    change(copy);
    rejected(() => encode("estr", copy), "invalid-cache-payload");
  }
  const accessor = { schemaVersion: "canonical-product-result-transport-v2", digest: "0".repeat(64),
    get body() { getters++; return "bad"; } };
  rejected(() => decode("estr", accessor), "invalid-cache-transport");
  assert.equal(getters, 0);
});
test("malformed transport, duplicate/unknown tags, corruption and resource excess fail closed", async () => {
  const payload = await estrPayload();
  const transport = encode("estr", payload);
  for (const malformed of [null, {}, [], { ...transport, extra: true }, { ...transport, body: "invalid JSON" },
    { ...transport, digest: "0".repeat(64) }, { ...transport, body: "x".repeat(16 * 1024 * 1024 + 1) }]) {
    rejected(() => decode("estr", malformed), "invalid-cache-transport");
  }
  rejected(() => decode("estr", tamper(transport, (wire) => { field(wire, ["evaluatedAt"])[0] = "unsupported"; })), "invalid-cache-transport");
  rejected(() => decode("estr", tamper(transport, (wire) => { (wire[2] as unknown[]).push((wire[2] as unknown[])[0]); })), "invalid-cache-transport");
  const deep = structuredClone(payload);
  let nested: object = {};
  for (let i = 0; i < 100; i++) nested = { nested };
  Reflect.set(deep.sourceContext, "deep", nested);
  rejected(() => encode("estr", deep), "invalid-cache-payload");
});
test("miss/fresh/stale/failed-revalidation readers always pass through the guard", async () => {
  const payload = await fxPayload();
  const transport = roundTrip(encode("launch-fx", payload));
  let reads = 0;
  for (const state of ["miss", "fresh", "stale", "failed-background-refresh"]) {
    const result = await productResults.getGuardedCanonicalFxResultBundleV2(async () => {
      reads++;
      if (state === "failed-background-refresh") await Promise.reject(new Error("refresh failed")).catch(() => undefined);
      return roundTrip(transport);
    });
    assert.deepEqual(result, payload.result);
  }
  assert.equal(reads, 4);
  await assert.rejects(productResults.getGuardedCanonicalFxResultBundleV2(async () => payload.result), QualificationError);
  await assert.rejects(productResults.getGuardedCanonicalFxResultBundleV2(async () => ({ ...transport, body: "malformed stale" })), QualificationError);
  const estr = await estrPayload();
  assert.deepEqual(await productResults.getGuardedCanonicalEstrResultV2(async () => roundTrip(encode("estr", estr))), estr.result);
});

interface MockEntry {
  keys: string[]; tags: string[]; revalidate: number; entry?: unknown;
  stale: boolean; writes: number; reads: number; refreshErrors: number; pending?: Promise<void>;
}
function observedService() {
  const caches = new Map<string, MockEntry>();
  let fxInput: EcbFxReferenceSeriesBundleV1 | Error = fxSources();
  let estrInput: EcbEstrSeriesV1 | Error = estrSource();
  let fxRuns = 0;
  let estrRuns = 0;
  let fxLoads = 0;
  let estrLoads = 0;
  const source = readFileSync(new URL("../../services/canonicalProductResults.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const box = { exports: {} };
  class FixedDate extends Date { constructor(value?: string | number) { super(value ?? E); } }
  const modules: Record<string, unknown> = {
    "server-only": {},
    "next/server": { connection: async () => undefined },
    "next/cache": { unstable_cache: (producer: () => Promise<unknown>, keys: string[], options: { tags: string[]; revalidate: number }) => {
      const family = keys.at(-1)!;
      const state: MockEntry = { keys, tags: options.tags, revalidate: options.revalidate,
        stale: false, writes: 0, reads: 0, refreshErrors: 0 };
      caches.set(family, state);
      const recompute = async () => { const result = await producer(); state.entry = roundTrip(result); state.writes++; };
      return async () => {
        state.reads++;
        if (state.entry === undefined) await recompute();
        else if (state.stale && !state.pending) {
          state.pending = recompute().catch(() => { state.refreshErrors++; }).finally(() => { state.pending = undefined; });
        }
        return roundTrip(state.entry);
      };
    } },
    "../providers/ecb/fxReferenceSeriesCache": { getCanonicalEcbFxReferenceSeriesBundleV1: async () => {
      fxLoads++; if (fxInput instanceof Error) throw fxInput; return fxInput;
    } },
    "../providers/ecb/estrSeriesCache": { getCanonicalEcbEstrSourceV1: async () => {
      estrLoads++; if (estrInput instanceof Error) throw estrInput; return estrInput;
    } },
    "./canonicalProductResultQualification": cacheQualification,
    "./canonicalTemporalAdmission": { CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1: POLICY },
    "./canonicalProductResultOwnership": ownership,
    "../projections/fiveProductProjections": projections,
    "./canonicalMarketSnapshot": { ...canonicalSnapshot, resolveCanonicalFxEvaluationInstantV1:
      (context: { evaluatedAt?: string }, now?: () => Date) => canonicalSnapshot.resolveCanonicalFxEvaluationInstantV1(context, now ?? (() => new Date(E))) },
    "./ecbMonetaryPolicyEventRuntime": { getEcbMonetaryPolicyEventRuntimeV1: async () => ({
      status: "source-unavailable", sourceUrl: "https://www.ecb.europa.eu/", reason: "mock-only" }) },
    "../assets/estr/runtime": { getEstrProductionRuntimeV1: (deps: Parameters<typeof getEstrProductionRuntimeV1>[0]) => {
      estrRuns++; return getEstrProductionRuntimeV1(deps);
    } },
  };
  const names = { eurusd: "getCanonicalLiveEurUsdIntelligence", eurjpy: "getCanonicalLiveEurJpyIntelligence",
    eurgbp: "getCanonicalLiveEurGbpIntelligence", eurchf: "getCanonicalLiveEurChfIntelligence" };
  for (const id of ids) modules[`../assets/${id}/productionRuntime`] = {
    [names[id]]: (deps: Parameters<typeof getCanonicalLiveEurUsdIntelligence>[0]) => { fxRuns++; return runFx(id, deps); },
  };
  const requireStub = (name: string) => { assert.ok(Object.hasOwn(modules, name), `unexpected module ${name}`); return modules[name]; };
  new Function("require", "module", "exports", "Date", compiled)(requireStub, box, box.exports, FixedDate);
  return { service: box.exports as typeof productResults, caches,
    setFx: (value: EcbFxReferenceSeriesBundleV1 | Error) => { fxInput = value; },
    setEstr: (value: EcbEstrSeriesV1 | Error) => { estrInput = value; },
    counts: () => ({ fxRuns, estrRuns, fxLoads, estrLoads }) };
}

test("actual producers use v2 only; cache miss and fresh hits preserve atomic source ownership", async () => {
  const observed = observedService();
  const fx = await observed.service.getCanonicalProductResultV1("eurusd");
  const estr = await observed.service.getCanonicalProductResultV1("estr");
  assert.equal(estr.availability, "available");
  const fxEntry = observed.caches.get("launch-fx")!;
  const estrEntry = observed.caches.get("estr")!;
  for (const entry of [fxEntry, estrEntry]) {
    assert.equal(entry.keys[2], "canonical-product-result-v2");
    assert.deepEqual(entry.tags, [`canonical-product-result-v2:${entry.keys.at(-1)}`]);
    assert.equal(entry.revalidate, 86400);
    assert.equal(entry.writes, 1);
    assert.equal(entry.keys.some((key) => key.includes("result-v1")), false);
  }
  const decodedFx = decode("launch-fx", fxEntry.entry);
  const decodedEstr = decode("estr", estrEntry.entry);
  assert.equal(decodedFx.evaluatedAt, E);
  assert.equal(decodedEstr.evaluatedAt, E);
  assert.equal(decodedFx.sourceContext.eurjpy.observations.length, 900);
  assert.equal(decodedEstr.sourceContext.observationMetadata.length, 220);
  const before = observed.counts();
  for (const id of ids) await observed.service.getCanonicalProductResultV1(id);
  assert.deepEqual(await observed.service.getCanonicalProductResultV1("eurusd"), fx);
  assert.deepEqual(await observed.service.getCanonicalProductResultV1("estr"), estr);
  assert.deepEqual(observed.counts(), before);
  assert.deepEqual(before, { fxRuns: 4, estrRuns: 1, fxLoads: 1, estrLoads: 1 });
});
test("real producer failure during SWR retains only separately validated previous payloads", async () => {
  const observed = observedService();
  const oldFx = await observed.service.getCanonicalProductResultV1("eurusd");
  const oldEstr = await observed.service.getCanonicalProductResultV1("estr");
  observed.setFx(new Error("mock acquisition failure"));
  observed.setEstr(new Error("mock acquisition failure"));
  for (const family of ["launch-fx", "estr"]) observed.caches.get(family)!.stale = true;
  assert.deepEqual(await observed.service.getCanonicalProductResultV1("eurusd"), oldFx);
  assert.deepEqual(await observed.service.getCanonicalProductResultV1("estr"), oldEstr);
  await Promise.all([...observed.caches.values()].map((entry) => entry.pending));
  for (const entry of observed.caches.values()) { assert.equal(entry.writes, 1); assert.equal(entry.refreshErrors, 1); }
  const fxEntry = observed.caches.get("launch-fx")!;
  fxEntry.entry = { schemaVersion: "legacy-v1", result: oldFx };
  const estrEntry = observed.caches.get("estr")!;
  estrEntry.entry = { schemaVersion: "malformed-stale" };
  await assert.rejects(observed.service.getCanonicalProductResultV1("eurusd"), QualificationError);
  await assert.rejects(observed.service.getCanonicalProductResultV1("estr"), QualificationError);
  await Promise.all([...observed.caches.values()].map((entry) => entry.pending));
});
test("producer temporal rejection is never persisted; FX family launches no partial calculations", async () => {
  const observed = observedService();
  const badFx = fxSources();
  Reflect.set(badFx.eurjpy.metadata, "fetchedAt", Math.floor(Date.parse(E) / 1000) + 1);
  const badEstr = estrSource();
  Reflect.set(badEstr.canonicalSeries.metadata, "fetchedAt", Math.floor(Date.parse(E) / 1000) + 1);
  observed.setFx(badFx); observed.setEstr(badEstr);
  await assert.rejects(observed.service.getCanonicalProductResultV1("eurusd"), (error: unknown) => {
    assert.ok(error instanceof canonicalSnapshot.CanonicalFxTemporalAdmissionErrorV1);
    assert.equal(error.result.productId, "eurjpy");
    assert.equal(error.result.reason, "acquisition-after-evaluation");
    return true;
  });
  assert.deepEqual(await observed.service.getCanonicalProductResultV1("estr"), {
    availability: "unavailable", productId: "estr", reason: "acquisition-after-evaluation", policyVersion: POLICY, missing: ["temporal"],
  });
  assert.equal(observed.counts().fxRuns, 0);
  for (const entry of observed.caches.values()) { assert.equal(entry.writes, 0); assert.equal(entry.entry, undefined); }
});
test("all single and Free/VIP map callers guard malformed family entries without legacy fallback", async () => {
  const observed = observedService();
  await observed.service.getCanonicalProductResultV1("eurusd");
  await observed.service.getCanonicalProductResultV1("estr");
  observed.caches.get("launch-fx")!.entry = (await fxPayload()).result;
  for (const id of ids) await assert.rejects(observed.service.getCanonicalProductResultV1(id), QualificationError);
  await assert.rejects(observed.service.getFiveProductFreeLiteProjectionV1("eurusd"), QualificationError);
  await assert.rejects(observed.service.getFiveProductVipDeepProjectionV1("eurusd"), QualificationError);
  const freePartial = await observed.service.getFiveProductFreeLiteProjectionMapV1();
  const vipPartial = await observed.service.getFiveProductVipDeepProjectionMapV1();
  for (const id of ids) { assert.equal(freePartial[id], null); assert.equal(vipPartial[id], null); }
  assert.equal(freePartial.estr?.availability, "available");
  assert.equal(vipPartial.estr?.availability, "available");
  observed.caches.get("estr")!.entry = (await estrPayload()).result;
  await assert.rejects(observed.service.getCanonicalProductResultV1("estr"), QualificationError);
  await assert.rejects(observed.service.getFiveProductFreeLiteProjectionV1("estr"), QualificationError);
  await assert.rejects(observed.service.getFiveProductVipDeepProjectionV1("estr"), QualificationError);
  for (const map of [await observed.service.getFiveProductFreeLiteProjectionMapV1(), await observed.service.getFiveProductVipDeepProjectionMapV1()]) {
    for (const id of [...ids, "estr"] as const) assert.equal(map[id], null);
  }
  assert.deepEqual(observed.counts(), { fxRuns: 4, estrRuns: 1, fxLoads: 1, estrLoads: 1 });
  for (const entry of observed.caches.values()) assert.equal(entry.writes, 1);
});
test("source failures preserve existing ESTR API and unrelated reader errors are not swallowed", async () => {
  const observed = observedService();
  observed.setEstr(new Error("private transport details"));
  assert.deepEqual(await observed.service.getCanonicalProductResultV1("estr"), {
    availability: "unavailable", reason: "Official ECB €STR source is unavailable.", missing: ["source"],
  });
  assert.equal(observed.caches.get("estr")!.writes, 0);
  const unrelated = new Error("unrelated cache failure");
  await assert.rejects(productResults.getGuardedCanonicalFxResultBundleV2(async () => { throw unrelated; }), (error) => error === unrelated);
  await assert.rejects(productResults.getGuardedCanonicalEstrResultV2(async () => { throw unrelated; }), (error) => error === unrelated);
});

test("varying rate calculations preserve the adapter's range-bound signal mapping", async () => {
  let nonzeroRangeBound = 0;
  let directional = 0;
  for (const rate of [1.5, 0, -0.593]) for (const amplitude of [0.001, 0.02, 0.1]) {
    const sourceContext = estrSource(rate, true, true);
    for (let index = 0; index < sourceContext.canonicalSeries.observations.length; index++) {
      Reflect.set(sourceContext.canonicalSeries.observations[index], "value", rate + Math.sin(index / 9) * amplitude);
    }
    const result = await getEstrProductionRuntimeV1({ loadSource: async () => sourceContext, evaluatedAt: E });
    if (result.availability !== "available") assert.fail(result.reason);
    if (result.data.signal.data.direction === "range-bound") {
      assert.notEqual(result.data.signal.data.score, 0);
      nonzeroRangeBound++;
      assert.equal(result.data.engineAdapter.data.engineEvidence.signal.score, 0);
    } else {
      directional++;
      assert.equal(result.data.engineAdapter.data.engineEvidence.signal.score, result.data.signal.data.score);
    }
    const payload = { schemaVersion: VERSION, policyVersion: POLICY, family: "estr", evaluatedAt: E, sourceContext, result };
    assert.deepEqual(decode("estr", roundTrip(encode("estr", payload))).result, result);
  }
  assert.ok(nonzeroRangeBound >= 3);
  assert.ok(directional >= 3);
});

test("compressed transport rejects output excess, invalid UTF-8, trailing data and noncanonical base64", async () => {
  const transport = encode("estr", await estrPayload());
  const packet = (bytes: Buffer) => {
    const body = bytes.toString("base64");
    return { ...transport, body, digest: createHash("sha256").update(transport.schemaVersion + "\n").update(body).digest("hex") };
  };
  for (const bytes of [
    deflateRawSync(Buffer.alloc(16 * 1024 * 1024 + 1, 97)),
    deflateRawSync(Buffer.from([255])),
    deflateRawSync(Buffer.from([239, 187, 191, 91, 34, 110, 117, 108, 108, 34, 93])),
    Buffer.concat([Buffer.from(transport.body, "base64"), Buffer.from("trailing")]),
    deflateRawSync(Buffer.from('[ "null" ]')),
    Buffer.from("invalid deflate"),
  ]) rejected(() => decode("estr", packet(bytes)), "invalid-cache-transport");
  const body = transport.body + " ";
  rejected(() => decode("estr", { ...transport, body,
    digest: createHash("sha256").update(transport.schemaVersion + "\n").update(body).digest("hex") }), "invalid-cache-transport");
  rejected(() => decode("estr", { ...transport, encoding: "unsupported" }), "invalid-cache-transport");
});

test("full FX histories remain complete within the installed Next two-MiB entry limit", async () => {
  const sourceContext = fxSources();
  for (const id of ids) {
    const latest = sourceContext[id].observations.at(-1)!;
    Reflect.set(sourceContext[id], "observations", Array.from({ length: 10000 }, (_, index) => ({
      timestamp: LATEST - (9999 - index) * 86400, value: latest.value * (1 + Math.sin(index / 9) * 0.002),
    })));
  }
  const computed = await productResults.computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => sourceContext, evaluatedAt: E,
    runtimes: { eurusd: (deps) => runFx("eurusd", deps), eurjpy: (deps) => runFx("eurjpy", deps),
      eurgbp: (deps) => runFx("eurgbp", deps), eurchf: (deps) => runFx("eurchf", deps) },
  });
  if (computed.availability !== "available") assert.fail(computed.reason);
  const payload = { schemaVersion: VERSION, policyVersion: POLICY, family: "launch-fx", evaluatedAt: E, sourceContext, result: computed.bundle };
  const transport = encode("launch-fx", payload);
  assert.ok(inflateRawSync(Buffer.from(transport.body, "base64")).length > 2 * 1024 * 1024);
  const nextEntry = { kind: "FETCH", data: { headers: {}, body: JSON.stringify(transport), status: 200, url: "" }, revalidate: 86400 };
  assert.ok(JSON.stringify(nextEntry).length < 2 * 1024 * 1024);
  const decoded = decode("launch-fx", roundTrip(transport));
  for (const id of ids) assert.equal(decoded.sourceContext[id].observations.length, 10000);
  assert.deepEqual(decoded.result, computed.bundle);
});

test("malformed analytical sections and producer source accessors fail closed", async () => {
  const payload = await estrPayload();
  const transport = encode("estr", payload);
  for (const path of [["result", "data", "signal", "data", "direction"],
    ["result", "data", "risk", "data", "level"], ["result", "data", "signal", "data", "components", "ema"]]) {
    rejected(() => decode("estr", tamper(transport, (wire) => { const node = field(wire, path); node[0] = "string"; node[1] = "unsupported"; })), "result-source-mismatch");
  }
  rejected(() => decode("estr", tamper(transport, (wire) => {
    field(wire, ["result", "data", "features", "ema"])[1] = [];
  })), "result-source-mismatch");
  const observed = observedService();
  const bad = estrSource();
  let getters = 0;
  Object.defineProperty(bad.canonicalSeries.metadata, "provider", { enumerable: true,
    get: () => { getters++; return "ecb"; } });
  observed.setEstr(bad);
  assert.deepEqual(await observed.service.getCanonicalProductResultV1("estr"), {
    availability: "unavailable", productId: "estr", reason: "invalid-input", policyVersion: POLICY, missing: ["temporal"],
  });
  assert.equal(getters, 0);
  assert.equal(observed.caches.get("estr")!.writes, 0);
});

function packetText(text: string): cacheQualification.CanonicalResultCacheTransportV2 {
  const schemaVersion = "canonical-product-result-transport-v2";
  const body = deflateRawSync(Buffer.from(text), { level: 9 }).toString("base64");
  return { schemaVersion, encoding: "deflate-raw-base64", body,
    digest: createHash("sha256").update(schemaVersion + "\n").update(body).digest("hex") };
}
// Independent implementation of the documented logical-node policy.
function logicalNodes(value: unknown): number {
  if (Array.isArray(value)) return 1 + value.reduce((sum, child) => sum + logicalNodes(child), 0);
  if (value !== null && typeof value === "object") {
    return 1 + Object.values(value).reduce<number>((sum, child) => sum + 1 + logicalNodes(child), 0);
  }
  return 1;
}

test("structural preflight rejects million-depth and excessive-node transports before graph allocation", () => {
  const attacks = [
    "[".repeat(1_000_000) + "null" + "]".repeat(1_000_000),
    '["array",['.repeat(1_000_000) + '["null"]' + "]]".repeat(1_000_000),
    '["array",[' + Array.from({ length: 4 }, () =>
      '["array",[' + '["string","x"],'.repeat(99_999) + '["string","x"]]]').join(",") + "]]",
    '["record",1,[["a",["null"]],["a",["null"]]]]',
    '["record",1,[["b",["null"]],["a",["null"]]]]',
    '["boolean",false,true]', '["number","01"]', '["string","\\q"]',
    '["array",[,["null"]]]', '["record",2,[]]', '["null"]trailing',
  ].map(packetText);
  const originalParse = JSON.parse;
  let graphParses = 0;
  JSON.parse = ((text: string, ...args: []) => {
    if (text[0] !== '"') graphParses++;
    return originalParse(text, ...args);
  }) as typeof JSON.parse;
  try {
    for (const attack of attacks) rejected(() => decode("estr", attack), "invalid-cache-transport");
    assert.equal(graphParses, 0, "no complete JSON graph is parsed even for rejected shallow node excess");
  } finally { JSON.parse = originalParse; }
});

test("two 100000-string source arrays accepted by the producer round-trip under unchanged budgets", async () => {
  const sourceContext = estrSource();
  Reflect.set(sourceContext, "extension", [Array(100_000).fill("x"), Array(100_000).fill("x")]);
  const result = await getEstrProductionRuntimeV1({ loadSource: async () => sourceContext, evaluatedAt: E });
  if (result.availability !== "available") assert.fail(result.reason);
  const payload = { schemaVersion: VERSION, policyVersion: POLICY, family: "estr", evaluatedAt: E, sourceContext, result };
  assert.ok(logicalNodes(payload) < 400_000);
  const encoded = encode("estr", payload);
  const decoded = decode("estr", roundTrip(encoded));
  assert.deepEqual(decoded, payload);
  const extension = Reflect.get(decoded.sourceContext, "extension") as string[][];
  assert.equal(extension[0].length, 100_000);
  assert.equal(extension[1].length, 100_000);
  assert.ok(Object.isFrozen(extension[0]));
});

test("producer and preflight share exact node and depth boundaries", async () => {
  const base = await estrPayload();
  const payload = structuredClone(base);
  const extension: unknown[][] = [[], [], [], []];
  Reflect.set(payload.result, "extension", extension);
  let remaining = 400_000 - logicalNodes(payload);
  for (const row of extension) {
    const length = Math.min(100_000, remaining);
    row.push(...Array(length).fill("x"));
    remaining -= length;
  }
  assert.equal(remaining, 0);
  assert.equal(logicalNodes(payload), 400_000);
  const encoded = encode("estr", payload);
  assert.deepEqual(decode("estr", roundTrip(encoded)), payload);
  extension.at(-1)!.push("x");
  assert.equal(logicalNodes(payload), 400_001);
  rejected(() => encode("estr", payload), "invalid-cache-payload");
  rejected(() => decode("estr", tamper(encoded, (wire) => {
    const node = field(wire, ["result", "extension"]);
    const rows = node[1] as unknown[][];
    (rows.at(-1)![1] as unknown[]).push(["string", "x"]);
  })), "invalid-cache-transport");
  let nested: unknown = "x";
  for (let index = 0; index < 96; index++) nested = [nested];
  cacheQualification.ownCanonicalResultPassiveDataV2(nested);
  assert.throws(() => cacheQualification.ownCanonicalResultPassiveDataV2([nested]), TypeError);
  // A depth-96 tagged value passes transport parsing, then fails payload schema.
  const atDepth = '["array",['.repeat(96) + '["string","x"]' + "]]".repeat(96);
  rejected(() => decode("estr", packetText(atDepth)), "invalid-cache-payload");
  rejected(() => decode("estr", packetText('["array",[' + atDepth + "]]")), "invalid-cache-transport");
});

test("large full ESTR wrapper retains all WT/RP/CM rows and prototype-key extensions", async () => {
  const sourceContext = estrSource(-0.5, true, true);
  const observations = Array.from({ length: 10_000 }, (_, index) => ({
    timestamp: LATEST - (9999 - index) * 86400, value: -0.5 + Math.sin(index / 9) * 0.001,
  }));
  Reflect.set(sourceContext.canonicalSeries, "observations", observations);
  const example = sourceContext.observationMetadata[0];
  Reflect.set(sourceContext, "observationMetadata", observations.map(({ timestamp }) => ({
    ...example, timestamp, referenceDate: new Date(timestamp * 1000).toISOString().slice(0, 10),
  })));
  const extension = Object.create(null);
  for (const key of ["__proto__", "constructor", "prototype"]) Object.defineProperty(extension, key, {
    value: { owned: key }, enumerable: true, writable: true, configurable: true,
  });
  Reflect.set(sourceContext, "extension", extension);
  const result = await getEstrProductionRuntimeV1({ loadSource: async () => sourceContext, evaluatedAt: E });
  if (result.availability !== "available") assert.fail(result.reason);
  const payload = { schemaVersion: VERSION, policyVersion: POLICY, family: "estr", evaluatedAt: E, sourceContext, result };
  const decoded = decode("estr", roundTrip(encode("estr", payload)));
  assert.deepEqual(decoded, payload);
  assert.equal(decoded.sourceContext.observationMetadata.length, 10_000);
  assert.equal(Object.getPrototypeOf(Reflect.get(decoded.sourceContext, "extension")), null);
  assert.equal(Object.hasOwn(Object.prototype, "owned"), false);
});

test("required FX and ESTR result contracts reject missing nested fields and contradictory discriminants atomically", async () => {
  const fx = await fxPayload();
  const estr = await estrPayload();
  const fxTransport = encode("launch-fx", fx);
  const estrTransport = encode("estr", estr);
  const fxPaths = [
    ["engineResult", "decision"], ["engineResult", "decision", "data", "score"],
    ["engineResult", "decision", "data", "stance"], ["engineResult", "confidence", "data", "data"],
    ["engineResult", "confidence", "data", "data", "data", "components", "technical"],
    ["engineResult", "confidence", "data", "conviction", "data", "score"],
    ["engineResult", "regime", "availability"],
    ["engineResult", "scenario", "data", "base", "supportingEvidence"],
    ["engineResult", "scenario", "data", "bullish", "strengtheningConditions"],
    ["engineResult", "invalidation", "data", "thesis", "source"],
    ["engineResult", "invalidation", "data", "invalidatesWhen"],
    ["engineResult", "recommendation", "data", "semantic"],
    ["engineResult", "recommendation", "data", "strength", "band"],
    ["engineResult", "recommendation", "data", "dataQuality", "canonicalScore"],
    ["engineResult", "recommendation", "data", "scenario", "base"],
    ["engineResult", "decisionLifecycle", "data", "current"],
    ["engineResult", "macro", "availability"], ["engineResult", "crossAsset", "availability"],
    ["engineResult", "positioning", "availability"], ["engineResult", "contradiction", "availability"],
    ["intelligence", "signal", "reasons"], ["intelligence", "risk", "level"],
    ["calibration", "productionCalibrated"],
  ];
  const estrPaths = [
    ["engineAdapter", "data", "engineEvidence", "macro"], ["engineAdapter", "data", "engineEvidence", "crossAsset"],
    ["engineAdapter", "data", "engineEvidence", "positioning"], ["engineAdapter", "data", "engineEvidence", "dataQuality"],
    ["engineAdapter", "data", "engineEvidence", "signal", "id"],
    ["engineAdapter", "data", "engineEvidence", "signal", "architecturePrior"],
    ["engineAdapter", "data", "engineEvidence", "signal", "coverage"],
    ["engineAdapter", "data", "engineEvidence", "risk", "reasons"],
    ["features", "macd", "signalBp"], ["features", "dailyBpVolatility"],
    ["signal", "data", "components", "ema"], ["risk", "data", "components", "rsiStretch"],
    ["marketState", "data", "volatilityRegime"], ["source", "latestObservationMetadata"],
  ];
  const remove = (wire: unknown[], path: string[]) => {
    const parent = field(wire, path.slice(0, -1));
    parent[2] = (parent[2] as [string, unknown][]).filter(([key]) => key !== path.at(-1));
  };
  const before = lifecycleCalls;
  for (const path of fxPaths) {
    const fullPath = ["result", "eurjpy", ...path];
    rejected(() => decode("launch-fx", tamper(fxTransport, (wire) => remove(wire, fullPath))), "result-source-mismatch");
  }
  rejected(() => decode("launch-fx", tamper(fxTransport, (wire) => {
    field(wire, ["result", "eurjpy", "engineResult", "decision"])[2] = [];
  })), "result-source-mismatch");
  const emptyDecision = structuredClone(fx);
  Reflect.set(emptyDecision.result.eurjpy.engineResult, "decision", {});
  rejected(() => encode("launch-fx", emptyDecision), "result-source-mismatch");
  const missingMacro = structuredClone(estr);
  Reflect.deleteProperty(missingMacro.result.data.engineAdapter.data.engineEvidence, "macro");
  rejected(() => encode("estr", missingMacro), "result-source-mismatch");
  for (const path of estrPaths) rejected(() => decode("estr",
    tamper(estrTransport, (wire) => remove(wire, ["result", "data", ...path]))), "result-source-mismatch");
  for (const path of [["result", "availability"], ...["signal", "risk", "marketState", "engineAdapter"].map((name) =>
    ["result", "data", name, "availability"])]) rejected(() => decode("estr", tamper(estrTransport, (wire) => {
      field(wire, path)[1] = "partial";
    })), "result-source-mismatch");
  for (const path of [["result", "eurjpy", "availability"], ...["macro", "crossAsset", "positioning", "decision",
    "decisionLifecycle", "scenario", "invalidation", "confidence", "regime", "contradiction", "recommendation"].map((name) =>
      ["result", "eurjpy", "engineResult", name, "availability"])]) {
    rejected(() => decode("launch-fx", tamper(fxTransport, (wire) => { field(wire, path)[1] = "unsupported"; })), "result-source-mismatch");
  }
  rejected(() => decode("launch-fx", tamper(fxTransport, (wire) => {
    field(wire, ["result", "eurjpy", "engineResult", "decision", "data", "stance"])[1] = "bullish";
  })), "result-source-mismatch");
  assert.equal(lifecycleCalls, before, "contract validation invokes zero calculations/lifecycle work");
});

test("guard preserves valid deferred/partial sections and compared lifecycle variants", async () => {
  const payload = structuredClone(await fxPayload());
  const engine = payload.result.eurusd.engineResult;
  for (const name of ["scenario", "invalidation", "recommendation", "confidence"]) {
    Reflect.set(engine, name, { availability: "not-computed" });
  }
  Reflect.set(engine, "decision", { ...engine.decision, availability: "partial", missing: ["prior"] });
  if (!("data" in engine.decision)) assert.fail("computed decision");
  const current = engine.decision.data;
  Reflect.set(engine, "decisionLifecycle", { availability: "partial", missing: ["prior"], data: {
    comparison: "compared", previous: current, current, transition: { kind: "maintained", stance: current.stance },
    decisionScoreDelta: 0, convictionDelta: -0, convictionChange: "unchanged",
  } });
  assert.deepEqual(decode("launch-fx", roundTrip(encode("launch-fx", payload))), payload);
});

