import assert from "node:assert/strict";
import { after, test } from "node:test";
import { BEA_API_URL_V1, BEA_MAX_RESPONSE_BYTES_V1, BeaTransportError, loadBeaResponseV1,
  parseBeaEnvelopeV1, type BeaRequestV1,
} from "../../providers/bea/client";
import { envelope, fakeUserId, gdpRequest, pceRequest } from "./fixtures";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const signal = new AbortController().signal;
const json = (payload: unknown = envelope()) => new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
const code = (expected: string) => (error: unknown) => error instanceof BeaTransportError && error.code === expected;
const load = (fetchImpl: typeof fetch, request = pceRequest, actualSignal = signal) =>
  loadBeaResponseV1(request, { fetchImpl, userId: fakeUserId, signal: actualSignal });

for (const request of [gdpRequest, pceRequest]) test(`official injected GET for ${request.tableName}/${request.frequency}; credential echo discarded`, async () => {
  let calls = 0;
  const result = await load(async (input, init) => {
    calls++; const url = new URL(String(input));
    assert.equal(`${url.origin}${url.pathname}`, BEA_API_URL_V1);
    assert.equal(url.searchParams.get("UserID"), fakeUserId);
    assert.deepEqual([...url.searchParams.keys()].sort(), ["UserID", "method", "datasetname", "TableName", "Frequency", "Year", "ResultFormat"].sort());
    assert.equal(url.searchParams.get("datasetname"), "NIPA"); assert.equal(url.searchParams.get("TableName"), request.tableName);
    assert.equal(url.searchParams.get("Frequency"), request.frequency); assert.equal(url.searchParams.get("Year"), "2025,2026");
    assert.equal(init?.method, "GET"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.equal(init.signal, signal);
    const result = json(envelope(request)); Object.defineProperty(result, "url", { value: url.toString() }); return result;
  }, request);
  assert.equal(calls, 1); assert.equal(result.sourceUrl, BEA_API_URL_V1);
  const serialized = JSON.stringify(result);
  for (const forbidden of [fakeUserId, "USERID", "UTCProductionTime", "RequestParam"]) assert.ok(!serialized.includes(forbidden));
});

test("invalid request or credential rejected before fetch; no unbounded history or substitutions", async () => {
  const invalid = [ { ...pceRequest, dataset: "other" }, { ...pceRequest, tableName: "T20304" },
    { ...pceRequest, frequency: "Q" }, { ...gdpRequest, frequency: "M" }, { ...pceRequest, years: [] },
    { ...pceRequest, years: [2025, 2025] }, { ...pceRequest, years: [999] },
    { ...pceRequest, years: [2020, 2021, 2022, 2023, 2024, 2025] }, { ...pceRequest, years: [Infinity] },
    { ...pceRequest, years: ["ALL"] }, null ];
  invalid.push({ ...pceRequest, UserID: "must not be retained" } as unknown as typeof invalid[number]);
  const fetchImpl: typeof fetch = async () => { throw new Error("fetch must not run"); };
  for (const request of invalid) await assert.rejects(load(fetchImpl, request as BeaRequestV1), code("invalid-request"));
  await assert.rejects(loadBeaResponseV1(pceRequest, { fetchImpl, signal, userId: "invalid synthetic credential" }), (error: unknown) => {
    assert.ok(code("invalid-request")(error)); assert.ok(!String(error).includes("synthetic")); return true;
  });
});

test("redirect and foreign final URLs fail, even when the payload is valid", async () => {
  for (const mutation of ["redirected", "url"]) {
    const result = json(); Object.defineProperty(result, mutation, { value: mutation === "redirected" ? true : "https://example.invalid/" });
    await assert.rejects(load(async () => result), code("redirect"));
  }
});

test("HTTP, content type, malformed JSON/UTF8, missing body and application/schema failures are static", async () => {
  const cases: Array<[Response, string]> = [
    [new Response("credential diagnostic", { status: 429 }), "http"],
    [new Response("{}", { headers: { "Content-Type": "text/html" } }), "content-type"],
    [new Response("{bad", { headers: { "Content-Type": "application/json" } }), "invalid-json"],
    [new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "application/json" } }), "invalid-json"],
    [new Response(null, { headers: { "Content-Type": "application/json" } }), "missing-body"],
    [json({ BEAAPI: { Results: { Error: { APIErrorCode: "1", APIErrorDescription: "credential diagnostic" } } } }), "application-failure"],
    [json({ BEAAPI: { Error: { APIErrorDescription: "credential diagnostic" } } }), "application-failure"],
    [json({ BEAAPI: { Results: { Data: [], Notes: [] } } }), "schema"],
  ];
  for (const [result, expected] of cases) await assert.rejects(load(async () => result), (error: unknown) => {
    assert.ok(code(expected)(error)); assert.ok(!String(error).includes("credential diagnostic")); return true;
  });
});

test("response echoes must bind exact table/frequency/dataset/years; duplicates fail", () => {
  for (const name of ["DATASETNAME", "TABLENAME", "FREQUENCY", "YEAR", "METHOD", "RESULTFORMAT"]) {
    const payload = envelope(); payload.BEAAPI.Request.RequestParam.find((param) => param.ParameterName === name)!.ParameterValue = "wrong";
    assert.throws(() => parseBeaEnvelopeV1(payload, pceRequest), code("schema"));
  }
  const payload = envelope(); payload.BEAAPI.Request.RequestParam.push(payload.BEAAPI.Request.RequestParam[1]!);
  assert.throws(() => parseBeaEnvelopeV1(payload, pceRequest), code("schema"));
});

test("declared Content-Length validates syntax and bound before reading; streaming enforces bytes", async () => {
  for (const [length, expected] of [["-1", "content-length"], ["1.2", "content-length"], ["garbage", "content-length"],
    [String(BEA_MAX_RESPONSE_BYTES_V1 + 1), "response-too-large"]]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    await assert.rejects(load(async () => new Response(stream, { headers: { "Content-Type": "application/json", "Content-Length": length! } })), code(expected!));
    assert.equal(cancelled, true);
  }
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(BEA_MAX_RESPONSE_BYTES_V1)); controller.enqueue(new Uint8Array(1));
  }, cancel() { cancelled = true; } });
  await assert.rejects(load(async () => new Response(stream, { headers: { "Content-Type": "application/json", "Content-Length": "1" } })), code("response-too-large"));
  assert.equal(cancelled, true);
});

test("cancellation before fetch, while pending fetch, and pending body respects caller signal", async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(load(async () => { throw new Error("must not fetch"); }, pceRequest, before.signal), code("aborted"));
  const pending = new AbortController(); let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const work = load(async () => { started(); return new Promise<Response>(() => {}); }, pceRequest, pending.signal);
  await startedPromise; pending.abort(); await assert.rejects(work, code("aborted"));
  const body = new AbortController(); let reading!: () => void; let cancelled = false;
  const readingPromise = new Promise<void>((resolve) => { reading = resolve; });
  const stream = new ReadableStream<Uint8Array>({ pull() { reading(); }, cancel() { cancelled = true; } });
  const bodyWork = load(async () => new Response(stream, { headers: { "Content-Type": "application/json" } }), pceRequest, body.signal);
  await readingPromise; body.abort(); await assert.rejects(bodyWork, code("aborted")); assert.equal(cancelled, true);
});

test("unrelated injected fetch and reader TypeError/ReferenceError propagate unchanged", async () => {
  for (const error of [new TypeError("programming defect"), new ReferenceError("programming defect")]) {
    await assert.rejects(load(async () => { throw error; }), (actual) => actual === error);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(error); } });
    await assert.rejects(load(async () => new Response(stream, { headers: { "Content-Type": "application/json" } })), (actual) => actual === error);
  }
});

test("transport rejects browser execution before fetch", async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(load(async () => { throw new Error("must not fetch"); }), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});

test("known native network/redirect failures use static codes; unrelated causes still propagate", async () => {
  const networkCause = Object.assign(new Error("private upstream detail"), { code: "ENOTFOUND" });
  for (const [failure, expected] of [
    [new TypeError("fetch failed", { cause: networkCause }), "network"],
    [new TypeError("fetch failed", { cause: new Error("unexpected redirect") }), "redirect"],
    [new TypeError("terminated", { cause: Object.assign(new Error("private detail"), { code: "UND_ERR_SOCKET" }) }), "network"],
  ] as const) await assert.rejects(load(async () => { throw failure; }), code(expected));
  const defect = new TypeError("fetch failed", { cause: new ReferenceError("programming defect") });
  await assert.rejects(load(async () => { throw defect; }), (actual) => actual === defect);
});

test("sparse request years and sparse data/note arrays fail closed", async () => {
  const years = new Array<number>(2); years[0] = 2025;
  await assert.rejects(load(async () => { throw new Error("must not fetch"); }, { ...pceRequest, years }), code("invalid-request"));
  for (const field of ["Data", "Notes"] as const) {
    const payload = envelope(); payload.BEAAPI.Results[field].length++;
    assert.throws(() => parseBeaEnvelopeV1(payload, pceRequest), code("schema"));
  }
});
