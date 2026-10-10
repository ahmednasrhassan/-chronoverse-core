import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  getEstrProductionRuntimeV1,
  type EstrProductionRuntimeDependenciesV1,
  type EstrProductionRuntimeResultV1,
} from "../../assets/estr/runtime";
import * as contract from "../../providers/ecb/estrContract";
import type { EcbEstrSeriesV1 } from "../../providers/ecb/estrTypes";
import * as features from "../../indicators/rateFeatures";
import * as signal from "../../assets/estr/signal";
import * as risk from "../../assets/estr/risk";
import * as marketState from "../../assets/estr/marketState";
import * as adapter from "../../assets/estr/engineAdapter";
import * as admission from "../../services/canonicalTemporalAdmission";
import * as qualification from "../../services/canonicalTemporalQualification";
import * as ownership from "../../services/canonicalProductResultOwnership";

const E = "2026-10-10T12:00:00.123Z";
const ORIGINAL = "2026-10-10T09:00:00.123Z";
const ACQUIRED = Date.parse("2026-10-10T10:00:00.000Z") / 1_000;
const LATEST = Date.parse("2026-10-09T00:00:00.000Z") / 1_000;
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
type Dependencies = Mutable<EstrProductionRuntimeDependenciesV1>;

function source(): Mutable<EcbEstrSeriesV1> {
  const observations = Array.from({ length: 220 }, (_, index) => ({
    timestamp: LATEST - (219 - index) * 86_400,
    value: 1.5 + index * 0.0005 + Math.sin(index / 7) * 0.01,
  }));
  return {
    schemaVersion: "ecb-estr-series-v1", dataflow: contract.ECB_ESTR_DATAFLOW_V1,
    seriesKey: contract.ECB_ESTR_SERIES_KEY_V1,
    canonicalSeries: {
      schemaVersion: "canonical-observation-series-v1", observations,
      metadata: {
        provenanceVersion: "canonical-observation-provenance-v1",
        provider: "ecb", source: "European Central Bank", originalPublisher: "European Central Bank",
        substitution: { status: "none" }, seriesId: contract.ECB_ESTR_SERIES_ID_V1,
        requestedProductId: "estr", canonicalProductId: "estr", interval: "1d",
        fetchedAt: ACQUIRED, sourceTimestamp: LATEST, observationTimestamp: LATEST,
        status: "end_of_day", unit: "percent", seriesKind: "reference-rate",
      },
    },
    observationMetadata: observations.map(({ timestamp }, index) => ({
      timestamp, referenceDate: new Date(timestamp * 1_000).toISOString().slice(0, 10),
      observationStatus: { headline: "A", publicationType: "A", calculationMethod: "A" },
      confidentialityStatus: { headline: "F", publicationType: "F", calculationMethod: "F" },
      publicationType: index % 2 ? "republication" : "standard",
      calculationMethod: index % 3 ? "normal" : "contingency",
    })),
  };
}

function available(result: EstrProductionRuntimeResultV1) {
  if (result.availability !== "available") assert.fail(result.reason);
  assert.ok(result.data.temporalQualification);
  return result.data as typeof result.data & {
    readonly temporalQualification: qualification.CanonicalTemporalQualificationEnvelopeV1;
  };
}
function assertRejected(result: EstrProductionRuntimeResultV1, reason: string) {
  assert.deepEqual(result, { availability: "unavailable", productId: "estr", reason,
    policyVersion: admission.CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1, missing: ["temporal"] });
  assert.ok(Object.isFrozen(result));
  if (result.availability !== "unavailable") assert.fail();
  assert.ok(Object.isFrozen(result.missing));
}
function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertFrozen(child);
}

// Observe actual runtime text with real calculations/helpers and local import spies.
// No production dependency injection or global patch is introduced.
const runtimeText = readFileSync(new URL("../../assets/estr/runtime.ts", import.meta.url), "utf8");
function evaluateModule<T>(text: string, imports: Record<string, unknown>, clone = structuredClone): T {
  const compiled = ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports = {};
  new Function("require", "exports", "structuredClone", compiled)(
    (name: string) => {
      assert.ok(Object.hasOwn(imports, name), "Unexpected import: " + name);
      return imports[name];
    }, exports, clone);
  return exports as T;
}
function observedRuntime(changeClone?: (copy: EcbEstrSeriesV1, original: EcbEstrSeriesV1) => void) {
  const calls = { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 };
  const events: string[] = [];
  let owned: EcbEstrSeriesV1 | undefined;
  let original: EcbEstrSeriesV1 | undefined;
  const imports = {
    "../../providers/ecb/estrContract": contract,
    "../../providers/ecb/estrSeriesCache": { getCanonicalEcbEstrSourceV1: () => assert.fail("No live source") },
    "../../services/canonicalTemporalAdmission": admission,
    "../../services/canonicalTemporalQualification": {
      ...qualification,
      qualifyCanonicalTemporalSourceV1: (input: qualification.CanonicalTemporalQualificationInputV1) => {
        events.push("qualify");
        if (input.productId !== "estr") assert.fail();
        original = input.source;
        return qualification.qualifyCanonicalTemporalSourceV1(input);
      },
      validateCanonicalTemporalQualificationV1: (...args: Parameters<typeof qualification.validateCanonicalTemporalQualificationV1>) => {
        events.push("validate");
        assert.equal(args[1].source, owned);
        assert.notEqual(owned, original);
        return qualification.validateCanonicalTemporalQualificationV1(...args);
      },
    },
    "../../indicators/rateFeatures": { calculateRateFeaturesV1: (...args: Parameters<typeof features.calculateRateFeaturesV1>) => {
      calls.features++; events.push("features");
      assertFrozen(owned);
      assert.equal(args[0], owned!.canonicalSeries.observations);
      return features.calculateRateFeaturesV1(...args);
    } },
    "./signal": { calculateEstrRateSignalV1: (...args: Parameters<typeof signal.calculateEstrRateSignalV1>) => {
      calls.signal++; return signal.calculateEstrRateSignalV1(...args);
    } },
    "./risk": { calculateEstrRateRiskV1: (...args: Parameters<typeof risk.calculateEstrRateRiskV1>) => {
      calls.risk++; return risk.calculateEstrRateRiskV1(...args);
    } },
    "./marketState": { calculateEstrRateMarketStateV1: (...args: Parameters<typeof marketState.calculateEstrRateMarketStateV1>) => {
      calls.marketState++; return marketState.calculateEstrRateMarketStateV1(...args);
    } },
    "./engineAdapter": { adaptEstrRateMarketStateToEngineV3: (...args: Parameters<typeof adapter.adaptEstrRateMarketStateToEngineV3>) => {
      calls.adapter++; return adapter.adaptEstrRateMarketStateToEngineV3(...args);
    } },
  };
  const runtime = evaluateModule<{ getEstrProductionRuntimeV1: typeof getEstrProductionRuntimeV1 }>(runtimeText, imports,
    ((input: EcbEstrSeriesV1) => {
      events.push("clone");
      assert.equal(input, original);
      owned = structuredClone(input);
      changeClone?.(owned, input);
      return owned;
    }) as typeof structuredClone).getEstrProductionRuntimeV1;
  return { runtime, calls, events, owned: () => owned };
}

test("complete WT/RP/CM wrapper is qualified, independently cloned, bound and frozen before calculation", async () => {
  const input = source();
  Reflect.set(input, "extension", { optional: undefined, signedZero: -0, nested: [{ label: "preserved" }] });
  const before = structuredClone(input);
  const observed = observedRuntime();
  const output = available(await observed.runtime({ evaluatedAt: E, loadSource: async () => input }));
  const owned = observed.owned()!;
  assert.deepEqual(owned, input);
  assert.notEqual(owned, input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input), false);
  assertFrozen(owned);
  assertFrozen(output);
  assert.equal(output.source.provenance, owned.canonicalSeries.metadata);
  assert.equal(output.source.latestObservationMetadata, owned.observationMetadata.at(-1));
  assert.notEqual(output.source.provenance, input.canonicalSeries.metadata);
  assert.notEqual(output.source.latestObservationMetadata, input.observationMetadata.at(-1));
  assert.deepEqual(observed.events, ["qualify", "clone", "validate", "features"]);
  assert.deepEqual(observed.calls, { features: 1, signal: 1, risk: 1, marketState: 1, adapter: 1 });
  const expected = qualification.qualifyCanonicalTemporalSourceV1({ productId: "estr", source: before, evaluatedAt: E });
  if (expected.status !== "qualified") assert.fail();
  assert.deepEqual(output.temporalQualification, expected.qualification);
  assert.equal(output.temporalQualification.evaluationTimestampMs, Date.parse(E));
  assert.equal(output.temporalQualification.availabilityEvidence, "unverified");
  assert.equal(output.temporalQualification.publicationTime, "unknown");
});

for (const level of [1.75, 0, -0.593]) {
  for (const publicationType of ["standard", "republication"] as const) {
    for (const calculationMethod of ["normal", "contingency"] as const) {
      test("mathematical parity at " + level + ", RP=" + publicationType + ", CM=" + calculationMethod, async () => {
        const input = source();
        input.canonicalSeries.observations.at(-1)!.value = level;
        Object.assign(input.observationMetadata.at(-1)!, { publicationType, calculationMethod });
        const expectedFeatures = features.calculateRateFeaturesV1(input.canonicalSeries.observations);
        const expectedSignal = signal.calculateEstrRateSignalV1(expectedFeatures);
        const expectedRisk = risk.calculateEstrRateRiskV1(expectedFeatures);
        const expectedState = marketState.calculateEstrRateMarketStateV1(expectedFeatures,
          { signal: expectedSignal, risk: expectedRisk });
        const expectedAdapter = adapter.adaptEstrRateMarketStateToEngineV3({ marketState: expectedState });
        const output = available(await getEstrProductionRuntimeV1({ evaluatedAt: E, loadSource: async () => input }));
        assert.equal(output.currentRatePercent, level);
        assert.deepEqual(output.features, expectedFeatures);
        assert.deepEqual(output.signal, expectedSignal);
        assert.deepEqual(output.risk, expectedRisk);
        assert.deepEqual(output.marketState, expectedState);
        assert.deepEqual(output.engineAdapter, expectedAdapter);
        assert.deepEqual(output.source.provenance, input.canonicalSeries.metadata);
        assert.deepEqual(output.source.latestObservationMetadata, input.observationMetadata.at(-1));
        assert.equal(output.latestReferenceDate, input.observationMetadata.at(-1)!.referenceDate);
        assert.equal(output.sourceTimestamp, LATEST);
        assert.equal(output.fetchedAt, ACQUIRED);
      });
    }
  }
}

type Rejection = [string, (input: Mutable<EcbEstrSeriesV1>) => void, qualification.CanonicalTemporalQualificationRejectionReasonV1];
const rejections: Rejection[] = [
  ["future interior WT", s => { s.canonicalSeries.observations[10].timestamp = LATEST + 2 * 86_400; }, "observation-after-evaluation"],
  ["future latest WT", s => { s.canonicalSeries.observations.at(-1)!.timestamp = LATEST + 2 * 86_400; }, "observation-after-evaluation"],
  ["acquisition after cutoff", s => { s.canonicalSeries.metadata.fetchedAt = Math.floor(Date.parse(E) / 1_000) + 1; }, "acquisition-after-evaluation"],
  ["missing sidecars", s => { Reflect.deleteProperty(s, "observationMetadata"); }, "estr-sidecars-missing"],
  ["missing interior sidecar", s => { s.observationMetadata.splice(10, 1); }, "estr-sidecar-count-mismatch"],
  ["extra sidecar", s => { s.observationMetadata.push(structuredClone(s.observationMetadata[10])); }, "estr-sidecar-count-mismatch"],
  ["duplicate sidecar", s => { s.observationMetadata[10] = structuredClone(s.observationMetadata[9]); }, "estr-sidecar-timestamp-mismatch"],
  ["reordered sidecars", s => { [s.observationMetadata[10], s.observationMetadata[11]] = [s.observationMetadata[11], s.observationMetadata[10]]; }, "estr-sidecar-timestamp-mismatch"],
  ["malformed status triplet", s => { Reflect.deleteProperty(s.observationMetadata[10].observationStatus, "calculationMethod"); }, "estr-sidecar-invalid"],
  ["malformed confidentiality triplet", s => { Reflect.set(s.observationMetadata[10].confidentialityStatus, "headline", 0); }, "estr-sidecar-invalid"],
  ["invalid RP state", s => { Reflect.set(s.observationMetadata[10], "publicationType", "0"); }, "estr-sidecar-enum-invalid"],
  ["invalid CM state", s => { Reflect.set(s.observationMetadata[10], "calculationMethod", "0"); }, "estr-sidecar-enum-invalid"],
  ["invalid interior reference date", s => { s.observationMetadata[10].referenceDate = "2026-02-30"; }, "estr-sidecar-reference-date-invalid"],
  ["misaligned interior reference date", s => { s.observationMetadata[10].referenceDate = s.observationMetadata[11].referenceDate; }, "estr-sidecar-reference-date-invalid"],
  ["wrong EST dataflow", s => { Reflect.set(s, "dataflow", "ECB/EXR/1.0"); }, "invalid-source-wrapper"],
  ["wrong WT key", s => { Reflect.set(s, "seriesKey", "B.EU000A2X2A25.RP"); }, "invalid-source-wrapper"],
  ["wrong series ID", s => { s.canonicalSeries.metadata.seriesId = "EST.B.EU000A2X2A25.CM"; }, "invalid-product-identity"],
  ["wrong product alias", s => { s.canonicalSeries.metadata.requestedProductId = "euro-short-term-rate"; }, "invalid-product-identity"],
  ["wrong canonical product", s => { s.canonicalSeries.metadata.canonicalProductId = "eurusd"; }, "invalid-product-identity"],
  ["wrong unit", s => { s.canonicalSeries.metadata.unit = "basis-points"; }, "invalid-product-identity"],
  ["wrong provider", s => { s.canonicalSeries.metadata.provider = "other"; }, "invalid-product-identity"],
  ["wrong publisher", s => { s.canonicalSeries.metadata.source = "other"; }, "invalid-product-identity"],
  ["wrong interval", s => { Reflect.set(s.canonicalSeries.metadata, "interval", "1h"); }, "invalid-series"],
  ["wrong quotation", s => { Reflect.set(s.canonicalSeries.metadata, "seriesKind", "market-price"); }, "invalid-series"],
  ["inconsistent observation alias", s => { s.canonicalSeries.metadata.observationTimestamp = LATEST - 86_400; }, "inconsistent-observation-alias"],
  ["invalid observation alias", s => { s.canonicalSeries.metadata.observationTimestamp = 1.5; }, "invalid-observation-alias"],
  ["inconsistent source timestamp", s => { s.canonicalSeries.metadata.sourceTimestamp = LATEST - 86_400; }, "inconsistent-source-timestamp"],
  ["invalid source provenance", s => { s.canonicalSeries.metadata.originalPublisher = "other"; }, "invalid-source-metadata"],
  ["non-finite WT rate", s => { s.canonicalSeries.observations[10].value = NaN; }, "invalid-observation-value"],
  ["non-midnight interior WT", s => { s.canonicalSeries.observations[10].timestamp++; }, "non-midnight-observation"],
  ["duplicate interior WT", s => { s.canonicalSeries.observations[10] = structuredClone(s.canonicalSeries.observations[9]); }, "non-canonical-history"],
  ["sparse WT history", s => { Reflect.deleteProperty(s.canonicalSeries.observations, "10"); }, "invalid-input"],
  ["sparse sidecars", s => { Reflect.deleteProperty(s.observationMetadata, "10"); }, "invalid-input"],
  ["WT iterator override", s => { Reflect.set(s.canonicalSeries.observations, Symbol.iterator, () => assert.fail("Iterator executed")); }, "invalid-input"],
  ["sidecar iterator override", s => { Reflect.set(s.observationMetadata, Symbol.iterator, () => assert.fail("Iterator executed")); }, "invalid-input"],
  ["interior accessor", s => { Object.defineProperty(s.canonicalSeries.observations[10], "value", { enumerable: true, get: () => assert.fail("Getter executed") }); }, "invalid-input"],
  ["wrapper accessor", s => { Object.defineProperty(s, "canonicalSeries", { enumerable: true, get: () => assert.fail("Getter executed") }); }, "invalid-input"],
  ["sidecar accessor", s => { Object.defineProperty(s.observationMetadata[10], "referenceDate", { enumerable: true, get: () => assert.fail("Getter executed") }); }, "invalid-input"],
  ["executable metadata", s => { Reflect.set(s.canonicalSeries.metadata, "toJSON", () => assert.fail("toJSON executed")); }, "invalid-input"],
];
for (const [label, mutate, reason] of rejections) {
  test(label + " rejects before every analytical stage", async () => {
    const input = source(); mutate(input);
    const observed = observedRuntime();
    assertRejected(await observed.runtime({ evaluatedAt: E, loadSource: async () => input }), reason);
    assert.deepEqual(observed.calls, { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 });
    assert.deepEqual(observed.events, ["qualify"]);
  });
}

for (const evaluatedAt of [undefined, "", "2026-10-10T12:00:00Z", "2026-10-10T12:00:00.12Z",
  "2026-10-10T12:00:00.1234Z", "2026-10-10T14:00:00.123+02:00", "2026-02-30T12:00:00.123Z"]) {
  test("explicit cutoff " + String(evaluatedAt) + " stays invalid and never defaults", async () => {
    const observed = observedRuntime();
    assertRejected(await observed.runtime({ evaluatedAt, loadSource: async () => source(),
      now: () => assert.fail("Clock sampled") }), "invalid-evaluation-instant");
    assert.deepEqual(observed.calls, { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 });
  });
}

test("explicit cutoff ownership survives original 09:00 -> acquisition 10:00 -> replacement 12:00", async () => {
  const observed = observedRuntime();
  const dependencies: Dependencies = { evaluatedAt: ORIGINAL,
    now: () => assert.fail("Explicit clock sampled"),
    loadSource: async () => { await Promise.resolve(); dependencies.evaluatedAt = E; return source(); } };
  assertRejected(await observed.runtime(dependencies), "acquisition-after-evaluation");
  assert.deepEqual(observed.calls, { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 });
});

test("valid explicit cutoff retains original milliseconds through deletion and clock replacement", async () => {
  const dependencies: Dependencies = { evaluatedAt: E,
    loadSource: async () => {
      await Promise.resolve(); delete dependencies.evaluatedAt;
      dependencies.now = () => assert.fail("Replacement clock sampled"); return source();
    } };
  const output = available(await getEstrProductionRuntimeV1(dependencies));
  assert.equal(output.temporalQualification.evaluatedAt, E);
  assert.equal(output.temporalQualification.evaluationTimestampMs, Date.parse(E));
});

test("originally absent cutoff ignores later addition and samples captured clock once after complete acquisition", async () => {
  let acquired = false;
  let samples = 0;
  const dependencies: Dependencies = {
    now: () => { assert.equal(acquired, true); samples++; return new Date(E); },
    loadSource: async () => {
      await Promise.resolve(); dependencies.evaluatedAt = ORIGINAL;
      dependencies.now = () => assert.fail("Replacement clock sampled"); acquired = true; return source();
    },
  };
  const output = available(await getEstrProductionRuntimeV1(dependencies));
  assert.equal(samples, 1);
  assert.equal(output.temporalQualification.evaluatedAt, E);
});

test("originally absent cutoff does not read a later caller getter", async () => {
  const dependencies: Dependencies = { now: () => new Date(E), loadSource: async () => {
    await Promise.resolve();
    Object.defineProperty(dependencies, "evaluatedAt", { get: () => assert.fail("Late getter read") });
    Object.defineProperty(dependencies, "now", { get: () => assert.fail("Late clock getter read") });
    return source();
  } };
  assert.equal(available(await getEstrProductionRuntimeV1(dependencies)).temporalQualification.evaluatedAt, E);
});

for (const field of ["evaluatedAt", "now", "loadSource"] as const) {
  test("dependency accessor " + field + " rejects without execution or acquisition", async () => {
    let loads = 0;
    const dependencies: Dependencies = { loadSource: async () => { loads++; return source(); } };
    Object.defineProperty(dependencies, field, { enumerable: true, get: () => assert.fail("Dependency getter read") });
    assertRejected(await getEstrProductionRuntimeV1(dependencies), "invalid-input");
    assert.equal(loads, 0);
  });
}
test("inherited and executable dependency shapes reject without execution", async () => {
  for (const dependencies of [Object.create({ evaluatedAt: E }),
    { evaluatedAt: () => assert.fail("Executable cutoff"), loadSource: async () => source() },
    { evaluatedAt: { toString: () => assert.fail("Cutoff coerced") }, loadSource: async () => source() },
    { loadSource: "invalid" }, { now: "invalid" }]) {
    assertRejected(await getEstrProductionRuntimeV1(dependencies as EstrProductionRuntimeDependenciesV1), "invalid-input");
  }
});

test("default clock errors and invalid dates produce typed unavailability", async () => {
  for (const now of [() => { throw new Error("Clock failure"); }, () => new Date(NaN)]) {
    assertRejected(await getEstrProductionRuntimeV1({ loadSource: async () => source(), now }), "invalid-evaluation-instant");
  }
});
test("same-second precision ambiguity and supplied release remain unverified", async () => {
  const input = source();
  input.canonicalSeries.metadata.fetchedAt = Math.floor(Date.parse(E) / 1_000);
  input.canonicalSeries.metadata.releaseTimestamp = input.canonicalSeries.metadata.fetchedAt;
  const output = available(await getEstrProductionRuntimeV1({ evaluatedAt: E, loadSource: async () => input }));
  assert.equal(output.temporalQualification.sameSecondPrecisionAmbiguity, true);
  assert.equal(output.temporalQualification.availabilityEvidence, "unverified");
  assert.equal(output.temporalQualification.publicationTime, "supplied-unverified");
});

test("source mutation queued after acquisition cannot affect owned calculations or result references", async () => {
  const input = source();
  const original = structuredClone(input);
  let mutated = false;
  const observed = observedRuntime();
  const output = available(await observed.runtime({ loadSource: async () => input, now: () => {
    queueMicrotask(() => {
      input.canonicalSeries.observations[10].timestamp = LATEST + 2 * 86_400;
      input.canonicalSeries.observations.at(-1)!.value = 999;
      input.canonicalSeries.metadata.sourceTimestamp = 1;
      input.observationMetadata.at(-1)!.referenceDate = "invalid";
      mutated = true;
    }); return new Date(E);
  } }));
  assert.equal(mutated, true);
  assert.deepEqual(observed.owned(), original);
  assert.deepEqual(output.features, features.calculateRateFeaturesV1(original.canonicalSeries.observations));
  assert.deepEqual(output.source.provenance, original.canonicalSeries.metadata);
  assert.deepEqual(output.source.latestObservationMetadata, original.observationMetadata.at(-1));
});

for (const [label, change] of [
  ["interior value", (s: EcbEstrSeriesV1) => { Reflect.set(s.canonicalSeries.observations[10], "value", 2); }],
  ["interior sidecar", (s: EcbEstrSeriesV1) => { Reflect.set(s.observationMetadata[10], "publicationType", "republication"); }],
  ["complete wrapper metadata", (s: EcbEstrSeriesV1) => { Reflect.set(s, "extraMetadata", "changed"); }],
] as const) {
  test("clone binding change in " + label + " fails before calculations", async () => {
    const observed = observedRuntime(copy => change(copy));
    assertRejected(await observed.runtime({ evaluatedAt: E, loadSource: async () => source() }), "qualification-mismatch");
    assert.deepEqual(observed.calls, { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 });
    assert.deepEqual(observed.events, ["qualify", "clone", "validate"]);
  });
}

test("JSON envelope revalidation requires full independent source and original cutoff", async () => {
  const input = source();
  const independent = structuredClone(input);
  const output = available(await getEstrProductionRuntimeV1({ evaluatedAt: E, loadSource: async () => input }));
  const decoded: unknown = JSON.parse(JSON.stringify(output.temporalQualification));
  const expected = { productId: "estr" as const, source: independent, evaluatedAt: E };
  const validated = qualification.validateCanonicalTemporalQualificationV1(decoded, expected);
  if (validated.status !== "qualified") assert.fail();
  assert.deepEqual(validated.qualification, output.temporalQualification);
  assert.notEqual(validated.qualification, decoded);
  assertFrozen(validated.qualification);
  assert.equal(qualification.validateCanonicalTemporalQualificationV1(decoded,
    { ...expected, evaluatedAt: E.replace(".123Z", ".124Z") }).status, "rejected");
  const truncated = structuredClone(independent);
  truncated.canonicalSeries.observations = truncated.canonicalSeries.observations.slice(-200);
  truncated.observationMetadata = truncated.observationMetadata.slice(-200);
  assert.deepEqual(qualification.validateCanonicalTemporalQualificationV1(decoded, { ...expected, source: truncated }),
    { status: "rejected", reason: "qualification-mismatch", policyVersion: admission.CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 });
  const latestOnly = structuredClone(independent);
  latestOnly.observationMetadata = latestOnly.observationMetadata.slice(-1);
  assert.equal(qualification.validateCanonicalTemporalQualificationV1(decoded, { ...expected, source: latestOnly }).status, "rejected");
  independent.observationMetadata[10].calculationMethod = "contingency";
  assert.equal(qualification.validateCanonicalTemporalQualificationV1(decoded, expected).status, "rejected");
});

test("existing production result owner carries temporal unavailable values without caching them or loading FX", async () => {
  const result = await getEstrProductionRuntimeV1({ evaluatedAt: ORIGINAL, loadSource: async () => source() });
  assertRejected(result, "acquisition-after-evaluation");
  let loads = 0;
  let cacheWrites = 0;
  const cacheKeys: unknown[] = [];
  const serviceText = readFileSync(new URL("../../services/canonicalProductResults.ts", import.meta.url), "utf8");
  // In-memory observation of the existing cache boundary, with no cache I/O.
  const imports: Record<string, unknown> = Object.fromEntries(Array.from(
    serviceText.matchAll(/from\s+"([^"]+)"|import\s+"([^"]+)"/g),
    match => [match[1] ?? match[2], {}]));
  imports["../assets/estr/runtime"] = { getEstrProductionRuntimeV1: async () => { loads++; return result; } };
  imports["./canonicalProductResultOwnership"] = ownership;
  imports["next/cache"] = { unstable_cache: (load: () => Promise<unknown>, keys: unknown, options: unknown) => {
    cacheKeys.push({ keys, options });
    return async () => { const value = await load(); cacheWrites++; return value; };
  } };
  const owner = evaluateModule<{ getCanonicalProductResultV1: (id: "estr") => Promise<EstrProductionRuntimeResultV1> }>(serviceText, imports);
  assert.equal(await owner.getCanonicalProductResultV1("estr"), result);
  assert.equal(await owner.getCanonicalProductResultV1("estr"), result);
  assert.equal(loads, 2);
  assert.equal(cacheWrites, 0);
  assert.equal(cacheKeys.length, 2);
});

test("source load failure retains existing unavailable API and performs no fallback or clock sample", async () => {
  let loads = 0;
  const result = await getEstrProductionRuntimeV1({ loadSource: async () => { loads++; throw new Error("Unavailable"); },
    now: () => assert.fail("Clock sampled before complete acquisition") });
  assert.equal(loads, 1);
  assert.equal(result.availability, "unavailable");
  if (result.availability !== "unavailable") assert.fail();
  assert.deepEqual(result.missing, ["source"]);
  assert.equal("policyVersion" in result, false);
});

for (const cutoff of [undefined, "invalid"]) {
  test("original explicit " + String(cutoff) + " cannot be repaired or removed during acquisition", async () => {
    for (const remove of [false, true]) {
      const dependencies: Dependencies = { evaluatedAt: cutoff,
        now: () => assert.fail("Invalid cutoff defaulted"),
        loadSource: async () => {
          await Promise.resolve();
          if (remove) delete dependencies.evaluatedAt;
          else dependencies.evaluatedAt = E;
          return source();
        } };
      const observed = observedRuntime();
      assertRejected(await observed.runtime(dependencies), "invalid-evaluation-instant");
      assert.deepEqual(observed.calls, { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 });
    }
  });
}

test("loader and clock callbacks never receive the internal cutoff capture as their receiver", async () => {
  let acquired = false;
  const output = available(await getEstrProductionRuntimeV1({
    loadSource: async function (this: unknown) { assert.equal(this, undefined); acquired = true; return source(); },
    now: function (this: unknown) { assert.equal(this, undefined); assert.equal(acquired, true); return new Date(E); },
  }));
  assert.equal(output.temporalQualification.evaluatedAt, E);
});

test("same-second acquisition equality without a release remains ambiguous and publication unknown", async () => {
  const input = source();
  input.canonicalSeries.metadata.fetchedAt = Math.floor(Date.parse(E) / 1_000);
  const output = available(await getEstrProductionRuntimeV1({ evaluatedAt: E, loadSource: async () => input }));
  assert.equal(output.temporalQualification.sameSecondPrecisionAmbiguity, true);
  assert.equal(output.temporalQualification.publicationTime, "unknown");
  assert.equal(output.temporalQualification.availabilityEvidence, "unverified");
});

test("valid source below history minimum is qualified but runs no analytical stage", async () => {
  const input = source();
  input.canonicalSeries.observations = input.canonicalSeries.observations.slice(-199);
  input.observationMetadata = input.observationMetadata.slice(-199);
  const observed = observedRuntime();
  const result = await observed.runtime({ evaluatedAt: E, loadSource: async () => input });
  if (result.availability !== "unavailable") assert.fail();
  assert.deepEqual(result.missing, ["history"]);
  assert.deepEqual(observed.events, ["qualify", "clone", "validate"]);
  assert.deepEqual(observed.calls, { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 });
});

test("changing original source and cloned source after qualification cannot replace the original binding", async () => {
  const input = source();
  const observed = observedRuntime((copy, original) => {
    Reflect.set(original.canonicalSeries.observations[10], "value", 3);
    Reflect.set(copy.canonicalSeries.observations[10], "value", 3);
  });
  assertRejected(await observed.runtime({ evaluatedAt: E, loadSource: async () => input }), "qualification-mismatch");
  assert.deepEqual(observed.calls, { features: 0, signal: 0, risk: 0, marketState: 0, adapter: 0 });
});
