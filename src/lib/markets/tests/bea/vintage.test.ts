import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { BEA_MACRO_FAMILIES_V1, getBeaMacroSourceSpecV1 } from "../../providers/bea/macroSeries";
import { BeaMacroSeriesVintagePersistenceError, buildBeaMacroSeriesVintageRedisKeyV1, createBeaMacroSeriesVintageRedisAdapterV1 } from "../../persistence/beaMacroSeriesVintageRedis";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import type { CanonicalStatisticalSeriesInputV1 } from "../../services/canonicalObservationSeries";
import { canonical, storage } from "./fixtures";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof BeaMacroSeriesVintagePersistenceError && error.code === expected;

test("exactly three isolated BEA namespace keys", async () => {
  const store = storage();
  for (const family of BEA_MACRO_FAMILIES_V1) {
    assert.equal(buildBeaMacroSeriesVintageRedisKeyV1(family), `chronoverse:markets:bea:macro-series-vintages-v1:${getBeaMacroSourceSpecV1(family).canonicalSeriesId}`);
    assert.equal((await store.adapter.append(family, canonical(family))).status, "initialized");
  }
  assert.equal(store.entries.size, 3);
});

for (const family of BEA_MACRO_FAMILIES_V1) {
  test(`${family}: immutable revisions, unchanged suppression, stale/conflict, no-lookahead boundaries`, async () => {
    const store = storage(); const key = buildBeaMacroSeriesVintageRedisKeyV1(family);
    assert.equal((await store.adapter.append(family, canonical(family, 100, 1))).status, "initialized");
    const first = store.entries.get(key)![0]!.member;
    assert.equal((await store.adapter.append(family, canonical(family, 200, 2))).status, "advanced");
    assert.equal((await store.adapter.append(family, canonical(family, 300, 2))).status, "unchanged");
    assert.equal((await store.adapter.append(family, canonical(family, 200, 2))).status, "unchanged");
    assert.equal((await store.adapter.append(family, canonical(family, 150, 3))).status, "stale");
    assert.equal((await store.adapter.append(family, canonical(family, 200, 3))).status, "conflict");
    assert.equal(store.entries.get(key)!.length, 2); assert.equal(store.entries.get(key)![0]!.member, first);
    for (const [asOf, knownAt] of [[99, null], [100, 100], [199, 100], [200, 200], [300, 200]] as const) {
      const result = await store.adapter.readAsKnownAt(family, asOf);
      assert.equal(result.status, knownAt === null ? "absent" : "available");
      if (result.status === "available") {
        assert.equal(result.snapshot.knownAt, knownAt); assert.equal(result.snapshot.series.metadata.fetchedAt, knownAt);
        assert.ok(!Object.hasOwn(result.snapshot.series.metadata, "releaseTimestamp"));
      }
    }
  });

  test(`${family}: metadata/publisher/table/line/unit/frequency/hash/release tampering rejected before writes`, async () => {
    const original = canonical(family); const key = buildBeaMacroSeriesVintageRedisKeyV1(family);
    const spec = getBeaMacroSourceSpecV1(family);
    const changes: Array<[string, unknown]> = Object.entries({ provider: "fred", source: "FRED", originalPublisher: "Other publisher",
      provenanceVersion: "forged", canonicalSeriesId: "other-family", unit: "percent growth", frequency: spec.frequency === "monthly" ? "quarterly" : "monthly",
      sourceUrl: "https://example.invalid/", sourceVersionId: "forged", releaseTimestamp: 99,
      substitution: { status: "substituted", provider: "fred", source: "FRED" } });
    for (const value of [spec.sourceSeriesId.replace("NIPA", "Other"), spec.sourceSeriesId.replace(spec.tableName, "T20304"),
      `NIPA:${spec.tableName}:30:${spec.seriesCode}:${spec.apiFrequency}`]) changes.push(["sourceSeriesId", value]);
    for (const [field, value] of changes) {
      const store = storage();
      const candidate = { ...original, metadata: { ...original.metadata, [field]: value } } as CanonicalStatisticalSeriesInputV1;
      await assert.rejects(store.adapter.append(family, candidate), code("invalid-current"));
      assert.deepEqual(store.counts(), { reads: 0, writes: 0 });
      const snapshot = JSON.parse(JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(original)));
      snapshot.series.metadata[field] = value;
      if (field === "sourceVersionId") snapshot.sourceVersionId = value;
      store.entries.set(key, [{ score: 100, member: JSON.stringify(snapshot) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
      await assert.rejects(store.adapter.append(family, canonical(family, 200)), code("stored-snapshot-invalid"));
      assert.equal(store.counts().writes, 0);
    }
    await assert.rejects(storage().adapter.append(family, { ...original, metadata: { ...original.metadata, releaseTimestamp: undefined } }), code("invalid-current"));
  });

  test(`${family}: stored annotation binding checked independently of a recomputed checksum`, async () => {
    for (const field of ["tableName", "lineNumber", "seriesCode", "metricName", "calculation", "unitMult", "referenceYear"]) {
      const store = storage(); const snapshot = JSON.parse(JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(canonical(family))));
      const observation = snapshot.series.observations[0]; const annotation = JSON.parse(observation.officialStatus);
      annotation[1][field] = field === "unitMult" || field === "referenceYear" ? 999 : "forged";
      observation.officialStatus = JSON.stringify(annotation);
      const hash = createHash("sha256").update(JSON.stringify(["bea-selected-series-v1", getBeaMacroSourceSpecV1(family), snapshot.series.metadata.unit,
        snapshot.series.observations.map((entry: { referencePeriod: string; value: number; officialStatus: string }) => [entry.referencePeriod, entry.value, entry.officialStatus])])).digest("hex");
      snapshot.sourceVersionId = snapshot.series.metadata.sourceVersionId = `bea-selected-series-v1:sha256:${hash}`;
      store.entries.set(buildBeaMacroSeriesVintageRedisKeyV1(family), [{ score: 100, member: JSON.stringify(snapshot) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
    }
  });

  test(`${family}: corrupted values/timing/JSON fail; other-family snapshots never substitute`, async () => {
    const key = buildBeaMacroSeriesVintageRedisKeyV1(family);
    for (const mutation of ["value", "fetchedAt", "knownAt", "score", "json"]) {
      const store = storage(); const snapshot = JSON.parse(JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(canonical(family))));
      if (mutation === "value") snapshot.series.observations[0].value = 123;
      if (mutation === "fetchedAt") snapshot.series.metadata.fetchedAt = 99;
      if (mutation === "knownAt") snapshot.knownAt = 99;
      store.entries.set(key, [{ score: mutation === "score" ? 99 : 100, member: mutation === "json" ? "{bad" : JSON.stringify(snapshot) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
      await assert.rejects(store.adapter.append(family, canonical(family, 200)), code("stored-snapshot-invalid"));
    }
    for (const other of BEA_MACRO_FAMILIES_V1) {
      if (other === family) continue;
      const store = storage(); await assert.rejects(store.adapter.append(family, canonical(other)), code("invalid-current"));
      store.entries.set(key, [{ score: 100, member: JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(canonical(other))) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
    }
  });

  test(`${family}: existing CAS retries are bounded; no overwrite when exhausted`, async () => {
    const store = storage(); store.race();
    await assert.rejects(store.adapter.append(family, canonical(family)), code("concurrency-conflict"));
    assert.deepEqual(store.counts(), { reads: 3, writes: 3 }); assert.equal(store.entries.size, 0);
  });
}

test("injected storage TypeError/ReferenceError defects propagate on append and read", async () => {
  for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect")]) {
    for (const field of ["readHead", "compareAndAppend", "readAsKnownAt"] as const) {
      const store = storage(); const adapter = createBeaMacroSeriesVintageRedisAdapterV1({ ...store.dependencies, [field]: async () => { throw defect; } });
      await assert.rejects(field === "readAsKnownAt" ? adapter.readAsKnownAt("real-gdp", 100) : adapter.append("real-gdp", canonical("real-gdp")), (actual) => actual === defect);
    }
  }
});
