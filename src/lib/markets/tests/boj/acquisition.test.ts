import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { acquireBojPolicyV1, type BojPolicyAcquisitionDependenciesV1 } from "../../services/bojPolicyAcquisition";
import { BojPolicyTransportError, loadBojPolicyDocumentV1 } from "../../providers/boj/transport";
import { BojPolicyVintagePersistenceError } from "../../persistence/bojPolicyVintageRedis";
import { LAUNCH_MARKETS_V1 } from "../../../../config/institutionalNavigation";
import { document, storage, date, captureTime } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
function dependencies(overrides: Partial<BojPolicyAcquisitionDependenciesV1> = {}) {
  const store = storage();
  let clocks = 0, appends = 0;
  const deps: BojPolicyAcquisitionDependenciesV1 = {
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
  const result = await acquireBojPolicyV1(date, signal, {
    loadDocument: (url, active) => loadBojPolicyDocumentV1(url, { signal: active, fetchImpl: async () => {
      order.push("fetch");
      return new Response(document().html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    } }),
    nowUnixSeconds: () => { order.push("clock"); return captureTime; },
    appendVintage: async (actualDate, series) => {
      order.push("append");
      assert.equal(series.metadata.fetchedAt, captureTime);
      assert.equal(series.fact.decisionDate, date);
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
test("malformed document, unsupported historical regime and invalid target never sample clock/write", async () => {
  for (const [actualDate, doc, expected] of [[date, { ...document(), html: "<html>bad</html>" }, "document"],
    ["2024-01-23", document({ date: "2024-01-23" }), "unsupported-historical-regime"],
    [date, document({ target: "0.75 to 0.5" }), "target"]] as const) {
    const { deps, counts } = dependencies({ loadDocument: async () => doc });
    assert.deepEqual(await acquireBojPolicyV1(actualDate, signal, deps), { status: "validation-failure", code: expected });
    assert.deepEqual(counts(), { clocks: 0, appends: 0 });
  }
});
test("provider failure prevents clock/persistence and does not leak diagnostics", async () => {
  const { deps, counts } = dependencies({ loadDocument: async () => { throw new BojPolicyTransportError("http"); } });
  assert.deepEqual(await acquireBojPolicyV1(date, signal, deps), { status: "provider-failure", code: "http" });
  assert.deepEqual(counts(), { clocks: 0, appends: 0 });
});
test("clock throw and invalid time prevent persistence", async () => {
  for (const nowUnixSeconds of [() => { throw new Error("clock unavailable"); }, () => NaN, () => -1, () => 1.5]) {
    const { deps, counts } = dependencies({ nowUnixSeconds });
    assert.deepEqual(await acquireBojPolicyV1(date, signal, deps), { status: "clock-failure" });
    assert.equal(counts().appends, 0);
  }
});
test("typed persistence failure and invalid-current classification are preserved", async () => {
  for (const code of ["redis-failure", "concurrency-conflict", "stored-snapshot-invalid", "invalid-current"] as const) {
    const { deps } = dependencies({ appendVintage: async () => { throw new BojPolicyVintagePersistenceError(code); } });
    assert.deepEqual(await acquireBojPolicyV1(date, signal, deps), { status: code === "invalid-current" ? "validation-failure" : "persistence-failure", code });
  }
});
test("deduplication, revision, stale and same-second conflict outcomes remain explicit", async () => {
  const store = storage();
  const run = (time: number, target = "0.5") => acquireBojPolicyV1(date, signal, {
    loadDocument: async () => document({ target }), nowUnixSeconds: () => time, appendVintage: store.adapter.append,
  });
  assert.equal((await run(captureTime)).status, "acquired");
  assert.equal((await run(captureTime + 10)).status, "unchanged");
  assert.equal((await run(captureTime + 20, "0.75")).status, "acquired");
  assert.equal((await run(captureTime + 15, "0.6")).status, "stale");
  assert.equal((await run(captureTime + 20, "0.6")).status, "conflict");
});
test("cancellation at prefetch, after source and after clock prevents persistence", async () => {
  const before = new AbortController(); before.abort();
  const first = dependencies({ loadDocument: async () => { throw new Error("must not fetch"); } });
  assert.deepEqual(await acquireBojPolicyV1(date, before.signal, first.deps), { status: "cancelled" });
  const afterSource = new AbortController();
  const second = dependencies({ loadDocument: async () => { afterSource.abort(); return document(); } });
  assert.deepEqual(await acquireBojPolicyV1(date, afterSource.signal, second.deps), { status: "cancelled" });
  assert.deepEqual(second.counts(), { clocks: 0, appends: 0 });
  const afterClock = new AbortController();
  const third = dependencies({ nowUnixSeconds: () => { afterClock.abort(); return captureTime; } });
  assert.deepEqual(await acquireBojPolicyV1(date, afterClock.signal, third.deps), { status: "cancelled" });
  assert.equal(third.counts().appends, 0);
  const failure = dependencies({ loadDocument: async () => { throw new BojPolicyTransportError("aborted"); } });
  assert.deepEqual(await acquireBojPolicyV1(date, signal, failure.deps), { status: "cancelled" });
});
test("cancellation during completed storage cannot roll back a successful append", async () => {
  const controller = new AbortController(); const store = storage();
  const result = await acquireBojPolicyV1(date, controller.signal, {
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
    ]) await assert.rejects(acquireBojPolicyV1(date, signal, dependencies(overrides).deps), (error) => error === defect);
  }
});
test("browser acquisition is rejected", async () => {
  const deps = dependencies().deps;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(acquireBojPolicyV1(date, signal, deps), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
test("foundation has no production/product caller and locked universe stays five", () => {
  const ids = LAUNCH_MARKETS_V1.map((market) => market.productId);
  assert.deepEqual(ids, ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"]);
  for (const path of ["../../services/canonicalProductResults.ts", "../../providers/register.ts", "../../assets/ecbFxProductionRuntime.ts"])
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /providers\/boj|bojPolicy|acquireBoj/);
});


test("March range acquisition exposes structured evidence through every public result", async () => {
  const store = storage();
  const actualDate = "2024-03-19";
  const result = await acquireBojPolicyV1(actualDate, signal, {
    loadDocument: async () => document({ date: actualDate, kind: "framework-transition", release: null }),
    nowUnixSeconds: () => captureTime, appendVintage: store.adapter.append,
  });
  assert.equal(result.status, "acquired");
  if (result.status !== "acquired" || result.persistence.status !== "initialized") assert.fail("Capture required");
  assert.deepEqual(result.persistence.snapshot.evidence.fact.target, { shape: "range", lower: 0, upper: 0.1, qualification: "around" });
  assert.equal(Object.hasOwn(result.persistence.snapshot, "series"), false);
  assert.equal(Object.hasOwn(result.persistence.snapshot.evidence, "observations"), false);
});
