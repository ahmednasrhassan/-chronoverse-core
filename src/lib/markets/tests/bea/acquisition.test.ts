import assert from "node:assert/strict";
import { after, test } from "node:test";
import { acquireBeaRealGdpV1, acquireBeaPceBundleV1, type BeaMacroAcquisitionDependenciesV1 } from "../../services/beaMacroAcquisition";
import { BeaTransportError, loadBeaResponseV1, parseBeaEnvelopeV1 } from "../../providers/bea/client";
import { BEA_PCE_FAMILIES_V1, buildBeaCanonicalMacroSeriesV1, parseBeaMacroSeriesFactsV1 } from "../../providers/bea/macroSeries";
import { BeaMacroSeriesVintagePersistenceError } from "../../persistence/beaMacroSeriesVintageRedis";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { canonical, envelope, fakeUserId, gdpRequest, pceRequest, response, storage } from "./fixtures";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
const base: BeaMacroAcquisitionDependenciesV1 = {
  loadResponse: async (request) => response(request), nowUnixSeconds: () => 500,
  appendVintage: async (_family, series) => ({ status: "initialized", snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) }),
};
const fail = () => { throw new Error("must not execute"); };

for (const [request, acquire, expectedFamilies] of [
  [gdpRequest, acquireBeaRealGdpV1, ["real-gdp"]],
  [pceRequest, acquireBeaPceBundleV1, BEA_PCE_FAMILIES_V1],
] as const) test(`${request.tableName} end-to-end injected transport -> immutable captures; exactly one request`, async () => {
  const store = storage(); let calls = 0;
  const result = await acquire(request, signal, { ...base, appendVintage: store.adapter.append,
    loadResponse: (actualRequest, actualSignal) => loadBeaResponseV1(actualRequest, {
      userId: fakeUserId, signal: actualSignal, fetchImpl: async () => {
        calls++; const payload = envelope(actualRequest); payload.BEAAPI.Results.Data.reverse();
        return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
      },
    }),
  });
  assert.equal(calls, 1); assert.equal(store.entries.size, expectedFamilies.length);
  assert.equal(result.status, "provider-acquired");
  if (result.status !== "provider-acquired") throw new Error("expected acquired provider unit");
  assert.equal(result.fetchedAt, 500); assert.deepEqual(result.outcomes.map((outcome) => outcome.family), expectedFamilies);
  assert.ok(result.outcomes.every((outcome) => outcome.result.status === "acquired"));
  for (const family of expectedFamilies) {
    assert.equal((await store.adapter.readAsKnownAt(family, 499)).status, "absent");
    const known = await store.adapter.readAsKnownAt(family, 500);
    assert.equal(known.status, "available");
    if (known.status === "available") { assert.equal(known.snapshot.knownAt, 500); assert.equal(known.snapshot.series.metadata.releaseTimestamp, undefined); }
  }
});

test("PCE clock sampled once, after response completion and normalization of both selected lines", async () => {
  const events: string[] = []; let complete!: (value: ReturnType<typeof response>) => void;
  const pending = new Promise<ReturnType<typeof response>>((resolve) => { complete = resolve; });
  const work = acquireBeaPceBundleV1(pceRequest, signal, {
    loadResponse: async () => { events.push("provider"); return pending; },
    nowUnixSeconds: () => { events.push("clock"); return 900; },
    appendVintage: async (family, series) => {
      events.push(`append:${family}`); assert.equal(series.metadata.fetchedAt, 900);
      return { status: "initialized", snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) };
    },
  });
  assert.deepEqual(events, ["provider"]);
  const source = response(); const data = source.data.map((raw) => {
    const datum = { ...raw as Record<string, unknown> }; const value = datum.DataValue;
    Object.defineProperty(datum, "DataValue", { get() { events.push(`normalize:${datum.LineNumber}`); return value; } }); return datum;
  });
  events.push("complete"); complete({ ...source, data });
  assert.equal((await work).status, "provider-acquired"); assert.equal(events.filter((event) => event === "clock").length, 1);
  for (const line of ["1", "25"]) assert.ok(events.indexOf(`normalize:${line}`) < events.indexOf("clock"));
  assert.ok(events.indexOf("complete") < events.indexOf("clock"));
  assert.deepEqual(events.slice(-2), BEA_PCE_FAMILIES_V1.map((family) => `append:${family}`));
});

test("an invalid OR absent PCE/core line prevents BOTH writes and clock capture", async () => {
  for (const line of ["1", "25"]) for (const invalid of ["value", "missing", "unit", "note"]) {
    const payload = envelope(); const selected = payload.BEAAPI.Results.Data.find((datum) => datum.LineNumber === line)!;
    if (invalid === "missing") payload.BEAAPI.Results.Data = payload.BEAAPI.Results.Data.filter((datum) => datum !== selected);
    if (invalid === "value") selected.DataValue = "NaN";
    if (invalid === "unit") selected.CL_UNIT = "Percent change";
    if (invalid === "note") selected.NoteRef = "unresolved";
    const result = await acquireBeaPceBundleV1(pceRequest, signal, {
      loadResponse: async () => parseBeaEnvelopeV1(payload, pceRequest), nowUnixSeconds: fail, appendVintage: fail,
    });
    assert.equal(result.status, "validation-failure");
  }
});

test("provider/schema/request failures prevent completion capture and storage", async () => {
  for (const providerCode of ["http", "network", "application-failure", "response-too-large", "schema", "invalid-request", "aborted"] as const) {
    const result = await acquireBeaPceBundleV1(pceRequest, signal, {
      loadResponse: async () => { throw new BeaTransportError(providerCode); }, nowUnixSeconds: fail, appendVintage: fail,
    });
    assert.deepEqual(result, providerCode === "aborted" ? { status: "cancelled", code: "aborted" } :
      { status: providerCode === "schema" || providerCode === "invalid-request" ? "validation-failure" : "provider-failure", code: providerCode });
  }
  assert.deepEqual(await acquireBeaRealGdpV1(pceRequest, signal, { ...base, loadResponse: fail }), { status: "validation-failure", code: "invalid-request" });
  assert.deepEqual(await acquireBeaPceBundleV1(gdpRequest, signal, { ...base, loadResponse: fail }), { status: "validation-failure", code: "invalid-request" });
});

test("invalid or failed completion clock prevents affected-unit writes", async () => {
  for (const clock of [() => NaN, () => -1, () => 1.5, async () => { throw new Error("clock unavailable"); }]) {
    for (const [request, acquire] of [[gdpRequest, acquireBeaRealGdpV1], [pceRequest, acquireBeaPceBundleV1]] as const) {
      assert.deepEqual(await acquire(request, signal, { ...base, nowUnixSeconds: clock, appendVintage: fail }), { status: "clock-failure" });
    }
  }
});

test("expected per-key persistence failures keep later writes and successful immutable captures explicit", async () => {
  for (const failingFamily of BEA_PCE_FAMILIES_V1) {
    const store = storage(); const writes: string[] = [];
    const result = await acquireBeaPceBundleV1(pceRequest, signal, { ...base,
      appendVintage: async (family, series) => {
        writes.push(family); if (family === failingFamily) throw new BeaMacroSeriesVintagePersistenceError("redis-failure");
        return store.adapter.append(family, series);
      },
    });
    assert.equal(result.status, "provider-acquired"); assert.deepEqual(writes, BEA_PCE_FAMILIES_V1); assert.equal(store.entries.size, 1);
    if (result.status === "provider-acquired") assert.deepEqual(result.outcomes.map((outcome) => outcome.result.status),
      BEA_PCE_FAMILIES_V1.map((family) => family === failingFamily ? "persistence-failure" : "acquired"));
  }
  const invalid = await acquireBeaRealGdpV1(gdpRequest, signal, { ...base,
    appendVintage: async () => { throw new BeaMacroSeriesVintagePersistenceError("invalid-current"); },
  });
  if (invalid.status !== "provider-acquired") throw new Error("expected valid provider acquisition");
  assert.deepEqual(invalid.outcomes[0]!.result, { status: "validation-failure", code: "invalid-current" });
});

test("acquired/unchanged/stale/conflict outcomes preserve generic adapter semantics", async () => {
  const store = storage(); let time = 100, value = "1";
  const dependencies: BeaMacroAcquisitionDependenciesV1 = { appendVintage: store.adapter.append, nowUnixSeconds: () => time,
    loadResponse: async () => {
      const payload = envelope(gdpRequest); payload.BEAAPI.Results.Data[0]!.DataValue = value; return parseBeaEnvelopeV1(payload, gdpRequest);
    },
  };
  for (const [nextTime, nextValue, expected] of [[100, "1", "acquired"], [200, "2", "acquired"], [300, "2", "unchanged"], [150, "3", "stale"], [200, "3", "conflict"]] as const) {
    time = nextTime; value = nextValue; const result = await acquireBeaRealGdpV1(gdpRequest, signal, dependencies);
    if (result.status !== "provider-acquired") throw new Error("expected valid provider unit"); assert.equal(result.outcomes[0]!.result.status, expected);
  }
  assert.equal([...store.entries.values()][0]!.length, 2);
});

test("cancellation checks before provider, after completion/normalization, and before persistence", async () => {
  for (const phase of ["before", "provider", "normalization", "clock"]) {
    const controller = new AbortController(); if (phase === "before") controller.abort();
    const result = await acquireBeaPceBundleV1(pceRequest, controller.signal, { appendVintage: fail,
      loadResponse: async () => {
        if (phase === "before") fail();
        if (phase === "provider") controller.abort();
        const source = response(); if (phase !== "normalization") return source;
        return { ...source, data: source.data.map((raw) => {
          const datum = { ...raw as Record<string, unknown> }; const value = datum.DataValue;
          Object.defineProperty(datum, "DataValue", { get() { controller.abort(); return value; } }); return datum;
        }) };
      },
      nowUnixSeconds: () => { if (phase !== "clock") fail(); controller.abort(); return 100; },
    });
    assert.deepEqual(result, { status: "cancelled", code: "aborted" });
  }
});

test("cancellation during first append preserves its success and cancels only the next key", async () => {
  const controller = new AbortController(); const store = storage(); let writes = 0;
  const result = await acquireBeaPceBundleV1(pceRequest, controller.signal, { ...base,
    appendVintage: async (family, series) => { writes++; controller.abort(); return store.adapter.append(family, series); },
  });
  assert.equal(writes, 1); assert.equal(store.entries.size, 1);
  if (result.status !== "provider-acquired") throw new Error("expected valid provider unit");
  assert.deepEqual(result.outcomes.map((outcome) => outcome.result.status), ["acquired", "cancelled"]);
});

test("unrelated loader/clock/append TypeError and ReferenceError propagate unchanged", async () => {
  for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect")]) {
    for (const stage of ["loadResponse", "nowUnixSeconds", "appendVintage"] as const) {
      await assert.rejects(acquireBeaPceBundleV1(pceRequest, signal, { ...base, [stage]: async () => { throw defect; } }), (actual) => actual === defect);
    }
  }
});

test("meaningful annotation-only revisions persist and round-trip safely", async () => {
  const store = storage(); await store.adapter.append("pce-price-index", canonical("pce-price-index"));
  const payload = envelope(); payload.BEAAPI.Results.Data[0]!.DataValue = "1";
  payload.BEAAPI.Results.Data[0]!.NoteRef = "T20804,T20804.4";
  payload.BEAAPI.Results.Notes.push({ NoteRef: "T20804.4", NoteText: "Official explanatory annotation." });
  const facts = parseBeaMacroSeriesFactsV1("pce-price-index", parseBeaEnvelopeV1(payload, pceRequest), pceRequest);
  assert.equal((await store.adapter.append("pce-price-index", buildBeaCanonicalMacroSeriesV1("pce-price-index", facts, 200))).status, "advanced");
  const known = await store.adapter.readAsKnownAt("pce-price-index", 200);
  if (known.status !== "available") throw new Error("expected available vintage");
  assert.ok(known.snapshot.series.observations[0]!.officialStatus!.includes("Official explanatory annotation."));
});

test("inactive service blocks browser calls", async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(acquireBeaPceBundleV1(pceRequest, signal, { ...base, loadResponse: fail }), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
