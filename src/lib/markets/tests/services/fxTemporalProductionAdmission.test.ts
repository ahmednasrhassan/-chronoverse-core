import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeCanonicalFxResultBundleV1,
  type CanonicalFxBundleComputationDependenciesV1,
} from "../../services/canonicalProductResults";
import {
  CANONICAL_FX_PREFLIGHT_ORDER_V1,
  CanonicalFxTemporalAdmissionErrorV1,
  createCanonicalMarketSnapshotV1,
} from "../../services/canonicalMarketSnapshot";
import { coordinateCanonicalMarketEvaluationV1 } from "../../engine/marketEvaluationCoordinator";
import { integrateCanonicalDecisionLifecycleV3 } from "../../engine/decisionLifecycleRuntime";
import { getCanonicalLiveEurUsdIntelligence } from "../../assets/eurusd/productionRuntime";
import { getCanonicalLiveEurJpyIntelligence } from "../../assets/eurjpy/productionRuntime";
import { getCanonicalLiveEurGbpIntelligence } from "../../assets/eurgbp/productionRuntime";
import { getCanonicalLiveEurChfIntelligence } from "../../assets/eurchf/productionRuntime";
import {
  ECB_FX_REFERENCE_PRODUCTS_V1,
  type EcbFxReferenceSeriesBundleV1,
} from "../../providers/ecb/fxReferenceSeries";
import type { EcbFxReferenceProductIdV1 } from "../../providers/ecb/types";
import type { CanonicalObservationSeriesV1 } from "../../services/canonicalObservationSeries";
import { qualifyCanonicalTemporalSourceV1 } from "../../services/canonicalTemporalQualification";

const E = "2026-10-10T12:00:00.123Z";
const ids = CANONICAL_FX_PREFLIGHT_ORDER_V1;
const realRuntimes = {
  eurusd: getCanonicalLiveEurUsdIntelligence,
  eurjpy: getCanonicalLiveEurJpyIntelligence,
  eurgbp: getCanonicalLiveEurGbpIntelligence,
  eurchf: getCanonicalLiveEurChfIntelligence,
} as const;
type Runtimes = NonNullable<CanonicalFxBundleComputationDependenciesV1["runtimes"]>;

function source(productId: EcbFxReferenceProductIdV1): CanonicalObservationSeriesV1 {
  const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
  const observations = Array.from({ length: 900 }, (_, i) => ({
    timestamp: Date.UTC(2023, 0, 1) / 1_000 + i * 86_400,
    value: (productId === "eurjpy" ? 150 : 1.1) *
      (1 + i * 0.00001 + Math.sin(i / 9) * 0.002),
  }));
  return {
    schemaVersion: "canonical-observation-series-v1",
    observations,
    metadata: {
      provider: "ecb", source: "European Central Bank",
      seriesId: product.seriesId, requestedProductId: productId,
      canonicalProductId: productId, interval: "1d",
      fetchedAt: Date.parse("2026-10-10T10:00:00.000Z") / 1_000,
      sourceTimestamp: observations.at(-1)!.timestamp,
      observationTimestamp: observations.at(-1)!.timestamp,
      status: "end_of_day", unit: product.unit, seriesKind: "reference-rate",
    },
  };
}
function bundle(): EcbFxReferenceSeriesBundleV1 {
  return { eurusd: source("eurusd"), eurjpy: source("eurjpy"),
    eurgbp: source("eurgbp"), eurchf: source("eurchf") };
}
function futureInterior(original: CanonicalObservationSeriesV1): CanonicalObservationSeriesV1 {
  const observations = original.observations.map((row) => ({ ...row }));
  observations[10].timestamp = Date.parse("2026-10-11T00:00:00.000Z") / 1_000;
  return { ...original, observations };
}
function neverLaunch(capture: { launches: number }): Runtimes {
  const run = async () => { capture.launches++; throw new Error("Must not launch runtime"); };
  return { eurusd: run, eurjpy: run, eurgbp: run, eurchf: run };
}
async function rejectDirect(
  productId: EcbFxReferenceProductIdV1,
  input: unknown,
  reason: string,
  evaluatedAt = E,
): Promise<void> {
  let integrations = 0;
  let writes = 0;
  await assert.rejects(realRuntimes[productId]({
    loadCanonicalSeries: async () => input as CanonicalObservationSeriesV1,
    evaluatedAt,
    now: () => { throw new Error("Explicit cutoff must not resample"); },
    integrateDecisionLifecycle: async () => {
      integrations++; throw new Error("Must not integrate rejected input");
    },
    advanceDecisionSnapshot: async () => {
      writes++; throw new Error("Must not persist rejected input");
    },
  }), (error: unknown) => {
    assert.ok(error instanceof CanonicalFxTemporalAdmissionErrorV1);
    assert.equal(error.result.availability, "unavailable");
    assert.equal(error.result.productId, productId);
    assert.equal(error.result.reason, reason);
    return true;
  });
  assert.equal(integrations, 0);
  assert.equal(writes, 0);
}

for (const productId of ids) {
  test(`${productId}: future interior row rejects entire family before launch`, async () => {
    const sources = { ...bundle(), [productId]: futureInterior(source(productId)) };
    const capture = { launches: 0 };
    const original = JSON.stringify(sources);
    const result = await computeCanonicalFxResultBundleV1({
      loadSourceBundle: async () => sources, evaluatedAt: E, runtimes: neverLaunch(capture),
    });
    assert.equal(result.availability, "unavailable");
    if (result.availability !== "unavailable") assert.fail("Expected unavailable family");
    assert.equal(result.productId, productId);
    assert.equal(result.reason, "observation-after-evaluation");
    assert.equal(capture.launches, 0);
    assert.equal(JSON.stringify(sources), original);
    assert.ok(!("bundle" in result));
  });
  test(`${productId}: direct runtime rejects future history outside its analytical window`, async () => {
    await rejectDirect(productId, futureInterior(source(productId)), "observation-after-evaluation");
  });
  test(`${productId}: direct snapshot gates future rows before normalization`, async () => {
    const result = await createCanonicalMarketSnapshotV1({
      assetIds: [productId], interval: "1d", history: { kind: "range", range: "max" },
      evaluatedAt: E,
    }, { loadHistoricalMarketData: async () => futureInterior(source(productId)) });
    assert.equal(result.availability, "unavailable");
    assert.equal(result.assets[0].observationCount, 0);
    assert.equal(result.assets[0].temporalFailure?.productId, productId);
    assert.equal(result.assets[0].temporalFailure?.reason, "observation-after-evaluation");
    assert.equal(result.assets[0].temporalQualification, undefined);
  });
  test(`${productId}: mismatched source identity rejects through the direct runtime`, async () => {
    const wrong = source(productId === "eurusd" ? "eurjpy" : "eurusd");
    await rejectDirect(productId, wrong, "invalid-product-identity");
  });
}

test("shared cutoff sampled once after complete acquisition; four outputs and lifecycle inputs agree", async () => {
  const sources = { ...bundle() };
  let acquired = false;
  let clockCalls = 0;
  const integrations: { assetId: string; computedAt: string }[] = [];
  const writes: { assetId: string; computedAt: string }[] = [];
  const lifecycle = {
    integrateDecisionLifecycle: async (input: Parameters<typeof integrateCanonicalDecisionLifecycleV3>[0]) => {
      assert.equal(acquired, true);
      integrations.push({ assetId: input.assetId, computedAt: input.computedAt });
      return integrateCanonicalDecisionLifecycleV3(input);
    },
    advanceDecisionSnapshot: async (snapshot: { assetId: string; computedAt: string }) => {
      writes.push({ assetId: snapshot.assetId, computedAt: snapshot.computedAt });
      return { status: "initialized", previous: null } as const;
    },
  };
  const runtimes: Runtimes = {
    eurusd: (deps) => realRuntimes.eurusd({ ...deps, ...lifecycle }),
    eurjpy: (deps) => realRuntimes.eurjpy({ ...deps, ...lifecycle }),
    eurgbp: (deps) => realRuntimes.eurgbp({ ...deps, ...lifecycle }),
    eurchf: (deps) => realRuntimes.eurchf({ ...deps, ...lifecycle }),
  };
  const before = JSON.stringify(sources);
  const result = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => { await Promise.resolve(); acquired = true; return sources; },
    now: () => { assert.equal(acquired, true); clockCalls++; return new Date(E); },
    runtimes,
  });
  assert.equal(result.availability, "available");
  if (result.availability !== "available") assert.fail("Expected available family");
  assert.equal(result.evaluatedAt, E);
  assert.equal(clockCalls, 1);
  assert.deepEqual(integrations.map((row) => row.assetId).sort(), [...ids].sort());
  assert.equal(writes.length, 4);
  for (const row of [...integrations, ...writes]) assert.equal(row.computedAt, E);
  for (const productId of ids) {
    const output: Awaited<ReturnType<typeof getCanonicalLiveEurUsdIntelligence>> = result.bundle[productId];
    assert.equal(output.engineResult.evaluatedAt, E);
    assert.equal(output.engineResult.marketData.historicalWindow?.receivedPoints, 900);
    const qualified = qualifyCanonicalTemporalSourceV1({ productId, source: sources[productId], evaluatedAt: E });
    assert.equal(qualified.status, "qualified");
    if (qualified.status !== "qualified") assert.fail("Expected qualification");
    assert.deepEqual(output.temporalQualification, qualified.qualification);
    assert.equal(output.temporalQualification?.evaluationTimestampMs, Date.parse(E));
    assert.equal(output.temporalQualification?.availabilityEvidence, "unverified");
    assert.equal(output.temporalQualification?.publicationTime, "unknown");
    assert.ok(Object.isFrozen(output.provenance));
  }
  assert.equal(JSON.stringify(sources), before);
  const explicit = E.replace(".123Z", ".999Z");
  const explicitResult = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => sources, evaluatedAt: explicit, runtimes,
    now: () => { throw new Error("Successful explicit cutoff must not resample"); },
  });
  if (explicitResult.availability !== "available") assert.fail();
  assert.equal(explicitResult.evaluatedAt, explicit);
  assert.equal(clockCalls, 1);
  for (const productId of ids) {
    const output: Awaited<ReturnType<typeof getCanonicalLiveEurUsdIntelligence>> =
      explicitResult.bundle[productId];
    assert.equal(output.engineResult.evaluatedAt, explicit);
    assert.equal(output.temporalQualification?.evaluatedAt, explicit);
    assert.deepEqual(output.temporalQualification?.sourceBinding,
      result.bundle[productId].temporalQualification?.sourceBinding);
    assert.deepEqual(output.engineResult.technical, result.bundle[productId].engineResult.technical);
    assert.deepEqual(output.engineResult.risk, result.bundle[productId].engineResult.risk);
    assert.deepEqual(output.engineResult.signal, result.bundle[productId].engineResult.signal);
  }
  for (const row of [...integrations.slice(4), ...writes.slice(4)]) {
    assert.equal(row.computedAt, explicit);
  }
});

test("explicit shared cutoff is preserved exactly and never resampled", async () => {
  const capture = { launches: 0 };
  const sources = { ...bundle() };
  sources.eurchf = { ...sources.eurchf, metadata: { ...sources.eurchf.metadata,
    fetchedAt: Math.floor(Date.parse(E) / 1_000) + 1 } };
  const result = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => sources, evaluatedAt: E,
    now: () => { throw new Error("Must not resample explicit cutoff"); },
    runtimes: neverLaunch(capture),
  });
  assert.deepEqual(result, { availability: "unavailable", productId: "eurchf",
    reason: "acquisition-after-evaluation", policyVersion: "canonical-temporal-admission-v1" });
  assert.equal(capture.launches, 0);
});

test("invalid clocks fail closed without runtimes", async () => {
  const clocks = ["2026-10-10T12:00:00Z", "2026-02-30T12:00:00.000Z",
    "2026-10-10T14:00:00.123+02:00", "", undefined, 123];
  for (const evaluatedAt of clocks) {
    const capture = { launches: 0 };
    const result = await computeCanonicalFxResultBundleV1({
      loadSourceBundle: async () => bundle(), evaluatedAt: evaluatedAt as string,
      runtimes: neverLaunch(capture),
    });
    assert.equal(result.availability, "unavailable");
    if (result.availability !== "unavailable") assert.fail();
    assert.equal(result.reason, "invalid-evaluation-instant");
    assert.equal(capture.launches, 0);
  }
  for (const now of [() => new Date(NaN), () => { throw new Error("Clock failed"); }]) {
    const result = await computeCanonicalFxResultBundleV1({
      loadSourceBundle: async () => bundle(), now, runtimes: neverLaunch({ launches: 0 }),
    });
    assert.equal(result.availability, "unavailable");
    if (result.availability !== "unavailable") assert.fail();
    assert.equal(result.reason, "invalid-evaluation-instant");
  }
});

test("same-second ambiguity is accepted with unverified evidence at the snapshot boundary", async () => {
  const series = source("eurusd");
  const fetchedAt = Math.floor(Date.parse(E) / 1_000);
  const input = { ...series, metadata: { ...series.metadata, fetchedAt, releaseTimestamp: fetchedAt } };
  const snapshot = await createCanonicalMarketSnapshotV1({
    assetIds: ["eurusd"], interval: "1d", history: { kind: "range", range: "max" }, evaluatedAt: E,
  }, { loadHistoricalMarketData: async () => input,
    now: () => { throw new Error("Must not replace explicit cutoff"); } });
  assert.equal(snapshot.availability, "available");
  assert.equal(snapshot.computedAt, E);
  assert.equal(snapshot.assets[0].temporalQualification?.sameSecondPrecisionAmbiguity, true);
  assert.equal(snapshot.assets[0].temporalQualification?.availabilityEvidence, "unverified");
  assert.equal(snapshot.assets[0].temporalQualification?.publicationTime, "supplied-unverified");
});

test("passive boundary rejects sparse, executable, accessor and malformed inputs without invoking getters", async () => {
  const valid = source("eurusd");
  const sparse = [...valid.observations];
  delete sparse[10];
  const iterator = [...valid.observations];
  Object.defineProperty(iterator, Symbol.iterator, { value: function* () {
    yield* valid.observations.filter((_, i) => i !== 10);
  } });
  const executable = [...valid.observations];
  Object.defineProperty(executable, "map", { value: () => [] });
  const malformedIndex = [...valid.observations];
  Object.defineProperty(malformedIndex, "01", { value: valid.observations[1], enumerable: true });
  let getters = 0;
  const accessorRow = [...valid.observations];
  accessorRow[10] = Object.defineProperty({ value: 1.1 }, "timestamp", {
    enumerable: true, get() { getters++; throw new Error("Must not invoke row getter"); },
  }) as CanonicalObservationSeriesV1["observations"][number];
  const metadata = Object.defineProperty({ ...valid.metadata }, "fetchedAt", {
    enumerable: true, get() { getters++; throw new Error("Must not invoke metadata getter"); },
  });
  for (const observations of [sparse, iterator, executable, malformedIndex, accessorRow]) {
    await rejectDirect("eurusd", { ...valid, observations }, "invalid-input");
    const result = await createCanonicalMarketSnapshotV1({
      assetIds: ["eurusd"], interval: "1d", history: { kind: "range", range: "max" }, evaluatedAt: E,
    }, { loadHistoricalMarketData: async () => ({ ...valid, observations }) });
    assert.equal(result.assets[0].temporalFailure?.reason, "invalid-input");
  }
  await rejectDirect("eurusd", { ...valid, metadata }, "invalid-input");
  await rejectDirect("eurusd", null, "invalid-source-wrapper");
  await rejectDirect("eurusd", { ...valid, observations: {} }, "invalid-series");
  const throwingProxy = new Proxy(valid, { ownKeys() { throw new Error("Reflection failed"); } });
  await rejectDirect("eurusd", throwingProxy, "invalid-input");
  assert.equal(getters, 0);
});

test("future row cannot be hidden behind a custom iterator through family preflight", async () => {
  const hidden = futureInterior(source("eurjpy"));
  Object.defineProperty(hidden.observations, Symbol.iterator, {
    value: function* () { yield* source("eurjpy").observations; },
  });
  const result = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => ({ ...bundle(), eurjpy: hidden }), evaluatedAt: E,
    runtimes: neverLaunch({ launches: 0 }),
  });
  assert.equal(result.availability, "unavailable");
  if (result.availability !== "unavailable") assert.fail();
  assert.equal(result.productId, "eurjpy");
  assert.equal(result.reason, "invalid-input");
});

test("bundle accessors, missing products and cutoff accessors reject without execution", async () => {
  let getters = 0;
  const sources = Object.defineProperty(bundle(), "eurgbp", {
    enumerable: true, get() { getters++; throw new Error("Must not invoke bundle getter"); },
  });
  const result = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => sources, evaluatedAt: E, runtimes: neverLaunch({ launches: 0 }),
  });
  assert.equal(result.availability, "unavailable");
  if (result.availability !== "unavailable") assert.fail();
  assert.equal(result.productId, "eurgbp");
  assert.equal(result.reason, "invalid-input");
  const dependencies = Object.defineProperty({
    loadSourceBundle: async () => bundle(), runtimes: neverLaunch({ launches: 0 }),
  }, "evaluatedAt", { enumerable: true, get() { getters++; return E; } });
  const clockResult = await computeCanonicalFxResultBundleV1(dependencies);
  assert.equal(clockResult.availability, "unavailable");
  if (clockResult.availability !== "unavailable") assert.fail();
  assert.equal(clockResult.reason, "invalid-evaluation-instant");
  const missing = { ...bundle() } as Partial<Record<EcbFxReferenceProductIdV1, CanonicalObservationSeriesV1>>;
  delete missing.eurchf;
  const absent = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => missing as EcbFxReferenceSeriesBundleV1, evaluatedAt: E,
    runtimes: neverLaunch({ launches: 0 }),
  });
  assert.equal(absent.availability, "unavailable");
  if (absent.availability !== "unavailable") assert.fail();
  assert.equal(absent.productId, "eurchf");
  assert.equal(absent.reason, "invalid-input");
  assert.equal(getters, 0);
});

test("direct snapshots reject unordered duplicates rather than repair them", async () => {
  const valid = source("eurusd");
  for (const observations of [
    [...valid.observations].reverse(),
    [valid.observations[0], ...valid.observations],
  ]) {
    const snapshot = await createCanonicalMarketSnapshotV1({
      assetIds: ["eurusd"], interval: "1d", history: { kind: "range", range: "max" }, evaluatedAt: E,
    }, { loadHistoricalMarketData: async () => ({ ...valid, observations }) });
    assert.equal(snapshot.assets[0].temporalFailure?.reason, "non-canonical-history");
    assert.equal(snapshot.assets[0].observationCount, 0);
  }
});

test("coordinator preserves typed FX failure and runs no cross-asset calculator", async () => {
  let calculations = 0;
  await assert.rejects(coordinateCanonicalMarketEvaluationV1({
    targetAssetIds: ["eurusd"], interval: "1d", history: { kind: "range", range: "max" }, evaluatedAt: E,
  }, {
    createSnapshot: (request) => {
      assert.equal(request.evaluatedAt, E);
      return createCanonicalMarketSnapshotV1(request, {
        loadHistoricalMarketData: async () => futureInterior(source("eurusd")),
      });
    },
    calculateCrossAssetSections: () => { calculations++; throw new Error("Must not calculate"); },
  }), (error: unknown) => {
    assert.ok(error instanceof CanonicalFxTemporalAdmissionErrorV1);
    assert.equal(error.result.productId, "eurusd");
    assert.equal(error.result.reason, "observation-after-evaluation");
    return true;
  });
  assert.equal(calculations, 0);
});

test("unrelated coordinator failures retain sanitized message and diagnostic cause", async () => {
  const cause = new Error("Injected deterministic failure");
  await assert.rejects(coordinateCanonicalMarketEvaluationV1({
    targetAssetIds: ["eurusd"], interval: "1d", history: { kind: "range", range: "max" },
  }, { createSnapshot: async () => { throw cause; } }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Canonical market evaluation coordination failed.");
    assert.equal(error.cause, cause);
    return true;
  });
});

test("source acquisition failure produces typed unavailability and never launches", async () => {
  const capture = { launches: 0 };
  const result = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => { throw new Error("Injected source failure"); },
    runtimes: neverLaunch(capture),
  });
  assert.equal(result.availability, "unavailable");
  if (result.availability !== "unavailable") assert.fail();
  assert.equal(result.reason, "source-unavailable");
  assert.equal(capture.launches, 0);
});


test("multi-product direct snapshot rejects its whole FX family before normalization", async () => {
  const sources = bundle();
  const bySymbol = new Map<string, EcbFxReferenceProductIdV1>(ids.map((id) => [ECB_FX_REFERENCE_PRODUCTS_V1[id].quoteCurrency, id]));
  const snapshot = await createCanonicalMarketSnapshotV1({
    assetIds: ids, interval: "1d", history: { kind: "range", range: "max" }, evaluatedAt: E,
  }, { loadHistoricalMarketData: async (symbol) => {
    const id = bySymbol.get(symbol.slice(3, 6))!;
    assert.ok(id);
    return id === "eurchf" ? futureInterior(sources[id]) : sources[id];
  } });
  assert.equal(snapshot.availability, "unavailable");
  assert.equal(snapshot.assets.length, 4);
  for (const asset of snapshot.assets) {
    assert.equal(asset.observationCount, 0);
    assert.equal(asset.temporalQualification, undefined);
    assert.equal(asset.temporalFailure?.productId, "eurchf");
    assert.equal(asset.temporalFailure?.reason, "observation-after-evaluation");
  }
});

test("direct clock and acquisition failures retain typed reasons without lifecycle effects", async () => {
  const valid = source("eurusd");
  await rejectDirect("eurusd", valid, "invalid-evaluation-instant", "2026-10-10T12:00:00Z");
  const after = { ...valid, metadata: { ...valid.metadata,
    fetchedAt: Math.floor(Date.parse(E) / 1_000) + 1 } };
  await rejectDirect("eurusd", after, "acquisition-after-evaluation");
  for (const [input, evaluatedAt, reason] of [
    [valid, "2026-10-10T12:00:00Z", "invalid-evaluation-instant"],
    [after, E, "acquisition-after-evaluation"],
  ] as const) {
    const snapshot = await createCanonicalMarketSnapshotV1({
      assetIds: ["eurusd"], interval: "1d", history: { kind: "range", range: "max" }, evaluatedAt,
    }, { loadHistoricalMarketData: async () => input });
    assert.equal(snapshot.availability, "unavailable");
    assert.equal(snapshot.assets[0].temporalFailure?.reason, reason);
  }
});

test("direct snapshot samples once only after acquisition", async () => {
  let acquired = false;
  let samples = 0;
  const snapshot = await createCanonicalMarketSnapshotV1({
    assetIds: ["eurusd"], interval: "1d", history: { kind: "range", range: "max" },
  }, {
    loadHistoricalMarketData: async () => {
      await Promise.resolve(); acquired = true; return source("eurusd");
    },
    now: () => { assert.equal(acquired, true); samples++; return new Date(E); },
  });
  assert.equal(snapshot.availability, "available");
  assert.equal(snapshot.computedAt, E);
  assert.equal(samples, 1);
});

test("owned source stays consistent across asynchronous caller mutation", async () => {
  const original = source("eurusd");
  const expected = qualifyCanonicalTemporalSourceV1({ productId: "eurusd", source: original, evaluatedAt: E });
  let samples = 0;
  let mutated = false;
  const output = await getCanonicalLiveEurUsdIntelligence({
    loadCanonicalSeries: async () => original,
    now: () => {
      samples++;
      queueMicrotask(() => {
        (original.observations[10] as { timestamp: number }).timestamp =
          Date.parse("2026-10-11T00:00:00.000Z") / 1_000;
        (original.metadata as { sourceTimestamp: number }).sourceTimestamp = 1;
        mutated = true;
      });
      return new Date(E);
    },
    advanceDecisionSnapshot: async () => ({ status: "initialized", previous: null }),
  });
  assert.equal(mutated, true);
  assert.equal(samples, 1);
  assert.equal(output.availability, "available");
  assert.equal(output.engineResult.evaluatedAt, E);
  assert.equal(output.provenance.sourceTimestamp, source("eurusd").metadata.sourceTimestamp);
  if (expected.status !== "qualified") assert.fail();
  assert.deepEqual(output.temporalQualification, expected.qualification);
});

test("missing source identity and noncanonical FX request intervals fail closed", async () => {
  const original = source("eurusd");
  const metadata = { ...original.metadata } as Partial<CanonicalObservationSeriesV1["metadata"]>;
  const missing = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "seriesId"));
  await rejectDirect("eurusd", { ...original, metadata: missing }, "invalid-product-identity");
  const snapshot = await createCanonicalMarketSnapshotV1({
    assetIds: ["eurusd"], interval: "1h", history: { kind: "range", range: "max" }, evaluatedAt: E,
  }, { loadHistoricalMarketData: async () => original });
  assert.equal(snapshot.availability, "unavailable");
  assert.equal(snapshot.assets[0].temporalFailure?.reason, "invalid-series");
});


test("family preflight priority is fixed independently of bundle property insertion order", async () => {
  const valid = bundle();
  const reversed = {
    eurchf: futureInterior(valid.eurchf), eurgbp: valid.eurgbp,
    eurjpy: futureInterior(valid.eurjpy), eurusd: valid.eurusd,
  };
  const capture = { launches: 0 };
  const result = await computeCanonicalFxResultBundleV1({
    loadSourceBundle: async () => reversed, evaluatedAt: E, runtimes: neverLaunch(capture),
  });
  assert.equal(result.availability, "unavailable");
  if (result.availability !== "unavailable") assert.fail();
  assert.equal(result.productId, "eurjpy");
  assert.equal(result.reason, "observation-after-evaluation");
  assert.equal(capture.launches, 0);
});


type MutableCutoffDependencies<T> = {
  -readonly [K in keyof T]: T[K];
};
type DirectRuntimeDependencies = NonNullable<Parameters<typeof getCanonicalLiveEurUsdIntelligence>[0]>;
type RuntimeCapture = {
  launches: number; calculations: number; integrations: number; writes: number;
};
function runtimeCapture(): RuntimeCapture {
  return { launches: 0, calculations: 0, integrations: 0, writes: 0 };
}
/** Real calculations and lifecycle integration; persistence is an in-memory spy. */
function observedRuntimes(capture: RuntimeCapture): Runtimes {
  const run = (productId: EcbFxReferenceProductIdV1) =>
    async (dependencies: DirectRuntimeDependencies = {}) => {
      capture.launches++;
      // Forward the caller's actual object so acquisition can mutate that owner.
      const ownedDependencies: MutableCutoffDependencies<DirectRuntimeDependencies> = dependencies;
      ownedDependencies.integrateDecisionLifecycle = async (input) => {
        capture.integrations++;
        return integrateCanonicalDecisionLifecycleV3(input);
      };
      ownedDependencies.advanceDecisionSnapshot = async () => {
        capture.writes++;
        return { status: "initialized", previous: null } as const;
      };
      const output = await realRuntimes[productId](ownedDependencies);
      capture.calculations++;
      return output;
    };
  return { eurusd: run("eurusd"), eurjpy: run("eurjpy"),
    eurgbp: run("eurgbp"), eurchf: run("eurchf") };
}
function assertCutoffRejection(error: unknown, productId: EcbFxReferenceProductIdV1, reason: string): boolean {
  assert.ok(error instanceof CanonicalFxTemporalAdmissionErrorV1);
  assert.deepEqual(error.result, { availability: "unavailable", productId, reason,
    policyVersion: "canonical-temporal-admission-v1" });
  return true;
}
const ORIGINAL_CUTOFF = "2026-10-10T09:00:00.123Z";

test("family owns explicit cutoff before asynchronous acquisition can replace it", async () => {
  const capture = runtimeCapture();
  let clockCalls = 0;
  const dependencies: MutableCutoffDependencies<CanonicalFxBundleComputationDependenciesV1> = {
    evaluatedAt: ORIGINAL_CUTOFF,
    loadSourceBundle: async () => {
      await Promise.resolve();
      dependencies.evaluatedAt = E;
      return bundle(); // Acquired at 10:00, after the original 09:00 cutoff.
    },
    now: () => { clockCalls++; return new Date(E); },
    runtimes: observedRuntimes(capture),
  };
  const result = await computeCanonicalFxResultBundleV1(dependencies);
  assert.equal(dependencies.evaluatedAt, E);
  assert.deepEqual(result, { availability: "unavailable", productId: "eurusd",
    reason: "acquisition-after-evaluation", policyVersion: "canonical-temporal-admission-v1" });
  assert.deepEqual(capture, runtimeCapture());
  assert.equal(clockCalls, 0);
});

test("family retains explicit invalid or undefined cutoffs even if removed or repaired during acquisition", async () => {
  for (const cutoff of [undefined, "2026-10-10T09:00:00Z", 123, null]) {
    for (const remove of [false, true]) {
      const capture = runtimeCapture();
      let clockCalls = 0;
      const dependencies: MutableCutoffDependencies<CanonicalFxBundleComputationDependenciesV1> = {
        evaluatedAt: cutoff as string,
        loadSourceBundle: async () => {
          await Promise.resolve();
          if (remove) delete dependencies.evaluatedAt;
          else dependencies.evaluatedAt = E;
          return bundle();
        },
        now: () => { clockCalls++; return new Date(E); },
        runtimes: observedRuntimes(capture),
      };
      const result = await computeCanonicalFxResultBundleV1(dependencies);
      assert.deepEqual(result, { availability: "unavailable", productId: "eurusd",
        reason: "invalid-evaluation-instant", policyVersion: "canonical-temporal-admission-v1" });
      assert.deepEqual(capture, runtimeCapture());
      assert.equal(clockCalls, 0);
    }
  }
});

test("family retains original cutoff absence and samples the captured clock only after acquisition", async () => {
  const capture = runtimeCapture();
  let acquired = false;
  let clockCalls = 0;
  const dependencies: MutableCutoffDependencies<CanonicalFxBundleComputationDependenciesV1> = {
    loadSourceBundle: async () => {
      await Promise.resolve();
      dependencies.evaluatedAt = ORIGINAL_CUTOFF;
      dependencies.now = () => { throw new Error("Must not read a replacement clock"); };
      acquired = true;
      return bundle();
    },
    now: () => {
      assert.equal(acquired, true); clockCalls++; return new Date(E);
    },
    runtimes: observedRuntimes(capture),
  };
  assert.equal("evaluatedAt" in dependencies, false);
  const result = await computeCanonicalFxResultBundleV1(dependencies);
  if (result.availability !== "available") assert.fail("Originally absent cutoff must use acquired-time clock");
  assert.equal(result.evaluatedAt, E);
  assert.equal(clockCalls, 1);
  assert.deepEqual(capture, { launches: 4, calculations: 4, integrations: 4, writes: 4 });
  for (const productId of ids) {
    assert.equal(result.bundle[productId].engineResult.evaluatedAt, E);
    assert.equal(result.bundle[productId].temporalQualification?.evaluationTimestampMs, Date.parse(E));
  }
});

test("valid family cutoff survives acquisition mutation with exact milliseconds and unchanged calculations", async () => {
  const capture = runtimeCapture();
  const runtimes = observedRuntimes(capture);
  const baseline = await computeCanonicalFxResultBundleV1({
    evaluatedAt: E, loadSourceBundle: async () => bundle(), runtimes,
  });
  const dependencies: MutableCutoffDependencies<CanonicalFxBundleComputationDependenciesV1> = {
    evaluatedAt: E,
    loadSourceBundle: async () => {
      await Promise.resolve(); dependencies.evaluatedAt = ORIGINAL_CUTOFF; return bundle();
    },
    now: () => { throw new Error("Explicit cutoff must not sample a clock"); },
    runtimes,
  };
  const result = await computeCanonicalFxResultBundleV1(dependencies);
  if (result.availability !== "available" || baseline.availability !== "available") assert.fail();
  assert.equal(result.evaluatedAt, E);
  for (const productId of ids) {
    assert.equal(result.bundle[productId].temporalQualification?.evaluatedAt, E);
    assert.equal(result.bundle[productId].temporalQualification?.evaluationTimestampMs, Date.parse(E));
    assert.deepEqual(result.bundle[productId], baseline.bundle[productId]);
  }
});

for (const productId of ids) {
  test(`${productId}: direct runtime owns explicit cutoff before acquisition mutation`, async () => {
    const capture = runtimeCapture();
    let clockCalls = 0;
    const dependencies: MutableCutoffDependencies<DirectRuntimeDependencies> = {
      evaluatedAt: ORIGINAL_CUTOFF,
      loadCanonicalSeries: async () => {
        await Promise.resolve(); dependencies.evaluatedAt = E; return source(productId);
      },
      now: () => { clockCalls++; return new Date(E); },
    };
    await assert.rejects(observedRuntimes(capture)[productId](dependencies),
      (error: unknown) => assertCutoffRejection(error, productId, "acquisition-after-evaluation"));
    assert.equal(dependencies.evaluatedAt, E);
    assert.deepEqual(capture, { launches: 1, calculations: 0, integrations: 0, writes: 0 });
    assert.equal(clockCalls, 0);
  });

  test(`${productId}: explicit invalid and undefined cutoffs cannot become defaults or repaired cutoffs`, async () => {
    for (const cutoff of [undefined, "2026-10-10T09:00:00Z", 123, null]) {
      for (const remove of [false, true]) {
        const capture = runtimeCapture();
        let clockCalls = 0;
        const dependencies: MutableCutoffDependencies<DirectRuntimeDependencies> = {
          evaluatedAt: cutoff as string,
          loadCanonicalSeries: async () => {
            await Promise.resolve();
            if (remove) delete dependencies.evaluatedAt;
            else dependencies.evaluatedAt = E;
            return source(productId);
          },
          now: () => { clockCalls++; return new Date(E); },
        };
        await assert.rejects(observedRuntimes(capture)[productId](dependencies),
          (error: unknown) => assertCutoffRejection(error, productId, "invalid-evaluation-instant"));
        assert.deepEqual(capture, { launches: 1, calculations: 0, integrations: 0, writes: 0 });
        assert.equal(clockCalls, 0);
      }
    }
  });

  test(`${productId}: original cutoff absence survives a later property addition`, async () => {
    const capture = runtimeCapture();
    let acquired = false;
    let clockCalls = 0;
    const dependencies: MutableCutoffDependencies<DirectRuntimeDependencies> = {
      loadCanonicalSeries: async () => {
        await Promise.resolve();
        dependencies.evaluatedAt = ORIGINAL_CUTOFF;
        dependencies.now = () => { throw new Error("Must not read a replacement clock"); };
        acquired = true;
        return source(productId);
      },
      now: () => { assert.equal(acquired, true); clockCalls++; return new Date(E); },
    };
    assert.equal("evaluatedAt" in dependencies, false);
    const output = await observedRuntimes(capture)[productId](dependencies);
    assert.equal(clockCalls, 1);
    assert.equal(output.engineResult.evaluatedAt, E);
    assert.equal(output.temporalQualification?.evaluatedAt, E);
    assert.equal(output.temporalQualification?.evaluationTimestampMs, Date.parse(E));
    assert.deepEqual(capture, { launches: 1, calculations: 1, integrations: 1, writes: 1 });
  });

  test(`${productId}: valid explicit cutoff preserves exact milliseconds and calculations despite mutation`, async () => {
    const capture = runtimeCapture();
    const runtime = observedRuntimes(capture)[productId];
    const baseline = await runtime({
      evaluatedAt: E, loadCanonicalSeries: async () => source(productId),
    });
    const dependencies: MutableCutoffDependencies<DirectRuntimeDependencies> = {
      evaluatedAt: E,
      loadCanonicalSeries: async () => {
        await Promise.resolve(); dependencies.evaluatedAt = ORIGINAL_CUTOFF; return source(productId);
      },
      now: () => { throw new Error("Explicit cutoff must not sample a clock"); },
    };
    const output = await runtime(dependencies);
    assert.equal(output.engineResult.evaluatedAt, E);
    assert.equal(output.temporalQualification?.evaluatedAt, E);
    assert.equal(output.temporalQualification?.evaluationTimestampMs, Date.parse(E));
    assert.deepEqual(output, baseline);
  });
}
