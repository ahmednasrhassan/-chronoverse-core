import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { acquireFomcPolicyV1, acquireEffrV1 } from "../../services/usPolicyAcquisition";
import { UsPolicyTransportError } from "../../providers/federalReserve/transport";
import { UsPolicyValidationError } from "../../providers/federalReserve/fomc";
import { UsPolicyVintagePersistenceError } from "../../persistence/usPolicyVintageRedis";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { date, statement, implementation, effrResponse, effrRequest, captureTime, storage, canonical } from "./fixtures";
const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
const base = { nowUnixSeconds: () => captureTime, appendVintage: async (_family: string, series: ReturnType<typeof canonical>) =>
  ({ status: "initialized" as const, snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) }),
  loadDocument: async (url: string) => url.endsWith("a1.htm") ? implementation() : statement(), loadResponse: async () => effrResponse() };
const fail = () => { throw new Error("must not execute"); };

test("inactive independent FOMC and EFFR acquisition persists isolated canonical facts", async () => {
  const store = storage(); let documentCalls = 0;
  assert.equal((await acquireFomcPolicyV1(date, signal, { ...base, appendVintage: store.adapter.append,
    loadDocument: async (url) => { documentCalls++; return base.loadDocument(url); },
  })).status, "acquired");
  assert.equal(documentCalls, 2);
  assert.equal((await acquireEffrV1(effrRequest, signal, { ...base, appendVintage: store.adapter.append })).status, "acquired");
  assert.equal(store.entries.size, 2);
});
test("completion clock follows statement AND note validation; missing note means no capture/write", async () => {
  const events: string[] = [];
  const result = await acquireFomcPolicyV1(date, signal, { ...base,
    loadDocument: async (url) => {
      events.push(url.endsWith("a1.htm") ? "note" : "statement");
      const document = await base.loadDocument(url); const html = document.html;
      Object.defineProperty(document, "html", { get() { events.push("validate"); return html; } }); return document;
    },
    nowUnixSeconds: () => { events.push("clock"); return captureTime; },
    appendVintage: async (actualFamily, series) => { events.push("append"); assert.equal(series.metadata.fetchedAt, captureTime); return base.appendVintage(actualFamily, series); },
  });
  assert.equal(result.status, "acquired"); assert.ok(events.indexOf("clock") > events.lastIndexOf("validate")); assert.ok(events.indexOf("clock") > events.indexOf("note"));
  assert.deepEqual(events.slice(-2), ["clock", "append"]);
  const failed = await acquireFomcPolicyV1(date, signal, { ...base, nowUnixSeconds: fail, appendVintage: fail,
    loadDocument: async (url) => { if (url.endsWith("a1.htm")) throw new UsPolicyTransportError("http"); return statement(); },
  });
  assert.deepEqual(failed, { status: "provider-failure", code: "http" });
});
test("EFFR validation completes before the completion clock", async () => {
  const events: string[] = []; const response = effrResponse(); const row = response.payload.refRates[0]!;
  Object.defineProperty(row, "percentRate", { get() { events.push("normalize"); return 4.33; } });
  assert.equal((await acquireEffrV1(effrRequest, signal, { ...base, loadResponse: async () => { events.push("provider"); return response; },
    nowUnixSeconds: () => { events.push("clock"); return captureTime; },
  })).status, "acquired");
  assert.ok(events.indexOf("clock") > events.lastIndexOf("normalize"));
});
test("provider/schema/validation failures prevent clock and persistence", async () => {
  for (const error of [new UsPolicyTransportError("http"), new UsPolicyValidationError("schema")]) {
    const expected = error instanceof UsPolicyTransportError ? "provider-failure" : "validation-failure";
    const dependencies = { ...base, nowUnixSeconds: fail, appendVintage: fail, loadDocument: async () => { throw error; }, loadResponse: async () => { throw error; } };
    assert.equal((await acquireFomcPolicyV1(date, signal, dependencies)).status, expected);
    assert.equal((await acquireEffrV1(effrRequest, signal, dependencies)).status, expected);
  }
  assert.equal((await acquireFomcPolicyV1(date, signal, { ...base, nowUnixSeconds: fail, appendVintage: fail,
    loadDocument: async (url) => url.endsWith("a1.htm") ? implementation("5 to 5-1/4") : statement() })).status, "validation-failure");
  const invalid = effrResponse(); invalid.payload.refRates[0]!.percentRate = "malformed";
  assert.equal((await acquireEffrV1(effrRequest, signal, { ...base, nowUnixSeconds: fail, appendVintage: fail, loadResponse: async () => invalid })).status, "validation-failure");
});
test("clock failure prevents either family's write", async () => {
  for (const nowUnixSeconds of [() => NaN, () => -1, () => 1.5, async () => { throw new Error("clock unavailable"); }]) {
    assert.deepEqual(await acquireFomcPolicyV1(date, signal, { ...base, nowUnixSeconds, appendVintage: fail }), { status: "clock-failure" });
    assert.deepEqual(await acquireEffrV1(effrRequest, signal, { ...base, nowUnixSeconds, appendVintage: fail }), { status: "clock-failure" });
  }
});
test("persistence outcomes/failures explicit; independent earlier success is never rolled back", async () => {
  const store = storage(); const dependencies = { ...base, appendVintage: store.adapter.append };
  assert.equal((await acquireFomcPolicyV1(date, signal, dependencies)).status, "acquired");
  assert.equal((await acquireFomcPolicyV1(date, signal, { ...dependencies, nowUnixSeconds: () => captureTime + 100 })).status, "unchanged");
  await store.adapter.append("effr", canonical("effr", captureTime + 100));
  assert.equal((await acquireEffrV1(effrRequest, signal, dependencies)).status, "stale");
  assert.equal((await acquireEffrV1(effrRequest, signal, { ...dependencies, nowUnixSeconds: () => captureTime + 100 })).status, "conflict");
  assert.deepEqual(await acquireEffrV1(effrRequest, signal, { ...base, appendVintage: async () => { throw new UsPolicyVintagePersistenceError("redis-failure"); } }), { status: "persistence-failure", code: "redis-failure" });
  assert.equal(store.entries.size, 2);
});
test("cancellation before provider, after provider, after normalization and during clock prevents storage", async () => {
  for (const stage of ["before", "provider", "normalize", "clock"]) {
    const controller = new AbortController(); if (stage === "before") controller.abort();
    const result = await acquireEffrV1(effrRequest, controller.signal, { ...base, appendVintage: fail,
      loadResponse: async () => {
        if (stage === "before") fail(); if (stage === "provider") controller.abort();
        const response = effrResponse(); if (stage === "normalize") Object.defineProperty(response.payload.refRates[0], "percentRate", { get() { controller.abort(); return 4.33; } }); return response;
      }, nowUnixSeconds: () => { if (stage !== "clock") fail(); controller.abort(); return captureTime; },
    }); assert.deepEqual(result, { status: "cancelled" });
  }
  const controller = new AbortController(); let calls = 0;
  assert.deepEqual(await acquireFomcPolicyV1(date, controller.signal, { ...base, nowUnixSeconds: fail, appendVintage: fail,
    loadDocument: async () => { calls++; controller.abort(); return statement(); },
  }), { status: "cancelled" }); assert.equal(calls, 1);
});
test("cancellation during append preserves a completed success", async () => {
  const controller = new AbortController(); const store = storage();
  const result = await acquireEffrV1(effrRequest, controller.signal, { ...base,
    appendVintage: async (actualFamily, series) => { controller.abort(); return store.adapter.append(actualFamily, series); },
  }); assert.equal(result.status, "acquired"); assert.equal(store.entries.size, 1);
});
test("unrelated provider/clock/storage TypeError and ReferenceError propagate unchanged", async () => {
  for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect")]) {
    for (const stage of ["loadDocument", "nowUnixSeconds", "appendVintage"] as const) await assert.rejects(acquireFomcPolicyV1(date, signal, { ...base, [stage]: async () => { throw defect; } }), (error) => error === defect);
    for (const stage of ["loadResponse", "nowUnixSeconds", "appendVintage"] as const) await assert.rejects(acquireEffrV1(effrRequest, signal, { ...base, [stage]: async () => { throw defect; } }), (error) => error === defect);
  }
});
test("service blocks browser execution and has no runtime activation dependency", async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(acquireFomcPolicyV1(date, signal, base), /server-only/); await assert.rejects(acquireEffrV1(effrRequest, signal, base), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
  for (const relative of ["../../services/usPolicyAcquisition.ts", "../../persistence/usPolicyVintageRedis.ts"]) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(source, /process\.env|\b(?:fetch|setInterval|setTimeout|cron|schedule|deploy)\s*\(/);
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:runtime|engine|recommendation|route|product|r2)[^"']*["']/i);
  }
});
