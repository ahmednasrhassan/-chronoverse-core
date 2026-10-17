import "server-only";

import { createHash } from "node:crypto";
import {
  createCalendarArchiveAdapterV1, prepareCalendarArchiveObjectV1,
  CALENDAR_ARCHIVE_MAX_BYTES_V1, CALENDAR_ARCHIVE_MAX_CHUNKS_V1,
  type CalendarArchiveResultV1, type CalendarArchiveTransportV1,
} from "./captureArchive";
import { CALENDAR_CAPTURE_INPUT_V1, prepareCalendarCaptureV1, type CalendarCaptureRecordV1 } from "./capturePersistence";
import { OFFICIAL_SCHEDULE_ACQUISITION_V1, OFFICIAL_SCHEDULE_SOURCES_V1 } from "./officialScheduleAcquisition";
import { OFFICIAL_SCHEDULE_DOCUMENT_V1, extractEcbOfficialScheduleHtmlV1 } from "./officialScheduleExtraction";
import { parseR2CalendarArchiveConfigV1, R2_CALENDAR_ARCHIVE_CONFIG_V1 } from "./r2CaptureArchiveConfig";
import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";

export const R2_QUALIFICATION_PLAN_V1 = "calendar-r2-qualification-plan-v1" as const;
export const R2_QUALIFICATION_MANIFEST_V1 = "calendar-r2-qualification-manifest-v1" as const;
export const R2_QUALIFICATION_APPROVAL_V1 = "calendar-r2-qualification-approval-v1" as const;
export const R2_QUALIFICATION_CEILINGS_V1 = Object.freeze({ writableKeys: 8, puts: 32, gets: 64, concurrency: 2, durationMs: 120_000 });
const fixtureVersion = "synthetic-ecb-qualification-v1";
const caseNames = ["fresh", "identical-retry", "divergent-conflict", "identical-writers", "divergent-writers",
  "bom-fidelity", "missing-object", "simulated-lost-ack", "controlled-abort"] as const;
type CaseName = typeof caseNames[number];
type Outcome = "pass" | "fail" | "inconclusive" | "unknown";
type Limits = { readonly [K in keyof typeof R2_QUALIFICATION_CEILINGS_V1]: number };
interface Target {
  readonly accountId: string;
  readonly jurisdiction: "default";
  readonly bucket: { readonly name: string; readonly purpose: "dedicated-calendar-capture-archive"; readonly environment: "non-production" };
}
interface Plan {
  readonly schemaVersion: typeof R2_QUALIFICATION_PLAN_V1;
  readonly runId: string;
  readonly target: Target;
  readonly limits: Limits;
}
interface Fixture {
  readonly id: string;
  readonly record: CalendarCaptureRecordV1;
  readonly objectKey: string;
  readonly payloadSha256: string;
  readonly payload: string;
}
export interface R2QualificationManifestV1 {
  readonly schemaVersion: typeof R2_QUALIFICATION_MANIFEST_V1;
  readonly plan: Plan;
  readonly fixtureVersion: string;
  readonly fixtures: readonly { readonly id: string; readonly captureId: string; readonly objectKey: string;
    readonly payloadSha256: string; readonly byteLength: number }[];
  readonly missingObjectKey: string;
  readonly cases: readonly CaseName[];
  readonly manifestSha256: string;
}
export interface R2QualificationObservationV1 {
  readonly case: CaseName;
  readonly outcome: Outcome;
  readonly basis: "offline-simulation";
}
type StopReason = "budget" | "deadline" | "cancelled" | "clock" | "transport";
export interface R2QualificationReportV1 {
  readonly scope: "offline-qualification-only";
  readonly status: "blocked" | "completed" | "stopped";
  readonly reason: "invalid-manifest" | "invalid-approval" | "live-replay-unavailable" | StopReason | null;
  readonly manifestSha256: string | null;
  readonly attempts: { readonly puts: number; readonly gets: number; readonly peakConcurrency: number };
  readonly observations: readonly R2QualificationObservationV1[];
}
export interface R2QualificationDependenciesV1 {
  /** Trusted OFFLINE capability only: no default transport, SDK or credentials.
   * A live mode request always blocks, even if this factory could supply R2. */
  readonly createOfflineTransport: () => CalendarArchiveTransportV1;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly monotonicNow?: () => number;
  readonly armDeadline?: (callback: () => void, milliseconds: number) => () => void;
}
class QualificationFailure extends Error {
  constructor() { super("Calendar R2 qualification unavailable."); }
}
function invalid(): never { throw new QualificationFailure(); }
function sha(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const data = value as Record<string, unknown>;
    return "{" + Object.keys(data).sort().map(key => JSON.stringify(key) + ":" + canonical(data[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? invalid();
}
function passive(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return calendarRecordV1(snapshotCalendarDataV1(value), keys);
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) invalid();
  return value;
}
function plan(value: unknown): Plan {
  const data = passive(value, ["schemaVersion", "runId", "target", "limits"]);
  if (data.schemaVersion !== R2_QUALIFICATION_PLAN_V1) invalid();
  const target = calendarRecordV1(data.target, ["accountId", "jurisdiction", "bucket"]);
  // Reuse the deployed closed configuration validator without requesting secrets.
  // These constants are synthetic placeholders, never usable credentials.
  const config = parseR2CalendarArchiveConfigV1({ ...target, schemaVersion: R2_CALENDAR_ARCHIVE_CONFIG_V1,
    accessKeyId: "offline-qualification-placeholder", secretAccessKey: "offline-qualification-placeholder" });
  const limits = calendarRecordV1(data.limits, Object.keys(R2_QUALIFICATION_CEILINGS_V1));
  for (const key of Object.keys(R2_QUALIFICATION_CEILINGS_V1) as (keyof Limits)[]) {
    const limit = limits[key];
    const minimum = key === "writableKeys" ? 6 : key === "concurrency" || key === "durationMs" ? 1 : 0;
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < minimum || limit > R2_QUALIFICATION_CEILINGS_V1[key]) invalid();
  }
  return Object.freeze({ schemaVersion: R2_QUALIFICATION_PLAN_V1, runId: identifier(data.runId),
    target: Object.freeze({ accountId: config.accountId, jurisdiction: config.jurisdiction, bucket: config.bucket }),
    limits: Object.freeze({ writableKeys: Number(limits.writableKeys), puts: Number(limits.puts), gets: Number(limits.gets),
      concurrency: Number(limits.concurrency), durationMs: Number(limits.durationMs) }) });
}
/** Pure synthetic HTTP observations. No fetch, file, supplied record or current clock. */
function fixture(runId: string, id: string, identity = id, variant = 0, bom = false): Fixture {
  const content = (bom ? "\uFEFF" : "") + '<main><h1>Schedules for the meetings of the Governing Council and General Council of the ECB and related press conferences</h1><dl><dt>29/10/2026</dt><dd>Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference<br></dd></dl></main>';
  const bytes = Buffer.from(content, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const source = OFFICIAL_SCHEDULE_SOURCES_V1.ecb;
  const extraction = extractEcbOfficialScheduleHtmlV1({ schemaVersion: OFFICIAL_SCHEDULE_DOCUMENT_V1, publisher: "ecb",
    sourceUrl: source.sourceUrl, documentId: "official-schedule:ecb:html", sourceVersionId: "sha256:" + digest,
    mediaType: "text/html", timeZone: source.timeZone, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) });
  if (extraction.status !== "available") invalid();
  const wall = Date.UTC(2026, 9, 16, 8) + variant * 1000;
  const instant = (offset: number) => new Date(wall + offset).toISOString();
  const capture = prepareCalendarCaptureV1({ schemaVersion: CALENDAR_CAPTURE_INPUT_V1,
    captureId: "r2-qualification:" + runId + ":" + identity, previousCaptureId: null,
    bodyBase64Chunks: bytes.toString("base64").match(/.{1,2048}/g),
    acquisition: { schemaVersion: OFFICIAL_SCHEDULE_ACQUISITION_V1, status: "acquired", network: "http-success",
      sourceAuthentication: "not-performed", evidenceAdmission: "not-certified", clockAccuracy: "unknown",
      historicalOwnership: "not-certified", sourceCurrency: "not-certified", sourceUrl: source.sourceUrl, startedAt: instant(0),
      timing: { acquisition: { status: "recorded", completedAt: instant(100) },
        evidenceAvailability: { status: "recorded", availableAt: instant(200) }, persistence: { status: "not-persisted" } },
      freshnessPolicy: { maximumAgeMilliseconds: 59000 }, freshness: { scope: "unverified-response-age",
        assessedAt: instant(200), expiresAt: instant(59200), observedAgeMilliseconds: 200 },
      http: { status: 200, responseDate: instant(0), ageSeconds: null, lastModified: null,
        receivedBytes: bytes.byteLength, deliveredBodySha256: digest }, extraction },
    bindings: extraction.rows.map((row, index) => ({ canonicalMeetingDate: row.eventTime.date,
      versionId: "synthetic-qualification-event-" + index, revision: { sequence: 1, supersedesVersionId: null, change: "initial" } })) });
  if (capture.status !== "prepared") invalid();
  const prepared = prepareCalendarArchiveObjectV1(capture.record);
  if (prepared.status !== "prepared") invalid();
  return { id, record: capture.record, objectKey: prepared.object.envelope.objectKey,
    payloadSha256: prepared.object.payloadSha256, payload: prepared.object.payload };
}
function fixtures(runId: string): readonly Fixture[] {
  return [fixture(runId, "fresh"), fixture(runId, "fresh-divergent", "fresh", 1), fixture(runId, "identical-race"),
    fixture(runId, "divergent-race-a", "divergent-race"), fixture(runId, "divergent-race-b", "divergent-race", 1),
    fixture(runId, "bom", "bom", 0, true), fixture(runId, "lost-ack"), fixture(runId, "abort")];
}
/** Deterministic versioned manifest; only an explicit plan is accepted. */
export function prepareR2CaptureArchiveQualificationV1(value: unknown): R2QualificationManifestV1 {
  const input = plan(value);
  const generated = fixtures(input.runId);
  if (new Set(generated.map(item => item.objectKey)).size > input.limits.writableKeys) invalid();
  const manifest = { schemaVersion: R2_QUALIFICATION_MANIFEST_V1, plan: input, fixtureVersion,
    fixtures: Object.freeze(generated.map(item => Object.freeze({ id: item.id, captureId: item.record.input.captureId,
      objectKey: item.objectKey, payloadSha256: item.payloadSha256, byteLength: Buffer.byteLength(item.payload, "utf8") }))),
    missingObjectKey: fixture(input.runId, "missing").objectKey, cases: Object.freeze([...caseNames]) };
  return Object.freeze({ ...manifest, manifestSha256: sha(canonical([R2_QUALIFICATION_MANIFEST_V1, manifest])) });
}

// OFFLINE replay guard only. Bounded, never evicted, never represented as durable.
const usedApprovals = new Set<string>();
const usedRuns = new Set<string>();
function approval(value: unknown, manifest: R2QualificationManifestV1, now: number): { mode: string; expiresAt: number; id: string; run: string } {
  const data = passive(value, ["schemaVersion", "mode", "approvalId", "accountId", "bucket", "runId", "manifestSha256", "expiresAt"]);
  if (data.schemaVersion !== R2_QUALIFICATION_APPROVAL_V1 || (data.mode !== "offline-simulation" && data.mode !== "live") ||
      data.accountId !== manifest.plan.target.accountId || data.bucket !== manifest.plan.target.bucket.name ||
      data.runId !== manifest.plan.runId || data.manifestSha256 !== manifest.manifestSha256 ||
      !Number.isSafeInteger(now) || now < 0 || typeof data.expiresAt !== "number" || !Number.isSafeInteger(data.expiresAt) ||
      data.expiresAt <= now || data.expiresAt - now > R2_QUALIFICATION_CEILINGS_V1.durationMs) invalid();
  const id = identifier(data.approvalId);
  const run = sha(canonical([manifest.plan.target, manifest.plan.runId]));
  if (usedApprovals.has(id) || usedRuns.has(run) || usedApprovals.size >= 1024) invalid();
  return { mode: data.mode, expiresAt: data.expiresAt, id, run };
}
function report(status: R2QualificationReportV1["status"], reason: R2QualificationReportV1["reason"],
  manifestSha256: string | null, attempts = { puts: 0, gets: 0, peakConcurrency: 0 }, observations: readonly R2QualificationObservationV1[] = []): R2QualificationReportV1 {
  return Object.freeze({ scope: "offline-qualification-only", status, reason, manifestSha256,
    attempts: Object.freeze({ ...attempts }), observations: Object.freeze([...observations]) });
}
const quiet = () => {};
function cancel(body: ReadableStream<Uint8Array>): void { try { void body.cancel().catch(quiet); } catch { /* Best effort. */ } }

/** Live execution ALWAYS blocks: durable approval/replay coordination is absent.
 * The only runnable mode requires a trusted explicitly injected offline store. */
export async function executeR2CaptureArchiveQualificationV1(
  manifestInput: unknown, approvalInput: unknown, dependencies: R2QualificationDependenciesV1,
): Promise<R2QualificationReportV1> {
  const monotonic = dependencies.monotonicNow ?? performance.now.bind(performance);
  const wallNow = dependencies.now ?? Date.now;
  let started: number;
  let executionWall: number;
  try {
    started = monotonic(); executionWall = wallNow();
    if (!Number.isFinite(started) || started < 0 || !Number.isSafeInteger(executionWall) || executionWall < 0) invalid();
  } catch { return report("stopped", "clock", null); }
  let manifest: R2QualificationManifestV1;
  try {
    const data = passive(manifestInput, ["schemaVersion", "plan", "fixtureVersion", "fixtures", "missingObjectKey", "cases", "manifestSha256"]);
    manifest = prepareR2CaptureArchiveQualificationV1(data.plan);
    if (canonical(data) !== canonical(manifest)) invalid();
  } catch { return report("blocked", "invalid-manifest", null); }
  let consent: ReturnType<typeof approval>;
  try { consent = approval(approvalInput, manifest, wallNow()); }
  catch { return report("blocked", "invalid-approval", manifest.manifestSha256); }
  if (consent.mode === "live") return report("blocked", "live-replay-unavailable", manifest.manifestSha256);
  // Consume synchronously before factory invocation/await; failed or cancelled runs
  // cannot reuse their approval or run identity in this process.
  usedApprovals.add(consent.id); usedRuns.add(consent.run);
  const arm = dependencies.armDeadline ?? ((callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  const runController = new AbortController();
  const counters = { puts: 0, gets: 0, peakConcurrency: 0 };
  const observations: R2QualificationObservationV1[] = [];
  const limits = manifest.plan.limits;
  const generated = fixtures(manifest.plan.runId);
  const payloads = new Map(generated.map(item => [item.objectKey + ":" + item.payloadSha256, item.payload]));
  const writable = new Set(generated.map(item => item.objectKey));
  const readable = new Set([...writable, manifest.missingObjectKey]);
  const wakeups = new Set<() => void>();
  let active = 0;
  let stopped: StopReason | null = null;
  let cancelTimer = quiet;
  let previous = started;
  let duration = 0;
  function stop(reason: StopReason): never { stopped ??= reason; runController.abort(); throw new QualificationFailure(); }
  const parentAbort = () => { stopped ??= "cancelled"; runController.abort(); };
  function check(): void {
    if (runController.signal.aborted) throw new QualificationFailure();
    let current: number;
    try { current = monotonic(); } catch { return stop("clock"); }
    if (!Number.isFinite(current) || current < previous || current < 0) stop("clock");
    previous = current;
    if (current - started >= duration) stop("deadline");
  }
  function count(method: "puts" | "gets"): void {
    if (counters[method] >= limits[method]) stop("budget");
    counters[method]++; // Includes cancelled attempts and every adapter verification GET.
    check();
  }
  async function operation(signal: AbortSignal, caseSignal?: AbortSignal) {
    const controller = new AbortController();
    const parents = [runController.signal, signal, ...(caseSignal ? [caseSignal] : [])];
    let closed = false;
    let acquired = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectAbort!: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    void aborted.catch(quiet);
    const forward = () => controller.abort();
    function finish(): void {
      if (closed) return;
      closed = true;
      for (const parent of parents) parent.removeEventListener("abort", forward);
      controller.signal.removeEventListener("abort", onAbort);
      controller.abort();
      try { void reader?.cancel().catch(quiet); } catch { /* Bounded cleanup. */ }
      try { reader?.releaseLock(); } catch { /* Pending read. */ }
      if (acquired) { active--; for (const wake of [...wakeups]) wake(); }
    }
    function onAbort(): void { rejectAbort(new QualificationFailure()); finish(); }
    controller.signal.addEventListener("abort", onAbort, { once: true });
    for (const parent of parents) parent.addEventListener("abort", forward, { once: true });
    if (parents.some(parent => parent.aborted)) forward();
    async function wait<T>(pending: Promise<T>): Promise<T> {
      const value = await Promise.race([pending, aborted]);
      check();
      if (closed) invalid();
      return value;
    }
    try {
      while (active >= limits.concurrency) {
        let wake = quiet;
        const ready = new Promise<void>(resolve => { wake = resolve; wakeups.add(wake); });
        try { await wait(ready); } finally { wakeups.delete(wake); }
      }
      check(); if (closed) invalid();
      active++; acquired = true;
      counters.peakConcurrency = Math.max(counters.peakConcurrency, active);
      return { signal: controller.signal, wait, finish,
        adopt: (body: ReadableStream<Uint8Array>) => {
          if (closed) { cancel(body); invalid(); }
          reader = body.getReader(); return reader;
        } };
    } catch { finish(); throw new QualificationFailure(); }
  }
  try {
    const remaining = consent.expiresAt - executionWall;
    if (!Number.isFinite(remaining) || remaining <= 0) stop("deadline");
    duration = Math.min(limits.durationMs, remaining);
    dependencies.signal?.addEventListener("abort", parentAbort, { once: true });
    if (dependencies.signal?.aborted) parentAbort();
    check();
    cancelTimer = arm(() => { stopped ??= "deadline"; runController.abort(); }, duration - (previous - started));
    check();
    const backend = dependencies.createOfflineTransport();
    const put = backend.putIfAbsent.bind(backend);
    const get = backend.getAuthenticated.bind(backend);
    function transport(caseSignal?: AbortSignal, lostAck = false, abortAfterDispatch?: () => void): CalendarArchiveTransportV1 {
      return {
        putIfAbsent: async request => {
          count("puts");
          const bytes = Uint8Array.from(request.payloadBytes);
          const payload = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          if (!writable.has(request.objectKey) || request.ifNoneMatch !== "*" || request.contentType !== "application/json" ||
              payloads.get(request.objectKey + ":" + sha(payload)) !== payload) invalid();
          const op = await operation(request.signal, caseSignal);
          try {
            const result = await op.wait(Promise.resolve().then(() => {
              check(); if (op.signal.aborted) invalid();
              const pending = put({ ...request, payloadBytes: bytes, signal: op.signal });
              abortAfterDispatch?.(); return pending;
            }));
            if (lostAck && result.status === 200) invalid(); // Deterministic acknowledgement suppression only.
            return result;
          } finally { op.finish(); }
        },
        getAuthenticated: async request => {
          count("gets");
          if (!readable.has(request.objectKey)) invalid();
          const op = await operation(request.signal, caseSignal);
          try {
            const response = await op.wait(Promise.resolve().then(() => {
              check(); if (op.signal.aborted) invalid();
              return get({ ...request, signal: op.signal });
            }).then(response => {
              if (response.status === 200 && op.signal.aborted) { cancel(response.body); invalid(); }
              return response;
            }));
            if (response.status === 404) { op.finish(); return response; }
            const source = op.adopt(response.body);
            let size = 0; let chunks = 0;
            return { status: 200, body: new ReadableStream<Uint8Array>({
              async pull(controller) {
                try {
                  const next = await op.wait(source.read());
                  if (next.done) { op.finish(); controller.close(); return; }
                  if (!(next.value instanceof Uint8Array) || ++chunks > CALENDAR_ARCHIVE_MAX_CHUNKS_V1 ||
                      next.value.byteLength > CALENDAR_ARCHIVE_MAX_BYTES_V1 - size) invalid();
                  size += next.value.byteLength; controller.enqueue(Uint8Array.from(next.value));
                } catch { op.finish(); controller.error(new QualificationFailure()); }
              }, cancel: op.finish,
            }, { highWaterMark: 0, size: chunk => chunk.byteLength }) };
          } catch { op.finish(); throw new QualificationFailure(); }
        },
      };
    }
    const byId = (id: string): Fixture => generated.find(item => item.id === id) ?? invalid();
    async function archive(id: string, options?: { lostAck?: boolean; abort?: AbortController }): Promise<CalendarArchiveResultV1> {
      return createCalendarArchiveAdapterV1({ transport: transport(options?.abort?.signal, options?.lostAck,
        options?.abort ? () => options.abort?.abort() : undefined), monotonicNow: monotonic, armDeadline: arm }).archive(byId(id).record);
    }
    function uncertain(results: readonly CalendarArchiveResultV1[]): Outcome {
      return results.some(result => result.putObservation === "outcome-unknown") ? "unknown" : "inconclusive";
    }
    const verified = (result: CalendarArchiveResultV1, observation: string) => result.status === "verified" && result.putObservation === observation;
    const conflict = (result: CalendarArchiveResultV1) => result.status === "unavailable" && result.reason === "conflict" && result.putObservation === "precondition-failed";
    for (const name of caseNames) {
      check();
      let outcome: Outcome;
      if (name === "missing-object") {
        try {
          const response = await transport().getAuthenticated({ objectKey: manifest.missingObjectKey, signal: runController.signal });
          if (response.status === 200) cancel(response.body);
          outcome = response.status === 404 ? "pass" : "fail"; // Absence at this read only.
        } catch { outcome = "inconclusive"; }
      } else if (name === "identical-writers" || name === "divergent-writers") {
        const pair = name === "identical-writers" ? ["identical-race", "identical-race"] : ["divergent-race-a", "divergent-race-b"];
        const results = await Promise.all(pair.map(id => archive(id)));
        const created = results.filter(result => verified(result, "created")).length;
        const other = results.filter(result => name === "identical-writers" ? verified(result, "precondition-failed") : conflict(result)).length;
        outcome = created === 1 && other === 1 ? "pass" : results.every(result => result.status === "verified") ? "fail" : uncertain(results);
      } else {
        const id = name === "identical-retry" ? "fresh" : name === "divergent-conflict" ? "fresh-divergent"
          : name === "bom-fidelity" ? "bom" : name === "simulated-lost-ack" ? "lost-ack" : name === "controlled-abort" ? "abort" : "fresh";
        const result = await archive(id, { lostAck: name === "simulated-lost-ack",
          ...(name === "controlled-abort" ? { abort: new AbortController() } : {}) });
        const expected = name === "identical-retry" ? "precondition-failed" : name === "simulated-lost-ack" ? "outcome-unknown" : "created";
        outcome = name === "controlled-abort" ? "unknown" : name === "divergent-conflict"
          ? conflict(result) ? "pass" : result.status === "verified" ? "fail" : uncertain([result])
          : verified(result, expected) ? "pass" : result.status === "verified" || conflict(result) ? "fail" : uncertain([result]);
      }
      observations.push(Object.freeze({ case: name, outcome, basis: "offline-simulation" }));
    }
    check();
    return report("completed", null, manifest.manifestSha256, counters, observations);
  } catch {
    return report("stopped", stopped ?? "transport", manifest.manifestSha256, counters, observations);
  } finally {
    runController.abort();
    dependencies.signal?.removeEventListener("abort", parentAbort);
    try { cancelTimer(); } catch { /* Cleanup cannot qualify a run. */ }
  }
}
