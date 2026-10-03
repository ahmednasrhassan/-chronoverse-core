import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createBlsMacroSeriesVintageRedisAdapterV1, buildBlsMacroSeriesVintageRedisKeyV1,
  BlsMacroSeriesVintagePersistenceError,
} from "../../persistence/blsMacroSeriesVintageRedis";
import type { CanonicalStatisticalSeriesVintageRedisDependencies } from "../../persistence/canonicalStatisticalSeriesVintageRedis";
import { BLS_LABOR_FAMILIES_V1, getBlsMacroSourceSpecV1, buildBlsCanonicalMacroSeriesV1,
  buildBlsSelectedSeriesSourceVersionIdV1, type BlsMacroFamilyV1,
} from "../../providers/bls/macroSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import type { CanonicalStatisticalSeriesInputV1 } from "../../services/canonicalObservationSeries";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const series = (family: BlsMacroFamilyV1, knownAt: number, value = 1) =>
  buildBlsCanonicalMacroSeriesV1(family, [{ referencePeriod: "2026-01", value }], knownAt);
const hasCode = (code: string) => (error: unknown) =>
  error instanceof BlsMacroSeriesVintagePersistenceError && error.code === code;
type Entry = { score: number; member: string };
function storage() {
  const entries = new Map<string, Entry[]>();
  let writes = 0, reads = 0;
  let race = false;
  const window = (items: Entry[]) => [...items].sort((a, b) => b.score - a.score).slice(0, 2)
    .flatMap((entry) => [entry.member, String(entry.score)]);
  const dependencies: CanonicalStatisticalSeriesVintageRedisDependencies = {
    readHead: async (key) => { reads++; return window(entries.get(key) ?? []); },
    readAsKnownAt: async (key, asOf) => window((entries.get(key) ?? []).filter((entry) => entry.score <= asOf)),
    compareAndAppend: async (key, expected, score, member) => {
      writes++;
      if (race) return "race";
      const items = entries.get(key) ?? [];
      const head = [...items].sort((a, b) => b.score - a.score)[0];
      if (expected === null ? head !== undefined :
        head === undefined || head.score !== expected.score || head.member !== expected.member) return "race";
      if (items.some((entry) => entry.score === score)) return "score-conflict";
      entries.set(key, [...items, { score, member }]); return "written";
    },
  };
  return { entries, adapter: createBlsMacroSeriesVintageRedisAdapterV1(dependencies),
    counts: () => ({ reads, writes }), race: () => { race = true; } };
}

test("CPI and three labor families each use their exact isolated BLS canonical key", async () => {
  const store = storage();
  const families: BlsMacroFamilyV1[] = ["cpi-all-items-nsa", ...BLS_LABOR_FAMILIES_V1];
  const ids = ["us-cpi-u-city-average-all-items-nsa-index", "us-total-nonfarm-payroll-employment-sa-level",
    "us-civilian-unemployment-rate-sa-level", "us-average-hourly-earnings-all-employees-total-private-sa-level"];
  for (const [index, family] of families.entries()) {
    assert.equal(buildBlsMacroSeriesVintageRedisKeyV1(family), `chronoverse:markets:bls:macro-series-vintages-v1:${ids[index]}`);
    assert.equal((await store.adapter.append(family, series(family, 100))).status, "initialized");
    const read = await store.adapter.readAsKnownAt(family, 100);
    assert.equal(read.status, "available");
    if (read.status === "available") assert.equal(read.snapshot.series.metadata.sourceSeriesId, getBlsMacroSourceSpecV1(family).sourceSeriesId);
  }
  assert.equal(store.entries.size, 4);
});

for (const family of BLS_LABOR_FAMILIES_V1) {
  test(`${family} keeps revisions immutable, unchanged captures unstored, stale/conflict and as-known boundaries explicit`, async () => {
    const store = storage(); const key = buildBlsMacroSeriesVintageRedisKeyV1(family);
    assert.equal((await store.adapter.append(family, series(family, 100))).status, "initialized");
    const first = store.entries.get(key)![0]!.member;
    assert.equal((await store.adapter.append(family, series(family, 200, 2))).status, "advanced");
    assert.equal((await store.adapter.append(family, series(family, 300, 2))).status, "unchanged");
    assert.equal((await store.adapter.append(family, series(family, 200, 2))).status, "unchanged");
    assert.equal((await store.adapter.append(family, series(family, 150, 3))).status, "stale");
    assert.equal((await store.adapter.append(family, series(family, 200, 3))).status, "conflict");
    assert.equal(store.entries.get(key)!.length, 2);
    assert.equal(store.entries.get(key)![0]!.member, first);
    for (const [asOf, knownAt] of [[99, null], [100, 100], [199, 100], [200, 200], [300, 200]] as const) {
      const result = await store.adapter.readAsKnownAt(family, asOf);
      assert.equal(result.status, knownAt === null ? "absent" : "available");
      if (result.status === "available") assert.equal(result.snapshot.knownAt, knownAt);
    }
  });

  test(`${family} rejects publisher/source/unit/provenance/hash/release tampering for candidates AND stored snapshots`, async () => {
    const original = series(family, 100); const key = buildBlsMacroSeriesVintageRedisKeyV1(family);
    for (const [field, value] of Object.entries({
      provider: "fred", source: "FRED", originalPublisher: "Eurostat", provenanceVersion: "forged",
      sourceSeriesId: getBlsMacroSourceSpecV1(family).sourceSeriesId.replace("CES", "CEU").replace("LNS", "LNU"),
      canonicalSeriesId: "other-family", unit: "forged-unit", frequency: "quarterly",
      sourceUrl: "https://example.com/", sourceVersionId: "forged", releaseTimestamp: 99,
      substitution: { status: "substituted", provider: "fred", source: "FRED" },
    })) {
      const store = storage();
      const candidate = { ...original, metadata: { ...original.metadata, [field]: value } } as CanonicalStatisticalSeriesInputV1;
      await assert.rejects(store.adapter.append(family, candidate), hasCode("invalid-current"));
      assert.deepEqual(store.counts(), { reads: 0, writes: 0 });
      const snapshot = JSON.parse(JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(original)));
      snapshot.series.metadata[field] = value;
      if (field === "sourceVersionId") snapshot.sourceVersionId = value;
      store.entries.set(key, [{ score: 100, member: JSON.stringify(snapshot) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
      await assert.rejects(store.adapter.append(family, series(family, 200)), hasCode("stored-snapshot-invalid"));
      assert.equal(store.counts().writes, 0);
    }
  });

  test(`${family} recomputes stored identity, validates status and knownAt/fetchedAt/score equality`, async () => {
    const key = buildBlsMacroSeriesVintageRedisKeyV1(family);
    for (const mutation of ["value", "status", "fetchedAt", "knownAt", "score", "malformed"] as const) {
      const store = storage();
      const snapshot = JSON.parse(JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(series(family, 100))));
      switch (mutation) {
        case "value": snapshot.series.observations[0].value = 2; break;
        case "status": {
          snapshot.series.observations[0].officialStatus = "forged";
          snapshot.sourceVersionId = snapshot.series.metadata.sourceVersionId =
            buildBlsSelectedSeriesSourceVersionIdV1(family, snapshot.series.observations);
          break;
        }
        case "fetchedAt": snapshot.series.metadata.fetchedAt = 99; break;
        case "knownAt": snapshot.knownAt = 99; break;
      }
      store.entries.set(key, [{ score: mutation === "score" ? 99 : 100,
        member: mutation === "malformed" ? "{malformed" : JSON.stringify(snapshot) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
      await assert.rejects(store.adapter.append(family, series(family, 200)), hasCode("stored-snapshot-invalid"));
    }
    const invalid = series(family, 100);
    const forged = { ...invalid, observations: [{ ...invalid.observations[0]!, officialStatus: "forged" }] };
    const candidate = { ...forged, metadata: { ...forged.metadata,
      sourceVersionId: buildBlsSelectedSeriesSourceVersionIdV1(family, forged.observations) } };
    await assert.rejects(storage().adapter.append(family, candidate), hasCode("invalid-current"));
  });

  test(`${family} rejects every other family's valid current and stored content`, async () => {
    for (const other of ["cpi-all-items-nsa", ...BLS_LABOR_FAMILIES_V1] as const) {
      if (other === family) continue;
      const store = storage();
      await assert.rejects(store.adapter.append(family, series(other, 100)), hasCode("invalid-current"));
      store.entries.set(buildBlsMacroSeriesVintageRedisKeyV1(family), [{ score: 100,
        member: JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(series(other, 100))) }]);
      assert.deepEqual(await store.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
    }
  });

  test(`${family} uses existing bounded CAS race retries without writes/overwrites`, async () => {
    const store = storage(); store.race();
    await assert.rejects(store.adapter.append(family, series(family, 100)), hasCode("concurrency-conflict"));
    assert.deepEqual(store.counts(), { reads: 3, writes: 3 });
    assert.equal(store.entries.size, 0);
  });
}

test("official status-only revisions advance and valid footnotes round-trip for every labor family", async () => {
  for (const family of BLS_LABOR_FAMILIES_V1) {
    const store = storage();
    await store.adapter.append(family, series(family, 100));
    const officialStatus = JSON.stringify(["bls-footnotes-v1", [["P", "Preliminary."]]]);
    const annotated = buildBlsCanonicalMacroSeriesV1(family,
      [{ referencePeriod: "2026-01", value: 1, officialStatus }], 200);
    assert.equal((await store.adapter.append(family, annotated)).status, "advanced");
    const read = await store.adapter.readAsKnownAt(family, 200);
    assert.equal(read.status, "available");
    if (read.status === "available") assert.equal(read.snapshot.series.observations[0]!.officialStatus, officialStatus);
  }
});
