import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildBojPolicyVintageKeyV1, createBojPolicyVintageAdapterV1, BojPolicyVintagePersistenceError } from "../../persistence/bojPolicyVintageRedis";
import { canonical, storage, date, captureTime } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof BojPolicyVintagePersistenceError && error.code === expected;

test("append-only captures deduplicate and preserve revisions, stale/conflict outcomes", async () => {
  const store = storage();
  const key = buildBojPolicyVintageKeyV1(date);
  assert.equal((await store.adapter.append(date, canonical())).status, "initialized");
  const original = store.entries.get(key)![0]!.member;
  assert.equal((await store.adapter.append(date, canonical(captureTime + 100, "0.75"))).status, "advanced");
  assert.equal((await store.adapter.append(date, canonical(captureTime + 200, "0.75"))).status, "unchanged");
  assert.equal((await store.adapter.append(date, canonical(captureTime + 50, "0.6"))).status, "stale");
  assert.equal((await store.adapter.append(date, canonical(captureTime + 100, "0.6"))).status, "conflict");
  assert.equal(store.entries.get(key)!.length, 2);
  assert.equal(store.entries.get(key)![0]!.member, original);
});
test("empty capture history and not-known-as-of are distinct without exposing later data", async () => {
  const store = storage();
  assert.deepEqual(await store.adapter.readAsKnownAt(date, captureTime), { status: "no-captured-evidence" });
  await store.adapter.append(date, canonical());
  assert.deepEqual(await store.adapter.readAsKnownAt(date, captureTime - 1), { status: "not-known-as-of" });
  // Historical 2025 decision captured in 2026 is not known to a 2025 replay.
  assert.deepEqual(await store.adapter.readAsKnownAt(date, Date.parse("2025-01-28T00:00:00Z") / 1000), { status: "not-known-as-of" });
  for (const asOf of [captureTime, captureTime + 1]) {
    const result = await store.adapter.readAsKnownAt(date, asOf);
    assert.equal(result.status, "available");
    if (result.status === "available") {
      assert.equal(result.snapshot.knownAt, captureTime);
      assert.equal(result.snapshot.evidence.metadata.fetchedAt, captureTime);
    }
  }
});
test("as-known before/at/after a changed capture selects only the captured version", async () => {
  const store = storage();
  await store.adapter.append(date, canonical());
  await store.adapter.append(date, canonical(captureTime + 100, "0.75"));
  for (const [asOf, expected] of [[captureTime + 99, captureTime], [captureTime + 100, captureTime + 100], [captureTime + 101, captureTime + 100]]) {
    const result = await store.adapter.readAsKnownAt(date, asOf!);
    assert.equal(result.status, "available");
    if (result.status === "available") assert.equal(result.snapshot.knownAt, expected);
  }
});
test("tampered public provenance/fact/identity and extra scalar carriers fail before storage", async () => {
  for (const field of ["provider", "source", "originalPublisher", "sourceUrl", "sourceSeriesId", "unit", "frequency", "canonicalSeriesId", "sourceVersionId", "releaseTimestamp", "value", "observations", "shape", "schemaVersion"]) {
    const store = storage();
    const evidence = JSON.parse(JSON.stringify(canonical()));
    if (field === "shape") evidence.fact.target.shape = "range";
    else if (field === "schemaVersion") evidence.schemaVersion = "forged";
    else if (field === "value") evidence.value = 0;
    else if (field === "observations") evidence.observations = [{ referencePeriod: date, value: 0 }];
    else evidence.metadata[field] = field === "releaseTimestamp" ? captureTime - 1 : "forged";
    await assert.rejects(store.adapter.append(date, evidence), code("invalid-current"));
    assert.deepEqual(store.counts(), { reads: 0, writes: 0 });
  }
});

test("tampered stored provenance/fact/carrier/identity/knowledge and corrupt JSON fail closed", async () => {
  const key = buildBojPolicyVintageKeyV1(date);
  for (const field of ["provider", "source", "originalPublisher", "sourceUrl", "sourceSeriesId", "unit", "frequency", "canonicalSeriesId", "sourceVersionId", "releaseTimestamp", "value", "status", "knownAt", "score", "json"]) {
    const store = storage();
    await store.adapter.append(date, canonical());
    const snapshot = JSON.parse(store.entries.get(key)![0]!.member);
    if (field === "value") snapshot.series.observations[0].value += 1;
    else if (field === "status") snapshot.series.observations[0].officialStatus = "forged";
    else if (field === "knownAt") snapshot.knownAt -= 1;
    else if (!["score", "json"].includes(field)) snapshot.series.metadata[field] = field === "releaseTimestamp" ? captureTime - 1 : "forged";
    store.entries.set(key, [{ score: field === "score" ? captureTime - 1 : captureTime, member: field === "json" ? "{bad" : JSON.stringify(snapshot) }]);
    assert.deepEqual(await store.adapter.readAsKnownAt(date, captureTime), { status: "stored-snapshot-invalid" });
    await assert.rejects(store.adapter.append(date, canonical(captureTime + 100)), code("stored-snapshot-invalid"));
    assert.equal(store.counts().writes, 1);
  }
});

test("range upper bound revisions create vintages without a numeric policy carrier", async () => {
  const store = storage();
  await store.adapter.append(date, canonical(captureTime, "0.5 to 0.75"));
  assert.equal((await store.adapter.append(date, canonical(captureTime + 1, "0.5 to 1"))).status, "advanced");
  assert.equal(store.entries.get(buildBojPolicyVintageKeyV1(date))!.length, 2);
});
test("date-specific keys isolate announcements and reject a mismatched family", async () => {
  assert.notEqual(buildBojPolicyVintageKeyV1(date), buildBojPolicyVintageKeyV1("2025-03-19"));
  await assert.rejects(storage().adapter.append("2025-03-19", canonical()), code("invalid-current"));
});
test("CAS races are bounded and do not overwrite history", async () => {
  const store = storage(); store.race();
  await assert.rejects(store.adapter.append(date, canonical()), code("concurrency-conflict"));
  assert.deepEqual(store.counts(), { reads: 3, writes: 3 });
  assert.equal(store.entries.size, 0);
});
test("storage outages are typed; programming defects propagate unchanged from every dependency", async () => {
  for (const defect of [new TypeError("storage defect"), new ReferenceError("storage defect")]) {
    const base = storage().dependencies;
    await assert.rejects(createBojPolicyVintageAdapterV1({ ...base, readHead: async () => { throw defect; } }).append(date, canonical()), (error) => error === defect);
    await assert.rejects(createBojPolicyVintageAdapterV1({ ...base, compareAndAppend: async () => { throw defect; } }).append(date, canonical()), (error) => error === defect);
    await assert.rejects(createBojPolicyVintageAdapterV1({ ...base, readAsKnownAt: async () => { throw defect; } }).readAsKnownAt(date, captureTime), (error) => error === defect);
  }
  const base = storage().dependencies;
  const adapter = createBojPolicyVintageAdapterV1({ ...base, readHead: async () => { throw new Error("offline"); }, readAsKnownAt: async () => { throw new Error("offline"); } });
  await assert.rejects(adapter.append(date, canonical()), code("redis-failure"));
  assert.deepEqual(await adapter.readAsKnownAt(date, captureTime), { status: "redis-failure" });
});


test("range append outcomes and as-known reads expose both bounds without scalar fields", async () => {
  const store = storage();
  const results = [
    await store.adapter.append(date, canonical(captureTime, "0 to 0.1")),
    await store.adapter.append(date, canonical(captureTime + 1, "0 to 0.2")),
    await store.adapter.append(date, canonical(captureTime + 2, "0 to 0.2")),
    await store.adapter.append(date, canonical(captureTime, "0 to 0.3")),
    await store.adapter.append(date, canonical(captureTime + 1, "0 to 0.3")),
  ];
  assert.deepEqual(results.map((result) => result.status), ["initialized", "advanced", "unchanged", "stale", "conflict"]);
  for (const result of results) {
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === "string") { assert.equal(key, "status"); continue; }
      assert.equal(Object.hasOwn(value, "series"), false);
      assert.equal(Object.hasOwn(value.evidence, "observations"), false);
      assert.equal(Object.hasOwn(value.evidence.fact.target, "value"), false);
      assert.equal(value.evidence.fact.target.shape, "range");
    }
  }
  const first = await store.adapter.readAsKnownAt(date, captureTime);
  assert.equal(first.status, "available");
  if (first.status !== "available") assert.fail("Capture required");
  assert.deepEqual(first.snapshot.evidence.fact.target, { shape: "range", lower: 0, upper: 0.1, qualification: "around" });
  assert.equal(store.entries.get(buildBojPolicyVintageKeyV1(date))!.length, 2);
  const stored = JSON.parse(store.entries.get(buildBojPolicyVintageKeyV1(date))![0]!.member);
  assert.equal(stored.series.observations[0].value, 1);
  assert.equal(stored.series.metadata.unit, "source-evidence-record");
  assert.equal(stored.series.metadata.canonicalSeriesId, `japan-boj-policy-evidence-record:${date}`);
  assert.equal(stored.series.metadata.sourceSeriesId, `BOJ:policy-evidence-record:${date}`);
});

test("legacy percent-valued range boundary records are rejected, never reinterpreted", async () => {
  for (const value of [0, 0.1, 0.05]) {
    const store = storage();
    await store.adapter.append(date, canonical(captureTime, "0 to 0.1"));
    const key = buildBojPolicyVintageKeyV1(date);
    const snapshot = JSON.parse(store.entries.get(key)![0]!.member);
    snapshot.series.observations[0].value = value;
    snapshot.series.observations[0].officialStatus = JSON.stringify(["boj-policy-source-fact-v1", canonical(captureTime, "0 to 0.1").fact]);
    snapshot.series.metadata.unit = "percent";
    snapshot.series.metadata.canonicalSeriesId = canonical().metadata.canonicalSeriesId;
    snapshot.series.metadata.sourceSeriesId = canonical().metadata.sourceSeriesId;
    snapshot.canonicalSeriesId = snapshot.series.metadata.canonicalSeriesId;
    await assert.rejects(store.adapter.append(date, snapshot.series), code("invalid-current"));
    store.entries.set(key, [{ score: captureTime, member: JSON.stringify(snapshot) }]);
    assert.deepEqual(await store.adapter.readAsKnownAt(date, captureTime), { status: "stored-snapshot-invalid" });
  }
});
