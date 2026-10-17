import "server-only";

import { Readable } from "node:stream";
import { types } from "node:util";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException, type S3ClientConfig } from "@aws-sdk/client-s3";
import { XMLValidator } from "fast-xml-parser";
import {
  CALENDAR_ARCHIVE_MAX_BYTES_V1, CALENDAR_ARCHIVE_MAX_CHUNKS_V1, CALENDAR_ARCHIVE_TIMEOUT_MS_V1,
  type CalendarArchiveTransportV1,
} from "./captureArchive";
import { parseR2CalendarArchiveConfigV1 } from "./r2CaptureArchiveConfig";

export const R2_CALENDAR_ARCHIVE_ERROR_MAX_BYTES_V1 = 64 * 1024;
export const R2_CALENDAR_ARCHIVE_QUEUE_BYTES_V1 = 64 * 1024;
export const R2_CALENDAR_ARCHIVE_HTTP_OPTIONS_V1 = Object.freeze({
  connectionTimeout: 2000, socketTimeout: 5000, requestTimeout: CALENDAR_ARCHIVE_TIMEOUT_MS_V1,
  throwOnRequestTimeout: true as const, httpsAgent: Object.freeze({ keepAlive: false, maxSockets: 1 }),
});
export type R2CalendarArchiveHttpHandlerV1 = Extract<NonNullable<S3ClientConfig["requestHandler"]>, { handle: unknown }>;
type DeserializeNext = Parameters<S3Client["middlewareStack"]["resolve"]>[0];
export interface R2CalendarArchiveTransportDependenciesV1 {
  /** Trusted test capability. Must return a fresh independently owned handler.
   * Omission selects SDK Node HTTP options, but no client exists before an operation. */
  readonly createHttpHandler?: (options: typeof R2_CALENDAR_ARCHIVE_HTTP_OPTIONS_V1) => R2CalendarArchiveHttpHandlerV1;
  readonly armDeadline?: (callback: () => void, milliseconds: number) => () => void;
}
export class R2CalendarArchiveTransportErrorV1 extends Error {
  constructor() { super("Calendar R2 archive transport unavailable."); this.name = "R2CalendarArchiveTransportErrorV1"; }
}
function failure(): R2CalendarArchiveTransportErrorV1 { return new R2CalendarArchiveTransportErrorV1(); }
function key(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^calendar\/captures\/v1\/[a-f0-9]{64}\.json$/.test(value)) throw failure();
}
const quiet = () => {};
const logger = Object.freeze({ trace: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet });

/** Explicit, inactive server-only transport. No environment loader, singleton,
 * production caller, bucket creation, list/delete/overwrite, or automatic retry.
 * Call through Slice 1 for complete record validation and the shared deadline. */
export function createR2CalendarCaptureArchiveTransportV1(
  configuration: unknown, dependencies: R2CalendarArchiveTransportDependenciesV1 = {},
): CalendarArchiveTransportV1 {
  const config = parseR2CalendarArchiveConfigV1(configuration);
  const createHandler = dependencies.createHttpHandler;
  const arm = dependencies.armDeadline ?? ((callback: () => void, milliseconds: number) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  });
  const usedHandlers = new WeakSet<object>();

  function operation(parent: AbortSignal, method: "put" | "get") {
    if (types.isProxy(parent) || !(parent instanceof AbortSignal) || parent.aborted) throw failure();
    const controller = new AbortController();
    const bodies = new Set<Readable>();
    let client: S3Client | undefined;
    let ownedHandler: R2CalendarArchiveHttpHandlerV1 | undefined;
    let closed = false;
    let cancelTimer = quiet;
    let rejectAbort!: (error: Error) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    void aborted.catch(quiet);
    const forwardAbort = () => controller.abort();
    function dispose(): void {
      if (closed) return;
      closed = true;
      parent.removeEventListener("abort", forwardAbort);
      controller.signal.removeEventListener("abort", onAbort);
      try { cancelTimer(); } catch { /* Cleanup never changes an observation. */ }
      controller.abort();
      for (const body of bodies) { try { body.destroy(); } catch { /* Best effort. */ } }
      try { if (client) client.destroy(); else ownedHandler?.destroy?.(); } catch { /* Best effort. */ }
    }
    function onAbort(): void { rejectAbort(failure()); dispose(); }
    function check(): void { if (closed || controller.signal.aborted) throw failure(); }
    function adopt(body: unknown): Readable {
      if (!(body instanceof Readable)) throw failure();
      if (!bodies.has(body)) { body.once("error", quiet); bodies.add(body); }
      if (closed) { body.destroy(); throw failure(); }
      return body;
    }
    async function wait<T>(pending: Promise<T>): Promise<T> {
      const result = await Promise.race([pending, aborted]);
      check();
      return result;
    }
    async function collect(stream: unknown): Promise<Uint8Array> {
      const body = adopt(stream);
      const parts: Uint8Array[] = [];
      let size = 0;
      let count = 0;
      try {
        for await (const chunk of body) {
          check();
          if (types.isProxy(chunk) || !(chunk instanceof Uint8Array) || ++count > CALENDAR_ARCHIVE_MAX_CHUNKS_V1 ||
              chunk.byteLength > R2_CALENDAR_ARCHIVE_ERROR_MAX_BYTES_V1 - size) throw failure();
          size += chunk.byteLength;
          parts.push(Uint8Array.from(chunk));
        }
        check();
        const bytes = Buffer.concat(parts, size);
        if (bytes.length) {
          const xml = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
          if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw failure();
        }
        return bytes;
      } catch { body.destroy(); throw failure(); }
    }
    try {
      parent.addEventListener("abort", forwardAbort, { once: true });
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (parent.aborted) forwardAbort();
      cancelTimer = arm(forwardAbort, CALENDAR_ARCHIVE_TIMEOUT_MS_V1);
      if (closed) { cancelTimer(); throw failure(); }
      const handler = createHandler?.(R2_CALENDAR_ARCHIVE_HTTP_OPTIONS_V1);
      if (createHandler) {
        if (!handler || typeof handler.handle !== "function" || typeof handler.destroy !== "function" || usedHandlers.has(handler)) throw failure();
        usedHandlers.add(handler);
        ownedHandler = handler;
      }
      check();
      client = new S3Client({
        endpoint: config.endpoint, region: config.region, forcePathStyle: true,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        maxAttempts: 1, retryMode: "standard", defaultsMode: "standard",
        authSchemePreference: ["aws.auth#sigv4"],
        followRegionRedirects: false, expectContinueHeader: false,
        requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
        useFipsEndpoint: false, useDualstackEndpoint: false, useArnRegion: false,
        disableS3ExpressSessionAuth: true, disableMultiregionAccessPoints: true,
        useAccelerateEndpoint: false, bucketEndpoint: false, useGlobalEndpoint: false,
        logger, streamCollector: collect,
        requestHandler: handler ?? { ...R2_CALENDAR_ARCHIVE_HTTP_OPTIONS_V1 },
      });
      // Capture even bodies whose headers/error XML fail SDK deserialization.
      // This also destroys late raw responses before the SDK can parse them.
      client.middlewareStack.addRelativeTo((next: DeserializeNext) => async (args: Parameters<DeserializeNext>[0]) => {
        const result = await next(args);
        const response = result.response as { statusCode?: number; body?: unknown } | undefined;
        if (!response || !Number.isInteger(response.statusCode) || response.statusCode! < 100 || response.statusCode! > 599) throw failure();
        adopt(response.body);
        if (method === "put" && response.statusCode === 200) {
          if ((await collect(response.body)).byteLength !== 0) throw failure();
          response.body = Readable.from([], { objectMode: false });
          adopt(response.body);
        }
        return result;
      }, { name: "calendarArchiveResponseBoundary", relation: "after", toMiddleware: "deserializerMiddleware" });
      return { client, signal: controller.signal, wait, check, adopt, dispose };
    } catch { dispose(); throw failure(); }
  }

  return Object.freeze({
    putIfAbsent: async (request: Parameters<CalendarArchiveTransportV1["putIfAbsent"]>[0]) => {
      key(request.objectKey);
      if (request.ifNoneMatch !== "*" || request.contentType !== "application/json" || types.isProxy(request.payloadBytes) ||
          !(request.payloadBytes instanceof Uint8Array) || !request.payloadBytes.byteLength ||
          request.payloadBytes.byteLength > CALENDAR_ARCHIVE_MAX_BYTES_V1) throw failure();
      const bytes = Buffer.from(request.payloadBytes);
      const op = operation(request.signal, "put");
      try {
        const result = await op.wait(op.client.send(new PutObjectCommand({
          Bucket: config.bucket.name, Key: request.objectKey, Body: bytes, ContentLength: bytes.byteLength,
          ContentType: "application/json", IfNoneMatch: "*",
        }), { abortSignal: op.signal }));
        if (result.$metadata.httpStatusCode !== 200) throw failure();
        return Object.freeze({ status: 200 as const });
      } catch (error) {
        op.check();
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412 && error.name === "PreconditionFailed") {
          return Object.freeze({ status: 412 as const });
        }
        throw failure();
      } finally { op.dispose(); }
    },
    getAuthenticated: async (request: Parameters<CalendarArchiveTransportV1["getAuthenticated"]>[0]) => {
      key(request.objectKey);
      const op = operation(request.signal, "get");
      let transferred = false;
      try {
        const result = await op.wait(op.client.send(new GetObjectCommand({
          Bucket: config.bucket.name, Key: request.objectKey,
        }), { abortSignal: op.signal }).then(result => {
          if (result.Body) op.adopt(result.Body); // Includes late responses after abort.
          return result;
        }));
        if (result.$metadata.httpStatusCode !== 200 || result.ContentType !== "application/json" ||
            result.ContentRange !== undefined || (result.ContentEncoding !== undefined && result.ContentEncoding !== "identity")) throw failure();
        const expected = result.ContentLength;
        if (expected !== undefined && (!Number.isSafeInteger(expected) || expected < 0 || expected > CALENDAR_ARCHIVE_MAX_BYTES_V1)) throw failure();
        const raw = op.adopt(result.Body);
        if (raw.readableObjectMode || raw.readableEncoding) throw failure();
        const source = Readable.toWeb(raw, { strategy: {
          highWaterMark: R2_CALENDAR_ARCHIVE_QUEUE_BYTES_V1,
          size: (chunk: Uint8Array) => chunk.byteLength,
        } }).getReader();
        let size = 0;
        let count = 0;
        function release(): void {
          op.dispose();
          try { void source.cancel().catch(quiet); } catch { /* Never wait for cleanup. */ }
          try { source.releaseLock(); } catch { /* A read may still be pending. */ }
        }
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const next = await op.wait(source.read());
              if (next.done) {
                if ((expected !== undefined && size !== expected) || (raw as Readable & { complete?: boolean }).complete === false) throw failure();
                release(); controller.close(); return;
              }
              if (types.isProxy(next.value) || !(next.value instanceof Uint8Array) || ++count > CALENDAR_ARCHIVE_MAX_CHUNKS_V1 ||
                  next.value.byteLength > CALENDAR_ARCHIVE_MAX_BYTES_V1 - size) throw failure();
              size += next.value.byteLength;
              if (expected !== undefined && size > expected) throw failure();
              controller.enqueue(Uint8Array.from(next.value));
            } catch { release(); controller.error(failure()); }
          },
          cancel: release,
        }, { highWaterMark: 0, size: chunk => chunk.byteLength });
        transferred = true;
        return Object.freeze({ status: 200 as const, body });
      } catch (error) {
        op.check();
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404 && error.name === "NoSuchKey") {
          return Object.freeze({ status: 404 as const });
        }
        throw failure();
      } finally { if (!transferred) op.dispose(); }
    },
  });
}
