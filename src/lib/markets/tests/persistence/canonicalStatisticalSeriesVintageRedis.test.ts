import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanonicalStatisticalSeriesVintageRedisAdapterV1,
  CanonicalStatisticalSeriesVintagePersistenceError,
  type CanonicalStatisticalSeriesVintageRedisDependencies,
} from "../../persistence/canonicalStatisticalSeriesVintageRedis";
import { createBlsMacroSeriesVintageRedisAdapterV1, buildBlsMacroSeriesVintageRedisKeyV1,
  BlsMacroSeriesVintagePersistenceError,
} from "../../persistence/blsMacroSeriesVintageRedis";
import { buildEurostatMacroSeriesVintageRedisKeyV1 } from "../../persistence/eurostatMacroSeriesVintageRedis";
import { buildBlsCanonicalMacroSeriesV1 } from "../../providers/bls/macroSeries";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import type { CanonicalStatisticalSeriesInputV1 } from "../../services/canonicalObservationSeries";

const family = "cpi-all-items-nsa";
const series = (knownAt: number, value = 310) => buildBlsCanonicalMacroSeriesV1(family,
  [{ referencePeriod: "2026-01", value }], knownAt);
type Entry = { score: number; member: string };
function fake() {
  const entries = new Map<string, Entry[]>();
  let appends = 0, heads = 0;
  let mode = "normal";
  let beforeAppend: (() => void) | undefined;
  const window = (items: Entry[]) => [...items].sort((a, b) => b.score - a.score)
    .slice(0, 2).flatMap((entry) => [entry.member, String(entry.score)]);
  const dependencies: CanonicalStatisticalSeriesVintageRedisDependencies = {
    readHead: async (key) => { heads++; return window(entries.get(key) ?? []); },
    readAsKnownAt: async (key, asOf) => {
      if (mode === "read-failure") throw new Error("storage failed");
      return window((entries.get(key) ?? []).filter((entry) => entry.score <= asOf));
    },
    compareAndAppend: async (key, expected, score, member) => {
      appends++; beforeAppend?.(); beforeAppend = undefined;
      if (mode === "race") return "race";
      if (mode === "append-failure") throw new Error("storage failed");
      if (mode === "invalid-response") return "unexpected";
      const items = entries.get(key) ?? [];
      const head = [...items].sort((a, b) => b.score - a.score)[0];
      if (expected === null ? head !== undefined :
        head === undefined || head.score !== expected.score || head.member !== expected.member) return "race";
      if (items.some((entry) => entry.score === score)) return "score-conflict";
      entries.set(key, [...items, { score, member }]); return "written";
    },
  };
  return { entries, dependencies, adapter: createBlsMacroSeriesVintageRedisAdapterV1(dependencies),
    count: () => ({ appends, heads }), mode: (next: string) => { mode = next; },
    before: (fn: () => void) => { beforeAppend = fn; } };
}
const hasCode = (code: string) => (error: unknown) =>
  error instanceof BlsMacroSeriesVintagePersistenceError && error.code === code;

async function main() {
  const key = buildBlsMacroSeriesVintageRedisKeyV1(family);
  assert.notEqual(key, buildEurostatMacroSeriesVintageRedisKeyV1("hicp"));
  assert.match(key, /:bls:/);
  const storage = fake();
  assert.equal((await storage.adapter.append(family, series(100))).status, "initialized");
  const first = storage.entries.get(key)![0]!.member;
  assert.equal((await storage.adapter.append(family, series(200, 311))).status, "advanced");
  assert.equal(storage.entries.get(key)![0]!.member, first, "earlier revision is immutable");
  assert.equal((await storage.adapter.append(family, series(300, 311))).status, "unchanged");
  assert.equal((await storage.adapter.append(family, series(150, 312))).status, "stale");
  assert.equal((await storage.adapter.append(family, series(200, 312))).status, "conflict");
  assert.equal(storage.entries.get(key)!.length, 2);
  for (const [asOf, expected] of [[99, null], [100, 100], [101, 100], [199, 100], [200, 200], [201, 200]]) {
    const result = await storage.adapter.readAsKnownAt(family, asOf!);
    assert.equal(result.status, expected === null ? "absent" : "available");
    if (result.status === "available") assert.equal(result.snapshot.knownAt, expected);
  }
  for (const [field, value] of Object.entries({
    provider: "fred", source: "FRED", originalPublisher: "Eurostat", sourceSeriesId: "CUSR0000SA0",
    canonicalSeriesId: "other", unit: "percent", frequency: "quarterly",
    sourceUrl: "https://example.com/", sourceVersionId: "forged", releaseTimestamp: 50,
  })) {
    const candidate = series(100);
    const forged = { ...candidate, metadata: { ...candidate.metadata, [field]: value } } as CanonicalStatisticalSeriesInputV1;
    const fresh = fake();
    await assert.rejects(fresh.adapter.append(family, forged), hasCode("invalid-current"));
    assert.deepEqual(fresh.count(), { appends: 0, heads: 0 });
    const raw = JSON.parse(JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(candidate)));
    raw.series.metadata[field] = value;
    if (field === "sourceVersionId") raw.sourceVersionId = value;
    fresh.entries.set(key, [{ score: 100, member: JSON.stringify(raw) }]);
    assert.deepEqual(await fresh.adapter.readAsKnownAt(family, 100), { status: "stored-snapshot-invalid" });
  }
  const malformed = fake();
  malformed.entries.set(key, [
    { score: 200, member: "{invalid" }, { score: 100, member: first },
  ]);
  assert.deepEqual(await malformed.adapter.readAsKnownAt(family, 200), { status: "stored-snapshot-invalid" });
  await assert.rejects(malformed.adapter.append(family, series(300)), hasCode("stored-snapshot-invalid"));
  const duplicate = fake();
  duplicate.entries.set(key, [
    { score: 100, member: first },
    { score: 100, member: JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(series(100, 311))) },
  ]);
  assert.deepEqual(await duplicate.adapter.readAsKnownAt(family, 100), { status: "duplicate-score" });
  const retries = fake(); retries.mode("race");
  await assert.rejects(retries.adapter.append(family, series(100)), hasCode("concurrency-conflict"));
  assert.deepEqual(retries.count(), { appends: 3, heads: 3 });
  const raced = fake();
  raced.before(() => raced.entries.set(key, [{ score: 150,
    member: JSON.stringify(buildCanonicalStatisticalSeriesSnapshotV1(series(150, 312))) }]));
  assert.equal((await raced.adapter.append(family, series(200))).status, "advanced");
  assert.deepEqual(raced.count(), { appends: 2, heads: 2 });
  for (const [mode, code] of [["append-failure", "redis-failure"], ["invalid-response", "invalid-response"]]) {
    const failed = fake(); failed.mode(mode!);
    await assert.rejects(failed.adapter.append(family, series(100)), hasCode(code!));
  }
  const failedRead = fake(); failedRead.mode("read-failure");
  assert.deepEqual(await failedRead.adapter.readAsKnownAt(family, 100), { status: "redis-failure" });
  assert.deepEqual(await storage.adapter.readAsKnownAt(family, -1), { status: "invalid-response" });
  await assert.rejects(storage.adapter.append("core" as typeof family, series(100)), hasCode("invalid-current"));
  // Exercise the generic layer without any provider-specific imports/configuration.
  const neutralStorage = fake();
  const neutral = createCanonicalStatisticalSeriesVintageRedisAdapterV1({
    buildKey: () => "test:neutral",
    canonicalSeriesId: () => series(100).metadata.canonicalSeriesId,
    validateCandidate: (_family, input) => buildCanonicalStatisticalSeriesSnapshotV1(input),
    isValidSnapshot: () => true,
    error: (code, message) => new CanonicalStatisticalSeriesVintagePersistenceError(code, message),
  }, neutralStorage.dependencies);
  assert.equal((await neutral.append("neutral", series(100))).status, "initialized");
  assert.equal((await neutral.readAsKnownAt("neutral", 100)).status, "available");
  assert.equal(neutralStorage.entries.has(key), false);
  const source = readFileSync(fileURLToPath(new URL("../../persistence/canonicalStatisticalSeriesVintageRedis.ts", import.meta.url)), "utf8");
  const script = /const CANONICAL_STATISTICAL_VINTAGE_COMPARE_AND_APPEND_SCRIPT = String.raw`([\s\S]*?)`;/.exec(source)![1]!;
  assert.match(script, /ZADD", key, "NX"/);
  assert.doesNotMatch(script, /EXPIRE|PEXPIRE|ZREM|DEL|ZPOPMIN|ZPOPMAX/i);
  assert.doesNotMatch(source, /providers\/|CUUR|eurostat|bls/i);
  console.log("PASS: Shared Redis and BLS immutable vintages V1");
}
void main();
