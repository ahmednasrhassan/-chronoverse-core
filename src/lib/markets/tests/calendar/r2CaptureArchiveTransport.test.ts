import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { Readable } from "node:stream";
import { after, mock, test } from "node:test";
import {
  createR2CalendarCaptureArchiveTransportV1, R2CalendarArchiveTransportErrorV1,
  R2_CALENDAR_ARCHIVE_HTTP_OPTIONS_V1, R2_CALENDAR_ARCHIVE_ERROR_MAX_BYTES_V1, R2_CALENDAR_ARCHIVE_QUEUE_BYTES_V1,
  type R2CalendarArchiveHttpHandlerV1,
} from "../../calendar/r2CaptureArchiveTransport";
import { R2_CALENDAR_ARCHIVE_CONFIG_V1 } from "../../calendar/r2CaptureArchiveConfig";
import { CALENDAR_ARCHIVE_MAX_BYTES_V1, CALENDAR_ARCHIVE_MAX_CHUNKS_V1, CALENDAR_ARCHIVE_TIMEOUT_MS_V1, createCalendarArchiveAdapterV1 } from "../../calendar/captureArchive";
import { prepareCalendarCaptureV1 } from "../../calendar/capturePersistence";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { captureFixtureV1, captureHtmlFixtureV1 } from "./capturePersistenceFixtures";

// Every SDK send goes through an in-memory handler. Any accidental real socket fails.
const sockets = mock.method(Socket.prototype, "connect", () => { assert.fail("Real sockets are forbidden in calendar R2 tests."); });
after(() => {
  try { assert.equal(sockets.mock.callCount(), 0, "An SDK test attempted a real socket."); }
  finally { sockets.mock.restore(); }
});
type WireRequest = Parameters<R2CalendarArchiveHttpHandlerV1["handle"]>[0];
type WireOptions = Parameters<R2CalendarArchiveHttpHandlerV1["handle"]>[1];
type WireResponse = Awaited<ReturnType<R2CalendarArchiveHttpHandlerV1["handle"]>>["response"];
const config = () => ({ schemaVersion: R2_CALENDAR_ARCHIVE_CONFIG_V1, accountId: "a".repeat(32),
  accessKeyId: "synthetic-calendar-access", secretAccessKey: "synthetic-calendar-secret", jurisdiction: "default",
  bucket: { name: "synthetic-calendar-test", purpose: "dedicated-calendar-capture-archive", environment: "non-production" } });
const objectKey = "calendar/captures/v1/" + "b".repeat(64) + ".json";
const signal = () => new AbortController().signal;
const put = (bytes = Buffer.from('{"synthetic":true}')) => ({ objectKey, payloadBytes: bytes, ifNoneMatch: "*" as const, contentType: "application/json" as const, signal: signal() });
function response(statusCode: number, payload: string | Uint8Array | Readable = "", headers: Record<string, string> = {}): WireResponse {
  return { statusCode, headers: { "content-type": "application/json", ...headers },
    body: payload instanceof Readable ? payload : Readable.from([typeof payload === "string" ? Buffer.from(payload) : payload], { objectMode: false }) };
}
function serviceError(status: number, code: string): WireResponse {
  return response(status, `<Error><Code>${code}</Code><Message>synthetic-private-service-detail</Message></Error>`, { "content-type": "application/xml" });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function harness(respond: (request: WireRequest, options: WireOptions, instance: number) => Promise<WireResponse> | WireResponse, value = config()) {
  const requests: WireRequest[] = [];
  const disposed: number[] = [];
  const timers: { expire: () => void; cancelled: boolean }[] = [];
  const transport = createR2CalendarCaptureArchiveTransportV1(value, {
    createHttpHandler: settings => {
      assert.deepEqual(settings, R2_CALENDAR_ARCHIVE_HTTP_OPTIONS_V1);
      assert.equal(settings.throwOnRequestTimeout, true);
      const instance = disposed.push(0) - 1;
      return {
        handle: async (request: WireRequest, options: WireOptions) => { requests.push(request); return { response: await respond(request, options, instance) }; },
        destroy: () => { disposed[instance]++; },
        updateHttpClientConfig: () => {}, httpHandlerConfigs: () => ({}),
      };
    },
    armDeadline: (expire, milliseconds) => {
      assert.equal(milliseconds, CALENDAR_ARCHIVE_TIMEOUT_MS_V1);
      const timer = { expire, cancelled: false }; timers.push(timer);
      return () => { timer.cancelled = true; };
    },
  });
  return { transport, requests, disposed, timers };
}
const rejected = (promise: Promise<unknown>) => assert.rejects(promise, error =>
  error instanceof R2CalendarArchiveTransportErrorV1 && error.message === "Calendar R2 archive transport unavailable.");
async function collect(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  try { for (;;) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function record(publisher: "ecb" | "boj" = "ecb", offset = 0, bom = false) {
  const result = prepareCalendarCaptureV1(await captureFixtureV1({ publisher, offset,
    ...(bom ? { content: "\uFEFF" + captureHtmlFixtureV1(publisher) } : {}) }));
  if (result.status !== "prepared") assert.fail("Synthetic record preparation failed.");
  return result.record;
}

test("factory is inactive, validates before handler construction, and snapshots supplied configuration", async () => {
  let constructed = 0;
  assert.throws(() => createR2CalendarCaptureArchiveTransportV1({ ...config(), endpoint: "https://invalid.invalid" }, {
    createHttpHandler: () => { constructed++; throw new Error(); },
  }));
  assert.equal(constructed, 0);
  createR2CalendarCaptureArchiveTransportV1(config()); // No SDK client or socket at construction.
  const value = config();
  const h = harness(() => response(200), value);
  assert.equal(h.disposed.length, 0);
  value.accountId = "c".repeat(32); value.bucket.name = "changed-after-construction"; value.accessKeyId = "changed-access";
  assert.deepEqual(await h.transport.putIfAbsent(put()), { status: 200 });
  assert.equal(h.requests[0].hostname, "a".repeat(32) + ".r2.cloudflarestorage.com");
  assert.equal(h.requests[0].path, "/synthetic-calendar-test/" + objectKey);
  assert.ok(h.requests[0].headers.authorization.includes("Credential=synthetic-calendar-access/"));
  assert.deepEqual(h.disposed, [1]);
});

test("real SDK wire serialization signs copied PUT bytes and pins conditional/checksum/Expect behavior", async () => {
  const bytes = Buffer.from('{"synthetic":true}');
  const original = Buffer.from(bytes);
  const h = harness(request => {
    assert.equal(request.method, "PUT"); assert.equal(request.protocol, "https:");
    assert.equal(request.headers["if-none-match"], "*");
    assert.equal(request.headers["content-length"], String(original.length));
    assert.equal(request.headers["content-type"], "application/json");
    assert.equal(request.headers["x-amz-content-sha256"], createHash("sha256").update(original).digest("hex"));
    assert.match(request.headers.authorization, /^AWS4-HMAC-SHA256 Credential=synthetic-calendar-access\/\d{8}\/auto\/s3\/aws4_request,/);
    assert.ok(request.headers.authorization.includes("if-none-match"));
    assert.equal(request.headers.Expect, undefined); assert.equal(request.headers.expect, undefined);
    assert.equal(request.headers["x-amz-checksum-crc32"], undefined);
    assert.equal(request.headers["x-amz-sdk-checksum-algorithm"], undefined);
    assert.deepEqual(Buffer.from(request.body as Uint8Array), original);
    return response(200);
  });
  const pending = h.transport.putIfAbsent(put(bytes)); bytes.fill(0);
  assert.deepEqual(await pending, { status: 200 });
  assert.equal(h.requests.length, 1); assert.deepEqual(h.disposed, [1]);
  assert.ok(h.timers.every(timer => timer.cancelled));
});

for (const badKey of ["", "production/backup.json", objectKey.toUpperCase(), objectKey + "?x=1", "calendar/captures/v1/../escape.json"]) {
  test("invalid key rejects before any handler: " + badKey, async () => {
    const h = harness(() => { assert.fail("Invalid key reached handler."); });
    await rejected(h.transport.putIfAbsent({ ...put(), objectKey: badKey }));
    await rejected(h.transport.getAuthenticated({ objectKey: badKey, signal: signal() }));
    assert.equal(h.disposed.length, 0);
  });
}
test("invalid PUT bounds, conditions, content types and pre-aborted requests never construct handlers", async () => {
  const h = harness(() => { assert.fail("Invalid request reached handler."); });
  await rejected(h.transport.putIfAbsent(put(Buffer.alloc(CALENDAR_ARCHIVE_MAX_BYTES_V1 + 1))));
  await rejected(h.transport.putIfAbsent(put(Buffer.alloc(0))));
  await rejected(h.transport.putIfAbsent({ ...put(), ifNoneMatch: "wrong" as "*" }));
  await rejected(h.transport.putIfAbsent({ ...put(), contentType: "text/html" as "application/json" }));
  const controller = new AbortController(); controller.abort();
  await rejected(h.transport.putIfAbsent({ ...put(), signal: controller.signal }));
  await rejected(h.transport.getAuthenticated({ objectKey, signal: controller.signal }));
  assert.equal(h.disposed.length, 0);
});
test("maximum-size PUT still disables Expect: 100-continue and sends exact length", async () => {
  const h = harness(request => {
    assert.equal(request.headers["content-length"], String(CALENDAR_ARCHIVE_MAX_BYTES_V1));
    assert.equal(request.headers.Expect, undefined); assert.equal(request.headers.expect, undefined);
    return response(200);
  });
  assert.deepEqual(await h.transport.putIfAbsent(put(Buffer.alloc(CALENDAR_ARCHIVE_MAX_BYTES_V1))), { status: 200 });
});

test("genuine SDK precondition failure maps to 412 without content-equality claims", async () => {
  const h = harness(() => serviceError(412, "PreconditionFailed"));
  assert.deepEqual(await h.transport.putIfAbsent(put()), { status: 412 });
  assert.equal(h.requests.length, 1); assert.deepEqual(h.disposed, [1]);
});
for (const [status, code] of [[403, "AccessDenied"], [409, "ConditionalRequestConflict"], [412, "AccessDenied"], [503, "ServiceUnavailable"], [301, "PermanentRedirect"]] as const) {
  test("PUT " + status + "/" + code + " is sanitized and never automatically retried", async () => {
    const h = harness(() => { const result = serviceError(status, code); result.headers["x-amz-bucket-region"] = "us-east-1"; return result; });
    await rejected(h.transport.putIfAbsent(put()));
    assert.equal(h.requests.length, 1); assert.deepEqual(h.disposed, [1]);
  });
}
test("network errors named like service errors cannot fabricate a precondition result", async () => {
  const h = harness(() => { throw Object.assign(new Error("synthetic-private"), { name: "PreconditionFailed", $metadata: { httpStatusCode: 412 }, code: "ECONNRESET" }); });
  await rejected(h.transport.putIfAbsent(put())); assert.equal(h.requests.length, 1);
});

test("GET sends signed full-object request and preserves exact Node-stream bytes until consumption", async () => {
  const bytes = Buffer.from([239, 187, 191, 123, 125]);
  const h = harness(request => {
    assert.equal(request.method, "GET"); assert.match(request.headers.authorization, /^AWS4-HMAC-SHA256 /);
    assert.equal(request.headers.range, undefined); assert.equal(request.headers["x-amz-checksum-mode"], undefined);
    return response(200, bytes, { "content-length": String(bytes.length), etag: "forged", "x-amz-meta-sha256": "forged" });
  });
  const result = await h.transport.getAuthenticated({ objectKey, signal: signal() });
  assert.equal(result.status, 200); assert.deepEqual(h.disposed, [0]);
  assert.ok("body" in result); if (!("body" in result)) return;
  assert.deepEqual(await collect(result.body), bytes);
  assert.deepEqual(h.disposed, [1]); assert.ok(h.timers.every(timer => timer.cancelled));
});
test("GET maps genuine NoSuchKey/404 only", async () => {
  const h = harness(() => serviceError(404, "NoSuchKey"));
  assert.deepEqual(await h.transport.getAuthenticated({ objectKey, signal: signal() }), { status: 404 });
  assert.deepEqual(h.disposed, [1]);
});
test("unexpected successful status and missing GET body are not usable object responses", async () => {
  const unexpectedPut = harness(() => response(201));
  await rejected(unexpectedPut.transport.putIfAbsent(put()));
  const unexpectedGet = harness(() => response(204));
  await rejected(unexpectedGet.transport.getAuthenticated({ objectKey, signal: signal() }));
  const missing = harness(() => ({ statusCode: 200, headers: { "content-type": "application/json" } }));
  await rejected(missing.transport.getAuthenticated({ objectKey, signal: signal() }));
  assert.deepEqual(unexpectedPut.disposed, [1]); assert.deepEqual(unexpectedGet.disposed, [1]); assert.deepEqual(missing.disposed, [1]);
});
for (const [status, code] of [[403, "AccessDenied"], [404, "NoSuchBucket"], [404, "NotFound"], [503, "NoSuchKey"], [301, "PermanentRedirect"]] as const) {
  test("GET " + status + "/" + code + " never becomes object absence", async () => {
    const h = harness(() => serviceError(status, code));
    await rejected(h.transport.getAuthenticated({ objectKey, signal: signal() }));
    assert.equal(h.requests.length, 1); assert.deepEqual(h.disposed, [1]);
  });
}
for (const kind of ["partial", "content-type", "encoding", "range", "negative-length", "oversized-length", "bad-date"] as const) {
  test("malformed GET " + kind + " fails closed and destroys its body", async () => {
    const raw = Readable.from([Buffer.from("{}")], { objectMode: false });
    const headers: Record<string, string> = {};
    if (kind === "content-type") headers["content-type"] = "text/html";
    if (kind === "encoding") headers["content-encoding"] = "gzip";
    if (kind === "range") headers["content-range"] = "bytes 0-1/10";
    if (kind === "negative-length") headers["content-length"] = "-1";
    if (kind === "oversized-length") headers["content-length"] = String(CALENDAR_ARCHIVE_MAX_BYTES_V1 + 1);
    if (kind === "bad-date") headers["last-modified"] = "invalid-date";
    const h = harness(() => response(kind === "partial" ? 206 : 200, raw, headers));
    await rejected(h.transport.getAuthenticated({ objectKey, signal: signal() }));
    assert.equal(raw.destroyed, true); assert.deepEqual(h.disposed, [1]);
  });
}

for (const kind of ["too-large", "malformed-xml", "entity", "put-body", "unexpected-success"] as const) {
  test("SDK error/discarded response boundary rejects " + kind, async () => {
    const raw = Readable.from([Buffer.from(kind === "too-large" ? "x".repeat(R2_CALENDAR_ARCHIVE_ERROR_MAX_BYTES_V1 + 1)
      : kind === "entity" ? '<!DOCTYPE Error [<!ENTITY x "expanded">]><Error><Code>PreconditionFailed</Code></Error>'
      : kind === "malformed-xml" ? "<Error><Code>PreconditionFailed</Error>" : "unexpected body")], { objectMode: false });
    const h = harness(() => response(kind === "put-body" ? 200 : kind === "unexpected-success" ? 201 : 412, raw));
    await rejected(h.transport.putIfAbsent(put()));
    assert.equal(raw.destroyed, true); assert.equal(h.requests.length, 1); assert.deepEqual(h.disposed, [1]);
  });
}
test("64 KiB is an inclusive bound for a valid SDK error body", async () => {
  const xml = "<Error><Code>PreconditionFailed</Code></Error>";
  const h = harness(() => response(412, xml.padEnd(R2_CALENDAR_ARCHIVE_ERROR_MAX_BYTES_V1, " ")));
  assert.deepEqual(await h.transport.putIfAbsent(put()), { status: 412 });
});

test("GET conversion uses byte backpressure and cancellation releases the owned client", async () => {
  let produced = 0;
  const raw = new Readable({ highWaterMark: 1024, read() { produced++; this.push(Buffer.alloc(1024, 1)); } });
  const h = harness(() => response(200, raw));
  const result = await h.transport.getAuthenticated({ objectKey, signal: signal() });
  if (!("body" in result)) assert.fail();
  await tick(); await tick();
  assert.ok(produced * 1024 <= R2_CALENDAR_ARCHIVE_QUEUE_BYTES_V1 + 4096, "Unconsumed queue exceeded byte backpressure allowance.");
  await result.body.cancel(); assert.equal(raw.destroyed, true); assert.deepEqual(h.disposed, [1]);
});
for (const kind of ["truncated", "oversized", "stream-error"] as const) {
  test("GET streamed " + kind + " rejects and cleans up", async () => {
    const raw = kind === "stream-error" ? new Readable({ read() { this.destroy(new Error("synthetic-private-stream")); } })
      : Readable.from([Buffer.alloc(kind === "oversized" ? CALENDAR_ARCHIVE_MAX_BYTES_V1 + 1 : 2)], { objectMode: false });
    const h = harness(() => response(200, raw, kind === "truncated" ? { "content-length": "3" } : {}));
    const result = await h.transport.getAuthenticated({ objectKey, signal: signal() });
    if (!("body" in result)) assert.fail();
    await rejected(collect(result.body)); assert.equal(raw.destroyed, true); assert.deepEqual(h.disposed, [1]);
  });
}

test("stalled GET body aborts promptly on the operation timeout", async () => {
  const raw = new Readable({ read() {} });
  const h = harness(() => response(200, raw));
  const result = await h.transport.getAuthenticated({ objectKey, signal: signal() });
  if (!("body" in result)) assert.fail();
  const pending = collect(result.body); h.timers[0].expire();
  await rejected(pending); assert.equal(raw.destroyed, true); assert.deepEqual(h.disposed, [1]);
});
test("parent abort during stalled headers returns promptly and late response is destroyed", async () => {
  const started = deferred<void>(); const late = deferred<WireResponse>();
  let networkSignal: NonNullable<WireOptions>["abortSignal"];
  const h = harness((_request, options) => { networkSignal = options?.abortSignal; started.resolve(); return late.promise; });
  const controller = new AbortController();
  const pending = h.transport.getAuthenticated({ objectKey, signal: controller.signal });
  await started.promise; controller.abort(); await rejected(pending);
  assert.equal(networkSignal?.aborted, true);
  const raw = new Readable({ read() {} }); late.resolve(response(200, raw));
  await tick(); assert.equal(raw.destroyed, true); assert.deepEqual(h.disposed, [1]);
});
test("stalled SDK error collection obeys abort and releases its stream", async () => {
  const reading = deferred<void>(); const raw = new Readable({ read() { reading.resolve(); } });
  const h = harness(() => response(412, raw));
  const pending = h.transport.putIfAbsent(put());
  await reading.promise; h.timers[0].expire(); await rejected(pending);
  assert.equal(raw.destroyed, true); assert.deepEqual(h.disposed, [1]);
});
test("concurrent operations own separate clients; cancellation cannot destroy a sibling", async () => {
  const first = new Readable({ read() {} });
  const h = harness((_request, _options, instance) => response(200, instance === 0 ? first : Buffer.from("{}")));
  const a = await h.transport.getAuthenticated({ objectKey, signal: signal() });
  const b = await h.transport.getAuthenticated({ objectKey, signal: signal() });
  if (!("body" in a) || !("body" in b)) assert.fail();
  await a.body.cancel(); assert.deepEqual(h.disposed, [1, 0]);
  assert.equal((await collect(b.body)).toString(), "{}"); assert.deepEqual(h.disposed, [1, 1]);
});

for (const publisher of ["ecb", "boj"] as const) {
  test("Slice 1 composition: " + publisher + " BOM fidelity, retries, conflicts and historical refusal", async () => {
    const stored = new Map<string, Buffer>();
    const h = harness(request => {
      if (request.method === "PUT") {
        if (stored.has(request.path)) return serviceError(412, "PreconditionFailed");
        stored.set(request.path, Buffer.from(request.body as Uint8Array)); return response(200);
      }
      const bytes = stored.get(request.path); return bytes ? response(200, bytes) : serviceError(404, "NoSuchKey");
    });
    const adapter = createCalendarArchiveAdapterV1({ transport: h.transport });
    const input = await record(publisher, 0, true);
    const first = await adapter.archive(input); const retry = await adapter.archive(input);
    assert.equal(first.status, "verified"); assert.equal(retry.status, "verified");
    assert.equal(first.putObservation, "created"); assert.equal(retry.putObservation, "precondition-failed");
    const conflict = await adapter.archive(await record(publisher, 1000, true));
    assert.ok(conflict.status === "unavailable" && conflict.reason === "conflict");
    assert.equal(stored.size, 1);
    const envelope = JSON.parse(stored.values().next().value!.toString("utf8"));
    assert.equal(Buffer.from(envelope.record.input.bodyBase64Chunks.join(""), "base64").toString("utf8"), "\uFEFF" + captureHtmlFixtureV1(publisher));
    for (const { event } of input.eventVersions) {
      assert.equal(selectCalendarEventAsOfV1({ versions: [event], knowledgeCutoff: "9999-12-31T23:59:59.999Z", evaluatedAt: "9999-12-31T23:59:59.999Z" }).status, "unavailable");
      assert.equal(event.timing.persistence.status, "not-persisted");
    }
    assert.ok(h.disposed.every(count => count === 1));
  });
}
test("lost PUT reply after commit reconciles by authenticated GET without a creation claim", async () => {
  let stored: Buffer | undefined;
  const h = harness(request => {
    if (request.method === "PUT") { stored = Buffer.from(request.body as Uint8Array); throw Object.assign(new Error("synthetic-private-reset"), { code: "ECONNRESET" }); }
    return response(200, stored!);
  });
  const result = await createCalendarArchiveAdapterV1({ transport: h.transport }).archive(await record());
  assert.equal(result.status, "verified"); assert.equal(result.putObservation, "outcome-unknown");
  assert.equal(h.requests.length, 2); assert.ok(h.disposed.every(count => count === 1));
});
test("uncertain PUT plus genuine GET 404 remains uncertain across the SDK mapping", async () => {
  const h = harness(request => { if (request.method === "PUT") throw new Error("synthetic-lost-response"); return serviceError(404, "NoSuchKey"); });
  const result = await createCalendarArchiveAdapterV1({ transport: h.transport }).archive(await record());
  assert.ok(result.status === "unavailable" && result.reason === "outcome-unknown");
  assert.equal(result.putObservation, "outcome-unknown"); assert.equal(h.requests.length, 2);
});
test("Slice 1 shared deadline wins over stalled PUT; a late server commit reconciles on retry", async () => {
  const started = deferred<void>(); const late = deferred<WireResponse>();
  let originalRequest: WireRequest | undefined;
  const stored: { bytes?: Buffer } = {};
  const h = harness(request => {
    if (request.method === "PUT") {
      if (stored.bytes) return serviceError(412, "PreconditionFailed");
      originalRequest = request; started.resolve(); return late.promise;
    }
    return stored.bytes ? response(200, stored.bytes) : serviceError(404, "NoSuchKey");
  });
  let expire!: () => void;
  const adapter = createCalendarArchiveAdapterV1({ transport: h.transport, monotonicNow: () => 0,
    armDeadline: callback => { expire = callback; return () => {}; } });
  const input = await record(); const pending = adapter.archive(input);
  await started.promise; expire();
  const result = await pending;
  assert.ok(result.status === "unavailable" && result.reason === "outcome-unknown");
  stored.bytes = Buffer.from(originalRequest!.body as Uint8Array); // Server commitment may outlive client abort.
  late.resolve(response(200)); await tick();
  assert.equal(h.requests.length, 1, "A late PUT must not start a GET after the shared deadline.");
  const retry = await adapter.archive(input);
  assert.equal(retry.status, "verified"); assert.equal(retry.putObservation, "precondition-failed");
  assert.ok(h.disposed.every(count => count === 1));
});
test("converted GET retains the 4096-chunk read limit", async () => {
  let produced = 0;
  const raw = new Readable({ highWaterMark: 1, read() {
    if (produced++ === CALENDAR_ARCHIVE_MAX_CHUNKS_V1 + 1) this.push(null);
    else this.push(Buffer.from([1]));
  } });
  const h = harness(() => response(200, raw));
  const result = await h.transport.getAuthenticated({ objectKey, signal: signal() });
  if (!("body" in result)) assert.fail();
  await rejected(collect(result.body)); assert.deepEqual(h.disposed, [1]);
});
test("source remains unwired and has no application environment/credential loader or storage administration", () => {
  const source = readFileSync(new URL("../../calendar/r2CaptureArchiveTransport.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /process\.env|defaultProvider|fromEnv|fromIni|DeleteObjectCommand|CreateBucketCommand|ListObjectsCommand/);
});
