import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { acquireBoeBankRateV1, type BoeBankRateAcquisitionDependenciesV1 } from "../../services/boeBankRateAcquisition";
import { BoeBankRateTransportError, loadBoeBankRateDocumentV1 } from "../../providers/boe/transport";
import { BoeBankRateVintagePersistenceError } from "../../persistence/boeBankRateVintageRedis";
import { LAUNCH_MARKETS_V1 } from "../../../../config/institutionalNavigation";
import { document, releaseNotice, storage, date, captureTime } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
function dependencies(overrides: Partial<BoeBankRateAcquisitionDependenciesV1> = {}) {
  const store = storage();
  let clocks = 0, appends = 0;
  const deps: BoeBankRateAcquisitionDependenciesV1 = {
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
  const result = await acquireBoeBankRateV1(date, signal, {
    loadDocument: (url, active) => loadBoeBankRateDocumentV1(url, { signal: active, fetchImpl: async () => {
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
    [{ ...document(), html: document().html.replace('id="output"', 'id="changed"') }, "unsupported-structure"],
    [document({ rate: "101" }), "rate"]] as const) {
    const { deps, counts } = dependencies({ loadDocument: async () => doc });
    assert.deepEqual(await acquireBoeBankRateV1(date, signal, deps), { status: "validation-failure", code: expected });
    assert.deepEqual(counts(), { clocks: 0, appends: 0 });
  }
});

test("provider failure prevents clock/persistence and does not leak diagnostics", async () => {
  const { deps, counts } = dependencies({ loadDocument: async () => { throw new BoeBankRateTransportError("http"); } });
  assert.deepEqual(await acquireBoeBankRateV1(date, signal, deps), { status: "provider-failure", code: "http" });
  assert.deepEqual(counts(), { clocks: 0, appends: 0 });
});
test("clock throw and invalid time prevent persistence", async () => {
  for (const nowUnixSeconds of [() => { throw new Error("clock unavailable"); }, () => NaN, () => -1, () => 1.5]) {
    const { deps, counts } = dependencies({ nowUnixSeconds });
    assert.deepEqual(await acquireBoeBankRateV1(date, signal, deps), { status: "clock-failure" });
    assert.equal(counts().appends, 0);
  }
});
test("typed persistence failure and invalid-current classification are preserved", async () => {
  for (const code of ["redis-failure", "concurrency-conflict", "stored-snapshot-invalid", "invalid-current"] as const) {
    const { deps } = dependencies({ appendVintage: async () => { throw new BoeBankRateVintagePersistenceError(code); } });
    assert.deepEqual(await acquireBoeBankRateV1(date, signal, deps), { status: code === "invalid-current" ? "validation-failure" : "persistence-failure", code });
  }
});
test("deduplication, revision, stale and same-second conflict outcomes remain explicit", async () => {
  const store = storage();
  const run = (time: number, rate = "4.25") => acquireBoeBankRateV1(date, signal, {
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
  assert.deepEqual(await acquireBoeBankRateV1(date, before.signal, first.deps), { status: "cancelled" });
  const afterSource = new AbortController();
  const second = dependencies({ loadDocument: async () => { afterSource.abort(); return document(); } });
  assert.deepEqual(await acquireBoeBankRateV1(date, afterSource.signal, second.deps), { status: "cancelled" });
  assert.deepEqual(second.counts(), { clocks: 0, appends: 0 });
  const afterClock = new AbortController();
  const third = dependencies({ nowUnixSeconds: () => { afterClock.abort(); return captureTime; } });
  assert.deepEqual(await acquireBoeBankRateV1(date, afterClock.signal, third.deps), { status: "cancelled" });
  assert.equal(third.counts().appends, 0);
  const failure = dependencies({ loadDocument: async () => { throw new BoeBankRateTransportError("aborted"); } });
  assert.deepEqual(await acquireBoeBankRateV1(date, signal, failure.deps), { status: "cancelled" });
});
test("cancellation during completed storage cannot roll back a successful append", async () => {
  const controller = new AbortController(); const store = storage();
  const result = await acquireBoeBankRateV1(date, controller.signal, {
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
    ]) await assert.rejects(acquireBoeBankRateV1(date, signal, dependencies(overrides).deps), (error) => error === defect);
  }
});
test("browser acquisition is rejected", async () => {
  const deps = dependencies().deps;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(acquireBoeBankRateV1(date, signal, deps), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
test("foundation has no production/product caller and locked universe stays five", () => {
  const ids = LAUNCH_MARKETS_V1.map((market) => market.productId);
  assert.deepEqual(ids, ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"]);
  for (const path of ["../../services/canonicalProductResults.ts", "../../providers/register.ts", "../../assets/ecbFxProductionRuntime.ts"])
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /providers\/boj|boeBankRate|acquireBoe/);
});




test("optional event-specific notice is validated before clock and its proof reaches structured results", async () => {
  const order: string[] = [];
  const { deps, store } = dependencies({
    loadDocument: async () => { order.push("decision"); return document(); },
    loadReleaseDocument: async () => { order.push("notice"); return releaseNotice(); },
    nowUnixSeconds: () => { order.push("clock"); return captureTime; },
  });
  const result = await acquireBoeBankRateV1(date, signal, deps);
  assert.equal(result.status, "acquired");
  assert.deepEqual(order, ["decision", "notice", "clock"]);
  assert.equal(store.entries.size, 1);
  if (result.status !== "acquired" || result.persistence.status !== "initialized") assert.fail("Capture required");
  assert.equal(result.persistence.snapshot.evidence.fact.releaseTimestamp, Date.parse("2025-05-08T11:02:00Z") / 1000);
  assert.equal(result.persistence.snapshot.evidence.fact.decision.rate, 4.25);
  assert.equal(Object.hasOwn(result.persistence.snapshot, "series"), false);
});

test("invalid or unavailable timing notice prevents clock/persistence; primary failure prevents notice fetch", async () => {
  const invalid = dependencies({ loadReleaseDocument: async () => releaseNotice({ zone: "London" }) });
  assert.deepEqual(await acquireBoeBankRateV1(date, signal, invalid.deps), { status: "validation-failure", code: "unsupported-wording" });
  assert.deepEqual(invalid.counts(), { clocks: 0, appends: 0 });
  const unavailable = dependencies({ loadReleaseDocument: async () => { throw new BoeBankRateTransportError("http"); } });
  assert.deepEqual(await acquireBoeBankRateV1(date, signal, unavailable.deps), { status: "provider-failure", code: "http" });
  assert.deepEqual(unavailable.counts(), { clocks: 0, appends: 0 });
  let notices = 0;
  const badPrimary = dependencies({ loadDocument: async () => ({ ...document(), html: "bad" }), loadReleaseDocument: async () => { notices++; return releaseNotice(); } });
  assert.equal((await acquireBoeBankRateV1(date, signal, badPrimary.deps)).status, "validation-failure");
  assert.equal(notices, 0);
  const wrongEvent = dependencies({ loadReleaseDocument: async () => { throw new Error("must not fetch"); } });
  assert.deepEqual(await acquireBoeBankRateV1("2026-09-17", signal, wrongEvent.deps), { status: "validation-failure", code: "source" });
  assert.deepEqual(wrongEvent.counts(), { clocks: 0, appends: 0 });
});

test("cancellation and programming faults during optional notice acquisition remain explicit", async () => {
  const controller = new AbortController();
  const work = dependencies({ loadReleaseDocument: async () => { controller.abort(); return releaseNotice(); } });
  assert.deepEqual(await acquireBoeBankRateV1(date, controller.signal, work.deps), { status: "cancelled" });
  assert.deepEqual(work.counts(), { clocks: 0, appends: 0 });
  for (const defect of [new TypeError("notice defect"), new ReferenceError("notice defect")]) {
    const work = dependencies({ loadReleaseDocument: async () => { throw defect; } });
    await assert.rejects(acquireBoeBankRateV1(date, signal, work.deps), (error) => error === defect);
  }
});
