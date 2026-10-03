import assert from "node:assert/strict";

async function main() {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Live network forbidden"); };
  try {
    const { loadBlsTimeseriesV1, BlsTransportError, BLS_TIMESERIES_API_URL_V1: url,
      BLS_MAX_RESPONSE_BYTES_V1: limit } = await import("../../providers/bls/client");
    assert.equal(calls, 0, "import performs no request");
    const request = { seriesId: "CUUR0000SA0" as const, startYear: 2025, endYear: 2026 };
    const signal = new AbortController().signal;
    const payload = { status: "REQUEST_SUCCEEDED", responseTime: 1, message: [],
      Results: { series: [{ seriesID: "CUUR0000SA0", data: [] }] } };
    const json = (value: unknown) => new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json" },
    });
    const rejects = (operation: Promise<unknown>, code: string) =>
      assert.rejects(operation, (error) => error instanceof BlsTransportError && error.code === code);
    const result = await loadBlsTimeseriesV1(request, { signal, fetchImpl: async (target, init) => {
      calls++;
      assert.equal(target, url);
      assert.equal(new URL(String(target)).host, "api.bls.gov");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.signal, signal);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        seriesid: ["CUUR0000SA0"], startyear: "2025", endyear: "2026",
      });
      return json(payload);
    } });
    assert.deepEqual(result, { sourceUrl: url, payload });
    const invalidRequests = [
      { ...request, seriesId: "CUSR0000SA0" },
      { ...request, startYear: 2027 }, { ...request, startYear: 2010 },
      { ...request, endYear: NaN },
    ];
    for (const invalid of invalidRequests) {
      await rejects(loadBlsTimeseriesV1(invalid as typeof request, { signal, fetchImpl: async () => {
        throw new Error("Invalid request must not fetch");
      } }), "invalid-request");
    }
    for (const [response, code] of [
      [new Response("bad", { status: 500 }), "http"],
      [new Response("bad", { headers: { "Content-Type": "text/html" } }), "content-type"],
      [new Response("bad", { headers: { "Content-Type": "application/json" } }), "invalid-json"],
      [json({}), "schema"],
      [json({ ...payload, Results: {} }), "schema"],
      [json({ ...payload, message: [1] }), "schema"],
      [json({ ...payload, status: "REQUEST_FAILED", message: ["fixture-sensitive-text"] }), "application-failure"],
      [json({ ...payload, message: ["fixture-sensitive-text"] }), "application-failure"],
      [new Response(null, { headers: { "Content-Type": "application/json" } }), "missing-body"],
      [new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "-1" } }), "content-length"],
      [new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": String(limit + 1) } }), "response-too-large"],
      [new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "application/json" } }), "invalid-json"],
    ] as const) {
      await rejects(loadBlsTimeseriesV1(request, { signal, fetchImpl: async () => response }), code);
    }
    for (const property of ["redirected", "url"]) {
      const response = json(payload);
      Object.defineProperty(response, property, { value: property === "url" ? "https://example.com/" : true });
      await rejects(loadBlsTimeseriesV1(request, { signal, fetchImpl: async () => response }), "redirect");
    }
    let cancelled = false;
    await rejects(loadBlsTimeseriesV1(request, { signal, fetchImpl: async () => new Response(
      new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(limit)); controller.enqueue(new Uint8Array(1)); },
        cancel() { cancelled = true; },
      }), { headers: { "Content-Type": "application/json", "Content-Length": "1" } },
    ) }), "response-too-large");
    assert.equal(cancelled, true);
    const aborted = new AbortController(); aborted.abort();
    await rejects(loadBlsTimeseriesV1(request, { signal: aborted.signal, fetchImpl: async () => {
      throw new Error("Pre-aborted request must not fetch");
    } }), "aborted");
    const pending = new AbortController();
    const pendingResult = loadBlsTimeseriesV1(request, { signal: pending.signal,
      fetchImpl: async () => new Promise<Response>(() => {}),
    });
    pending.abort();
    await rejects(pendingResult, "aborted");
    let cancelledBody = false;
    const reading = new AbortController();
    await rejects(loadBlsTimeseriesV1(request, { signal: reading.signal, fetchImpl: async () =>
      new Response(new ReadableStream<Uint8Array>({
        pull() { reading.abort(); }, cancel() { cancelledBody = true; },
      }), { headers: { "Content-Type": "application/json" } }),
    }), "aborted");
    assert.equal(cancelledBody, true);
    const keepAlive = setTimeout(() => {}, 100);
    await rejects(loadBlsTimeseriesV1(request, { signal: AbortSignal.timeout(10),
      fetchImpl: async () => new Promise<Response>(() => {}),
    }), "aborted");
    clearTimeout(keepAlive);
    for (const defect of [new ReferenceError("defect"), new TypeError("defect")]) {
      await assert.rejects(loadBlsTimeseriesV1(request, { signal, fetchImpl: async () => { throw defect; } }),
        (actual) => actual === defect);
    }
    await assert.rejects(loadBlsTimeseriesV1(request, { signal, fetchImpl: async () =>
      json({ status: "REQUEST_FAILED", message: ["fixture-sensitive-text"] }),
    }), (error) => {
      assert.ok(error instanceof BlsTransportError);
      assert.doesNotMatch(JSON.stringify(error) + error.message + error.stack, /fixture-sensitive-text/);
      return true;
    });
    assert.equal(calls, 1, "all other requests used explicit offline dependencies");
    console.log("PASS: BLS offline bounded transport V1");
  } finally { globalThis.fetch = originalFetch; }
}
void main();
