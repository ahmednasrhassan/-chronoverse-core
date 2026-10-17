import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CALENDAR_ARCHIVE_ENVELOPE_V1, CALENDAR_ARCHIVE_NAMESPACE_V1,
  CALENDAR_ARCHIVE_MAX_BYTES_V1, CALENDAR_ARCHIVE_MAX_CHUNKS_V1, CALENDAR_ARCHIVE_TIMEOUT_MS_V1,
  createCalendarArchiveAdapterV1, prepareCalendarArchiveObjectV1,
  type CalendarArchiveDependenciesV1, type CalendarArchiveResultV1, type CalendarArchiveTransportV1,
} from "../../calendar/captureArchive";
import { prepareCalendarCaptureV1 } from "../../calendar/capturePersistence";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { captureFixtureV1, captureHtmlFixtureV1 } from "./capturePersistenceFixtures";

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
async function record(options: Parameters<typeof captureFixtureV1>[0] = {}) {
  const result = prepareCalendarCaptureV1(await captureFixtureV1(options));
  if (result.status !== "prepared") assert.fail("Expected synthetic capture.");
  return result.record;
}
function prepared(value: unknown) {
  const result = prepareCalendarArchiveObjectV1(value);
  if (result.status !== "prepared") assert.fail("Expected archive object.");
  return result.object;
}
function unavailable(result: CalendarArchiveResultV1, reason: string) {
  assert.equal(result.status, "unavailable");
  assert.ok("reason" in result && result.reason === reason, JSON.stringify(result));
  assert.ok(Object.isFrozen(result));
}
function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function memory() {
  const objects = new Map<string, Uint8Array>();
  const calls = { puts: 0, gets: 0 };
  const transport: CalendarArchiveTransportV1 = {
    putIfAbsent: async request => {
      calls.puts++;
      assert.equal(request.ifNoneMatch, "*");
      assert.equal(request.contentType, "application/json");
      assert.ok(request.signal instanceof AbortSignal);
      if (objects.has(request.objectKey)) return { status: 412 };
      objects.set(request.objectKey, Uint8Array.from(request.payloadBytes));
      return { status: 200 };
    },
    getAuthenticated: async request => {
      calls.gets++;
      const bytes = objects.get(request.objectKey);
      return bytes ? { status: 200, body: stream(Uint8Array.from(bytes)) } : { status: 404 };
    },
  };
  return { objects, calls, transport };
}
function deadline(transport: CalendarArchiveTransportV1) {
  let expire!: () => void;
  let cancelled = 0;
  const dependencies: CalendarArchiveDependenciesV1 = {
    transport, monotonicNow: () => 0,
    armDeadline: (callback, milliseconds) => {
      assert.equal(milliseconds, CALENDAR_ARCHIVE_TIMEOUT_MS_V1);
      expire = callback;
      return () => { cancelled++; };
    },
  };
  return { dependencies, expire: () => expire(), cancelled: () => cancelled };
}

test("versioned canonical serialization and domain-separated keys ignore property insertion order", async () => {
  const input = await record();
  const first = prepared(input);
  const reordered = Object.fromEntries(Object.entries(plain(input)).reverse());
  assert.equal(prepared(reordered).payload, first.payload);
  assert.equal(first.envelope.schemaVersion, CALENDAR_ARCHIVE_ENVELOPE_V1);
  assert.equal(first.envelope.namespace, CALENDAR_ARCHIVE_NAMESPACE_V1);
  const identity = createHash("sha256").update(JSON.stringify([
    CALENDAR_ARCHIVE_NAMESPACE_V1, "capture-identity", input.input.captureId,
  ])).digest("hex");
  assert.equal(first.envelope.objectKey, `calendar/captures/v1/${identity}.json`);
  assert.equal(first.payloadSha256, createHash("sha256").update(first.payload).digest("hex"));
  assert.notEqual(first.payloadSha256, input.recordSha256);
  const divergent = prepared(await record({ offset: 1000 }));
  assert.equal(divergent.envelope.objectKey, first.envelope.objectKey);
  assert.notEqual(divergent.payloadSha256, first.payloadSha256);
  assert.notEqual(prepared(await record({ captureId: "another-capture" })).envelope.objectKey, first.envelope.objectKey);
  assert.equal(prepared(await record({ publisher: "boj" })).envelope.objectKey, first.envelope.objectKey,
    "capture IDs are archive-wide, preventing cross-publisher ID reuse");
});

for (const publisher of ["ecb", "boj"] as const) {
  test(publisher + " original-byte fidelity, including BOM, survives full archive verification", async () => {
    const input = await record({ publisher, content: "\uFEFF" + captureHtmlFixtureV1(publisher) });
    const storage = memory();
    const result = await createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(input);
    assert.equal(result.status, "verified");
    const decoded = JSON.parse(Buffer.from(storage.objects.get(prepared(input).envelope.objectKey)!).toString("utf8"));
    assert.deepEqual(decoded.record, plain(input));
    const bytes = Buffer.from(decoded.record.input.bodyBase64Chunks.join(""), "base64");
    assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191]);
    assert.equal(bytes.toString("utf8"), "\uFEFF" + captureHtmlFixtureV1(publisher));
    assert.notEqual(input.input.acquisition.http.deliveredBodySha256, input.input.acquisition.extraction.document.htmlTextSha256);
  });
}

const invalidCases = ["schema", "hash", "event", "body", "missing-field", "unknown-field", "oversize", "proxy", "accessor"];
for (const kind of invalidCases) {
  test("invalid " + kind + " record fails before any transport", async () => {
    let input: unknown = plain(await record());
    const data = input as Record<string, unknown>;
    switch (kind) {
      case "schema": data.schemaVersion = "unsupported-v9"; break;
      case "hash": data.recordSha256 = "0".repeat(64); break;
      case "event": (data.eventVersions as { sha256: string }[])[0].sha256 = "0".repeat(64); break;
      case "body": ((data.input as Record<string, unknown>).bodyBase64Chunks as string[])[0] = "AAAA"; break;
      case "missing-field": delete data.acquisitionCutoff; break;
      case "unknown-field": data.secret = "synthetic-private"; break;
      case "oversize": (data.input as Record<string, unknown>).bodyBase64Chunks = Array(343).fill("A".repeat(2048)); break;
      case "proxy": input = new Proxy(data, { ownKeys() { assert.fail("Proxy trap executed"); } }); break;
      case "accessor": Object.defineProperty(data, "input", { get() { assert.fail("Getter executed"); }, enumerable: true }); break;
    }
    const storage = memory();
    unavailable(await createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(input), "invalid-record");
    assert.deepEqual(storage.calls, { puts: 0, gets: 0 });
  });
}

test("construction is inactive; creation and identical retry both require authenticated full GET", async () => {
  const storage = memory();
  const adapter = createCalendarArchiveAdapterV1({ transport: storage.transport });
  assert.deepEqual(storage.calls, { puts: 0, gets: 0 });
  const input = await record();
  const first = await adapter.archive(input);
  const second = await adapter.archive(plain(input));
  assert.equal(first.status, "verified");
  assert.equal(second.status, "verified");
  assert.equal(first.putObservation, "created");
  assert.equal(second.putObservation, "precondition-failed");
  assert.deepEqual(storage.calls, { puts: 2, gets: 2 });
  assert.equal(storage.objects.size, 1);
});

test("same capture identity with different valid content conflicts without overwrite", async () => {
  const storage = memory();
  const adapter = createCalendarArchiveAdapterV1({ transport: storage.transport });
  const first = await record();
  await adapter.archive(first);
  const before = Buffer.from(storage.objects.get(prepared(first).envelope.objectKey)!);
  unavailable(await adapter.archive(await record({ offset: 1000 })), "conflict");
  assert.deepEqual(storage.objects.get(prepared(first).envelope.objectKey), new Uint8Array(before));
  assert.equal(storage.objects.size, 1);
});

test("64 independent concurrent adapters with divergent records have one winner", async () => {
  const storage = memory();
  const inputs = await Promise.all(Array.from({ length: 64 }, (_, offset) => record({ offset: offset * 1000 })));
  const results = await Promise.all(inputs.map(input => createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(input)));
  assert.equal(results.filter(result => result.status === "verified").length, 1);
  assert.equal(results.filter(result => result.status === "unavailable" && result.reason === "conflict").length, 63);
  assert.equal(storage.objects.size, 1);
  assert.deepEqual(storage.calls, { puts: 64, gets: 64 });
});

test("64 identical concurrent writers verify one creation and 63 retries", async () => {
  const storage = memory();
  const input = await record();
  const results = await Promise.all(Array.from({ length: 64 }, () => createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(input)));
  assert.ok(results.every(result => result.status === "verified"));
  assert.equal(results.filter(result => result.putObservation === "created").length, 1);
  assert.equal(results.filter(result => result.putObservation === "precondition-failed").length, 63);
});

test("lost PUT reply after commit is reconciled by full GET without claiming creation", async () => {
  const storage = memory();
  const adapter = createCalendarArchiveAdapterV1({ transport: { ...storage.transport, putIfAbsent: async request => {
    await storage.transport.putIfAbsent(request);
    throw new Error("synthetic-private-network-detail");
  } } });
  const result = await adapter.archive(await record());
  assert.equal(result.status, "verified");
  assert.equal(result.putObservation, "outcome-unknown");
  assert.ok(!JSON.stringify(result).includes("synthetic-private"));
});

test("lost PUT reply plus GET 404 remains uncertain; late commit reconciles on conditional retry", async () => {
  const storage = memory();
  let lateCommit!: () => Promise<unknown>;
  const adapter = createCalendarArchiveAdapterV1({ transport: { ...storage.transport, putIfAbsent: async request => {
    lateCommit = () => storage.transport.putIfAbsent(request);
    throw new Error("lost reply while write is in flight");
  } } });
  const input = await record();
  const uncertain = await adapter.archive(input);
  unavailable(uncertain, "outcome-unknown");
  assert.equal(uncertain.putObservation, "outcome-unknown");
  // An aborted client request cannot cancel or disprove server-side commitment.
  await lateCommit();
  const retry = await createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(input);
  assert.equal(retry.status, "verified");
  assert.equal(retry.putObservation, "precondition-failed");
  assert.equal(storage.objects.size, 1);
});

test("uncertain write can safely lose to divergent content without overwriting the winner", async () => {
  const storage = memory();
  const first = await record();
  const second = await record({ offset: 1000 });
  const firstObject = prepared(first);
  const failed = createCalendarArchiveAdapterV1({ transport: { ...storage.transport, putIfAbsent: async () => { throw new Error(); } } });
  unavailable(await failed.archive(first), "outcome-unknown");
  await createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(second);
  assert.equal((await storage.transport.putIfAbsent({ objectKey: firstObject.envelope.objectKey, ifNoneMatch: "*",
    contentType: "application/json", payloadBytes: Buffer.from(firstObject.payload), signal: new AbortController().signal })).status, 412);
  unavailable(await createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(first), "conflict");
});

for (const putStatus of [200, 412] as const) {
  test("GET 404 after PUT " + putStatus + " never reports verified or permanent absence", async () => {
    const adapter = createCalendarArchiveAdapterV1({ transport: {
      putIfAbsent: async () => ({ status: putStatus }), getAuthenticated: async () => ({ status: 404 }),
    } });
    unavailable(await adapter.archive(await record()), "verification-unavailable");
  });
}

for (const kind of ["corrupt", "truncated", "invalid-utf8", "json-bom", "duplicate-key", "whitespace", "unknown-field", "wrong-key", "wrong-version", "wrong-record-hash", "wrong-body"] as const) {
  test("GET rejects " + kind + " payload despite forged metadata and ETag", async () => {
    const input = await record();
    const expected = prepared(input);
    const parsed = JSON.parse(expected.payload);
    let payload = expected.payload;
    switch (kind) {
      case "corrupt": payload = "not json"; break;
      case "truncated": payload = payload.slice(0, -1); break;
      case "json-bom": payload = "\uFEFF" + payload; break;
      case "duplicate-key": payload = '{"namespace":"forged",' + payload.slice(1); break;
      case "whitespace": payload += "\n"; break;
      case "unknown-field": parsed.secret = "synthetic-forged"; payload = JSON.stringify(parsed); break;
      case "wrong-key": parsed.objectKey = "calendar/captures/v1/wrong.json"; payload = JSON.stringify(parsed); break;
      case "wrong-version": parsed.schemaVersion = "archive-v99"; payload = JSON.stringify(parsed); break;
      case "wrong-record-hash": parsed.record.recordSha256 = "0".repeat(64); payload = JSON.stringify(parsed); break;
      case "wrong-body": parsed.record.input.bodyBase64Chunks[0] = "AAAA"; payload = JSON.stringify(parsed); break;
    }
    const bytes = kind === "invalid-utf8" ? new Uint8Array([0xff]) : Buffer.from(payload);
    const adapter = createCalendarArchiveAdapterV1({ transport: {
      putIfAbsent: async () => ({ status: 412 }),
      getAuthenticated: async () => ({ status: 200, body: stream(bytes), metadata: { sha256: expected.payloadSha256 }, etag: expected.payloadSha256 }),
    } });
    unavailable(await adapter.archive(input), "invalid-stored-object");
  });
}

test("forged metadata on a valid object is ignored in favor of full payload verification", async () => {
  const storage = memory();
  const adapter = createCalendarArchiveAdapterV1({ transport: { ...storage.transport,
    getAuthenticated: async request => ({ ...await storage.transport.getAuthenticated(request), metadata: { sha256: "wrong" }, etag: "wrong" }),
  } });
  assert.equal((await adapter.archive(await record())).status, "verified");
});

for (const kind of ["oversized", "too-many-chunks", "empty", "stream-error"] as const) {
  test("bounded GET rejects " + kind + " and cancels the stream", async () => {
    let cancelled = 0;
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        emitted++;
        if (kind === "oversized") controller.enqueue(new Uint8Array(CALENDAR_ARCHIVE_MAX_BYTES_V1 + 1));
        else if (kind === "too-many-chunks") controller.enqueue(new Uint8Array());
        else if (kind === "empty") controller.close();
        else controller.error(new Error("synthetic-private-stream-detail"));
      },
      cancel() { cancelled++; },
    });
    const result = await createCalendarArchiveAdapterV1({ transport: {
      putIfAbsent: async () => ({ status: 412 }), getAuthenticated: async () => ({ status: 200, body }),
    } }).archive(await record());
    unavailable(result, kind === "oversized" ? "object-too-large" : kind === "stream-error" ? "verification-unavailable" : "invalid-stored-object");
    assert.ok(!JSON.stringify(result).includes("synthetic-private"));
    if (kind === "oversized" || kind === "too-many-chunks") assert.equal(cancelled, 1);
    if (kind === "too-many-chunks") assert.ok(emitted <= CALENDAR_ARCHIVE_MAX_CHUNKS_V1 + 2);
  });
}

test("stalled PUT times out ambiguously and late completion cannot initiate GET", async () => {
  const started = deferred<void>();
  const completed = deferred<{ status: 200 }>();
  let gets = 0;
  let signal!: AbortSignal;
  const timer = deadline({
    putIfAbsent: async request => { signal = request.signal; started.resolve(); return completed.promise; },
    getAuthenticated: async () => { gets++; return { status: 404 }; },
  });
  const pending = createCalendarArchiveAdapterV1(timer.dependencies).archive(await record());
  await started.promise;
  timer.expire();
  unavailable(await pending, "outcome-unknown");
  assert.equal(signal.aborted, true);
  completed.resolve({ status: 200 });
  await tick();
  assert.equal(gets, 0);
  assert.equal(timer.cancelled(), 1);
});

test("stalled GET headers time out; late body is cancelled without parsing", async () => {
  const started = deferred<void>();
  const completed = deferred<{ status: 200; body: ReadableStream<Uint8Array> }>();
  let cancelled = 0;
  const timer = deadline({
    putIfAbsent: async () => ({ status: 412 }),
    getAuthenticated: async () => { started.resolve(); return completed.promise; },
  });
  const pending = createCalendarArchiveAdapterV1(timer.dependencies).archive(await record());
  await started.promise;
  timer.expire();
  unavailable(await pending, "timeout");
  completed.resolve({ status: 200, body: new ReadableStream({ cancel() { cancelled++; } }) });
  await tick();
  assert.equal(cancelled, 1);
  assert.equal(timer.cancelled(), 1);
});

test("stalled GET body times out and pending read is cancelled", async () => {
  const reading = deferred<void>();
  let cancelled = 0;
  const timer = deadline({
    putIfAbsent: async () => ({ status: 200 }),
    getAuthenticated: async () => ({ status: 200, body: new ReadableStream({
      pull() { reading.resolve(); }, cancel() { cancelled++; },
    }) }),
  });
  const pending = createCalendarArchiveAdapterV1(timer.dependencies).archive(await record());
  await reading.promise;
  timer.expire();
  unavailable(await pending, "timeout");
  assert.equal(cancelled, 1);
});

test("elapsed clock rejects late completed bodies even if deadline callback was delayed", async () => {
  const input = await record();
  let elapsed = 0;
  let cancelled = 0;
  const expected = prepared(input);
  const adapter = createCalendarArchiveAdapterV1({ monotonicNow: () => elapsed,
    armDeadline: () => () => {}, transport: {
      putIfAbsent: async () => ({ status: 412 }),
      getAuthenticated: async () => {
        elapsed = CALENDAR_ARCHIVE_TIMEOUT_MS_V1;
        return { status: 200, body: new ReadableStream({
          start(controller) { controller.enqueue(Buffer.from(expected.payload)); }, cancel() { cancelled++; },
        }) };
      },
    },
  });
  unavailable(await adapter.archive(input), "timeout");
  assert.equal(cancelled, 1);
});

test("clock regression and unavailable elapsed clocks fail without disclosing errors", async () => {
  const storage = memory();
  const input = await record();
  for (const monotonicNow of [() => NaN, () => { throw new Error("private-clock-detail"); }]) {
    unavailable(await createCalendarArchiveAdapterV1({ transport: storage.transport, monotonicNow }).archive(input), "clock-unavailable");
  }
  assert.equal(storage.calls.puts, 0);
  let calls = 0;
  unavailable(await createCalendarArchiveAdapterV1({ transport: storage.transport, monotonicNow: () => calls++ === 0 ? 10 : 9 }).archive(input), "clock-unavailable");
  assert.equal(storage.calls.puts, 0);
});

test("failed or synchronously expired deadline setup prevents storage operations", async () => {
  const storage = memory();
  const input = await record();
  const broken = createCalendarArchiveAdapterV1({ transport: storage.transport, armDeadline: () => {
    throw new Error("synthetic-private-timer-detail");
  } });
  unavailable(await broken.archive(input), "verification-unavailable");
  const expired = createCalendarArchiveAdapterV1({ transport: storage.transport, armDeadline: callback => {
    callback(); return () => {};
  } });
  unavailable(await expired.archive(input), "timeout");
  assert.deepEqual(storage.calls, { puts: 0, gets: 0 });
});

test("shared elapsed budget spans PUT and GET body reads", async () => {
  const input = await record();
  const expected = prepared(input);
  let elapsed = 0;
  const adapter = createCalendarArchiveAdapterV1({ monotonicNow: () => elapsed, armDeadline: () => () => {}, transport: {
    putIfAbsent: async () => { elapsed = 6000; return { status: 200 }; },
    getAuthenticated: async () => ({ status: 200, body: new ReadableStream({ pull(controller) {
      elapsed = 10000;
      controller.enqueue(Buffer.from(expected.payload)); controller.close();
    } }) }),
  } });
  unavailable(await adapter.archive(input), "timeout");
});

test("multiple bounded chunks preserve exact payload and are detached during reads", async () => {
  const input = await record();
  const bytes = Buffer.from(prepared(input).payload);
  let offset = 0;
  const adapter = createCalendarArchiveAdapterV1({ transport: {
    putIfAbsent: async () => ({ status: 412 }),
    getAuthenticated: async () => ({ status: 200, body: new ReadableStream({ pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(offset + 17, bytes.length);
      controller.enqueue(bytes.subarray(offset, end)); offset = end;
    } }) }),
  } });
  assert.equal((await adapter.archive(input)).status, "verified");
});

test("GET errors retain uncertain PUT observations and never expose transport details", async () => {
  const adapter = createCalendarArchiveAdapterV1({ transport: {
    putIfAbsent: async () => { throw new Error("synthetic-private-put-detail"); },
    getAuthenticated: async () => { throw new Error("synthetic-private-get-detail"); },
  } });
  const result = await adapter.archive(await record());
  unavailable(result, "verification-unavailable");
  assert.equal(result.putObservation, "outcome-unknown");
  assert.ok(!JSON.stringify(result).includes("synthetic-private"));
});

test("input and transport-owned byte mutation cannot alter the detached expected object", async () => {
  const input = plain(await record());
  const expected = prepared(input);
  const storage = memory();
  const adapter = createCalendarArchiveAdapterV1({ transport: { ...storage.transport, putIfAbsent: async request => {
    (input as { recordSha256: string }).recordSha256 = "0".repeat(64);
    const result = await storage.transport.putIfAbsent(request);
    request.payloadBytes.fill(0);
    return result;
  } } });
  const result = await adapter.archive(input);
  assert.equal(result.status, "verified");
  assert.ok("payloadSha256" in result && result.payloadSha256 === expected.payloadSha256);
  assert.equal(Buffer.from(storage.objects.get(expected.envelope.objectKey)!).toString("utf8"), expected.payload);
});

test("successful archive observations never admit canonical history or fabricate receipts", async () => {
  const storage = memory();
  const input = await record();
  const result = await createCalendarArchiveAdapterV1({ transport: storage.transport }).archive(input);
  assert.equal(result.status, "verified");
  assert.equal(result.scope, "injected-archive-only");
  assert.deepEqual(Object.keys(result).sort(), ["objectKey", "payloadSha256", "putObservation", "recordSha256", "scope", "status"]);
  for (const { event } of input.eventVersions) {
    assert.equal(selectCalendarEventAsOfV1({ versions: [event], knowledgeCutoff: "9999-12-31T23:59:59.999Z",
      evaluatedAt: "9999-12-31T23:59:59.999Z" }).status, "unavailable");
    assert.equal(event.timing.persistence.status, "not-persisted");
    assert.equal(event.timing.evidenceAvailability.status, "unavailable");
  }
  assert.equal(input.durablePersistence.status, "unavailable");
  assert.equal(input.evidenceAvailability.status, "unavailable");
});

test("adapter source remains isolated from production SDK, environment, acquisition and wall clocks", () => {
  const source = readFileSync(new URL("../../calendar/captureArchive.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /@aws-sdk|@upstash|process\.|fetch\(|Date\.now|new Date|officialScheduleAcquisition|r2Production|createOfflineCalendarJournal/);
  assert.match(source, /^import "server-only";/);
});
