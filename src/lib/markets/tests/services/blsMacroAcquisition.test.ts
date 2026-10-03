import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { acquireBlsMacroSeriesV1, type BlsMacroAcquisitionDependenciesV1 } from "../../services/blsMacroAcquisition";
import { BlsTransportError, BLS_TIMESERIES_API_URL_V1 } from "../../providers/bls/client";
import { BlsMacroSeriesVintagePersistenceError } from "../../persistence/blsMacroSeriesVintageRedis";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";

const request = { seriesId: "CUUR0000SA0" as const, startYear: 2026, endYear: 2026 };
const signal = new AbortController().signal;
const payload = () => ({ status: "REQUEST_SUCCEEDED", message: [], Results: { series: [{
  seriesID: "CUUR0000SA0", data: [{ year: "2026", period: "M01", periodName: "January",
    value: "310.25", footnotes: [{}] }],
}] } });
const response = () => ({ sourceUrl: BLS_TIMESERIES_API_URL_V1, payload: payload() });

async function main() {
  const events: string[] = [];
  let complete!: (value: ReturnType<typeof response>) => void;
  const pending = new Promise<ReturnType<typeof response>>((resolve) => { complete = resolve; });
  const dependencies: BlsMacroAcquisitionDependenciesV1 = {
    loadResponse: async (actual, actualSignal) => {
      assert.equal(actual, request); assert.equal(actualSignal, signal);
      events.push("provider"); return pending;
    },
    nowUnixSeconds: () => { events.push("clock"); return 500; },
    appendVintage: async (_family, series) => {
      events.push("append");
      assert.equal(series.metadata.fetchedAt, 500);
      assert.equal(series.metadata.releaseTimestamp, undefined);
      return { status: "initialized", snapshot: buildCanonicalStatisticalSeriesSnapshotV1(series) };
    },
  };
  const acquisition = acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, signal, dependencies);
  assert.deepEqual(events, ["provider"]);
  const captured = response();
  Object.defineProperty(captured.payload.Results.series[0]!.data[0], "value", {
    get() { events.push("normalize"); return "310.25"; },
  });
  complete(captured);
  assert.equal((await acquisition).status, "acquired");
  assert.equal(events[0], "provider");
  assert.ok(events.indexOf("normalize") < events.indexOf("clock"));
  assert.deepEqual(events.slice(-2), ["clock", "append"]);
  const base: BlsMacroAcquisitionDependenciesV1 = {
    ...dependencies, loadResponse: async () => response(),
  };
  for (const code of ["http", "application-failure", "aborted", "response-too-large"] as const) {
    assert.deepEqual(await acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, signal, {
      ...base, loadResponse: async () => { throw new BlsTransportError(code); },
    }), { status: "provider-failure", code });
  }
  let clockCalls = 0, appendCalls = 0;
  const invalid = response(); invalid.payload.Results.series[0]!.data[0]!.value = "NaN";
  assert.deepEqual(await acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, signal, {
    ...base, loadResponse: async () => invalid,
    nowUnixSeconds: () => { clockCalls++; return 500; },
    appendVintage: async () => { appendCalls++; throw new Error("must not append"); },
  }), { status: "validation-failure", code: "value" });
  assert.equal(clockCalls, 0, "invalid source rejected before capture clock");
  assert.equal(appendCalls, 0);
  for (const code of ["redis-failure", "invalid-current", "stored-snapshot-invalid"] as const) {
    assert.deepEqual(await acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, signal, {
      ...base, appendVintage: async () => { throw new BlsMacroSeriesVintagePersistenceError(code); },
    }), { status: code === "invalid-current" ? "validation-failure" : "persistence-failure", code });
  }
  assert.deepEqual(await acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, signal, {
    ...base, nowUnixSeconds: () => NaN,
  }), { status: "clock-failure" });
  const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(
    (await import("../../providers/bls/macroSeries")).buildBlsCanonicalMacroSeriesV1(
      "cpi-all-items-nsa", [{ referencePeriod: "2026-01", value: 310.25 }], 500));
  for (const status of ["unchanged", "stale", "conflict"] as const) {
    const persistence = status === "unchanged" ? { status, latest: snapshot }
      : { status, latest: snapshot, candidate: snapshot };
    assert.deepEqual(await acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, signal, {
      ...base, appendVintage: async () => persistence,
    }), { status, persistence });
  }
  for (const defect of [new ReferenceError("defect"), new TypeError("defect")]) {
    for (const stage of ["loadResponse", "nowUnixSeconds", "appendVintage"] as const) {
      await assert.rejects(acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, signal, {
        ...base, [stage]: async () => { throw defect; },
      }), (error) => error === defect);
    }
  }
  const aborted = new AbortController(); aborted.abort();
  assert.deepEqual(await acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, aborted.signal, {
    ...base, loadResponse: async () => { throw new Error("aborted must not load"); },
  }), { status: "provider-failure", code: "aborted" });
  const duringCapture = new AbortController();
  assert.deepEqual(await acquireBlsMacroSeriesV1("cpi-all-items-nsa", request, duringCapture.signal, {
    ...base, nowUnixSeconds: () => { duringCapture.abort(); return 500; },
    appendVintage: async () => { throw new Error("aborted must not append"); },
  }), { status: "provider-failure", code: "aborted" });
  let unsupportedLoads = 0;
  assert.deepEqual(await acquireBlsMacroSeriesV1("core" as "cpi-all-items-nsa", request, signal, {
    ...base, loadResponse: async () => { unsupportedLoads++; return response(); },
  }), { status: "validation-failure", code: "family" });
  assert.equal(unsupportedLoads, 0);
  const source = readFileSync(fileURLToPath(new URL("../../services/blsMacroAcquisition.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /process\.env|setInterval|setTimeout|registerProvider|appendBlsMacroSeriesVintageRedisV1/);
  console.log("PASS: Inactive BLS acquisition ordering and typed failures V1");
}
void main();
