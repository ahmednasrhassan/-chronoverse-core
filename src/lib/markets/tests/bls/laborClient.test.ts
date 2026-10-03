import assert from "node:assert/strict";
import { after, test } from "node:test";
import { BLS_LABOR_SERIES_IDS_V1, BLS_TIMESERIES_API_URL_V1, BLS_MAX_RESPONSE_BYTES_V1,
  BlsTransportError, loadBlsLaborTimeseriesV1, assertBlsResponseEnvelopeV1, type BlsLaborTimeseriesRequestV1,
} from "../../providers/bls/client";
import { laborRequest, laborResponse } from "./laborFixtures";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
const json = (payload: unknown) => new Response(JSON.stringify(payload), {
  headers: { "Content-Type": "application/json; charset=utf-8" },
});
const hasCode = (code: BlsTransportError["code"]) => (error: unknown) =>
  error instanceof BlsTransportError && error.code === code;

test("labor transport makes one exact official POST without optional calculations or credentials", async () => {
  let calls = 0;
  assert.deepEqual(BLS_LABOR_SERIES_IDS_V1, ["CES0000000001", "LNS14000000", "CES0500000003"]);
  const response = laborResponse(); response.payload.Results.series.reverse();
  const result = await loadBlsLaborTimeseriesV1(laborRequest, { signal, fetchImpl: async (target, init) => {
    calls++;
    assert.equal(target, "https://api.bls.gov/publicAPI/v2/timeseries/data/");
    assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.signal, signal);
    assert.deepEqual(init?.headers, { Accept: "application/json", "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(init?.body)), {
      seriesid: ["CES0000000001", "LNS14000000", "CES0500000003"], startyear: "2025", endyear: "2026",
    });
    return json(response.payload);
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, response);
});

test("only the complete authorized labor request and bounded year range can fetch", async () => {
  for (const seriesIds of [[], ["CES0000000001"],
    ["CEU0000000001", "LNS14000000", "CES0500000003"],
    ["CES0000000001", "LNU14000000", "CES0500000003"],
    ["CES0000000001", "LNS14000000", "CEU0500000003"],
    ["CES0000000001", "LNS14000000", "LNS14000000"],
    [...BLS_LABOR_SERIES_IDS_V1, "CUUR0000SA0"],
  ]) {
    await assert.rejects(loadBlsLaborTimeseriesV1({ ...laborRequest, seriesIds } as unknown as BlsLaborTimeseriesRequestV1,
      { signal, fetchImpl: async () => { throw new Error("must not fetch"); } }), hasCode("invalid-request"));
  }
  for (const years of [{ startYear: 2010 }, { startYear: 2027 }, { endYear: NaN },
    { startYear: 999 }, { endYear: 10000 }]) {
    await assert.rejects(loadBlsLaborTimeseriesV1({ ...laborRequest, ...years },
      { signal, fetchImpl: async () => { throw new Error("must not fetch"); } }), hasCode("invalid-request"));
  }
});

for (const kind of ["missing", "duplicate", "unexpected", "extra", "non-array-data", "null-series", "missing-results"] as const) {
  test(`labor response rejects ${kind} before returning a provider bundle`, async () => {
    const payload = laborResponse().payload;
    switch (kind) {
      case "missing": payload.Results.series.pop(); break;
      case "duplicate": payload.Results.series[2] = payload.Results.series[0]!; break;
      case "unexpected": payload.Results.series[2]!.seriesID = "CEU0500000003"; break;
      case "extra": payload.Results.series.push({ seriesID: "CUUR0000SA0", data: [] }); break;
      case "non-array-data": Object.assign(payload.Results.series[0]!, { data: {} }); break;
      case "null-series": Object.assign(payload.Results.series, { 0: null }); break;
      case "missing-results": Object.assign(payload, { Results: null }); break;
    }
    await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal, fetchImpl: async () => json(payload) }), hasCode("schema"));
  });
}

test("labor shares declared/streamed byte, HTTP, JSON, content-type and application protections", async () => {
  for (const [response, code] of [
    [new Response("bad", { status: 503 }), "http"],
    [new Response("{}", { headers: { "Content-Type": "text/plain" } }), "content-type"],
    [json({}), "schema"],
    [json({ ...laborResponse().payload, status: "REQUEST_FAILED", message: ["private diagnostic"] }), "application-failure"],
    [json({ ...laborResponse().payload, message: ["partial response"] }), "application-failure"],
    [new Response("{", { headers: { "Content-Type": "application/json" } }), "invalid-json"],
    [new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "application/json" } }), "invalid-json"],
    [new Response(null, { headers: { "Content-Type": "application/json" } }), "missing-body"],
    [new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "bad" } }), "content-length"],
    [new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": String(BLS_MAX_RESPONSE_BYTES_V1 + 1) } }), "response-too-large"],
  ] as const) {
    await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal, fetchImpl: async () => response }), hasCode(code));
  }
  let cancelled = false;
  await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal, fetchImpl: async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(BLS_MAX_RESPONSE_BYTES_V1)); controller.enqueue(new Uint8Array(1)); },
      cancel() { cancelled = true; },
    }), { headers: { "Content-Type": "application/json", "Content-Length": "1" } },
  ) }), hasCode("response-too-large"));
  assert.equal(cancelled, true);
});

test("labor refuses redirects and changed final URLs", async () => {
  for (const [property, value] of [["redirected", true], ["url", "https://example.com/"],
    ["url", BLS_TIMESERIES_API_URL_V1.replace("https:", "http:")]] as const) {
    const response = json(laborResponse().payload);
    Object.defineProperty(response, property, { value });
    await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal, fetchImpl: async () => response }), hasCode("redirect"));
  }
});

test("labor preserves pre-fetch, pending-fetch and pending-body cancellation/deadlines", async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal: before.signal,
    fetchImpl: async () => { throw new Error("must not fetch"); },
  }), hasCode("aborted"));
  const pending = new AbortController();
  const result = loadBlsLaborTimeseriesV1(laborRequest, { signal: pending.signal,
    fetchImpl: async () => new Promise<Response>(() => {}),
  });
  pending.abort(); await assert.rejects(result, hasCode("aborted"));
  const reading = new AbortController(); let cancelled = false;
  await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal: reading.signal,
    fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
      pull() { reading.abort(); }, cancel() { cancelled = true; },
    }), { headers: { "Content-Type": "application/json" } }),
  }), hasCode("aborted"));
  assert.equal(cancelled, true);
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal: AbortSignal.timeout(10),
      fetchImpl: async () => new Promise<Response>(() => {}),
    }), hasCode("aborted"));
  } finally { clearTimeout(keepAlive); }
});

test("labor transport propagates injected programming errors and keeps provider diagnostics private", async () => {
  for (const defect of [new TypeError("defect"), new ReferenceError("defect")]) {
    await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal,
      fetchImpl: async () => { throw defect; },
    }), (error) => error === defect);
  }
  await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal,
    fetchImpl: async () => json({ ...laborResponse().payload, message: ["private diagnostic"] }),
  }), (error) => {
    assert.ok(error instanceof BlsTransportError);
    assert.doesNotMatch(error.message + error.stack + JSON.stringify(error), /private diagnostic/);
    return true;
  });
});

test("malformed injected sparse series arrays fail schema validation", () => {
  const payload = laborResponse().payload;
  delete payload.Results.series[1];
  assert.throws(() => assertBlsResponseEnvelopeV1(payload, BLS_LABOR_SERIES_IDS_V1), hasCode("schema"));
});

test("labor provider access is server-only", async () => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  try {
    await assert.rejects(loadBlsLaborTimeseriesV1(laborRequest, { signal,
      fetchImpl: async () => { throw new Error("must not fetch"); },
    }), /server-only/);
  } finally { Reflect.deleteProperty(globalThis, "window"); }
});
