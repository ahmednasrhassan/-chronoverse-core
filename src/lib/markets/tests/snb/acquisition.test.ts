import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { acquireSnbPolicyV1, type SnbPolicyAcquisitionDependenciesV1 } from "../../services/snbPolicyAcquisition";
import { SnbPolicyTransportError, loadSnbPolicyDocumentV1 } from "../../providers/snb/transport";
import { SnbPolicyVintagePersistenceError } from "../../persistence/snbPolicyVintageRedis";
import { LAUNCH_MARKETS_V1 } from "../../../../config/institutionalNavigation";
import { document, storage, date, captureTime } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
function dependencies(overrides: Partial<SnbPolicyAcquisitionDependenciesV1> = {}) {
  const store = storage();
  let clocks = 0, appends = 0;
  const deps: SnbPolicyAcquisitionDependenciesV1 = {
    loadDocument: async () => document(),
    nowUnixSeconds: () => { clocks++; return captureTime; },
    appendVintage: async (actualDate, series) => { appends++; return store.adapter.append(actualDate, series); },
    ...overrides,
  };
  return { deps, store, counts: () => ({ clocks, appends }) };
}

test("full offline transport→validation→clock→immutable append respects ordering", async () => {
  const order: string[] = [];
  const store = storage();
  const result = await acquireSnbPolicyV1(date, signal, {
    loadDocument: (url, active) => loadSnbPolicyDocumentV1(url, { signal: active, fetchImpl: async () => {
      order.push("fetch");
      return new Response(document().html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    } }),
    nowUnixSeconds: () => { order.push("clock"); return captureTime; },
    appendVintage: async (actualDate, series) => {
      order.push("append");
      assert.equal(series.metadata.fetchedAt, captureTime);
      assert.equal(series.fact.publicationDate, date);
      assert.equal(Object.hasOwn(series, "observations"), false);
      return store.adapter.append(actualDate, series);
    },
  });
  assert.equal(result.status, "acquired");
  assert.deepEqual(order, ["fetch", "clock", "append"]);
  if (result.status === "acquired" && result.persistence.status === "initialized") {
    assert.equal(result.persistence.snapshot.knownAt, captureTime);
  }
});
test("malformed structure and invalid rate never sample the completion clock or write", async () => {
  for (const [doc, expected] of [[{ ...document(), html: "<html>bad</html>" }, "source"],
    [{ ...document(), html: document().html.replace('id="a11y-main"', 'id="changed"') }, "unsupported-structure"],
    [document({ rate: "101" }), "rate"]] as const) {
    const { deps, counts } = dependencies({ loadDocument: async () => doc });
    assert.deepEqual(await acquireSnbPolicyV1(date, signal, deps), { status: "validation-failure", code: expected });
    assert.deepEqual(counts(), { clocks: 0, appends: 0 });
  }
});

test("provider failure prevents clock/persistence and does not leak diagnostics", async () => {
  const { deps, counts } = dependencies({ loadDocument: async () => { throw new SnbPolicyTransportError("http"); } });
  assert.deepEqual(await acquireSnbPolicyV1(date, signal, deps), { status: "provider-failure", code: "http" });
  assert.deepEqual(counts(), { clocks: 0, appends: 0 });
});
test("pre-regime and invalid requests stop before fetch, clock or persistence", async () => {
  let fetches = 0;
  const { deps, counts } = dependencies({ loadDocument: async () => { fetches++; return document(); } });
  assert.deepEqual(await acquireSnbPolicyV1("2019-06-12", signal, deps), { status: "unsupported-regime" });
  assert.deepEqual(await acquireSnbPolicyV1("bad-date", signal, deps), { status: "validation-failure", code: "invalid-request" });
  assert.equal(fetches, 0);
  assert.deepEqual(counts(), { clocks: 0, appends: 0 });
});
test("clock throw and invalid time prevent persistence", async () => {
  for (const nowUnixSeconds of [() => { throw new Error("clock unavailable"); }, () => NaN, () => -1, () => 1.5]) {
    const { deps, counts } = dependencies({ nowUnixSeconds });
    assert.deepEqual(await acquireSnbPolicyV1(date, signal, deps), { status: "clock-failure" });
    assert.equal(counts().appends, 0);
  }
});
test("typed persistence failure and invalid-current classification are preserved", async () => {
  for (const code of ["redis-failure", "concurrency-conflict", "stored-snapshot-invalid", "invalid-current"] as const) {
    const { deps } = dependencies({ appendVintage: async () => { throw new SnbPolicyVintagePersistenceError(code); } });
    assert.deepEqual(await acquireSnbPolicyV1(date, signal, deps), { status: code === "invalid-current" ? "validation-failure" : "persistence-failure", code });
  }
});
test("deduplication, revision, stale and same-second conflict outcomes remain explicit", async () => {
  const store = storage();
  const run = (time: number, rate = "0") => acquireSnbPolicyV1(date, signal, {
    loadDocument: async () => document({ rate }), nowUnixSeconds: () => time, appendVintage: store.adapter.append,
  });
  assert.equal((await run(captureTime)).status, "acquired");
  assert.equal((await run(captureTime + 10)).status, "unchanged");
  assert.equal((await run(captureTime + 20, "4.5")).status, "acquired");
  assert.equal((await run(captureTime + 15, "4.4")).status, "stale");
  assert.equal((await run(captureTime + 20, "4.4")).status, "conflict");
});
test("cancellation at prefetch, after source and after clock prevents persistence", async () => {
  const before = new AbortController(); before.abort();
  const first = dependencies({ loadDocument: async () => { throw new Error("must not fetch"); } });
  assert.deepEqual(await acquireSnbPolicyV1(date, before.signal, first.deps), { status: "cancelled" });
  const afterSource = new AbortController();
  const second = dependencies({ loadDocument: async () => { afterSource.abort(); return document(); } });
  assert.deepEqual(await acquireSnbPolicyV1(date, afterSource.signal, second.deps), { status: "cancelled" });
  assert.deepEqual(second.counts(), { clocks: 0, appends: 0 });
  const afterClock = new AbortController();
  const third = dependencies({ nowUnixSeconds: () => { afterClock.abort(); return captureTime; } });
  assert.deepEqual(await acquireSnbPolicyV1(date, afterClock.signal, third.deps), { status: "cancelled" });
  assert.equal(third.counts().appends, 0);
  const failure = dependencies({ loadDocument: async () => { throw new SnbPolicyTransportError("aborted"); } });
  assert.deepEqual(await acquireSnbPolicyV1(date, signal, failure.deps), { status: "cancelled" });
});
test("cancellation during completed storage cannot roll back a successful append", async () => {
  const controller = new AbortController(); const store = storage();
  const result = await acquireSnbPolicyV1(date, controller.signal, {
    loadDocument: async () => document(), nowUnixSeconds: () => captureTime,
    appendVintage: async (actualDate, series) => { const appended = await store.adapter.append(actualDate, series); controller.abort(); return appended; },
  });
  assert.equal(result.status, "acquired");
  assert.equal(store.entries.size, 1);
});
test("dependency programming TypeError/ReferenceError propagate unchanged", async () => {
  for (const defect of [new TypeError("defect"), new ReferenceError("defect")]) {
    for (const overrides of [
      { loadDocument: async () => { throw defect; } }, { nowUnixSeconds: () => { throw defect; } },
      { appendVintage: async () => { throw defect; } },
    ]) await assert.rejects(acquireSnbPolicyV1(date, signal, dependencies(overrides).deps), (error) => error === defect);
  }
});
test("browser acquisition is rejected", async () => {
  const deps = dependencies().deps;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(acquireSnbPolicyV1(date, signal, deps), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
test("foundation has no production/product caller and locked universe stays five", () => {
  const ids = LAUNCH_MARKETS_V1.map((market) => market.productId);
  assert.deepEqual(ids, ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"]);
  for (const path of ["../../services/canonicalProductResults.ts", "../../providers/register.ts", "../../assets/ecbFxProductionRuntime.ts"])
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /providers\/snb|snbPolicy|acquireSnb/);
  for (const path of ["../../providers/snb/transport.ts", "../../providers/snb/facts.ts", "../../providers/snb/canonical.ts",
    "../../services/snbPolicyAcquisition.ts", "../../persistence/snbPolicyVintageRedis.ts"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /process\.env|setInterval\(|setTimeout\(|new Redis\(|globalThis\.fetch|\bfetch\(/);
    assert.doesNotMatch(source, /readonly (?:confidence|recommendation|direction|policyDifferential|interventionScore):/);
  }
});
