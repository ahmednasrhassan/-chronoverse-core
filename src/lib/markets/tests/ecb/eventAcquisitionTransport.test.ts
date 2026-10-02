import assert from "node:assert/strict";
import { ECB_GOVERNING_COUNCIL_CALENDAR_URL as URL } from "../../events/ecbMonetaryPolicy";
import {
  ECB_EVENT_MAX_RESPONSE_BYTES_V1, EcbEventTransportError, loadEcbEventHtmlV1,
} from "../../providers/ecb/monetaryPolicy/acquisitionTransport";

async function run() {
  const signal = new AbortController().signal;
  const rejects = (operation: Promise<unknown>, code: EcbEventTransportError["code"]) =>
    assert.rejects(operation, (error) => error instanceof EcbEventTransportError && error.code === code);
  let calls = 0;
  assert.equal(await loadEcbEventHtmlV1(URL, { signal, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, URL);
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.signal, signal);
    return new Response("<main>ECB €</main>", { headers: { "Content-Type": "TEXT/HTML; charset=utf-8" } });
  } }), "<main>ECB €</main>");
  assert.equal(calls, 1);
  for (const [response, code] of [
    [new Response("bad", { status: 404 }), "http"],
    [new Response("bad", { headers: { "Content-Type": "application/json" } }), "content-type"],
    [new Response("bad", { headers: { "Content-Type": "text/html", "Content-Length": "-1" } }), "content-length"],
    [new Response("bad", { headers: { "Content-Type": "text/html", "Content-Length": String(ECB_EVENT_MAX_RESPONSE_BYTES_V1 + 1) } }), "response-too-large"],
    [new Response(null, { headers: { "Content-Type": "text/html" } }), "missing-body"],
    [new Response(new Uint8Array([0xc3, 0x28]), { headers: { "Content-Type": "text/html" } }), "invalid-encoding"],
  ] as const) {
    await rejects(loadEcbEventHtmlV1(URL, { signal, fetchImpl: async () => response }), code);
  }
  const redirected = new Response("redirected", { headers: { "Content-Type": "text/html" } });
  Object.defineProperty(redirected, "redirected", { value: true });
  await rejects(loadEcbEventHtmlV1(URL, { signal, fetchImpl: async () => redirected }), "redirect");
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(ECB_EVENT_MAX_RESPONSE_BYTES_V1));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { cancelled = true; },
  });
  await rejects(loadEcbEventHtmlV1(URL, { signal, fetchImpl: async () => new Response(stream,
    { headers: { "Content-Type": "text/html", "Content-Length": "1" } }),
  }), "response-too-large");
  assert.equal(cancelled, true, "actual stream size bounded regardless of declared length");
  const exact = await loadEcbEventHtmlV1(URL, { signal, fetchImpl: async () => new Response("x".repeat(ECB_EVENT_MAX_RESPONSE_BYTES_V1),
    { headers: { "Content-Type": "text/html" } }),
  });
  assert.equal(exact.length, ECB_EVENT_MAX_RESPONSE_BYTES_V1);
  const controller = new AbortController();
  controller.abort();
  await rejects(loadEcbEventHtmlV1(URL, { signal: controller.signal, fetchImpl: async () => {
    throw new Error("Pre-aborted request must not execute.");
  } }), "aborted");
  const duringRead = new AbortController();
  let readCancelled = false;
  await rejects(loadEcbEventHtmlV1(URL, { signal: duringRead.signal, fetchImpl: async () => new Response(
    new ReadableStream<Uint8Array>({
      pull() { duringRead.abort(); }, cancel() { readCancelled = true; },
    }), { headers: { "Content-Type": "text/html" } }),
  }), "aborted");
  assert.equal(readCancelled, true);
  const duringRequest = new AbortController();
  await rejects(loadEcbEventHtmlV1(URL, { signal: duringRequest.signal, fetchImpl: () => {
    duringRequest.abort(); return new Promise<Response>(() => {});
  } }), "aborted");
  for (const url of ["https://example.com/", `${URL}?query=1`, URL.replace("https:", "http:"),
    "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260230~abcdef.en.html"]) {
    await rejects(loadEcbEventHtmlV1(url, { signal, fetchImpl: async () => {
      throw new Error("Invalid official URL must not execute.");
    } }), "invalid-url");
  }
  for (const error of [new TypeError("defect"), new ReferenceError("defect")]) {
    await assert.rejects(loadEcbEventHtmlV1(URL, { signal, fetchImpl: async () => { throw error; } }), (actual) => actual === error);
    await assert.rejects(loadEcbEventHtmlV1(URL, { signal, fetchImpl: async () => new Response(
      new ReadableStream({ start(controller) { controller.error(error); } }), { headers: { "Content-Type": "text/html" } }),
    }), (actual) => actual === error);
  }
  await rejects(loadEcbEventHtmlV1(URL, { signal, fetchImpl: async () => { throw new EcbEventTransportError("network"); } }), "network");
  const nativeFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed", { cause: new Error("connection refused") });
    };
    await rejects(loadEcbEventHtmlV1(URL, { signal }), "network");
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.error(new TypeError("terminated", {
          cause: Object.assign(new Error("socket closed"), { code: "UND_ERR_SOCKET" }),
        }));
      },
    }), { headers: { "Content-Type": "text/html" } });
    await rejects(loadEcbEventHtmlV1(URL, { signal }), "network");
    const defect = new TypeError("fetch failed", { cause: new ReferenceError("defect") });
    globalThis.fetch = async () => { throw defect; };
    await assert.rejects(loadEcbEventHtmlV1(URL, { signal }), (error) => error === defect);
  } finally { globalThis.fetch = nativeFetch; }
  console.log("PASS: bounded official ECB event transport");
}

void run();
