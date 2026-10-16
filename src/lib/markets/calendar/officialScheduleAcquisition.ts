import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";
import { ECB_GOVERNING_COUNCIL_CALENDAR_URL } from "../events/ecbMonetaryPolicy";
import type { CalendarCaptureTimingV1, CalendarEventV1 } from "./contracts";
import { BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1 } from "./officialPolicySchedules";
import {
  OFFICIAL_SCHEDULE_DOCUMENT_V1, OFFICIAL_SCHEDULE_MAX_BYTES_V1,
  extractBojOfficialScheduleHtmlV1, extractEcbOfficialScheduleHtmlV1,
  type BojOfficialScheduleExtractionV1, type EcbOfficialScheduleExtractionV1,
} from "./officialScheduleExtraction";
import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";

export const OFFICIAL_SCHEDULE_ACQUISITION_V1 = "official-schedule-acquisition-v1" as const;
export const OFFICIAL_SCHEDULE_REQUEST_V1 = "official-schedule-request-v1" as const;
export const OFFICIAL_SCHEDULE_TIMEOUT_MS_V1 = 10_000;
export const OFFICIAL_SCHEDULE_RESPONSE_MAX_AGE_MS_V1 = 60_000;
export const OFFICIAL_SCHEDULE_SOURCES_V1 = Object.freeze({
  ecb: Object.freeze({ sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL, timeZone: "Europe/Berlin" }),
  boj: Object.freeze({ sourceUrl: BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1, timeZone: "Asia/Tokyo" }),
});

export interface OfficialScheduleAcquisitionRequestV1 {
  readonly schemaVersion: typeof OFFICIAL_SCHEDULE_REQUEST_V1;
  readonly publisher: "ecb" | "boj";
}
/** Trusted capabilities, captured at construction. Clock values are observations,
 * not authenticated clock bounds. The timer must measure elapsed real time. */
export interface OfficialScheduleAcquisitionDependenciesV1 {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly now: () => number;
  readonly monotonicNow: () => number;
  readonly armDeadline: (callback: () => void, milliseconds: number) => () => void;
}
export type OfficialScheduleAcquisitionFailureV1 =
  | "invalid-input" | "timeout" | "network-failure" | "http-status" | "unsupported-redirect"
  | "invalid-response" | "unsupported-media-type" | "unsupported-encoding" | "response-too-large"
  | "body-failure" | "clock-unavailable" | "stale-response" | "freshness-unavailable"
  | "source-malformed" | "schedule-outdated";

type CompleteExtraction = Extract<EcbOfficialScheduleExtractionV1 | BojOfficialScheduleExtractionV1, { status: "available" }>;
type Scope = {
  readonly schemaVersion: typeof OFFICIAL_SCHEDULE_ACQUISITION_V1;
  readonly sourceAuthentication: "not-performed";
  readonly evidenceAdmission: "not-certified";
  readonly clockAccuracy: "unknown";
  readonly historicalOwnership: "not-certified";
  readonly sourceCurrency: "not-certified";
};
export type OfficialScheduleAcquisitionResultV1 = Scope & (
  | { readonly status: "acquired";
      readonly network: "http-success"; readonly sourceUrl: string; readonly startedAt: string;
      readonly timing: CalendarCaptureTimingV1;
      readonly freshnessPolicy: CalendarEventV1["freshnessPolicy"];
      readonly freshness: { readonly scope: "unverified-response-age"; readonly assessedAt: string;
        readonly expiresAt: string; readonly observedAgeMilliseconds: number };
      /** HTTP metadata is never a decision publication timestamp. */
      readonly http: { readonly status: 200; readonly responseDate: string; readonly ageSeconds: number | null;
        readonly lastModified: string | null; readonly receivedBytes: number; readonly deliveredBodySha256: string };
      readonly extraction: CompleteExtraction }
  | { readonly status: "unavailable"; readonly reason: OfficialScheduleAcquisitionFailureV1 }
);
export interface OfficialScheduleAcquirerV1 {
  readonly acquire: (input: unknown) => Promise<OfficialScheduleAcquisitionResultV1>;
}

const scope: Scope = Object.freeze({ schemaVersion: OFFICIAL_SCHEDULE_ACQUISITION_V1,
  sourceAuthentication: "not-performed", evidenceAdmission: "not-certified", clockAccuracy: "unknown",
  historicalOwnership: "not-certified", sourceCurrency: "not-certified" });
const MAX_MS = 253_402_300_799_999;
const MAX_CHUNKS = 4_096;
class AcquisitionError extends Error {
  readonly reason: OfficialScheduleAcquisitionFailureV1;
  constructor(reason: OfficialScheduleAcquisitionFailureV1) { super("Official schedule acquisition unavailable."); this.reason = reason; }
}
function fail(reason: OfficialScheduleAcquisitionFailureV1): never { throw new AcquisitionError(reason); }
function clock(value: number): number {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > MAX_MS) fail("clock-unavailable");
  return value;
}
function monotonic(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) fail("clock-unavailable");
  return value;
}
function header(response: Response, key: string): string | null {
  const value = response.headers.get(key);
  if (value !== null && (value.length > 1_024 || /\p{Cc}/u.test(value))) fail("invalid-response");
  return value;
}
function httpDate(value: string): number {
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) fail("invalid-response");
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_MS || new Date(parsed).toUTCString() !== value) fail("invalid-response");
  return parsed;
}
function unsigned(value: string): number {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) fail("invalid-response");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail("invalid-response");
  return number;
}
function httpMetadata(response: Response) {
  const contentType = header(response, "content-type");
  if (contentType === null || !/^text\/html(?:\s*;\s*charset\s*=\s*(?:"utf-8"|utf-8))?\s*$/i.test(contentType)) fail("unsupported-media-type");
  const encoding = header(response, "content-encoding");
  if (encoding !== null && encoding.toLowerCase() !== "identity") fail("unsupported-encoding");
  const lengthHeader = header(response, "content-length");
  const length = lengthHeader === null ? null : unsigned(lengthHeader);
  if (length !== null && length > OFFICIAL_SCHEDULE_MAX_BYTES_V1) fail("response-too-large");
  if (length !== null && header(response, "transfer-encoding") !== null) fail("invalid-response");
  const responseDate = header(response, "date");
  if (responseDate === null) fail("freshness-unavailable");
  const date = httpDate(responseDate);
  const ageHeader = header(response, "age");
  const age = ageHeader === null ? null : unsigned(ageHeader);
  if (age !== null && age > Math.floor(MAX_MS / 1_000) - 1) fail("invalid-response");
  // A whole-second Age field is a bucket; use its upper endpoint, not an invented exact millisecond.
  const ageUpper = age === null ? 0 : (age + 1) * 1_000;
  const lastModifiedHeader = header(response, "last-modified");
  const lastModified = lastModifiedHeader === null ? null : new Date(httpDate(lastModifiedHeader)).toISOString();
  if (header(response, "warning") !== null) fail("stale-response");
  let maxAge = OFFICIAL_SCHEDULE_RESPONSE_MAX_AGE_MS_V1;
  const cacheControl = header(response, "cache-control");
  const seen = new Set<string>();
  for (const part of cacheControl?.split(",") ?? []) {
    const directive = part.trim();
    if (!/^(?:s-maxage|max-age)(?:\s|=|$)/i.test(directive)) continue;
    const match = /^(s-maxage|max-age)\s*=\s*(?:"(\d+)"|(\d+))$/i.exec(directive);
    if (!match || seen.has(match[1].toLowerCase())) fail("invalid-response");
    seen.add(match[1].toLowerCase());
    const seconds = unsigned(match[2] ?? match[3]);
    if (seconds > Math.floor(MAX_MS / 1_000)) fail("invalid-response");
    maxAge = Math.min(maxAge, seconds * 1_000);
  }
  return { length, responseDate, date, age, ageUpper, lastModified, maxAge };
}
function cancelBody(response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined): void {
  try {
    const pending = reader ? reader.cancel() : response?.body?.cancel();
    void pending?.catch(() => {}); // Cleanup never delays the caller's deadline.
  } catch { /* Trusted transport cleanup cannot replace the sanitized result. */ }
}
function localDate(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (name: string) => parts.find(value => value.type === name)?.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}

/** Opt-in factory only. No singleton, module-load I/O, retry, cache or scheduler.
 * The injected fetch must honor manual redirects and native response/stream semantics. */
export function createOfficialScheduleAcquirerV1(
  dependencies: Partial<OfficialScheduleAcquisitionDependenciesV1> = {},
): OfficialScheduleAcquirerV1 {
  const capabilities = Object.freeze({
    fetch: dependencies.fetch ?? globalThis.fetch.bind(globalThis),
    now: dependencies.now ?? Date.now,
    monotonicNow: dependencies.monotonicNow ?? performance.now.bind(performance),
    armDeadline: dependencies.armDeadline ?? ((callback: () => void, milliseconds: number) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    }),
  });
  return Object.freeze({ acquire: (input: unknown) => acquire(input, capabilities) });
}
async function acquire(input: unknown, capabilities: OfficialScheduleAcquisitionDependenciesV1): Promise<OfficialScheduleAcquisitionResultV1> {
  let cancelDeadline = () => {};
  let closed = false;
  let timedOut = false;
  const controller = new AbortController();
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let cleaned = false;
  function cleanup(): void {
    if (cleaned || (response === undefined && reader === undefined)) return;
    cleaned = true;
    cancelBody(response, reader);
  }
  try {
    const request = calendarRecordV1(snapshotCalendarDataV1(input), ["schemaVersion", "publisher"]);
    if (request.schemaVersion !== OFFICIAL_SCHEDULE_REQUEST_V1 || (request.publisher !== "ecb" && request.publisher !== "boj")) fail("invalid-input");
    const publisher = request.publisher;
    const source = OFFICIAL_SCHEDULE_SOURCES_V1[publisher];
    if (new URL(source.sourceUrl).protocol !== "https:") fail("invalid-input");
    function wallNow(): number {
      try { return clock(capabilities.now()); } catch { return fail("clock-unavailable"); }
    }
    function monotonicNow(): number {
      try { return monotonic(capabilities.monotonicNow()); } catch { return fail("clock-unavailable"); }
    }
    const started = wallNow();
    const startMonotonic = monotonicNow();
    let lastMonotonic = startMonotonic;
    function elapsed(): number {
      const now = monotonicNow();
      if (now < lastMonotonic) fail("clock-unavailable");
      lastMonotonic = now;
      const elapsed = now - startMonotonic;
      if (closed || timedOut || elapsed >= OFFICIAL_SCHEDULE_TIMEOUT_MS_V1) fail("timeout");
      return elapsed;
    }
    const deadline = new Promise<never>((_, reject) => {
      cancelDeadline = capabilities.armDeadline(() => {
        if (closed) return;
        timedOut = true;
        controller.abort();
        reject(new AcquisitionError("timeout"));
      }, OFFICIAL_SCHEDULE_TIMEOUT_MS_V1);
    });
    const operation = async (): Promise<OfficialScheduleAcquisitionResultV1> => {
      try {
        elapsed();
        try {
          response = await capabilities.fetch(source.sourceUrl, { method: "GET", redirect: "manual", cache: "no-store",
            credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal,
            headers: { Accept: "text/html", "Accept-Encoding": "identity", "Cache-Control": "no-cache, no-store",
              Pragma: "no-cache", "User-Agent": "Chronoverse-Official-Schedule-Acquisition/1.0" } });
        } catch { fail(timedOut ? "timeout" : "network-failure"); }
        elapsed();
        if (types.isProxy(response) || !(response instanceof Response)) fail("invalid-response");
        if (response.redirected || response.type === "opaqueredirect" || [301, 302, 303, 307, 308].includes(response.status) ||
          header(response, "location") !== null) fail("unsupported-redirect");
        if (response.url !== source.sourceUrl) fail("unsupported-redirect");
        if (response.status !== 200) fail("http-status");
        const metadata = httpMetadata(response);
        if (metadata.ageUpper >= metadata.maxAge) fail("stale-response");
        if (response.body === null || response.bodyUsed || response.body.locked) fail("invalid-response");
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const hash = createHash("sha256");
        const parts: string[] = [];
        let received = 0;
        let chunks = 0;
        while (true) {
          elapsed();
          let next: ReadableStreamReadResult<Uint8Array>;
          try { next = await reader.read(); } catch { fail(timedOut ? "timeout" : "body-failure"); }
          elapsed();
          if (next.done) break;
          if (++chunks > MAX_CHUNKS || types.isProxy(next.value) || !(next.value instanceof Uint8Array)) fail("invalid-response");
          const chunk = Uint8Array.from(next.value);
          received += chunk.byteLength;
          if (received > OFFICIAL_SCHEDULE_MAX_BYTES_V1) fail("response-too-large");
          hash.update(chunk);
          try { parts.push(decoder.decode(chunk, { stream: true })); } catch { fail("unsupported-encoding"); }
        }
        try { parts.push(decoder.decode()); } catch { fail("unsupported-encoding"); }
        if (received === 0 || (metadata.length !== null && received !== metadata.length)) fail("invalid-response");
        const completed = wallNow();
        if (completed < started || metadata.date > completed) fail("clock-unavailable");
        const deliveredBodySha256 = hash.digest("hex");
        const document = { schemaVersion: OFFICIAL_SCHEDULE_DOCUMENT_V1, publisher,
          sourceUrl: source.sourceUrl, timeZone: source.timeZone, documentId: "official-schedule:" + publisher + ":html",
          // Locally computed content identity, never a publisher-issued version.
          sourceVersionId: "sha256:" + deliveredBodySha256, mediaType: "text/html", content: parts.join("") };
        elapsed();
        const extraction = publisher === "ecb" ? extractEcbOfficialScheduleHtmlV1(document) : extractBojOfficialScheduleHtmlV1(document);
        if (extraction.status !== "available") fail("source-malformed");
        const duration = Math.ceil(elapsed());
        const available = wallNow();
        if (available < completed || metadata.date > available) fail("clock-unavailable");
        // Conservative local observations only; neither Age nor Date authenticates source freshness.
        const ageUpper = Math.max(available - metadata.date, metadata.ageUpper + duration);
        if (ageUpper >= metadata.maxAge) fail("stale-response");
        const remaining = metadata.maxAge - ageUpper;
        if (available + remaining > MAX_MS) fail("clock-unavailable");
        const today = localDate(available, source.timeZone);
        if (!extraction.rows.some(row => row.eventTime.kind === "date-only"
          ? row.eventTime.date >= today : row.eventTime.expectedDate !== null && row.eventTime.expectedDate >= today)) fail("schedule-outdated");
        elapsed(); // Reject even a delayed synchronous extraction or clock callback.
        const result = snapshotCalendarDataV1({ ...scope, status: "acquired", network: "http-success",
          sourceUrl: source.sourceUrl, startedAt: new Date(started).toISOString(),
          timing: { acquisition: { status: "recorded", completedAt: new Date(completed).toISOString() },
            evidenceAvailability: { status: "recorded", availableAt: new Date(available).toISOString() },
            persistence: { status: "not-persisted" } },
          freshnessPolicy: { maximumAgeMilliseconds: remaining },
          freshness: { scope: "unverified-response-age", assessedAt: new Date(available).toISOString(),
            expiresAt: new Date(available + remaining).toISOString(), observedAgeMilliseconds: ageUpper },
          http: { status: 200, responseDate: new Date(metadata.date).toISOString(), ageSeconds: metadata.age,
            lastModified: metadata.lastModified, receivedBytes: received, deliveredBodySha256 }, extraction }) as OfficialScheduleAcquisitionResultV1;
        const delivered = wallNow();
        const finalDuration = Math.ceil(elapsed());
        if (delivered < available) fail("clock-unavailable");
        const deliveryDate = localDate(delivered, source.timeZone);
        if (deliveryDate !== today && !extraction.rows.some(row => row.eventTime.kind === "date-only"
          ? row.eventTime.date >= deliveryDate : row.eventTime.expectedDate !== null && row.eventTime.expectedDate >= deliveryDate)) fail("schedule-outdated");
        elapsed();
        if (delivered >= available + remaining ||
          Math.max(delivered - metadata.date, metadata.ageUpper + finalDuration) >= metadata.maxAge) fail("stale-response");
        return result;
      } finally { cleanup(); }
    };
    return await Promise.race([operation(), deadline]);
  } catch (error) {
    return Object.freeze({ ...scope, status: "unavailable",
      reason: timedOut ? "timeout" : error instanceof AcquisitionError ? error.reason : "invalid-input" });
  } finally {
    closed = true;
    try { cancelDeadline(); } catch { /* A failed cleanup cannot certify evidence. */ }
    controller.abort();
    cleanup();
  }
}
