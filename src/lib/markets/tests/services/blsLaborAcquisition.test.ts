import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { acquireBlsLaborBundleV1, type BlsLaborAcquisitionDependenciesV1 } from "../../services/blsMacroAcquisition";
import { BlsTransportError, loadBlsLaborTimeseriesV1 } from "../../providers/bls/client";
import { BLS_LABOR_FAMILIES_V1, getBlsMacroSourceSpecV1, type BlsLaborFamilyV1 } from "../../providers/bls/macroSeries";
import { BlsMacroSeriesVintagePersistenceError, createBlsMacroSeriesVintageRedisAdapterV1,
  buildBlsMacroSeriesVintageRedisKeyV1,
} from "../../persistence/blsMacroSeriesVintageRedis";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { laborRequest, laborResponse } from "../bls/laborFixtures";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
const base: BlsLaborAcquisitionDependenciesV1 = {
  loadResponse: async () => laborResponse(), nowUnixSeconds: () => 500,
  appendVintage: async (_family, series) => ({ status: "initialized", snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) }),
};

test("one complete offline transport -> canonical bundle -> three isolated immutable keys", async () => {
  let calls = 0;
  const entries = new Map<string, { score: number; member: string }>();
  const adapter = createBlsMacroSeriesVintageRedisAdapterV1({
    readHead: async (key) => { const entry = entries.get(key); return entry ? [entry.member, String(entry.score)] : []; },
    readAsKnownAt: async (key, asOf) => { const entry = entries.get(key); return entry && entry.score <= asOf ? [entry.member, String(entry.score)] : []; },
    compareAndAppend: async (key, expected, score, member) => {
      assert.equal(expected, null); assert.equal(entries.has(key), false);
      entries.set(key, { score, member }); return "written";
    },
  });
  const result = await acquireBlsLaborBundleV1(laborRequest, signal, {
    ...base, appendVintage: adapter.append,
    loadResponse: (request, requestSignal) => loadBlsLaborTimeseriesV1(request, { signal: requestSignal,
      fetchImpl: async () => { calls++; const response = laborResponse(); response.payload.Results.series.reverse();
        return new Response(JSON.stringify(response.payload), { headers: { "Content-Type": "application/json" } }); },
    }),
  });
  assert.equal(calls, 1); assert.equal(entries.size, 3);
  assert.equal(result.status, "provider-acquired");
  if (result.status !== "provider-acquired") throw new Error("expected complete provider bundle");
  assert.deepEqual(result.outcomes.map((entry) => entry.family), BLS_LABOR_FAMILIES_V1);
  assert.deepEqual(result.outcomes.map((entry) => entry.result.status), ["acquired", "acquired", "acquired"]);
  assert.equal(result.fetchedAt, 500); assert.ok(Object.isFrozen(result.outcomes));
  for (const family of BLS_LABOR_FAMILIES_V1) {
    assert.ok(entries.has(buildBlsMacroSeriesVintageRedisKeyV1(family)));
    const known = await adapter.readAsKnownAt(family, 500);
    assert.equal(known.status, "available");
    if (known.status === "available") {
      assert.equal(known.snapshot.knownAt, 500); assert.equal(known.snapshot.series.metadata.fetchedAt, 500);
      assert.equal(known.snapshot.series.metadata.releaseTimestamp, undefined);
    }
  }
});

test("capture clock is sampled once only after successful provider completion and ALL series normalization", async () => {
  const events: string[] = [];
  let complete!: (value: ReturnType<typeof laborResponse>) => void;
  const pending = new Promise<ReturnType<typeof laborResponse>>((resolve) => { complete = resolve; });
  const acquisition = acquireBlsLaborBundleV1(laborRequest, signal, {
    loadResponse: async (request, actualSignal) => {
      assert.equal(request, laborRequest); assert.equal(actualSignal, signal); events.push("provider"); return pending;
    },
    nowUnixSeconds: async () => { events.push("clock"); return 1234; },
    appendVintage: async (family, series) => {
      events.push(`append:${family}`);
      assert.equal(series.metadata.fetchedAt, 1234);
      return { status: "initialized", snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) };
    },
  });
  assert.deepEqual(events, ["provider"]);
  const response = laborResponse();
  for (const entry of response.payload.Results.series) {
    const value = entry.data[0]!.value;
    Object.defineProperty(entry.data[0], "value", { get() { events.push(`normalize:${entry.seriesID}`); return value; } });
  }
  complete(response);
  const result = await acquisition; assert.equal(result.status, "provider-acquired");
  assert.equal(events.filter((event) => event === "clock").length, 1);
  for (const entry of response.payload.Results.series) {
    assert.ok(events.indexOf(`normalize:${entry.seriesID}`) < events.indexOf("clock"));
  }
  assert.deepEqual(events.slice(-3), BLS_LABOR_FAMILIES_V1.map((family) => `append:${family}`));
});

test("expected provider failures are explicit and never reach the clock or storage", async () => {
  for (const code of ["http", "application-failure", "response-too-large", "network", "aborted"] as const) {
    assert.deepEqual(await acquireBlsLaborBundleV1(laborRequest, signal, {
      ...base, loadResponse: async () => { throw new BlsTransportError(code); },
      nowUnixSeconds: () => { throw new Error("must not sample clock"); },
      appendVintage: async () => { throw new Error("must not append"); },
    }), { status: "provider-failure", code });
  }
});

test("incomplete/malformed bundles and invalid facts in ANY family fail before ALL persistence", async () => {
  for (const family of BLS_LABOR_FAMILIES_V1) {
    const response = laborResponse();
    response.payload.Results.series.find((entry) => entry.seriesID === getBlsMacroSourceSpecV1(family).sourceSeriesId)!.data[0]!.value = "NaN";
    assert.deepEqual(await acquireBlsLaborBundleV1(laborRequest, signal, {
      ...base, loadResponse: async () => response,
      nowUnixSeconds: () => { throw new Error("must not sample clock"); },
      appendVintage: async () => { throw new Error("must not append"); },
    }), { status: "validation-failure", code: "value" });
  }
  const incomplete = laborResponse(); incomplete.payload.Results.series.pop();
  assert.deepEqual(await acquireBlsLaborBundleV1(laborRequest, signal, {
    ...base, loadResponse: async () => incomplete,
    appendVintage: async () => { throw new Error("must not append"); },
  }), { status: "validation-failure", code: "schema" });
  const annotatedGap = laborResponse(); annotatedGap.payload.Results.series[1]!.data[0]!.value = "-";
  annotatedGap.payload.Results.series[1]!.data[0]!.footnotes = [{ code: "9", text: "Data unavailable" }];
  assert.deepEqual(await acquireBlsLaborBundleV1(laborRequest, signal, {
    ...base, loadResponse: async () => annotatedGap,
    appendVintage: async () => { throw new Error("must not append"); },
  }), { status: "validation-failure", code: "annotation" });
});

test("invalid completion clocks fail closed without persisting any family", async () => {
  for (const time of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(await acquireBlsLaborBundleV1(laborRequest, signal, {
      ...base, nowUnixSeconds: () => time,
      appendVintage: async () => { throw new Error("must not append"); },
    }), { status: "clock-failure" });
  }
});

test("each persistence status is represented for its family including unchanged/stale/conflict", async () => {
  for (const status of ["initialized", "advanced", "unchanged", "stale", "conflict"] as const) {
    const result = await acquireBlsLaborBundleV1(laborRequest, signal, {
      ...base, appendVintage: async (_family, series) => {
        const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(series);
        if (status === "initialized") return { status, snapshot };
        if (status === "advanced") return { status, snapshot, previous: snapshot };
        if (status === "unchanged") return { status, latest: snapshot };
        return { status, latest: snapshot, candidate: snapshot };
      },
    });
    assert.equal(result.status, "provider-acquired");
    if (result.status !== "provider-acquired") throw new Error("expected complete provider bundle");
    assert.deepEqual(result.outcomes.map((entry) => entry.result.status),
      Array(3).fill(status === "initialized" || status === "advanced" ? "acquired" : status));
    assert.deepEqual(result.outcomes.map((entry) => "persistence" in entry.result ? entry.result.persistence.status : null), Array(3).fill(status));
  }
});

test("known per-family storage failures leave earlier successes intact and attempt later families", async () => {
  for (const code of ["redis-failure", "invalid-current", "stored-snapshot-invalid", "concurrency-conflict"] as const) {
    const attempts: BlsLaborFamilyV1[] = [];
    const result = await acquireBlsLaborBundleV1(laborRequest, signal, {
      ...base, appendVintage: async (family, series) => {
        assert.notEqual(family, "cpi-all-items-nsa"); attempts.push(family as BlsLaborFamilyV1);
        if (family === "unemployment-rate") throw new BlsMacroSeriesVintagePersistenceError(code);
        return { status: "initialized", snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) };
      },
    });
    assert.deepEqual(attempts, BLS_LABOR_FAMILIES_V1);
    assert.equal(result.status, "provider-acquired");
    if (result.status !== "provider-acquired") throw new Error("expected complete provider bundle");
    assert.deepEqual(result.outcomes.map((entry) => entry.result.status),
      ["acquired", code === "invalid-current" ? "validation-failure" : "persistence-failure", "acquired"]);
    assert.deepEqual(result.outcomes[1]!.result, { status: code === "invalid-current" ? "validation-failure" : "persistence-failure", code });
  }
});

test("cancellation before provider, after provider and during clock stops ALL persistence", async () => {
  const before = new AbortController(); before.abort();
  assert.deepEqual(await acquireBlsLaborBundleV1(laborRequest, before.signal, {
    ...base, loadResponse: async () => { throw new Error("must not load"); },
  }), { status: "provider-failure", code: "aborted" });
  for (const stage of ["loadResponse", "nowUnixSeconds"] as const) {
    const controller = new AbortController();
    assert.deepEqual(await acquireBlsLaborBundleV1(laborRequest, controller.signal, {
      ...base,
      loadResponse: async () => { if (stage === "loadResponse") controller.abort(); return laborResponse(); },
      nowUnixSeconds: async () => { controller.abort(); return 500; },
      appendVintage: async () => { throw new Error("must not append"); },
    }), { status: "provider-failure", code: "aborted" });
  }
});

test("cancellation between writes reports immutable success and explicit unattempted families", async () => {
  const controller = new AbortController(); let writes = 0;
  const result = await acquireBlsLaborBundleV1(laborRequest, controller.signal, {
    ...base, appendVintage: async (_family, series) => {
      writes++; controller.abort();
      return { status: "initialized", snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) };
    },
  });
  assert.equal(writes, 1); assert.equal(result.status, "provider-acquired");
  if (result.status !== "provider-acquired") throw new Error("expected complete provider bundle");
  assert.deepEqual(result.outcomes.map((entry) => entry.result.status), ["acquired", "cancelled", "cancelled"]);
});

test("unrelated programming errors propagate from injected provider, clock and persistence", async () => {
  for (const defect of [new ReferenceError("defect"), new TypeError("defect")]) {
    for (const stage of ["loadResponse", "nowUnixSeconds", "appendVintage"] as const) {
      await assert.rejects(acquireBlsLaborBundleV1(laborRequest, signal, {
        ...base, [stage]: async () => { throw defect; },
      }), (error) => error === defect);
    }
  }
});

test("labor service stays inactive with no production dependency wiring, timers, env or engine integration", () => {
  const source = readFileSync(fileURLToPath(new URL("../../services/blsMacroAcquisition.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /process\.env|setInterval|setTimeout|registerProvider|appendBlsMacroSeriesVintageRedisV1/);
});

test("invalid labor request never reaches provider work; zero completion time is valid", async () => {
  const invalid = { ...laborRequest, endYear: 2024 };
  assert.deepEqual(await acquireBlsLaborBundleV1(invalid, signal, {
    ...base, loadResponse: async () => { throw new Error("must not load"); },
  }), { status: "validation-failure", code: "invalid-request" });
  const result = await acquireBlsLaborBundleV1(laborRequest, signal, { ...base, nowUnixSeconds: () => 0 });
  assert.equal(result.status, "provider-acquired");
  if (result.status === "provider-acquired") assert.equal(result.fetchedAt, 0);
});

test("labor acquisition entry point is server-only", async () => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  try {
    await assert.rejects(acquireBlsLaborBundleV1(laborRequest, signal, {
      ...base, loadResponse: async () => { throw new Error("must not load"); },
    }), /server-only/);
  } finally { Reflect.deleteProperty(globalThis, "window"); }
});
