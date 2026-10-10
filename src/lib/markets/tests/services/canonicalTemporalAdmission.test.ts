import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  admitCanonicalObservationSeriesV1,
  CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
  type CanonicalTemporalAdmissionInputV1,
  type CanonicalTemporalAdmissionRejectionReasonV1,
} from "../../services/canonicalTemporalAdmission";
import { normalizeCanonicalObservationSeriesV1 } from "../../services/canonicalObservationSeries";
import { ECB_FX_REFERENCE_PRODUCTS_V1, loadEcbFxReferenceSeriesBundleV1 } from "../../providers/ecb/fxReferenceSeries";
import { normalizeEcbEstrSeriesV1 } from "../../providers/ecb/estrSeries";
import type { EcbEstrRawObservationV1 } from "../../providers/ecb/estrTypes";
import { ECB_ESTR_SERIES_ID_V1 } from "../../providers/ecb/estrContract";

const PRODUCTS = ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"] as const;
const EVALUATED_AT = "2026-10-05T12:00:00.123Z";
const EVALUATION_SECONDS = Math.floor(Date.parse(EVALUATED_AT) / 1_000);
const LATEST = Date.parse("2026-10-05T00:00:00.000Z") / 1_000;
const FUTURE = LATEST + 86_400;
const MAX_SECONDS = 253_402_300_799;

function fixture(productId: typeof PRODUCTS[number]): CanonicalTemporalAdmissionInputV1 {
  const series = normalizeCanonicalObservationSeriesV1({
    observations: [-2, -1, 0].map((days) => ({ timestamp: LATEST + days * 86_400, value: 1.1 })),
    metadata: {
      provider: "ecb", source: "European Central Bank", requestedProductId: productId, canonicalProductId: productId,
      seriesId: productId === "estr" ? "EST.B.EU000A2X2A25.WT" : ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId,
      interval: "1d", fetchedAt: EVALUATION_SECONDS - 10, sourceTimestamp: LATEST, observationTimestamp: LATEST,
      status: "end_of_day", unit: productId === "estr" ? "percent" : ECB_FX_REFERENCE_PRODUCTS_V1[productId].unit,
      seriesKind: "reference-rate",
    },
  });
  if (productId !== "estr") return { productId, series, evaluatedAt: EVALUATED_AT };
  return { productId, series, evaluatedAt: EVALUATED_AT,
    observationMetadata: series.observations.map(({ timestamp }, index) => ({
      timestamp, referenceDate: new Date(timestamp * 1_000).toISOString().slice(0, 10),
      observationStatus: { headline: "A", publicationType: "A", calculationMethod: "A" },
      confidentialityStatus: { headline: "F", publicationType: "F", calculationMethod: "F" },
      publicationType: index === 1 ? "republication" : "standard",
      calculationMethod: index === 1 ? "contingency" : "normal",
    })),
  };
}

// Malformed JSON-like boundary fixtures do not weaken the public API.
function metadataWith(input: CanonicalTemporalAdmissionInputV1, patch: Record<string, unknown>): CanonicalTemporalAdmissionInputV1 {
  return { ...input, series: { ...input.series, metadata: { ...input.series.metadata, ...patch } } } as CanonicalTemporalAdmissionInputV1;
}
function historyWith(input: CanonicalTemporalAdmissionInputV1, observations: readonly unknown[]): CanonicalTemporalAdmissionInputV1 {
  return { ...input, series: { ...input.series, observations } } as CanonicalTemporalAdmissionInputV1;
}
function sidecarsWith(input: CanonicalTemporalAdmissionInputV1, observationMetadata: unknown): CanonicalTemporalAdmissionInputV1 {
  return { ...input, observationMetadata } as CanonicalTemporalAdmissionInputV1;
}
function accepted(input: CanonicalTemporalAdmissionInputV1) {
  const result = admitCanonicalObservationSeriesV1(input);
  if (result.status !== "not-contradicted") throw new Error(result.reason);
  assert.equal(result.status, "not-contradicted");
  assert.equal(result.policyVersion, CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1);
  assert.equal(result.availabilityEvidence, "unverified");
  assert.equal(result.evaluatedAt, input.evaluatedAt);
  assert.equal(result.evaluationTimestampMs, Date.parse(input.evaluatedAt));
  assert.equal(Object.isFrozen(result), true);
  return result;
}
function rejected(input: CanonicalTemporalAdmissionInputV1, reason: CanonicalTemporalAdmissionRejectionReasonV1) {
  const result = admitCanonicalObservationSeriesV1(input);
  assert.deepEqual(result, { status: "rejected", reason, policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 });
  assert.equal(Object.isFrozen(result), true);
  assert.equal("availabilityEvidence" in result, false);
}
const INVALID_SECONDS: readonly unknown[] = [
  undefined, null, "1791201600", Number.NaN, Infinity, -Infinity, -1, -0,
  0.5, Number.MAX_SAFE_INTEGER + 1, MAX_SECONDS + 1, 1_791_201_600_000, {}, true,
];

for (const productId of PRODUCTS) {
  test(`${productId}: valid history and absent publication`, () => {
    const input = fixture(productId);
    const before = JSON.stringify(input);
    const result = accepted(input);
    assert.equal(result.publicationTime, "unknown");
    assert.equal(result.sameSecondPrecisionAmbiguity, false);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(admitCanonicalObservationSeriesV1(input), result);
    accepted(metadataWith(input, { observationTimestamp: undefined }));
  });
  test(`${productId}: future latest and interior observations reject the complete payload`, () => {
    const input = fixture(productId);
    const future = { timestamp: FUTURE, value: 1.2 };
    for (const observations of [[...input.series.observations, future],
      [input.series.observations[0], future, ...input.series.observations.slice(1)]]) {
      const malformed = historyWith(input, observations);
      const before = JSON.stringify(malformed);
      rejected(malformed, "observation-after-evaluation");
      assert.equal(JSON.stringify(malformed), before);
    }
  });
  test(`${productId}: timestamp validation never coerces or substitutes`, () => {
    const input = fixture(productId);
    for (const value of INVALID_SECONDS) {
      rejected(metadataWith(input, { fetchedAt: value }), "invalid-acquisition-timestamp");
      rejected(metadataWith(input, { sourceTimestamp: value }), "invalid-source-timestamp");
      if (value !== undefined) {
        rejected(metadataWith(input, { observationTimestamp: value }), "invalid-observation-alias");
        rejected(metadataWith(input, { releaseTimestamp: value }), "invalid-release-timestamp");
      }
      rejected(historyWith(input, [{ timestamp: value, value: 1.1 }]), "invalid-observation-timestamp");
    }
    rejected(historyWith(input, [null]), "invalid-observation-timestamp");
    rejected(historyWith(input, new Array(1)), "invalid-input");
    rejected(historyWith(input, []), "empty-history");
    rejected(historyWith(input, [{ timestamp: LATEST + 1, value: 1.1 }]), "non-midnight-observation");
  });
  test(`${productId}: acquisition cutoff, equality, and second-bucket ambiguity`, () => {
    const input = fixture(productId);
    rejected(metadataWith(input, { fetchedAt: EVALUATION_SECONDS + 1 }), "acquisition-after-evaluation");
    assert.equal(accepted(metadataWith(input, { fetchedAt: EVALUATION_SECONDS })).sameSecondPrecisionAmbiguity, true);
    assert.equal(accepted(metadataWith(input, { fetchedAt: EVALUATION_SECONDS - 1 })).sameSecondPrecisionAmbiguity, false);
    const midnight = { ...input, evaluatedAt: "2026-10-05T00:00:00.000Z" };
    assert.equal(accepted(metadataWith(midnight, { fetchedAt: LATEST })).sameSecondPrecisionAmbiguity, true);
    rejected(metadataWith({ ...input, evaluatedAt: "2026-10-04T23:59:59.999Z" }, { fetchedAt: LATEST - 1 }),
      "observation-after-evaluation");
  });
  test(`${productId}: aliases and canonical ordering are never repaired`, () => {
    const input = fixture(productId);
    rejected(metadataWith(input, { sourceTimestamp: LATEST - 86_400 }), "inconsistent-source-timestamp");
    rejected(metadataWith(input, { sourceTimestamp: LATEST + 86_400 }), "inconsistent-source-timestamp");
    rejected(metadataWith(input, { observationTimestamp: LATEST - 86_400 }), "inconsistent-observation-alias");
    rejected(historyWith(input, [...input.series.observations].reverse()), "non-canonical-history");
    rejected(historyWith(input, [...input.series.observations, input.series.observations.at(-1)]), "non-canonical-history");
  });
  test(`${productId}: optional release remains unverified`, () => {
    const input = fixture(productId);
    rejected(metadataWith(input, { releaseTimestamp: EVALUATION_SECONDS + 1 }), "release-after-evaluation");
    rejected(metadataWith(input, { releaseTimestamp: EVALUATION_SECONDS - 9 }), "release-after-acquisition");
    const supplied = accepted(metadataWith(input, { releaseTimestamp: EVALUATION_SECONDS - 11 }));
    assert.equal(supplied.publicationTime, "supplied-unverified");
    assert.equal(supplied.sameSecondPrecisionAmbiguity, false);
    assert.equal(accepted(metadataWith(input, { releaseTimestamp: input.series.metadata.fetchedAt }))
      .sameSecondPrecisionAmbiguity, true);
    assert.equal(accepted(metadataWith(input, { fetchedAt: EVALUATION_SECONDS, releaseTimestamp: EVALUATION_SECONDS }))
      .sameSecondPrecisionAmbiguity, true);
  });
  test(`${productId}: strict evaluation format and civil calendar`, () => {
    const input = fixture(productId);
    for (const evaluatedAt of [undefined, null, 0, "", "invalid", "2026-10-05", "2026-10-05T12:00:00",
      "2026-10-05T12:00:00Z", "2026-10-05T12:00:00.1Z", "2026-10-05T12:00:00.1234Z",
      "2026-10-05T12:00:00.123+00:00", "2026-10-05T12:00:00.123z", " 2026-10-05T12:00:00.123Z",
      "2026-02-29T00:00:00.000Z", "2026-04-31T00:00:00.000Z", "2026-13-01T00:00:00.000Z",
      "2026-10-05T24:00:00.000Z", "2026-10-05T12:60:00.000Z", "2026-10-05T12:00:60.000Z",
      "1969-12-31T23:59:59.999Z", "0000-01-01T00:00:00.000Z", "+010000-01-01T00:00:00.000Z"]) {
      rejected({ ...input, evaluatedAt } as CanonicalTemporalAdmissionInputV1, "invalid-evaluation-instant");
    }
    accepted({ ...input, evaluatedAt: "2028-02-29T00:00:00.000Z" });
  });
  test(`${productId}: epoch and final millisecond of year 9999`, () => {
    for (const [timestamp, evaluatedAt, fetchedAt] of [[0, "1970-01-01T00:00:00.000Z", 0],
      [MAX_SECONDS - 86_399, "9999-12-31T23:59:59.999Z", MAX_SECONDS]] as const) {
      let input = metadataWith(historyWith(fixture(productId), [{ timestamp, value: 1.1 }]), {
        sourceTimestamp: timestamp, observationTimestamp: timestamp, fetchedAt, releaseTimestamp: fetchedAt,
      });
      input = { ...input, evaluatedAt };
      if (input.productId === "estr") input = sidecarsWith(input, [{
        ...input.observationMetadata[0], timestamp, referenceDate: evaluatedAt.slice(0, 10),
      }]);
      accepted(input);
    }
  });
  test(`${productId}: product correspondence, daily schema, and finite value domain`, () => {
    const input = fixture(productId);
    rejected(metadataWith(input, { canonicalProductId: "oil" }), "invalid-product-identity");
    rejected(metadataWith(input, { requestedProductId: "oil" }), "invalid-product-identity");
    rejected(metadataWith(input, { interval: "1h" }), "invalid-series");
    rejected(metadataWith(input, { seriesKind: "spot-price" }), "invalid-series");
    rejected({ ...input, series: { ...input.series, schemaVersion: "wrong" } } as unknown as CanonicalTemporalAdmissionInputV1,
      "invalid-series");
    for (const value of [undefined, null, "1.1", NaN, Infinity]) {
      rejected(historyWith(input, [{ timestamp: LATEST, value }]), "invalid-observation-value");
    }
    if (productId !== "estr") for (const value of [0, -1]) {
      rejected(historyWith(input, [{ timestamp: LATEST, value }]), "invalid-observation-value");
    }
  });
}

test("malformed outer/series boundaries fail closed", () => {
  for (const input of [undefined, null, [], 1]) rejected(input as unknown as CanonicalTemporalAdmissionInputV1, "invalid-input");
  const input = fixture("eurusd");
  rejected({ ...input, productId: "EUR/USD" } as unknown as CanonicalTemporalAdmissionInputV1, "invalid-product-identity");
  for (const series of [undefined, null, [], { ...input.series, metadata: null }, { ...input.series, observations: null }]) {
    rejected({ ...input, series } as unknown as CanonicalTemporalAdmissionInputV1, "invalid-series");
  }
});

test("all four FX unordered raw-provider histories normalize before admission", async () => {
  const rows = PRODUCTS.filter((productId) => productId !== "estr").flatMap((productId) =>
    fixture(productId).series.observations.map(({ timestamp, value }) => ({
      seriesId: ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId,
      period: new Date(timestamp * 1_000).toISOString().slice(0, 10), value: String(value),
    })));
  let fixtureLoads = 0;
  const load = (observations: typeof rows) => loadEcbFxReferenceSeriesBundleV1({
    loadData: async (requestedSeriesIds) => {
      fixtureLoads++;
      return { provider: "ecb", requestedSeriesIds, observations };
    },
    now: () => new Date((EVALUATION_SECONDS - 10) * 1_000),
  });
  const ordered = await load(rows);
  const unordered = await load([...rows].reverse());
  assert.deepEqual(unordered, ordered);
  assert.equal(fixtureLoads, 2);
  for (const productId of PRODUCTS) if (productId !== "estr") {
    assert.deepEqual(accepted({ productId, series: unordered[productId], evaluatedAt: EVALUATED_AT }),
      accepted({ productId, series: ordered[productId], evaluatedAt: EVALUATED_AT }));
  }
});

test("€STR unordered WT/RP/CM data normalizes together, retaining zero and negative rates", () => {
  const input = fixture("estr");
  const rows: EcbEstrRawObservationV1[] = input.series.observations.flatMap(({ timestamp }, index) =>
    (["WT", "RP", "CM"] as const).map((dataType) => ({
      seriesId: `EST.B.EU000A2X2A25.${dataType}`, frequency: "B", benchmarkItem: "EU000A2X2A25",
      dataType, period: new Date(timestamp * 1_000).toISOString().slice(0, 10),
      value: String(dataType === "WT" ? [-0.5, 0, 1.1][index] : index === 1 ? 1 : 0),
      observationStatus: "A", confidentialityStatus: "F", unitMeasure: dataType === "WT" ? "PC" : "_Z", unitMultiplier: "0",
    })));
  const normalize = (observations: EcbEstrRawObservationV1[]) => normalizeEcbEstrSeriesV1(
    { provider: "ecb", observations }, () => new Date((EVALUATION_SECONDS - 10) * 1_000));
  const ordered = normalize(rows);
  const unordered = normalize([...rows].reverse());
  assert.deepEqual(unordered, ordered);
  assert.deepEqual(unordered.canonicalSeries.observations.map(({ value }) => value), [-0.5, 0, 1.1]);
  assert.equal(accepted({ productId: "estr", series: unordered.canonicalSeries,
    observationMetadata: unordered.observationMetadata, evaluatedAt: EVALUATED_AT }).publicationTime, "unknown");
});

test("€STR validates every sidecar, including interior RP/CM entries and civil dates", () => {
  const input = fixture("estr");
  if (input.productId !== "estr") throw new Error("fixture");
  for (const sidecars of [undefined, null, {}]) rejected(sidecarsWith(input, sidecars), "estr-sidecars-missing");
  for (const sidecars of [input.observationMetadata.slice(1), [...input.observationMetadata, input.observationMetadata[0]]]) {
    rejected(sidecarsWith(input, sidecars), "estr-sidecar-count-mismatch");
  }
  const withInterior = (patch: Record<string, unknown>) => sidecarsWith(input,
    input.observationMetadata.map((sidecar, index) => index === 1 ? { ...sidecar, ...patch } : sidecar));
  for (const sidecar of [null, undefined, {}]) {
    rejected(sidecarsWith(input, [input.observationMetadata[0], sidecar, input.observationMetadata[2]]), "estr-sidecar-invalid");
  }
  for (const timestamp of [...INVALID_SECONDS, LATEST, LATEST + 1]) {
    rejected(withInterior({ timestamp }), "estr-sidecar-timestamp-mismatch");
  }
  for (const referenceDate of [undefined, null, "", "2026-10-03", "2026-2-03", "2026-02-29", "2026-04-31",
    "1969-12-31", "10000-01-01", "2026-10-04T00:00:00.000Z", " 2026-10-04"]) {
    rejected(withInterior({ referenceDate }), "estr-sidecar-reference-date-invalid");
  }
  for (const publicationType of [undefined, null, 0, "unknown"]) rejected(withInterior({ publicationType }), "estr-sidecar-enum-invalid");
  for (const calculationMethod of [undefined, null, 0, "unknown"]) rejected(withInterior({ calculationMethod }), "estr-sidecar-enum-invalid");
  for (const key of ["observationStatus", "confidentialityStatus"]) {
    for (const value of [undefined, null, {}, { headline: "A", publicationType: "A", calculationMethod: null }]) {
      rejected(withInterior({ [key]: value }), "estr-sidecar-invalid");
    }
  }
  rejected(sidecarsWith(input, [...input.observationMetadata].reverse()), "estr-sidecar-timestamp-mismatch");
  rejected(sidecarsWith(input, [input.observationMetadata[0], input.observationMetadata[0], input.observationMetadata[2]]),
    "estr-sidecar-timestamp-mismatch");
});

test("pure admission has no runtime imports, implicit clock, I/O, analytics, or mutation", () => {
  const source = readFileSync(new URL("../../services/canonicalTemporalAdmission.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("canonicalTemporalAdmission.ts", source, ts.ScriptTarget.Latest, true);
  function inspect(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) assert.equal(node.importClause?.isTypeOnly, true, "only type imports are permitted");
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const expression = node.expression.getText(parsed);
      assert.equal(/fetch|require|import|Redis|cache|persist|calculate|setTimeout|Date\.now/.test(expression), false,
        `unexpected effect: ${expression}`);
      if (expression === "Date" && ts.isNewExpression(node)) assert.equal(node.arguments?.length, 1, "no implicit clock");
    }
    ts.forEachChild(node, inspect);
  }
  inspect(parsed);
  const input = fixture("estr");
  function freeze(value: unknown): void {
    if (value !== null && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(input);
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  globalThis.fetch = () => { throw new Error("unexpected I/O"); };
  Date.now = () => { throw new Error("unexpected clock acquisition"); };
  try {
    accepted(input);
    rejected(metadataWith(input, { fetchedAt: EVALUATION_SECONDS + 1 }), "acquisition-after-evaluation");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

for (const productId of PRODUCTS) {
  test(`${productId}: direct calls enforce the existing ECB source identity`, () => {
    const input = fixture(productId);
    accepted(input);
    // Test against the source owner's descriptors, without importing them into
    // the primitive or inventing a second source registry.
    if (productId === "estr") assert.equal(input.series.metadata.seriesId, ECB_ESTR_SERIES_ID_V1);
    else {
      const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
      assert.equal(product.seriesId, `EXR.D.${product.quoteCurrency}.EUR.SP00.A`);
      assert.equal(product.unit, `${product.quoteCurrency} per EUR`);
      assert.equal(product.quotation, `EUR 1 = X ${product.quoteCurrency}`);
      assert.equal(product.inverted, false);
    }
    for (const otherProduct of PRODUCTS) if (otherProduct !== productId) {
      const other = fixture(otherProduct).series.metadata;
      rejected(metadataWith(input, { seriesId: other.seriesId, unit: other.unit }), "invalid-product-identity");
      rejected(metadataWith(input, { seriesId: other.seriesId }), "invalid-product-identity");
    }
    for (const seriesId of [undefined, null, "", "EXR.D.EUR.USD.SP00.A", "EST.B.EU000A2X2A25.RP",
      "EST.B.EU000A2X2A25.CM"]) rejected(metadataWith(input, { seriesId }), "invalid-product-identity");
    const missing = structuredClone(input);
    delete (missing.series.metadata as unknown as Record<string, unknown>).seriesId;
    rejected(missing, "invalid-product-identity");
    for (const patch of [{ provider: "fred" }, { source: "another publisher" }, { unit: "EUR per USD" },
      { unit: undefined }, { status: "live" }]) rejected(metadataWith(input, patch), "invalid-product-identity");
  });

  test(`${productId}: dense history rejects hidden future rows and unsupported array properties`, () => {
    const input = fixture(productId);
    const observations = [input.series.observations[0], { timestamp: FUTURE, value: 1.1 }, input.series.observations[2]];
    let iteratorCalls = 0;
    Object.defineProperty(observations, Symbol.iterator, { value: function* () {
      iteratorCalls++;
      yield observations[0];
      yield observations[2];
    } });
    Object.freeze(observations);
    rejected(historyWith(input, observations), "invalid-input");
    assert.equal(iteratorCalls, 0, "the hiding iterator must never execute");
    rejected(historyWith(input, [observations[0], observations[1], observations[2]]), "observation-after-evaluation");

    const sparse = [...input.series.observations];
    delete sparse[1];
    rejected(historyWith(input, sparse), "invalid-input");
    const malformedIndex = [...input.series.observations];
    let getterCalls = 0;
    Object.defineProperty(malformedIndex, "1", { enumerable: true, get: () => {
      getterCalls++;
      throw new Error("index getter must not run");
    } });
    rejected(historyWith(input, malformedIndex), "invalid-input");
    assert.equal(getterCalls, 0);
    const invalidIndexName = [...input.series.observations];
    Object.defineProperty(invalidIndexName, "01", { value: input.series.observations[1], enumerable: true });
    rejected(historyWith(input, invalidIndexName), "invalid-input");
    const extraMethod = [...input.series.observations];
    Object.defineProperty(extraMethod, "map", { value: () => { throw new Error("must not run"); } });
    rejected(historyWith(input, extraMethod), "invalid-input");
    const iteratorGetter = [...input.series.observations];
    Object.defineProperty(iteratorGetter, Symbol.iterator, { get: () => { throw new Error("must not run"); } });
    rejected(historyWith(input, iteratorGetter), "invalid-input");
    class UnsupportedArray extends Array {}
    rejected(historyWith(input, UnsupportedArray.from(input.series.observations)), "invalid-input");
  });

  test(`${productId}: accepted output uses validated scalar values and survives later caller mutation`, () => {
    const input = structuredClone(fixture(productId));
    const before = structuredClone(input);
    const result = accepted(input);
    assert.deepEqual(input, before);
    const expected = { ...result };
    (input as unknown as Record<string, unknown>).evaluatedAt = "invalid-time";
    (input.series.metadata as unknown as Record<string, unknown>).fetchedAt = FUTURE;
    assert.deepEqual(result, expected);
    assert.equal(result.evaluationTimestampMs, Date.parse(result.evaluatedAt));
    assert.equal(Object.isFrozen(result), true);
  });
}

test("passive boundary rejects changing evaluation and throwing acquisition getters without executing them", () => {
  const input = fixture("eurusd");
  let evaluationReads = 0;
  const changing = { ...input };
  Object.defineProperty(changing, "evaluatedAt", { enumerable: true, get: () =>
    ++evaluationReads === 1 ? EVALUATED_AT : "invalid-time" });
  rejected(changing, "invalid-input");
  assert.equal(evaluationReads, 0);
  let acquisitionReads = 0;
  const throwing = metadataWith(input, {});
  Object.defineProperty(throwing.series.metadata, "fetchedAt", { enumerable: true, get: () => {
    acquisitionReads++;
    throw new Error("acquisition getter must not execute");
  } });
  rejected(throwing, "invalid-input");
  assert.equal(acquisitionReads, 0);
});

test("passive boundary rejects accessor-bearing observations and series records", () => {
  const input = fixture("eurusd");
  for (const key of ["timestamp", "value"]) {
    const observation = { timestamp: LATEST, value: 1.1 };
    let reads = 0;
    Object.defineProperty(observation, key, { enumerable: true, get: () => {
      reads++;
      throw new Error("observation getter must not execute");
    } });
    rejected(historyWith(input, [observation]), "invalid-input");
    assert.equal(reads, 0);
  }
  const series = { ...input.series };
  Object.defineProperty(series, "metadata", { enumerable: true, get: () => { throw new Error("must not run"); } });
  rejected({ ...input, series }, "invalid-input");
});

test("passive boundary covers every €STR sidecar and nested status record", () => {
  const input = fixture("estr");
  if (input.productId !== "estr") throw new Error("fixture");
  for (const key of ["timestamp", "referenceDate", "publicationType", "calculationMethod", "observationStatus"]) {
    const sidecar = { ...input.observationMetadata[1] };
    let reads = 0;
    Object.defineProperty(sidecar, key, { enumerable: true, get: () => {
      reads++;
      throw new Error("sidecar getter must not execute");
    } });
    rejected(sidecarsWith(input, [input.observationMetadata[0], sidecar, input.observationMetadata[2]]), "invalid-input");
    assert.equal(reads, 0);
  }
  const status = { headline: "A", publicationType: "A", calculationMethod: "A" };
  Object.defineProperty(status, "headline", { enumerable: true, get: () => { throw new Error("must not run"); } });
  const sidecars = input.observationMetadata.map((sidecar) => ({ ...sidecar, confidentialityStatus: status }));
  rejected(sidecarsWith(input, sidecars), "invalid-input");
  const sparse = [...input.observationMetadata];
  delete sparse[1];
  rejected(sidecarsWith(input, sparse), "invalid-input");
  const overridden = [...input.observationMetadata];
  Object.defineProperty(overridden, Symbol.iterator, { value: () => { throw new Error("must not run"); } });
  rejected(sidecarsWith(input, overridden), "invalid-input");
});

test("passive boundary rejects executable properties, cycles, and unsupported prototypes", () => {
  const input = fixture("eurusd");
  for (const extra of [() => 1, Symbol("unsupported"), BigInt(1), new Date(0)]) {
    rejected({ ...input, extra } as unknown as CanonicalTemporalAdmissionInputV1, "invalid-input");
  }
  const symbolKey = { ...input, [Symbol("key")]: 1 };
  rejected(symbolKey, "invalid-input");
  const nonEnumerable = { ...input };
  Object.defineProperty(nonEnumerable, "extra", { value: 1 });
  rejected(nonEnumerable, "invalid-input");
  const setterOnly = { ...input };
  Object.defineProperty(setterOnly, "extra", { enumerable: true, set: () => { throw new Error("must not run"); } });
  rejected(setterOnly, "invalid-input");
  const inherited = Object.assign(Object.create({ extra: 1 }), input);
  rejected(inherited, "invalid-input");
  const cyclic = { ...input, extra: {} };
  cyclic.extra = cyclic;
  rejected(cyclic, "invalid-input");
  // Ordinary null-prototype records are supported, including safely copied keys
  // that would otherwise invoke Object.prototype setters.
  const passive = Object.assign(Object.create(null), input);
  Object.defineProperty(passive, "__proto__", { value: { label: "passive" }, enumerable: true });
  accepted(passive);
});

test("thrown Proxy reflection traps and revoked Proxies produce typed rejections", () => {
  // Proxies remain outside the supported trust boundary. These deterministic
  // probes check containment of reflection errors, not universal Proxy detection
  // or a promise that arbitrary traps cannot execute or fabricate descriptors.
  const input = fixture("eurusd");
  for (const proxy of [
    new Proxy(input, { ownKeys: () => { throw new Error("ownKeys trap"); } }),
    new Proxy(input, { getPrototypeOf: () => { throw new Error("prototype trap"); } }),
    new Proxy(input, { getOwnPropertyDescriptor: () => { throw new Error("descriptor trap"); } }),
  ]) rejected(proxy, "invalid-input");
  const revoked = Proxy.revocable(input, {});
  revoked.revoke();
  rejected(revoked.proxy, "invalid-input");
  const observations = new Proxy([...input.series.observations], {
    getOwnPropertyDescriptor: () => { throw new Error("array descriptor trap"); },
  });
  rejected(historyWith(input, observations), "invalid-input");
});
