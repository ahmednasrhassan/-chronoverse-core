import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";
import { readCalendarCaptureRecordV1, type CalendarCaptureRecordV1 } from "./capturePersistence";
import { calendarRecordV1 } from "./validation";

export const CALENDAR_ARCHIVE_ENVELOPE_V1 = "calendar-immutable-archive-v1" as const;
export const CALENDAR_ARCHIVE_NAMESPACE_V1 = "chronoverse:calendar:capture:v1" as const;
export const CALENDAR_ARCHIVE_MAX_BYTES_V1 = 2 * 1024 * 1024;
export const CALENDAR_ARCHIVE_MAX_CHUNKS_V1 = 4096;
export const CALENDAR_ARCHIVE_TIMEOUT_MS_V1 = 10_000;
const scope = "injected-archive-only" as const;

export interface CalendarArchiveEnvelopeV1 {
  readonly schemaVersion: typeof CALENDAR_ARCHIVE_ENVELOPE_V1;
  readonly namespace: typeof CALENDAR_ARCHIVE_NAMESPACE_V1;
  readonly objectKey: string;
  readonly record: CalendarCaptureRecordV1;
}
export interface CalendarArchiveObjectV1 {
  readonly envelope: CalendarArchiveEnvelopeV1;
  /** Exact canonical UTF-8 JSON representation. No transport-owned mutable bytes. */
  readonly payload: string;
  /** Hash of the complete serialized envelope, distinct from recordSha256. */
  readonly payloadSha256: string;
}
type Reason = "invalid-record" | "object-too-large" | "invalid-stored-object" | "conflict"
  | "verification-unavailable" | "outcome-unknown" | "timeout" | "clock-unavailable";
type PutObservation = "not-attempted" | "created" | "precondition-failed" | "outcome-unknown";
export type CalendarArchiveResultV1 =
  | { readonly scope: typeof scope; readonly status: "verified";
      readonly putObservation: Exclude<PutObservation, "not-attempted">;
      readonly objectKey: string; readonly recordSha256: string; readonly payloadSha256: string }
  | { readonly scope: typeof scope; readonly status: "unavailable";
      readonly putObservation: PutObservation; readonly reason: Reason };

export interface CalendarArchiveTransportV1 {
  /** Trusted capability: atomic create-only PUT. 200 means committed; 412 means
   * precondition failed, never content equality. Every thrown/other result is ambiguous.
   * Implementations must not downgrade to an unconditional PUT or retry under a new key. */
  readonly putIfAbsent: (request: {
    readonly objectKey: string; readonly ifNoneMatch: "*"; readonly contentType: "application/json";
    readonly payloadBytes: Uint8Array; readonly signal: AbortSignal;
  }) => Promise<{ readonly status: 200 | 412 }>;
  /** Trusted capability: authenticated direct storage GET, bypassing public caches.
   * Authentication is a capability requirement, not a response field that can prove it.
   * Return the full raw body stream; metadata, ETag and advertised size are not evidence. */
  readonly getAuthenticated: (request: { readonly objectKey: string; readonly signal: AbortSignal }) => Promise<
    | { readonly status: 200; readonly body: ReadableStream<Uint8Array> }
    | { readonly status: 404 }
  >;
}
export interface CalendarArchiveDependenciesV1 {
  readonly transport: CalendarArchiveTransportV1;
  /** Trusted elapsed-time capabilities only, never evidence/receipt clocks. */
  readonly monotonicNow?: () => number;
  readonly armDeadline?: (callback: () => void, milliseconds: number) => () => void;
}

class ArchiveFailure extends Error {
  readonly reason: Reason;
  constructor(reason: Reason) { super("Calendar archive operation unavailable."); this.reason = reason; }
}
function fail(reason: Reason): never { throw new ArchiveFailure(reason); }
function sha(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
/** Versioned internal JSON encoding: sorted object keys, source array order, UTF-8. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    const data = value as Record<string, unknown>;
    return "{" + Object.keys(data).sort().map(key => JSON.stringify(key) + ":" + canonical(data[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function object(value: unknown): CalendarArchiveObjectV1 {
  let record: CalendarCaptureRecordV1;
  try { record = readCalendarCaptureRecordV1(value); } catch { return fail("invalid-record"); }
  // Identity is archive-wide captureId, including across publishers. Hashing a
  // domain-separated tuple prevents key/path injection and concatenation ambiguity.
  const identity = sha(canonical([CALENDAR_ARCHIVE_NAMESPACE_V1, "capture-identity", record.input.captureId]));
  const envelope = Object.freeze({ schemaVersion: CALENDAR_ARCHIVE_ENVELOPE_V1,
    namespace: CALENDAR_ARCHIVE_NAMESPACE_V1, objectKey: `calendar/captures/v1/${identity}.json`, record });
  const payload = canonical(envelope);
  if (Buffer.byteLength(payload, "utf8") > CALENDAR_ARCHIVE_MAX_BYTES_V1) fail("object-too-large");
  return Object.freeze({ envelope, payload, payloadSha256: sha(payload) });
}
/** Pure preparation, no capability calls; rejects complete-record inconsistencies. */
export function prepareCalendarArchiveObjectV1(value: unknown):
  | { readonly status: "prepared"; readonly object: CalendarArchiveObjectV1 }
  | { readonly status: "unavailable"; readonly reason: "invalid-record" | "object-too-large" } {
  try { return Object.freeze({ status: "prepared", object: object(value) }); }
  catch (error) { return Object.freeze({ status: "unavailable",
    reason: error instanceof ArchiveFailure && error.reason === "object-too-large" ? "object-too-large" : "invalid-record" }); }
}

/** Strict canonical-only parsing also rejects duplicate keys, alternate numeric
 * encodings, unknown fields, whitespace, invalid UTF-8 and a leading JSON BOM. */
function storedObject(bytes: Uint8Array): CalendarArchiveObjectV1 {
  try {
    const payload = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    const envelope = calendarRecordV1(JSON.parse(payload), ["schemaVersion", "namespace", "objectKey", "record"]);
    if (envelope.schemaVersion !== CALENDAR_ARCHIVE_ENVELOPE_V1 || envelope.namespace !== CALENDAR_ARCHIVE_NAMESPACE_V1) fail("invalid-stored-object");
    const rebuilt = object(envelope.record);
    if (rebuilt.payload !== payload || rebuilt.envelope.objectKey !== envelope.objectKey) fail("invalid-stored-object");
    return rebuilt;
  } catch { return fail("invalid-stored-object"); }
}

/** Inactive factory: no default storage, SDK, env, singleton, acquisition or caller.
 * Exactly one conditional PUT and at most one GET per explicit archive() call.
 * The injected store must supply atomic creation and authenticated direct reads.
 * Verification observes bytes only; it is never qualification or a durable receipt. */
export function createCalendarArchiveAdapterV1(dependencies: CalendarArchiveDependenciesV1): {
  readonly archive: (value: unknown) => Promise<CalendarArchiveResultV1>;
} {
  const put = dependencies.transport.putIfAbsent.bind(dependencies.transport);
  const get = dependencies.transport.getAuthenticated.bind(dependencies.transport);
  const now = dependencies.monotonicNow ?? performance.now.bind(performance);
  const arm = dependencies.armDeadline ?? ((callback: () => void, milliseconds: number) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  });
  return Object.freeze({ archive: async (value: unknown): Promise<CalendarArchiveResultV1> => {
    const prepared = prepareCalendarArchiveObjectV1(value);
    if (prepared.status !== "prepared") return Object.freeze({ scope, status: "unavailable", putObservation: "not-attempted", reason: prepared.reason });
    const expected = prepared.object;
    let putObservation: PutObservation = "not-attempted";
    let closed = false;
    let cancelDeadline = () => {};
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let responseBody: ReadableStream<Uint8Array> | undefined;
    function cancelBody(body: ReadableStream<Uint8Array>): void {
      try { void body.cancel().catch(() => {}); } catch { /* Best effort, never delay return. */ }
    }
    try {
      function readClock(): number {
        try { return now(); } catch { return fail("clock-unavailable"); }
      }
      let previous = readClock();
      if (!Number.isFinite(previous) || previous < 0) fail("clock-unavailable");
      const started = previous;
      function check(): void {
        const current = readClock();
        if (!Number.isFinite(current) || current < previous) fail("clock-unavailable");
        previous = current;
        if (closed || current - started >= CALENDAR_ARCHIVE_TIMEOUT_MS_V1) fail("timeout");
      }
      let rejectDeadline!: (error: ArchiveFailure) => void;
      const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
      // Even a synchronous deadline callback or a misbehaving late transport
      // cannot produce an unhandled rejection or continue to the next operation.
      void deadline.catch(() => {});
      cancelDeadline = arm(() => {
        closed = true;
        rejectDeadline(new ArchiveFailure("timeout"));
        controller.abort();
      }, CALENDAR_ARCHIVE_TIMEOUT_MS_V1);
      const wait = async <T>(pending: Promise<T>): Promise<T> => {
        const result = await Promise.race([pending, deadline]);
        check();
        return result;
      };
      check();
      putObservation = "outcome-unknown";
      const written = await wait(Promise.resolve().then(() => {
        check();
        return put({ objectKey: expected.envelope.objectKey, ifNoneMatch: "*", contentType: "application/json",
          payloadBytes: Buffer.from(expected.payload, "utf8"), signal: controller.signal });
      }).catch(() => undefined));
      if (written?.status === 200) putObservation = "created";
      else if (written?.status === 412) putObservation = "precondition-failed";
      const response = await wait(Promise.resolve().then(() => {
        check();
        return get({ objectKey: expected.envelope.objectKey, signal: controller.signal });
      }).then(response => {
        if (response.status === 200) {
          responseBody = response.body;
          if (closed) cancelBody(response.body);
        }
        return response;
      }));
      if (response.status === 404) fail(putObservation === "outcome-unknown" ? "outcome-unknown" : "verification-unavailable");
      if (response.status !== 200 || !(response.body instanceof ReadableStream)) fail("invalid-stored-object");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (let count = 0; ; count++) {
        const chunk = await wait(reader.read());
        if (chunk.done) break;
        if (count >= CALENDAR_ARCHIVE_MAX_CHUNKS_V1 || types.isProxy(chunk.value) ||
            !(chunk.value instanceof Uint8Array)) fail("invalid-stored-object");
        if (chunk.value.byteLength > CALENDAR_ARCHIVE_MAX_BYTES_V1 - size) fail("object-too-large");
        size += chunk.value.byteLength;
        chunks.push(Uint8Array.from(chunk.value));
      }
      if (size === 0) fail("invalid-stored-object");
      const actual = storedObject(Buffer.concat(chunks, size));
      check();
      if (actual.envelope.objectKey !== expected.envelope.objectKey || actual.payloadSha256 !== expected.payloadSha256 ||
          actual.envelope.record.recordSha256 !== expected.envelope.record.recordSha256 || actual.payload !== expected.payload) fail("conflict");
      return Object.freeze({ scope, status: "verified", putObservation: putObservation as Exclude<PutObservation, "not-attempted">,
        objectKey: expected.envelope.objectKey, recordSha256: expected.envelope.record.recordSha256, payloadSha256: expected.payloadSha256 });
    } catch (error) {
      const reason = error instanceof ArchiveFailure ? error.reason : "verification-unavailable";
      return Object.freeze({ scope, status: "unavailable", putObservation,
        reason: putObservation === "outcome-unknown" && reason === "timeout" ? "outcome-unknown" : reason });
    } finally {
      closed = true;
      try { cancelDeadline(); } catch { /* Cleanup cannot replace the result. */ }
      controller.abort();
      if (!reader && responseBody) cancelBody(responseBody);
      try { void reader?.cancel().catch(() => {}); } catch { /* Bounded best effort. */ }
      try { reader?.releaseLock(); } catch { /* A pending read may still own it. */ }
    }
  } });
}
