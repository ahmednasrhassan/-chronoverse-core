import assert from "node:assert/strict";
import { after, test } from "node:test";
import { loadSnbPolicyDocumentV1, snbPolicyDocumentUrlV1, assertSnbPolicyUrlV1, SNB_POLICY_MAX_RESPONSE_BYTES_V1, SnbPolicyTransportError } from "../../providers/snb/transport";
import { date } from "./fixtures";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live network forbidden"); };
after(() => { globalThis.fetch = originalFetch; });
const url = snbPolicyDocumentUrlV1(date);
const signal = new AbortController().signal;
const code = (expected: string) => (error: unknown) => error instanceof SnbPolicyTransportError && error.code === expected;
const response = (body: BodyInit | null = "<html></html>", contentType = "text/html;charset=UTF-8", status = 200) => new Response(body, { status, headers: { "Content-Type": contentType } });
const load = (fetchImpl: typeof fetch, active = signal) => loadSnbPolicyDocumentV1(url, { fetchImpl, signal: active });

test("transport permits only exact verified SNB paths and source suffix", async () => {
  assert.equal(assertSnbPolicyUrlV1(url), date);
  assert.equal(snbPolicyDocumentUrlV1(date), "https://www.snb.ch/en/publications/communication/press-releases-restricted/pre_20250619_2");
  assert.equal(snbPolicyDocumentUrlV1("2023-06-22"), "https://www.snb.ch/en/publications/communication/press-releases/2023/pre_20230622");
  assert.equal(assertSnbPolicyUrlV1(snbPolicyDocumentUrlV1("2019-06-13")), "2019-06-13");
  for (const candidate of [url.replace("https:", "http:"), url.replace("www.snb.ch", "snb.ch"),
    url.replace("www.snb.ch", "www.snb.ch.evil.test"), url.replace("www.snb.ch", "user@www.snb.ch"),
    url+'?q=1', url+'#f', url+'/', url+'.pdf', url.replace('_2',''),url.replace('_2','_3'),
    url.replace('press-releases-restricted','press-releases/2025'), url.replace('20250619','20260230'),
    snbPolicyDocumentUrlV1("2023-06-22").replace('/2023/','/2022/')]) {
    let called = false;
    await assert.rejects(loadSnbPolicyDocumentV1(candidate, { signal, fetchImpl: async () => { called = true; return response(); } }), code("invalid-request"));
    assert.equal(called, false);
  }
  for (const invalid of ["2025-02-30", "2025-06-00", "bad-date"]) assert.throws(() => snbPolicyDocumentUrlV1(invalid), code("invalid-request"));
  for (const invalid of ["2019-06-12", "2018-12-13"]) assert.throws(() => snbPolicyDocumentUrlV1(invalid), code("unsupported-regime"));
});

test("request is bounded explicit server GET with injected fetch, signal, no retry/cache", async () => {
  let calls = 0;
  const result = await load(async (requested, init) => {
    calls++;
    assert.equal(requested, url);
    assert.equal(init?.method, "GET");
    assert.equal(init?.signal, signal);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    return response();
  });
  assert.deepEqual(result, { url, html: "<html></html>" });
  assert.equal(calls, 1);
});
test("HTTP/type/missing body/invalid UTF-8 failures are typed", async () => {
  for (const [result, expected] of [[response("", "text/html", 500), "http"], [response("", "text/html", 206), "http"], [response("", "text/html", 201), "http"],
    [response("", "application/pdf"), "content-type"], [response("", "text/html; charset=shift_jis"), "content-type"],
    [response(null), "missing-body"], [response(new Uint8Array([0xc3, 0x28])), "invalid-encoding"]] as const) {
    await assert.rejects(load(async () => result), code(expected));
  }
});
test("redirects, escaped final host and mismatched dated URL are rejected", async () => {
  for (const [property, value] of [["redirected", true], ["url", "https://evil.test/decision"], ["url", snbPolicyDocumentUrlV1("2025-06-20")]] as const) {
    const result = response();
    Object.defineProperty(result, property, { value });
    await assert.rejects(load(async () => result), code("redirect"));
  }
});
test("declared and streaming response size limits reject overflow and bad lengths", async () => {
  for (const [length, expected] of [["-1", "content-length"], ["bad", "content-length"], [String(SNB_POLICY_MAX_RESPONSE_BYTES_V1 + 1), "response-too-large"]]) {
    const result = response(); result.headers.set("Content-Length", length!);
    await assert.rejects(load(async () => result), code(expected!));
  }
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new Uint8Array(SNB_POLICY_MAX_RESPONSE_BYTES_V1)); controller.enqueue(new Uint8Array(1));
  }, cancel() { cancelled = true; } });
  await assert.rejects(load(async () => response(stream)), code("response-too-large"));
  assert.equal(cancelled, true);
});
test("cancellation before fetch, pending fetch and pending body is bounded", async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(load(async () => { throw new Error("must not fetch"); }, before.signal), code("aborted"));
  const pending = new AbortController();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const work = load(async () => { started(); return new Promise<Response>(() => {}); }, pending.signal);
  await ready; pending.abort(); await assert.rejects(work, code("aborted"));
  const body = new AbortController();
  let pulled!: () => void;
  const reading = new Promise<void>((resolve) => { pulled = resolve; });
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull() { pulled(); }, cancel() { cancelled = true; } });
  const bodyWork = load(async () => response(stream), body.signal);
  await reading; body.abort(); await assert.rejects(bodyWork, code("aborted"));
  assert.equal(cancelled, true);
});
test("recognized native network/redirect/abort failures become typed errors", async () => {
  for (const [error, expected] of [
    [new TypeError("fetch failed", { cause: Object.assign(new Error("socket"), { code: "ECONNRESET" }) }), "network"],
    [new TypeError("fetch failed", { cause: new Error("unexpected redirect") }), "redirect"],
    [new DOMException("aborted", "AbortError"), "aborted"],
  ] as const) await assert.rejects(load(async () => { throw error; }), code(expected));
});
test("unrelated fetch/body TypeError and ReferenceError propagate unchanged", async () => {
  for (const defect of [new TypeError("programming defect"), new ReferenceError("programming defect"),
    new TypeError("fetch failed", { cause: new ReferenceError("programming defect") })]) {
    await assert.rejects(load(async () => { throw defect; }), (error) => error === defect);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(defect); } });
    await assert.rejects(load(async () => response(stream)), (error) => error === defect);
  }
});
test("browser invocation is rejected before fetch", async () => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(load(async () => { throw new Error("must not fetch"); }), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
