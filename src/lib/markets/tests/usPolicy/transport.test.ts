import assert from "node:assert/strict";
import { after, test } from "node:test";
import { loadUsPolicyTextV1, UsPolicyTransportError, US_POLICY_MAX_RESPONSE_BYTES_V1, effrRequestUrlV1 } from "../../providers/federalReserve/transport";
import { loadEffrResponseV1 } from "../../providers/newYorkFed/effr";
import { statement, effrRequest, effrResponse } from "./fixtures";
const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const code = (expected: string) => (error: unknown) => error instanceof UsPolicyTransportError && error.code === expected;
const signal = new AbortController().signal;
for (const [url, media] of [[statement().url, "text/html"], [effrRequestUrlV1(effrRequest), "application/json"]] as const) {
  const load = (fetchImpl: typeof fetch, actualSignal = signal) => loadUsPolicyTextV1(url, media, { fetchImpl, signal: actualSignal });
  const response = (body: BodyInit | null = "fixture", status = 200, type = media) => new Response(body, { status, headers: { "Content-Type": type } });
  test(`${media}: exact official GET, injected fetch and caller-owned deadline; no retry`, async () => {
    let calls = 0;
    assert.equal(await load(async (input, init) => {
      calls++; assert.equal(input, url); assert.equal(init?.method, "GET"); assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store"); assert.equal(init.signal, signal);
      const result = response(); Object.defineProperty(result, "url", { value: url }); return result;
    }), "fixture"); assert.equal(calls, 1);
  });
  test(`${media}: strict official URL allowlist and bounded EFFR dates`, async () => {
    for (const other of [url.replace("https:", "http:"), url.replace("https://", "https://evil.invalid/"), "https://example.invalid/", url + "#fragment", url + "&credential=ignored"]) {
      await assert.rejects(loadUsPolicyTextV1(other, media, { signal, fetchImpl: async () => { throw new Error("must not fetch"); } }), code("invalid-request"));
    }
    for (const request of [{ startDate: "2016-02-29", endDate: "2016-03-01" }, { startDate: "2025-02-30", endDate: "2025-03-01" },
      { startDate: "2025-01-01", endDate: "2025-03-01" }, { startDate: "2025-01-30", endDate: "2025-01-29" }]) assert.throws(() => effrRequestUrlV1(request), code("invalid-request"));
  });
  test(`${media}: HTTP/content-type/redirect/final URL/missing body/UTF8 failures are deterministic`, async () => {
    const redirected = response(); Object.defineProperty(redirected, "redirected", { value: true });
    const foreign = response(); Object.defineProperty(foreign, "url", { value: "https://example.invalid/" });
    for (const [result, expected] of [[response("private diagnostics", 500), "http"], [response("fixture", 200, "text/plain" as typeof media), "content-type"],
      [redirected, "redirect"], [foreign, "redirect"], [response(null), "missing-body"], [response(new Uint8Array([0xff])), "invalid-encoding"]] as const) {
      await assert.rejects(load(async () => result), (error: unknown) => { assert.ok(code(expected)(error)); assert.ok(!String(error).includes("private diagnostics")); return true; });
    }
  });
  test(`${media}: declared and streamed size caps; malformed declared lengths`, async () => {
    for (const [length, expected] of [["-1", "content-length"], ["invalid", "content-length"], [String(US_POLICY_MAX_RESPONSE_BYTES_V1 + 1), "response-too-large"]]) {
      const result = response(); result.headers.set("Content-Length", length!); await assert.rejects(load(async () => result), code(expected!));
    }
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(US_POLICY_MAX_RESPONSE_BYTES_V1)); controller.enqueue(new Uint8Array(1)); } });
    await assert.rejects(load(async () => response(stream)), code("response-too-large"));
  });
  test(`${media}: before/pending fetch and pending body cancellation`, async () => {
    const before = new AbortController(); before.abort(); await assert.rejects(load(async () => { throw new Error("must not fetch"); }, before.signal), code("aborted"));
    const pending = new AbortController(); let started!: () => void; const ready = new Promise<void>((resolve) => { started = resolve; });
    const work = load(async () => { started(); return new Promise<Response>(() => {}); }, pending.signal);
    await ready; pending.abort(); await assert.rejects(work, code("aborted"));
    const body = new AbortController(); let pulled!: () => void; const reading = new Promise<void>((resolve) => { pulled = resolve; }); let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ pull() { pulled(); }, cancel() { cancelled = true; } });
    const bodyWork = load(async () => response(stream), body.signal); await reading; body.abort(); await assert.rejects(bodyWork, code("aborted")); assert.equal(cancelled, true);
  });
  test(`${media}: programming fetch/body TypeError/ReferenceError defects propagate unchanged`, async () => {
    for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect")]) {
      await assert.rejects(load(async () => { throw defect; }), (error) => error === defect);
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(defect); } });
      await assert.rejects(load(async () => response(stream)), (error) => error === defect);
    }
  });
  test(`${media}: browser access rejected`, async () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    try { await assert.rejects(load(async () => { throw new Error("must not fetch"); }), /server-only/); }
    finally { Reflect.deleteProperty(globalThis, "window"); }
  });
}
test("EFFR loader accepts only valid JSON, preserves verified payload, no guessed rate alias", async () => {
  const load = (body: string) => loadEffrResponseV1(effrRequest, { signal, fetchImpl: async () => new Response(body, { headers: { "Content-Type": "application/json" } }) });
  assert.deepEqual((await load(JSON.stringify(effrResponse().payload))).payload, effrResponse().payload);
  await assert.rejects(load("{malformed"), /validation failed: schema/);
});
