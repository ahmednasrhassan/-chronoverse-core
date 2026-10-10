import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import {
  qualifyCanonicalTemporalSourceV1,
  validateCanonicalTemporalQualificationV1,
  CANONICAL_TEMPORAL_QUALIFICATION_VERSION_V1,
  CANONICAL_TEMPORAL_SOURCE_BINDING_VERSION_V1,
  type CanonicalTemporalQualificationInputV1,
  type CanonicalTemporalQualificationRejectionReasonV1,
} from "../../services/canonicalTemporalQualification";
import { CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1 } from "../../services/canonicalTemporalAdmission";
import { normalizeCanonicalObservationSeriesV1, type CanonicalObservationSeriesV1 } from "../../services/canonicalObservationSeries";
import { ECB_FX_REFERENCE_PRODUCTS_V1, loadEcbFxReferenceSeriesBundleV1 } from "../../providers/ecb/fxReferenceSeries";
import { normalizeEcbEstrSeriesV1 } from "../../providers/ecb/estrSeries";
import type { EcbEstrRawObservationV1 } from "../../providers/ecb/estrTypes";
import { ECB_ESTR_DATAFLOW_V1, ECB_ESTR_SERIES_KEY_V1, ECB_ESTR_SERIES_ID_V1 } from "../../providers/ecb/estrContract";

const PRODUCTS = ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"] as const;
const E = "2026-10-05T12:00:00.123Z";
const Q = Math.floor(Date.parse(E) / 1_000);
const LATEST = Date.parse("2026-10-05T00:00:00.000Z") / 1_000;

function fixture(productId: typeof PRODUCTS[number]): CanonicalTemporalQualificationInputV1 {
  const series = normalizeCanonicalObservationSeriesV1({
    observations: [-2, -1, 0].map((days) => ({ timestamp: LATEST + days * 86_400, value: 1.1 })),
    metadata: {
      provenanceVersion: "canonical-observation-provenance-v1",
      provider: "ecb", source: "European Central Bank", originalPublisher: "European Central Bank",
      substitution: { status: "none" }, requestedProductId: productId, canonicalProductId: productId,
      seriesId: productId === "estr" ? ECB_ESTR_SERIES_ID_V1 : ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId,
      interval: "1d", fetchedAt: Q - 10, sourceTimestamp: LATEST, observationTimestamp: LATEST,
      status: "end_of_day", unit: productId === "estr" ? "percent" : ECB_FX_REFERENCE_PRODUCTS_V1[productId].unit,
      seriesKind: "reference-rate",
    },
  });
  if (productId !== "estr") return { productId, source: series, evaluatedAt: E };
  return { productId, evaluatedAt: E, source: {
    schemaVersion: "ecb-estr-series-v1", dataflow: ECB_ESTR_DATAFLOW_V1, seriesKey: ECB_ESTR_SERIES_KEY_V1,
    canonicalSeries: series,
    observationMetadata: series.observations.map(({ timestamp }) => ({
      timestamp, referenceDate: new Date(timestamp * 1_000).toISOString().slice(0, 10),
      observationStatus: { headline: "A", publicationType: "A", calculationMethod: "A" },
      confidentialityStatus: { headline: "F", publicationType: "F", calculationMethod: "F" },
      publicationType: "standard", calculationMethod: "normal",
    })),
  } };
}
function seriesOf(input: CanonicalTemporalQualificationInputV1): CanonicalObservationSeriesV1 {
  return input.productId === "estr" ? input.source.canonicalSeries : input.source;
}
function withSeries(input: CanonicalTemporalQualificationInputV1, series: CanonicalObservationSeriesV1): CanonicalTemporalQualificationInputV1 {
  return input.productId === "estr"
    ? { ...input, source: { ...input.source, canonicalSeries: series } }
    : { ...input, source: series };
}
function withMetadata(input: CanonicalTemporalQualificationInputV1, patch: Record<string, unknown>) {
  const series = seriesOf(input);
  return withSeries(input, { ...series, metadata: { ...series.metadata, ...patch } } as CanonicalObservationSeriesV1);
}
function withHistory(input: CanonicalTemporalQualificationInputV1, observations: readonly unknown[]) {
  return withSeries(input, { ...seriesOf(input), observations } as CanonicalObservationSeriesV1);
}
function qualified(input: CanonicalTemporalQualificationInputV1) {
  const result = qualifyCanonicalTemporalSourceV1(input);
  if (result.status === "rejected") throw new Error(result.reason);
  return result.qualification;
}
function reject(input: unknown, reason: CanonicalTemporalQualificationRejectionReasonV1) {
  assert.deepEqual(qualifyCanonicalTemporalSourceV1(input as CanonicalTemporalQualificationInputV1), {
    status: "rejected", reason, policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
  });
}
function validationReject(envelope: unknown, expected: CanonicalTemporalQualificationInputV1,
  reason: CanonicalTemporalQualificationRejectionReasonV1 = "qualification-mismatch") {
  assert.deepEqual(validateCanonicalTemporalQualificationV1(envelope, expected), {
    status: "rejected", reason, policyVersion: CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1,
  });
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function reverseRecordKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseRecordKeys);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).reverse().map(([key, child]) => [key, reverseRecordKeys(child)]),
  );
  return value;
}

for (const productId of PRODUCTS) {
  test(`${productId}: correct identity, exact cutoff, and unverified evidence`, () => {
    const input = frozen(fixture(productId));
    const before = JSON.stringify(input);
    const result = qualified(input);
    assert.equal(result.schemaVersion, CANONICAL_TEMPORAL_QUALIFICATION_VERSION_V1);
    assert.equal(result.productId, productId);
    assert.equal(result.status, "not-contradicted");
    assert.equal(result.policyVersion, CANONICAL_TEMPORAL_ADMISSION_POLICY_VERSION_V1);
    assert.equal(result.evaluatedAt, E);
    assert.equal(result.evaluationTimestampMs, Date.parse(E));
    assert.equal(result.availabilityEvidence, "unverified");
    assert.equal(result.publicationTime, "unknown");
    assert.equal(result.sameSecondPrecisionAmbiguity, false);
    assert.deepEqual(result.sourceIdentity, {
      provider: "ecb", source: "European Central Bank", seriesId: seriesOf(input).metadata.seriesId,
      unit: seriesOf(input).metadata.unit, interval: "1d", seriesKind: "reference-rate",
    });
    assert.equal(result.sourceBinding.version, CANONICAL_TEMPORAL_SOURCE_BINDING_VERSION_V1);
    assert.equal(result.sourceBinding.algorithm, "sha256");
    assert.match(result.sourceBinding.digest, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.sourceIdentity), true);
    assert.equal(Object.isFrozen(result.sourceBinding), true);
    assert.equal(JSON.stringify(input), before);
  });
  test(`${productId}: required canonical metadata fail closed when missing`, () => {
    for (const key of ["provider", "source", "seriesId", "requestedProductId", "canonicalProductId", "status", "unit"]) {
      reject(withMetadata(fixture(productId), { [key]: undefined }), "invalid-product-identity");
    }
    for (const key of ["interval", "seriesKind"]) {
      reject(withMetadata(fixture(productId), { [key]: undefined }), "invalid-series");
    }
    reject(withMetadata(fixture(productId), { fetchedAt: undefined }), "invalid-acquisition-timestamp");
    reject(withMetadata(fixture(productId), { sourceTimestamp: undefined }), "invalid-source-timestamp");
    qualified(withMetadata(fixture(productId), {
      observationTimestamp: undefined, releaseTimestamp: undefined,
      originalPublisher: undefined, substitution: undefined, provenanceVersion: undefined,
    }));
  });
  test(`${productId}: future interior history and noncanonical order cannot be hidden`, () => {
    const input = fixture(productId);
    const observations = seriesOf(input).observations;
    reject(withHistory(input, [observations[0], { timestamp: LATEST + 86_400, value: 1.2 }, observations[2]]),
      "observation-after-evaluation");
    reject(withHistory(input, [...observations].reverse()), "non-canonical-history");
    reject(withHistory(input, [observations[0], observations[0], observations[2]]), "non-canonical-history");
  });
  test(`${productId}: deterministic binding includes interior values and same-second revisions`, () => {
    const input = fixture(productId);
    const original = qualified(input);
    assert.deepEqual(qualified(input), original);
    assert.deepEqual(qualified(reverseRecordKeys(input) as CanonicalTemporalQualificationInputV1), original);
    const changed = withHistory(input, seriesOf(input).observations.map((row, index) =>
      index === 1 ? { ...row, value: row.value + 0.01 } : row));
    assert.equal(seriesOf(changed).metadata.fetchedAt, seriesOf(input).metadata.fetchedAt);
    assert.notEqual(qualified(changed).sourceBinding.digest, original.sourceBinding.digest);
    validationReject(original, changed);
    const laterCutoff = { ...input, evaluatedAt: "2026-10-05T13:00:00.456Z" };
    assert.equal(qualified(laterCutoff).sourceBinding.digest, original.sourceBinding.digest);
    validationReject(original, laterCutoff);
  });
  test(`${productId}: ambiguity and supplied publication remain unverified`, () => {
    const input = fixture(productId);
    assert.equal(qualified(withMetadata(input, { fetchedAt: Q })).sameSecondPrecisionAmbiguity, true);
    const supplied = qualified(withMetadata(input, { releaseTimestamp: Q - 10 }));
    assert.equal(supplied.publicationTime, "supplied-unverified");
    assert.equal(supplied.availabilityEvidence, "unverified");
    assert.equal(supplied.sameSecondPrecisionAmbiguity, true);
    reject(withMetadata(input, { fetchedAt: Q + 1 }), "acquisition-after-evaluation");
    reject(withMetadata(input, { releaseTimestamp: Q + 1 }), "release-after-evaluation");
    reject(withMetadata(input, { releaseTimestamp: Q - 5 }), "release-after-acquisition");
    assert.notEqual(supplied.sourceBinding.digest, qualified(input).sourceBinding.digest);
  });
  test(`${productId}: JSON envelopes require independent complete context`, () => {
    const input = fixture(productId);
    const original = qualified(input);
    const decoded = JSON.parse(JSON.stringify(original));
    const validated = validateCanonicalTemporalQualificationV1(decoded, input);
    assert.deepEqual(validated, { status: "qualified", qualification: original });
    decoded.sourceBinding.digest = "0".repeat(64);
    assert.equal(validated.qualification.sourceBinding.digest, original.sourceBinding.digest);
    validationReject(decoded, input);
    validationReject({ ...original, evaluatedAt: "2026-10-05T13:00:00.123Z",
      evaluationTimestampMs: Date.parse("2026-10-05T13:00:00.123Z") }, input);
    validationReject({ ...original, sameSecondPrecisionAmbiguity: true }, input);
    validationReject({ ...original, publicationTime: "supplied-unverified" }, input);
    validationReject({ ...original, sourceIdentity: { ...original.sourceIdentity, seriesId: "other" } }, input);
    validationReject({ ...original, sourceBinding: { ...original.sourceBinding, digest: "a".repeat(64) } }, input);
    validationReject(original, undefined as unknown as CanonicalTemporalQualificationInputV1, "invalid-input");
    validationReject(original, withHistory(input, [seriesOf(input).observations.at(-1)]),
      productId === "estr" ? "estr-sidecar-count-mismatch" : "qualification-mismatch");
    validationReject(original, fixture(productId === "eurusd" ? "eurjpy" : "eurusd"));
  });
}

test("FX direct sources reject all cross-wired and reversed identities", () => {
  for (const productId of PRODUCTS.filter((id) => id !== "estr")) {
    const input = fixture(productId);
    for (const other of PRODUCTS.filter((id) => id !== productId)) {
      reject(withMetadata(input, { seriesId: seriesOf(fixture(other)).metadata.seriesId }), "invalid-product-identity");
    }
    const quote = ECB_FX_REFERENCE_PRODUCTS_V1[productId].quoteCurrency;
    reject(withMetadata(input, { seriesId: `EXR.D.EUR.${quote}.SP00.A`, unit: `EUR per ${quote}` }), "invalid-product-identity");
    reject(withMetadata(input, { requestedProductId: "estr", canonicalProductId: "estr" }), "invalid-product-identity");
  }
  reject(withMetadata(fixture("estr"), { seriesId: ECB_FX_REFERENCE_PRODUCTS_V1.eurusd.seriesId }), "invalid-product-identity");
});

test("actual ECB source producers map without normalization in qualification", async () => {
  const fx = await loadEcbFxReferenceSeriesBundleV1({
    loadData: async (requestedSeriesIds) => ({ provider: "ecb", requestedSeriesIds,
      observations: PRODUCTS.filter((id) => id !== "estr").flatMap((id) => [
        { seriesId: ECB_FX_REFERENCE_PRODUCTS_V1[id].seriesId, period: "2026-10-05", value: "1.1" },
        { seriesId: ECB_FX_REFERENCE_PRODUCTS_V1[id].seriesId, period: "2026-10-02", value: "1.2" },
      ]),
    }), now: () => new Date(E),
  });
  for (const productId of PRODUCTS.filter((id) => id !== "estr")) {
    qualified({ productId, source: fx[productId], evaluatedAt: E });
  }
  const rows: EcbEstrRawObservationV1[] = ["2026-10-05", "2026-10-02"].flatMap((period) =>
    (["WT", "RP", "CM"] as const).map((dataType) => ({
      seriesId: `EST.B.EU000A2X2A25.${dataType}`, frequency: "B", benchmarkItem: "EU000A2X2A25",
      dataType, period, value: dataType === "WT" ? "-0.1" : "0",
      observationStatus: "A", confidentialityStatus: "F", unitMeasure: "PC", unitMultiplier: "0",
    })));
  const estr = normalizeEcbEstrSeriesV1({ provider: "ecb", observations: rows }, () => new Date(E));
  qualified({ productId: "estr", source: estr, evaluatedAt: E });
});

test("source wrapper and optional provenance contradictions reject", () => {
  const input = fixture("estr");
  if (input.productId !== "estr") throw new Error("fixture");
  for (const key of ["schemaVersion", "dataflow", "seriesKey"]) {
    for (const value of [undefined, "wrong"]) {
      reject({ ...input, source: { ...input.source, [key]: value } }, "invalid-source-wrapper");
    }
  }
  reject({ ...input, source: fixture("eurusd").source }, "invalid-source-wrapper");
  reject({ ...fixture("eurusd"), source: input.source }, "invalid-series");
  reject({ ...input, productId: "unsupported" }, "invalid-product-identity");
  for (const productId of PRODUCTS) {
    for (const patch of [
      { originalPublisher: "other" }, { originalPublisher: null }, { provenanceVersion: "other" },
      { substitution: { status: "substituted", provider: "other", source: "other" } },
      { substitution: { status: "unknown" } }, { substitution: { status: "none", provider: "other" } },
    ]) reject(withMetadata(fixture(productId), patch), "invalid-source-metadata");
  }
});

test("every EUR short-term rate sidecar is aligned and bound; zero and negative values survive", () => {
  const input = fixture("estr");
  if (input.productId !== "estr") throw new Error("fixture");
  const source = input.source;
  const sidecars = source.observationMetadata;
  const changedSidecars = sidecars.map((row, index) => index === 1 ? {
    ...row, publicationType: "republication" as const, calculationMethod: "contingency" as const,
    observationStatus: { ...row.observationStatus, headline: "B" },
    confidentialityStatus: { ...row.confidentialityStatus, headline: "N" },
  } : row);
  const changed = { ...input, source: { ...source, observationMetadata: changedSidecars } };
  assert.notEqual(qualified(changed).sourceBinding.digest, qualified(input).sourceBinding.digest);
  validationReject(qualified(input), changed);
  for (const field of ["publicationType", "calculationMethod", "observationStatus", "confidentialityStatus"] as const) {
    const variant = { ...input, source: { ...source, observationMetadata: sidecars.map((row, index) =>
      index === 1 ? { ...row, [field]: changedSidecars[index]![field] } : row) } };
    assert.notEqual(qualified(variant).sourceBinding.digest, qualified(input).sourceBinding.digest, field);
  }
  for (const value of [undefined, [], [...sidecars, sidecars[0]]]) {
    reject({ ...input, source: { ...source, observationMetadata: value } },
      value === undefined ? "estr-sidecars-missing" : "estr-sidecar-count-mismatch");
  }
  for (const [patch, reason] of [
    [{ timestamp: sidecars[0]!.timestamp }, "estr-sidecar-timestamp-mismatch"],
    [{ referenceDate: "2026-02-30" }, "estr-sidecar-reference-date-invalid"],
    [{ publicationType: "unknown" }, "estr-sidecar-enum-invalid"],
    [{ calculationMethod: "unknown" }, "estr-sidecar-enum-invalid"],
    [{ observationStatus: {} }, "estr-sidecar-invalid"],
  ] as const) {
    reject({ ...input, source: { ...source, observationMetadata: sidecars.map((row, index) =>
      index === 1 ? { ...row, ...patch } : row) } }, reason);
  }
  const negative = withHistory(input, source.canonicalSeries.observations.map((row, index) =>
    ({ ...row, value: [-0.1, 0, -0.2][index] })));
  const original = JSON.stringify(negative);
  qualified(frozen(negative));
  assert.equal(JSON.stringify(negative), original);
  validationReject(qualified(input), { ...input, source: {
    ...source, observationMetadata: [sidecars.at(-1)!],
  } }, "estr-sidecar-count-mismatch");
});

test("binding covers all metadata, history length, and additional passive source fields", () => {
  const input = fixture("eurusd");
  const original = qualified(input);
  for (const patch of [{ fetchedAt: Q - 11 }, { observationTimestamp: undefined },
    { originalPublisher: undefined }, { extraEvidence: "passive extension" }]) {
    assert.notEqual(qualified(withMetadata(input, patch)).sourceBinding.digest, original.sourceBinding.digest);
  }
  assert.notEqual(qualified(withHistory(input, seriesOf(input).observations.slice(1))).sourceBinding.digest,
    original.sourceBinding.digest);
  assert.notEqual(qualified(withMetadata(input, { releaseTimestamp: undefined })).sourceBinding.digest,
    original.sourceBinding.digest);
  const estr = fixture("estr");
  assert.notEqual(qualified(withMetadata(estr, { extraEvidence: -0 })).sourceBinding.digest,
    qualified(withMetadata(estr, { extraEvidence: 0 })).sourceBinding.digest);
});

test("legacy, malformed, unknown-version, and unsupported envelopes fail closed", () => {
  const input = fixture("eurusd");
  const original = qualified(input);
  for (const value of [undefined, null, {}, [], "receipt", { availability: "available" },
    { ...original, schemaVersion: "other" }, { ...original, policyVersion: "other" },
    { ...original, availabilityEvidence: "verified" }, { ...original, publicationTime: "proven" },
    { ...original, extra: "ignored?" }, { ...original, evaluationTimestampMs: NaN },
    { ...original, sourceBinding: { ...original.sourceBinding, digest: "bad" } },
    { ...original, sourceBinding: { ...original.sourceBinding, algorithm: "other" } },
    { ...original, sourceIdentity: { ...original.sourceIdentity, extra: true } },
  ]) validationReject(value, input, "invalid-qualification-envelope");
  for (const key of Object.keys(original)) {
    const incomplete: Record<string, unknown> = { ...original };
    delete incomplete[key];
    validationReject(incomplete, input, "invalid-qualification-envelope");
  }
});

test("passive input boundary rejects getters and iterators without invoking them", () => {
  let reads = 0;
  const getter = { enumerable: true, get() { reads += 1; throw new Error("must not run"); } };
  for (const productId of PRODUCTS) {
    const input = fixture(productId);
    reject(Object.defineProperty({ ...input }, "evaluatedAt", getter), "invalid-input");
    reject(Object.defineProperty({ ...input }, "source", getter), "invalid-input");
    const metadata = Object.defineProperty({ ...seriesOf(input).metadata }, "fetchedAt", getter);
    reject(withSeries(input, { ...seriesOf(input), metadata }), "invalid-input");
    const observation = Object.defineProperty({ value: 1.2 }, "timestamp", getter);
    reject(withHistory(input, [observation, ...seriesOf(input).observations.slice(1)]), "invalid-input");
    const overridden = [...seriesOf(input).observations];
    Object.defineProperty(overridden, Symbol.iterator, { value: () => { reads += 1; return [][Symbol.iterator](); } });
    reject(withHistory(input, overridden), "invalid-input");
    reject(withHistory(input, new Array(3)), "invalid-input");
    const malformed = [...seriesOf(input).observations];
    Object.defineProperty(malformed, "1", getter);
    reject(withHistory(input, malformed), "invalid-input");
  }
  const estr = fixture("estr");
  if (estr.productId !== "estr") throw new Error("fixture");
  reject({ ...estr, source: { ...estr.source, observationMetadata: estr.source.observationMetadata.map((row, index) =>
    index === 1 ? Object.defineProperty({ ...row }, "publicationType", getter) : row) } }, "invalid-input");
  const input = fixture("eurusd");
  validationReject(Object.defineProperty({ ...qualified(input) }, "evaluatedAt", getter), input,
    "invalid-qualification-envelope");
  assert.equal(reads, 0);
});

test("reflection failures, executable fields, cycles, and unsupported shapes return typed rejection", () => {
  const input = fixture("eurusd");
  const cycle: Record<string, unknown> = { ...input };
  cycle.self = cycle;
  for (const value of [null, undefined, [], cycle, { ...input, method() {} },
    Object.assign(Object.create({}), input), new Proxy(input, { ownKeys() { throw new Error("trap"); } }),
  ]) reject(value, "invalid-input");
  const revoked = Proxy.revocable(input, {});
  revoked.revoke();
  reject(revoked.proxy, "invalid-input");
  const envelope = qualified(input);
  validationReject(new Proxy(envelope, { getOwnPropertyDescriptor() { throw new Error("trap"); } }), input,
    "invalid-qualification-envelope");
});

test("strict clocks and year-9999 arithmetic remain owned by approved admission", () => {
  const input = fixture("eurusd");
  for (const evaluatedAt of ["2026-10-05T12:00:00Z", "2026-02-30T12:00:00.000Z", "2026-10-05T14:00:00.123+02:00"]) {
    reject({ ...input, evaluatedAt }, "invalid-evaluation-instant");
  }
  const evaluatedAt = "9999-12-31T23:59:59.999Z";
  const boundary = withMetadata({ ...input, evaluatedAt }, { fetchedAt: 253_402_300_799 });
  const result = qualified(boundary);
  assert.equal(result.evaluationTimestampMs, 253_402_300_799_999);
  assert.equal(result.sameSecondPrecisionAmbiguity, true);
  assert.equal(validateCanonicalTemporalQualificationV1(JSON.parse(JSON.stringify(result)), boundary).status, "qualified");
  reject(withMetadata(boundary, { fetchedAt: 253_402_300_800 }), "invalid-acquisition-timestamp");
});

test("helper is inactive with only hashing, constants, and approved admission runtime imports", () => {
  const text = readFileSync(new URL("../../services/canonicalTemporalQualification.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("qualification.ts", text, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).filter((statement) => !statement.importClause?.isTypeOnly)
    .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
  assert.deepEqual(imports, ["node:crypto", "../providers/ecb/estrContract", "./canonicalTemporalAdmission"]);
  const calls: string[] = [];
  function walk(node: ts.Node) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) calls.push(node.expression.getText(ast));
    ts.forEachChild(node, walk);
  }
  walk(ast);
  for (const forbidden of ["fetch", "Date", "Date.now", "Math.random", "unstable_cache", "advanceSnapshot",
    "getCanonicalEcbFxReferenceSeriesBundleV1", "getCanonicalEcbEstrSourceV1"]) {
    assert.equal(calls.includes(forbidden), false, forbidden);
  }
});
