import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { after, mock, test } from "node:test";
import {
  R2_QUALIFICATION_PLAN_V1, R2_QUALIFICATION_APPROVAL_V1, R2_QUALIFICATION_CEILINGS_V1,
  prepareR2CaptureArchiveQualificationV1, executeR2CaptureArchiveQualificationV1,
  type R2QualificationManifestV1, type R2QualificationDependenciesV1,
} from "../../calendar/r2CaptureArchiveQualification";
import { readCalendarCaptureRecordV1 } from "../../calendar/capturePersistence";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import type { CalendarArchiveTransportV1 } from "../../calendar/captureArchive";

const sockets = mock.method(Socket.prototype, "connect", () => { assert.fail("Qualification must never open a real socket."); });
after(() => { try { assert.equal(sockets.mock.callCount(), 0); } finally { sockets.mock.restore(); } });
const wall = Date.UTC(2026, 9, 17);
let serial = 0;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function input(limits: Partial<{ [K in keyof typeof R2_QUALIFICATION_CEILINGS_V1]: number }> = {}) {
  return { schemaVersion: R2_QUALIFICATION_PLAN_V1, runId: "offline-run-" + serial++,
    target: { accountId: "a".repeat(32), jurisdiction: "default", bucket: { name: "synthetic-qualification-only",
      purpose: "dedicated-calendar-capture-archive", environment: "non-production" } },
    limits: { ...R2_QUALIFICATION_CEILINGS_V1, ...limits } };
}
function consent(manifest: R2QualificationManifestV1) {
  return { schemaVersion: R2_QUALIFICATION_APPROVAL_V1, mode: "offline-simulation", approvalId: "offline-approval-" + serial++,
    accountId: manifest.plan.target.accountId, bucket: manifest.plan.target.bucket.name, runId: manifest.plan.runId,
    manifestSha256: manifest.manifestSha256, expiresAt: wall + 120_000 };
}
function memory() {
  const stored = new Map<string, Uint8Array>();
  const calls = { puts: 0, gets: 0 };
  const signals: AbortSignal[] = [];
  const transport = {
    putIfAbsent: async (request: Parameters<CalendarArchiveTransportV1["putIfAbsent"]>[0]): ReturnType<CalendarArchiveTransportV1["putIfAbsent"]> => {
      calls.puts++; signals.push(request.signal);
      assert.equal(request.ifNoneMatch, "*"); assert.equal(request.contentType, "application/json");
      assert.match(request.objectKey, /^calendar\/captures\/v1\/[a-f0-9]{64}\.json$/);
      if (stored.has(request.objectKey)) return { status: 412 };
      stored.set(request.objectKey, Uint8Array.from(request.payloadBytes)); return { status: 200 };
    },
    getAuthenticated: async (request: Parameters<CalendarArchiveTransportV1["getAuthenticated"]>[0]): ReturnType<CalendarArchiveTransportV1["getAuthenticated"]> => {
      calls.gets++; signals.push(request.signal);
      const bytes = stored.get(request.objectKey);
      return bytes ? { status: 200, body: new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(Uint8Array.from(bytes)); controller.close();
      } }) } : { status: 404 };
    },
  };
  return { stored, calls, signals, transport };
}
function clock() {
  let elapsed = 0;
  const timers: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  return { timers, advance: (ms: number) => { elapsed = ms; },
    capabilities: { now: () => wall + elapsed, monotonicNow: () => elapsed,
      armDeadline: (callback: () => void, ms: number) => {
        const timer = { callback, ms, cancelled: false }; timers.push(timer);
        return () => { timer.cancelled = true; };
      } } };
}
function setup(limits: Parameters<typeof input>[0] = {}) {
  const manifest = prepareR2CaptureArchiveQualificationV1(input(limits));
  const approval = consent(manifest); const store = memory(); const time = clock();
  let constructed = 0;
  const dependencies: R2QualificationDependenciesV1 = { ...time.capabilities,
    createOfflineTransport: () => { constructed++; return store.transport; } };
  return { manifest, approval, store, time, dependencies, constructed: () => constructed };
}

test("pure deterministic manifest is detached, versioned, bounded and preserves canonical keys", () => {
  const value = input(); const first = prepareR2CaptureArchiveQualificationV1(value);
  assert.deepEqual(prepareR2CaptureArchiveQualificationV1(JSON.parse(JSON.stringify(value))), first);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.plan.target.bucket));
  assert.equal(first.fixtures.length, 8); assert.equal(new Set(first.fixtures.map(item => item.objectKey)).size, 6);
  assert.equal(first.cases.length, 9); assert.match(first.manifestSha256, /^[a-f0-9]{64}$/);
  for (const fixture of first.fixtures) {
    assert.ok(fixture.captureId.includes(value.runId));
    assert.match(fixture.objectKey, /^calendar\/captures\/v1\/[a-f0-9]{64}\.json$/);
  }
  value.runId = "detached"; value.target.bucket.name = "changed-bucket";
  assert.notEqual(first.plan.runId, value.runId);
  const second = prepareR2CaptureArchiveQualificationV1(value);
  assert.notEqual(first.manifestSha256, second.manifestSha256);
  assert.notEqual(first.fixtures[0].objectKey, second.fixtures[0].objectKey);
});

for (const [field, value] of [["writableKeys", 9], ["writableKeys", 5], ["puts", 33], ["gets", 65],
  ["concurrency", 3], ["concurrency", 0], ["durationMs", 120001], ["durationMs", 0], ["puts", -1], ["gets", 1.5]] as const) {
  test("preparation rejects invalid ceiling " + field + "=" + value, () => {
    const request = input(); Object.assign(request.limits, { [field]: value });
    assert.throws(() => prepareR2CaptureArchiveQualificationV1(request));
  });
}
for (const field of ["records", "fixtures", "endpoint", "credentials"] as const) {
  test("preparation rejects external " + field, () => {
    assert.throws(() => prepareR2CaptureArchiveQualificationV1({ ...input(), [field]: "untrusted-external-input" }));
  });
}
test("configuration rejects production declarations, backup bucket, endpoint injection and unsupported jurisdiction", () => {
  for (const change of [{ bucket: { name: "chronoverse-backups", purpose: "dedicated-calendar-capture-archive", environment: "non-production" } },
    { jurisdiction: "eu" }, { endpoint: "https://invalid.invalid" }, { accountId: "bad" },
    { bucket: { name: "synthetic-test", purpose: "dedicated-calendar-capture-archive", environment: "production" } }]) {
    const request = input(); Object.assign(request.target, change);
    assert.throws(() => prepareR2CaptureArchiveQualificationV1(request));
  }
  let accessed = false;
  const request = input(); Object.defineProperty(request, "runId", { get() { accessed = true; return "getter"; } });
  assert.throws(() => prepareR2CaptureArchiveQualificationV1(request)); assert.equal(accessed, false);
});

test("manifest payload, digest, target, cases and missing key mutations reject before factory invocation", async () => {
  const h = setup();
  for (const modify of [
    (value: Record<string, unknown>) => { value.manifestSha256 = "b".repeat(64); },
    (value: Record<string, unknown>) => { value.fixtures = []; },
    (value: Record<string, unknown>) => { value.cases = []; },
    (value: Record<string, unknown>) => { value.missingObjectKey = h.manifest.fixtures[0].objectKey; },
    (value: Record<string, unknown>) => { value.fixtureVersion = "external-evidence"; },
    (value: Record<string, unknown>) => { value.plan = input(); },
  ]) {
    const value: Record<string, unknown> = JSON.parse(JSON.stringify(h.manifest)); modify(value);
    assert.equal((await executeR2CaptureArchiveQualificationV1(value, h.approval, h.dependencies)).reason, "invalid-manifest");
  }
  assert.equal(h.constructed(), 0);
});
for (const field of ["accountId", "bucket", "runId", "manifestSha256", "schemaVersion", "mode", "approvalId"] as const) {
  test("approval binds " + field + " before transport construction", async () => {
    const h = setup();
    const result = await executeR2CaptureArchiveQualificationV1(h.manifest, { ...h.approval, [field]: "mismatch!" }, h.dependencies);
    assert.equal(result.reason, "invalid-approval"); assert.equal(h.constructed(), 0);
  });
}
test("missing, expired, excessive-lifetime and accessor approvals reject without transport", async () => {
  const h = setup();
  const accessor = { ...h.approval }; let accessed = false;
  Object.defineProperty(accessor, "approvalId", { get() { accessed = true; return "unsafe"; } });
  for (const approval of [undefined, {}, accessor, { ...h.approval, expiresAt: wall },
    { ...h.approval, expiresAt: wall + 120001 }, { ...h.approval, expiresAt: Number.NaN }]) {
    assert.equal((await executeR2CaptureArchiveQualificationV1(h.manifest, approval, h.dependencies)).reason, "invalid-approval");
  }
  assert.equal(h.constructed(), 0); assert.equal(accessed, false);
});
test("live execution always blocks because durable replay coordination is unavailable", async () => {
  const h = setup();
  const result = await executeR2CaptureArchiveQualificationV1(h.manifest, { ...h.approval, mode: "live" }, h.dependencies);
  assert.equal(result.reason, "live-replay-unavailable"); assert.equal(result.status, "blocked");
  assert.equal(h.constructed(), 0); assert.deepEqual(result.attempts, { puts: 0, gets: 0, peakConcurrency: 0 });
});

test("all nine scenarios run only synthetic records, account for hidden GETs, and retain historical refusal", async () => {
  const h = setup(); const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  assert.equal(result.status, "completed"); assert.equal(result.scope, "offline-qualification-only");
  assert.deepEqual(result.observations.map(item => item.outcome), [...Array<string>(8).fill("pass"), "unknown"]);
  assert.ok(result.observations.every(item => item.basis === "offline-simulation"));
  assert.deepEqual(result.attempts, { puts: 10, gets: 11, peakConcurrency: 2 });
  assert.deepEqual(h.store.calls, { puts: 10, gets: 10 }); // Aborted verification attempt is counted but never dispatched.
  assert.equal(h.store.stored.size, 6); assert.ok(h.time.timers.every(timer => timer.cancelled));
  assert.ok(h.store.signals.every(signal => signal.aborted));
  for (const [key, bytes] of h.store.stored) {
    const envelope = JSON.parse(Buffer.from(bytes).toString("utf8"));
    const record = readCalendarCaptureRecordV1(envelope.record);
    assert.equal(envelope.objectKey, key); assert.ok(record.input.captureId.includes(h.manifest.plan.runId));
    assert.equal(record.evidenceAvailability.status, "unavailable"); assert.equal(record.durablePersistence.status, "unavailable");
    for (const { event } of record.eventVersions) {
      assert.equal(selectCalendarEventAsOfV1({ versions: [event], knowledgeCutoff: "9999-12-31T23:59:59.999Z",
        evaluatedAt: "9999-12-31T23:59:59.999Z" }).status, "unavailable");
    }
  }
  const bom = h.manifest.fixtures.find(item => item.id === "bom"); assert.ok(bom);
  const envelope = JSON.parse(Buffer.from(h.store.stored.get(bom.objectKey)!).toString("utf8"));
  assert.deepEqual([...Buffer.from(envelope.record.input.bodyBase64Chunks.join(""), "base64").subarray(0, 3)], [239, 187, 191]);
  const replay = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  assert.equal(replay.reason, "invalid-approval"); assert.equal(h.constructed(), 1);
  assert.equal((await executeR2CaptureArchiveQualificationV1(h.manifest, consent(h.manifest), h.dependencies)).reason, "invalid-approval");
  const other = setup();
  assert.equal((await executeR2CaptureArchiveQualificationV1(other.manifest,
    { ...other.approval, approvalId: h.approval.approvalId }, other.dependencies)).reason, "invalid-approval");
});

for (const puts of [0, 1, 2, 3, 7, 10, 32]) {
  test("PUT budget is enforced before dispatch at " + puts, async () => {
    const h = setup({ puts });
    const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
    assert.ok(result.attempts.puts <= puts); assert.ok(h.store.calls.puts <= result.attempts.puts);
    assert.equal(result.status, puts < 10 ? "stopped" : "completed");
    if (puts < 10) { assert.equal(result.reason, "budget"); assert.equal(result.attempts.puts, puts); }
  });
}
for (const gets of [0, 1, 2, 5, 10, 11, 64]) {
  test("GET budget includes adapter verification and cancelled attempts at " + gets, async () => {
    const h = setup({ gets });
    const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
    assert.ok(result.attempts.gets <= gets); assert.ok(h.store.calls.gets <= result.attempts.gets);
    assert.equal(result.status, gets < 11 ? "stopped" : "completed");
    if (gets < 11) { assert.equal(result.reason, "budget"); assert.equal(result.attempts.gets, gets); }
  });
}
test("lower concurrency is authoritative and concurrent approval reuse cannot construct a second store", async () => {
  const h = setup({ concurrency: 1 });
  const first = executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  const replay = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  assert.equal(replay.reason, "invalid-approval"); assert.equal(h.constructed(), 1);
  const result = await first; assert.equal(result.status, "completed"); assert.equal(result.attempts.peakConcurrency, 1);
});
for (const code of ["429 TooManyRequests", "403 AccessDenied", "404 NoSuchBucket", "redirect", "timeout"]) {
  test("generic " + code + " with divergent GET never qualifies a conflict or exposes raw errors", async () => {
    const h = setup(); const base = h.store.transport.putIfAbsent;
    let calls = 0;
    h.store.transport.putIfAbsent = async request => {
      if (++calls === 3) throw new Error(code + " private-secret-details");
      return base(request);
    };
    const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
    assert.equal(result.observations.find(item => item.case === "divergent-conflict")?.outcome, "unknown");
    assert.ok(!JSON.stringify(result).includes("private-secret-details")); assert.ok(!JSON.stringify(result).includes(code));
  });
}
test("missing-object permission failure is inconclusive, never absence", async () => {
  const h = setup(); const base = h.store.transport.getAuthenticated;
  h.store.transport.getAuthenticated = async request => {
    if (request.objectKey === h.manifest.missingObjectKey) throw new Error("403 private-detail");
    return base(request);
  };
  const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  assert.equal(result.observations.find(item => item.case === "missing-object")?.outcome, "inconclusive");
});
test("run deadline aborts a stalled PUT, consumes approval and prevents late dispatch", async () => {
  const h = setup(); let dispatched = 0; let ownedSignal: AbortSignal | undefined;
  let resolve!: (value: { status: 200 }) => void;
  h.store.transport.putIfAbsent = request => {
    dispatched++; ownedSignal = request.signal; return new Promise(done => { resolve = done; });
  };
  const pending = executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  await tick(); assert.equal(dispatched, 1);
  h.time.advance(120000); h.time.timers[0].callback();
  const result = await pending; assert.equal(result.reason, "deadline"); assert.ok(ownedSignal?.aborted);
  resolve({ status: 200 }); await tick(); assert.equal(dispatched, 1); assert.equal(h.store.calls.gets, 0);
  assert.ok(h.time.timers.every(timer => timer.cancelled));
  assert.equal((await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies)).status, "blocked");
});
test("approval expiry shortens the run deadline", async () => {
  const h = setup(); h.approval.expiresAt = wall + 25;
  const pending = executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  assert.equal(h.time.timers[0].ms, 25);
  h.time.advance(25); h.time.timers[0].callback();
  assert.equal((await pending).reason, "deadline");
});
test("pre-cancelled run never constructs a transport and still consumes its offline approval", async () => {
  const h = setup(); const controller = new AbortController(); controller.abort();
  const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, { ...h.dependencies, signal: controller.signal });
  assert.equal(result.reason, "cancelled"); assert.equal(h.constructed(), 0);
  assert.equal((await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies)).reason, "invalid-approval");
});
test("clock failure and backward elapsed time fail closed", async () => {
  for (const bad of [Number.NaN, -1]) {
    const h = setup();
    const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, { ...h.dependencies, monotonicNow: () => bad });
    assert.equal(result.reason, "clock"); assert.equal(h.constructed(), 0);
  }
  const h = setup(); let reads = 0;
  const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval,
    { ...h.dependencies, monotonicNow: () => ++reads === 1 ? 10 : 9 });
  assert.equal(result.reason, "clock"); assert.equal(h.constructed(), 0);
});
test("concurrent verification streams have independent ownership and cancellation", async () => {
  const h = setup(); const base = h.store.transport.getAuthenticated;
  const raceKey = h.manifest.fixtures.find(item => item.id === "identical-race")!.objectKey;
  const streams: { controller: ReadableStreamDefaultController<Uint8Array>; signal: AbortSignal; cancelled: number }[] = [];
  h.store.transport.getAuthenticated = async request => {
    if (request.objectKey !== raceKey) return base(request);
    const state: { controller?: ReadableStreamDefaultController<Uint8Array>; signal: AbortSignal; cancelled: number } = { signal: request.signal, cancelled: 0 };
    const body = new ReadableStream<Uint8Array>({ start(controller) { state.controller = controller; }, cancel() { state.cancelled++; } });
    assert.ok(state.controller); streams.push({ ...state, controller: state.controller });
    return { status: 200, body };
  };
  const pending = executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies);
  for (let count = 0; count < 20 && streams.length < 2; count++) await tick();
  assert.equal(streams.length, 2); assert.notEqual(streams[0].signal, streams[1].signal);
  streams[0].controller.error(new Error("private-stream-failure")); await tick();
  assert.equal(streams[0].signal.aborted, true); assert.equal(streams[1].signal.aborted, false);
  streams[1].controller.enqueue(Uint8Array.from(h.store.stored.get(raceKey)!)); streams[1].controller.close();
  const result = await pending; assert.equal(result.status, "completed"); assert.ok(result.attempts.peakConcurrency <= 2);
  assert.ok(!JSON.stringify(result).includes("private-stream-failure"));
});
test("late GET response after parent cancellation is cancelled and cannot resume the run", async () => {
  const h = setup(); const parent = new AbortController();
  let resolve!: (value: Awaited<ReturnType<CalendarArchiveTransportV1["getAuthenticated"]>>) => void;
  h.store.transport.getAuthenticated = () => new Promise(done => { resolve = done; });
  const pending = executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, { ...h.dependencies, signal: parent.signal });
  await tick(); parent.abort(); const result = await pending; assert.equal(result.reason, "cancelled");
  let cancelled = 0;
  resolve({ status: 200, body: new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }) });
  await tick(); assert.equal(cancelled, 1); assert.equal(h.store.calls.puts, 1);
});
test("factory exceptions are sanitized and do not release an approval for reuse", async () => {
  const h = setup();
  const result = await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval,
    { ...h.dependencies, createOfflineTransport: () => { throw new Error("private-credential-detail"); } });
  assert.equal(result.reason, "transport"); assert.ok(!JSON.stringify(result).includes("private-credential-detail"));
  assert.equal((await executeR2CaptureArchiveQualificationV1(h.manifest, h.approval, h.dependencies)).reason, "invalid-approval");
});
test("source is server-only and has no environment loader, SDK factory, storage administration or activation", () => {
  const source = readFileSync(new URL("../../calendar/r2CaptureArchiveQualification.ts", import.meta.url), "utf8");
  assert.ok(source.startsWith('import "server-only";'));
  assert.doesNotMatch(source, /process\.env|fetch\(|S3Client|createR2CalendarCaptureArchiveTransportV1|DeleteObject|CreateBucket|ListObjects|sessionToken/);
});
