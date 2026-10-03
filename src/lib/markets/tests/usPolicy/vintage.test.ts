import assert from "node:assert/strict";
import { after, test } from "node:test";
import { normalizeCanonicalStatisticalSeriesV1 } from "../../services/canonicalObservationSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { createUsPolicyVintageAdapterV1, buildUsPolicyVintageKeyV1, UsPolicyVintagePersistenceError } from "../../persistence/usPolicyVintageRedis";
import { readUsPolicyFactsV1, buildUsPolicyCanonicalSeriesV1 } from "../../providers/federalReserve/canonical";
import { canonical, storage, family, captureTime } from "./fixtures";
const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof UsPolicyVintagePersistenceError && error.code === expected;
for (const actualFamily of [family, "effr"] as const) {
  test(`${actualFamily}: immutable revisions, identical dedupe, stale/conflict and as-known boundaries`, async () => {
    const store = storage(); const key = buildUsPolicyVintageKeyV1(actualFamily); const time = captureTime;
    assert.equal((await store.adapter.append(actualFamily, canonical(actualFamily, time))).status, "initialized");
    const first = store.entries.get(key)![0]!.member;
    assert.equal((await store.adapter.append(actualFamily, canonical(actualFamily, time + 100, 4))).status, "advanced");
    assert.equal((await store.adapter.append(actualFamily, canonical(actualFamily, time + 200, 4))).status, "unchanged");
    assert.equal((await store.adapter.append(actualFamily, canonical(actualFamily, time + 50, 3))).status, "stale");
    assert.equal((await store.adapter.append(actualFamily, canonical(actualFamily, time + 100, 3))).status, "conflict");
    assert.equal(store.entries.get(key)!.length, 2); assert.equal(store.entries.get(key)![0]!.member, first);
    for (const [asOf, expected] of [[time - 1, null], [time, time], [time + 99, time], [time + 100, time + 100]] as const) {
      const result = await store.adapter.readAsKnownAt(actualFamily, asOf); assert.equal(result.status, expected === null ? "absent" : "available");
      if (result.status === "available") {
        assert.equal(result.snapshot.knownAt, expected); assert.equal(result.snapshot.series.metadata.fetchedAt, expected);
        if (actualFamily === "effr") assert.equal(result.snapshot.series.metadata.releaseTimestamp, undefined);
        else assert.notEqual(result.snapshot.series.metadata.releaseTimestamp, result.snapshot.knownAt);
      }
    }
  });
  test(`${actualFamily}: provenance/value/status/timing tampering and corrupt JSON fail closed`, async () => {
    const key = buildUsPolicyVintageKeyV1(actualFamily);
    for (const field of ["provider", "source", "originalPublisher", "sourceUrl", "sourceSeriesId", "unit", "frequency", "canonicalSeriesId", "sourceVersionId", "releaseTimestamp", "fetchedAt", "value", "status", "knownAt", "score", "json"]) {
      const store = storage(); const snapshot = JSON.parse(JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(canonical(actualFamily))));
      if (field === "value") snapshot.series.observations[0].value += 1;
      else if (field === "status") snapshot.series.observations[0].officialStatus = "forged";
      else if (field === "knownAt") snapshot.knownAt -= 1;
      else if (!["score", "json"].includes(field)) snapshot.series.metadata[field] = ["fetchedAt", "releaseTimestamp"].includes(field) ? captureTime - 1 : "forged";
      if (!["knownAt", "score", "json", "fetchedAt"].includes(field)) {
        const candidateStore = storage();
        await assert.rejects(candidateStore.adapter.append(actualFamily, snapshot.series), code("invalid-current"));
        assert.deepEqual(candidateStore.counts(), { reads: 0, writes: 0 });
      }
      store.entries.set(key, [{ score: field === "score" ? captureTime - 1 : captureTime, member: field === "json" ? "{bad" : JSON.stringify(snapshot) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(actualFamily, captureTime), { status: "stored-snapshot-invalid" });
      await assert.rejects(store.adapter.append(actualFamily, canonical(actualFamily, captureTime + 100)), code("stored-snapshot-invalid"));
      assert.equal(store.counts().writes, 0);
    }
    const candidate = canonical(actualFamily); const other = actualFamily === "effr" ? family : "effr";
    await assert.rejects(storage().adapter.append(other, candidate), code("invalid-current"));
  });
  test(`${actualFamily}: CAS retries bounded with no overwrite`, async () => {
    const store = storage(); store.race(); await assert.rejects(store.adapter.append(actualFamily, canonical(actualFamily)), code("concurrency-conflict"));
    assert.deepEqual(store.counts(), { reads: 3, writes: 3 }); assert.equal(store.entries.size, 0);
  });
}
test("policy date keys isolated from EFFR; marker-only revisions create immutable captures", async () => {
  assert.notEqual(buildUsPolicyVintageKeyV1(family), buildUsPolicyVintageKeyV1("effr"));
  assert.notEqual(buildUsPolicyVintageKeyV1(family), buildUsPolicyVintageKeyV1("fomc:2025-03-19"));
  const store = storage(); const original = canonical("effr"); await store.adapter.append("effr", original);
  const facts = readUsPolicyFactsV1("effr", original).map((fact) => ({ ...fact, revisionIndicator: "Y" }));
  assert.equal((await store.adapter.append("effr", buildUsPolicyCanonicalSeriesV1("effr", facts, captureTime + 100))).status, "advanced");
});
test("storage programming errors propagate from read/append dependencies", async () => {
  for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect")]) for (const stage of ["readHead", "readAsKnownAt", "compareAndAppend"] as const) {
    const adapter = createUsPolicyVintageAdapterV1({ ...storage().dependencies, [stage]: async () => { throw defect; } });
    await assert.rejects(stage === "readAsKnownAt" ? adapter.readAsKnownAt(family, captureTime) : adapter.append(family, canonical()), (error) => error === defect);
  }
});
test("shared daily/event-date periods validate civil dates while monthly/quarterly behavior stays intact", () => {
  const original = canonical("effr");
  for (const frequency of ["daily", "event-date"] as const) {
    assert.equal(normalizeCanonicalStatisticalSeriesV1({ ...original, metadata: { ...original.metadata, frequency } }).observations[0]!.referencePeriod, "2025-01-29");
    for (const referencePeriod of ["2025-02-30", "2025-13-01", "2025-01", "2025-Q1"]) assert.throws(() => normalizeCanonicalStatisticalSeriesV1({ ...original, metadata: { ...original.metadata, frequency }, observations: [{ referencePeriod, value: 1 }] }));
  }
  for (const [frequency, referencePeriod] of [["monthly", "2025-01"], ["quarterly", "2025-Q1"]] as const) {
    assert.equal(normalizeCanonicalStatisticalSeriesV1({ ...original, metadata: { ...original.metadata, frequency }, observations: [{ referencePeriod, value: 1 }] }).observations[0]!.referencePeriod, referencePeriod);
  }
});
