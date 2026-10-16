import "server-only";

import { createHash } from "node:crypto";
import type { CalendarEventV1 } from "./contracts";
import {
  OFFICIAL_SCHEDULE_ACQUISITION_V1, OFFICIAL_SCHEDULE_SOURCES_V1,
  type OfficialScheduleAcquisitionResultV1,
} from "./officialScheduleAcquisition";
import {
  OFFICIAL_SCHEDULE_DOCUMENT_V1, OFFICIAL_SCHEDULE_MAX_BYTES_V1,
  extractBojOfficialScheduleHtmlV1, extractEcbOfficialScheduleHtmlV1,
} from "./officialScheduleExtraction";
import {
  ECB_OFFICIAL_SCHEDULE_INPUT_V1, BOJ_OFFICIAL_SCHEDULE_INPUT_V1,
  normalizeEcbOfficialScheduleV1, normalizeBojOfficialScheduleV1,
} from "./officialPolicySchedules";
import { calendarInstantV1, calendarRecordV1, snapshotCalendarDataV1 } from "./validation";

export const CALENDAR_CAPTURE_V1 = "calendar-capture-v1" as const;
export const CALENDAR_CAPTURE_INPUT_V1 = "calendar-capture-input-v1" as const;
export const CALENDAR_OFFLINE_CHECKPOINT_V1 = "calendar-offline-checkpoint-v1" as const;
export const CALENDAR_OFFLINE_CAPACITY_V1 = 16;
type Acquired = Extract<OfficialScheduleAcquisitionResultV1, { status: "acquired" }>;
export interface CalendarCaptureBindingV1 {
  readonly canonicalMeetingDate: string;
  readonly versionId: string;
  readonly revision: CalendarEventV1["revision"];
}
export interface CalendarCaptureInputV1 {
  readonly schemaVersion: typeof CALENDAR_CAPTURE_INPUT_V1;
  readonly captureId: string;
  readonly previousCaptureId: string | null;
  /** Canonical base64, split every 2048 characters; exact delivered body bytes. */
  readonly bodyBase64Chunks: readonly string[];
  readonly acquisition: Acquired;
  /** One explicit identity/revision context per extracted row, in source order. */
  readonly bindings: readonly CalendarCaptureBindingV1[];
}
export interface CalendarCaptureRecordV1 {
  readonly schemaVersion: typeof CALENDAR_CAPTURE_V1;
  readonly input: CalendarCaptureInputV1;
  readonly acquisitionCutoff: string;
  readonly evidenceAvailability: { readonly status: "unavailable"; readonly reason: "qualification-not-performed" };
  readonly durablePersistence: { readonly status: "unavailable"; readonly reason: "offline-only" };
  readonly eventVersions: readonly { readonly event: CalendarEventV1; readonly sha256: string }[];
  /** sha256 of recursively key-sorted JSON of all other fields, UTF-8. */
  readonly recordSha256: string;
}
export type CalendarCaptureResultV1 =
  | { readonly status: "prepared"; readonly record: CalendarCaptureRecordV1 }
  | { readonly status: "unavailable"; readonly reason: "invalid-capture" };
export interface CalendarOfflineReceiptV1 {
  readonly scope: "volatile-offline-only";
  readonly sequence: number;
  readonly captureId: string;
  readonly recordSha256: string;
  readonly observedAcknowledgedAt: string;
}
interface Entry { readonly record: CalendarCaptureRecordV1; readonly receipt: CalendarOfflineReceiptV1 }
export type CalendarOfflineAppendResultV1 =
  | { readonly status: "appended" | "idempotent"; readonly receipt: CalendarOfflineReceiptV1 }
  | { readonly status: "unavailable"; readonly reason: "invalid-capture" | "conflict" | "corrupt-history"
      | "capacity-exceeded" | "clock-unavailable" | "simulated-failure" | "outcome-unknown" };
export interface CalendarOfflineJournalV1 {
  readonly scope: "volatile-offline-only";
  readonly append: (record: unknown) => CalendarOfflineAppendResultV1;
  readonly checkpoint: () => unknown;
}
export interface CalendarOfflineDependenciesV1 {
  /** Trusted test capabilities only. No provider, environment or storage transport. */
  readonly now: () => string;
  readonly fault?: () => "none" | "before-append" | "after-append";
}
function invalid(): never { throw new TypeError("Unsupported calendar capture."); }
function detached<T>(value: T): T { return snapshotCalendarDataV1(value) as T; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object" && value !== null) {
    const data = value as Record<string, unknown>;
    return "{" + Object.keys(data).sort().map(key => JSON.stringify(key) + ":" + canonical(data[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function sha(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function equal(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }
function id(value: unknown): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/.test(value)) invalid();
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum) invalid();
  return value;
}
function body(chunks: readonly string[]): Buffer {
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 342 ||
      chunks.some((part, index) => typeof part !== "string" || !part.length ||
        part.length > 2048 || (index < chunks.length - 1 && part.length !== 2048))) invalid();
  const encoded = chunks.join("");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > OFFICIAL_SCHEDULE_MAX_BYTES_V1 || bytes.toString("base64") !== encoded) invalid();
  return bytes;
}
function prepare(input: unknown): CalendarCaptureRecordV1 {
  const data = calendarRecordV1(detached(input), [
    "schemaVersion", "captureId", "previousCaptureId", "bodyBase64Chunks", "acquisition", "bindings",
  ]) as unknown as CalendarCaptureInputV1;
  if (data.schemaVersion !== CALENDAR_CAPTURE_INPUT_V1) invalid();
  id(data.captureId);
  if (data.previousCaptureId !== null) { id(data.previousCaptureId); if (data.previousCaptureId === data.captureId) invalid(); }
  const a = calendarRecordV1(data.acquisition, [
    "schemaVersion", "sourceAuthentication", "evidenceAdmission", "clockAccuracy", "historicalOwnership",
    "sourceCurrency", "status", "network", "sourceUrl", "startedAt", "timing", "freshnessPolicy", "freshness", "http", "extraction",
  ]) as unknown as Acquired;
  if (a.schemaVersion !== OFFICIAL_SCHEDULE_ACQUISITION_V1 || a.status !== "acquired" || a.network !== "http-success" ||
      a.sourceAuthentication !== "not-performed" || a.evidenceAdmission !== "not-certified" ||
      a.clockAccuracy !== "unknown" || a.historicalOwnership !== "not-certified" || a.sourceCurrency !== "not-certified") invalid();
  calendarRecordV1(a.timing, ["acquisition", "evidenceAvailability", "persistence"]);
  calendarRecordV1(a.timing.acquisition, ["status", "completedAt"]);
  calendarRecordV1(a.timing.evidenceAvailability, ["status", "availableAt"]);
  calendarRecordV1(a.timing.persistence, ["status"]);
  if (a.timing.acquisition.status !== "recorded" || a.timing.evidenceAvailability.status !== "recorded" ||
      a.timing.persistence.status !== "not-persisted") invalid();
  const completed = calendarInstantV1(a.timing.acquisition.completedAt);
  const available = calendarInstantV1(a.timing.evidenceAvailability.availableAt);
  if (completed < calendarInstantV1(a.startedAt) || available < completed) invalid();
  calendarRecordV1(a.freshness, ["scope", "assessedAt", "expiresAt", "observedAgeMilliseconds"]);
  calendarRecordV1(a.freshnessPolicy, ["maximumAgeMilliseconds"]);
  const lifetime = integer(a.freshnessPolicy.maximumAgeMilliseconds, 1);
  if (a.freshness.scope !== "unverified-response-age" || calendarInstantV1(a.freshness.assessedAt) !== available ||
      calendarInstantV1(a.freshness.expiresAt) - available !== lifetime ||
      integer(a.freshness.observedAgeMilliseconds) + lifetime > 60_000) invalid();
  calendarRecordV1(a.http, ["status", "responseDate", "ageSeconds", "lastModified", "receivedBytes", "deliveredBodySha256"]);
  if (a.http.status !== 200 || calendarInstantV1(a.http.responseDate) > completed ||
      available - calendarInstantV1(a.http.responseDate) > a.freshness.observedAgeMilliseconds) invalid();
  if (a.http.ageSeconds !== null && (integer(a.http.ageSeconds) + 1) * 1000 > a.freshness.observedAgeMilliseconds) invalid();
  if (a.http.lastModified !== null) calendarInstantV1(a.http.lastModified);
  const bytes = body(data.bodyBase64Chunks);
  const digest = sha(bytes);
  if (integer(a.http.receivedBytes, 1) !== bytes.length || a.http.deliveredBodySha256 !== digest) invalid();
  const publisher = a.extraction?.status === "available" ? a.extraction.document.publisher : null;
  if (publisher !== "ecb" && publisher !== "boj") invalid();
  const source = OFFICIAL_SCHEDULE_SOURCES_V1[publisher];
  if (a.sourceUrl !== source.sourceUrl) invalid();
  const document = {
    schemaVersion: OFFICIAL_SCHEDULE_DOCUMENT_V1, publisher, sourceUrl: source.sourceUrl,
    documentId: "official-schedule:" + publisher + ":html", sourceVersionId: "sha256:" + digest,
    mediaType: "text/html", timeZone: source.timeZone,
    content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  };
  const extraction = publisher === "ecb" ? extractEcbOfficialScheduleHtmlV1(document) : extractBojOfficialScheduleHtmlV1(document);
  if (extraction.status !== "available" || !equal(extraction, a.extraction) ||
      !Array.isArray(data.bindings) || data.bindings.length !== extraction.rows.length) invalid();
  const seen = new Set<string>();
  const eventVersions = extraction.rows.map((row, index) => {
    const binding = calendarRecordV1(data.bindings[index], ["canonicalMeetingDate", "versionId", "revision"]) as unknown as CalendarCaptureBindingV1;
    const context = {
      ...binding, state: "scheduled", sourceVersionId: document.sourceVersionId,
      timing: { acquisition: a.timing.acquisition,
        evidenceAvailability: { status: "unavailable", reason: "availability-time-unavailable" },
        persistence: { status: "not-persisted" } }, freshnessPolicy: a.freshnessPolicy,
    };
    const result = publisher === "ecb"
      ? normalizeEcbOfficialScheduleV1({ schemaVersion: ECB_OFFICIAL_SCHEDULE_INPUT_V1, candidate: row.candidate, announcementClock: null, context })
      : normalizeBojOfficialScheduleV1({ schemaVersion: BOJ_OFFICIAL_SCHEDULE_INPUT_V1, candidate: row.candidate, context });
    if (result.status !== "available" || !equal(result.event.eventTime, row.eventTime) || seen.has(result.event.eventId)) invalid();
    seen.add(result.event.eventId);
    return { event: result.event, sha256: sha(canonical(result.event)) };
  });
  const record = { schemaVersion: CALENDAR_CAPTURE_V1, input: data, acquisitionCutoff: a.timing.acquisition.completedAt,
    evidenceAvailability: { status: "unavailable", reason: "qualification-not-performed" },
    durablePersistence: { status: "unavailable", reason: "offline-only" }, eventVersions } as const;
  return detached({ ...record, recordSha256: sha(canonical(record)) });
}
/** Archive preparation only. Supplied HTTP observations are not authenticated.
 * Old captures can be archived after HTTP expiry; this never admits them as current. */
export function prepareCalendarCaptureV1(input: unknown): CalendarCaptureResultV1 {
  try { return Object.freeze({ status: "prepared", record: prepare(input) }); }
  catch { return Object.freeze({ status: "unavailable", reason: "invalid-capture" }); }
}
function readRecord(value: unknown): CalendarCaptureRecordV1 {
  const data = calendarRecordV1(detached(value), [
    "schemaVersion", "input", "acquisitionCutoff", "evidenceAvailability", "durablePersistence", "eventVersions", "recordSha256",
  ]);
  const rebuilt = prepare(data.input);
  if (!equal(rebuilt, data)) invalid();
  return rebuilt;
}
function history(entries: readonly Entry[]): void {
  const captures = new Set<string>();
  const events = new Map<string, CalendarEventV1>();
  const versionIds = new Set<string>();
  let previous: Entry | undefined;
  for (const entry of entries) {
    const r = entry.record;
    const receipt = calendarRecordV1(entry.receipt, ["scope", "sequence", "captureId", "recordSha256", "observedAcknowledgedAt"]);
    if (receipt.scope !== "volatile-offline-only" || receipt.sequence !== captures.size + 1 ||
        receipt.captureId !== r.input.captureId || receipt.recordSha256 !== r.recordSha256 ||
        captures.has(r.input.captureId) || r.input.previousCaptureId !== (previous?.record.input.captureId ?? null) ||
        calendarInstantV1(receipt.observedAcknowledgedAt) < calendarInstantV1(r.input.acquisition.timing.evidenceAvailability.status === "recorded"
          ? r.input.acquisition.timing.evidenceAvailability.availableAt : "")) invalid();
    if (previous && (calendarInstantV1(receipt.observedAcknowledgedAt) < calendarInstantV1(previous.receipt.observedAcknowledgedAt) ||
        calendarInstantV1(r.acquisitionCutoff) < calendarInstantV1(previous.record.acquisitionCutoff) ||
        r.input.acquisition.extraction.document.documentId !== previous.record.input.acquisition.extraction.document.documentId)) invalid();
    for (const { event } of r.eventVersions) {
      const prior = events.get(event.eventId);
      if (!prior) {
        if (event.revision.sequence !== 1) invalid();
      } else if (event.versionId === prior.versionId) {
        if (!equal(event, prior)) invalid();
      } else if (event.revision.sequence !== prior.revision.sequence + 1 ||
          event.revision.supersedesVersionId !== prior.versionId) invalid();
      const key = canonical([event.eventId, event.versionId]);
      if (versionIds.has(key) && event.versionId !== prior?.versionId) invalid();
      versionIds.add(key);
      events.set(event.eventId, event);
    }
    captures.add(r.input.captureId);
    previous = entry;
  }
}
/** Synchronous linearization models one atomic append + head CAS. Memory only:
 * no durability, no cross-process guarantee, no TTL/delete/production adapter.
 * A checkpoint is an untrusted full simulation export, never a storage receipt. */
export function createOfflineCalendarJournalV1(
  dependencies: CalendarOfflineDependenciesV1, checkpoint?: unknown,
): CalendarOfflineJournalV1 {
  const now = dependencies.now;
  const fault = dependencies.fault ?? (() => "none");
  let entries: readonly Entry[] = Object.freeze([]);
  let corrupt = false;
  let busy = false;
  if (checkpoint !== undefined) {
    try {
      const data = calendarRecordV1(detached(checkpoint), ["schemaVersion", "scope", "entries"]);
      if (data.schemaVersion !== CALENDAR_OFFLINE_CHECKPOINT_V1 || data.scope !== "volatile-offline-only" ||
          !Array.isArray(data.entries) || data.entries.length > CALENDAR_OFFLINE_CAPACITY_V1) invalid();
      const recovered = data.entries.map(value => {
        const entry = calendarRecordV1(value, ["record", "receipt"]);
        return { record: readRecord(entry.record), receipt: entry.receipt as CalendarOfflineReceiptV1 };
      });
      history(recovered);
      entries = Object.freeze(recovered);
    } catch { corrupt = true; }
  }
  return Object.freeze({
    scope: "volatile-offline-only" as const,
    checkpoint: () => corrupt ? Object.freeze({ status: "unavailable", reason: "corrupt-history" })
      : detached({ schemaVersion: CALENDAR_OFFLINE_CHECKPOINT_V1, scope: "volatile-offline-only", entries }),
    append: (input: unknown): CalendarOfflineAppendResultV1 => {
      const unavailable = (reason: Extract<CalendarOfflineAppendResultV1, { status: "unavailable" }>["reason"]) =>
        Object.freeze({ status: "unavailable" as const, reason });
      if (corrupt) return unavailable("corrupt-history");
      if (busy) return unavailable("conflict");
      busy = true;
      try {
        let record: CalendarCaptureRecordV1;
        try { record = readRecord(input); } catch { return unavailable("invalid-capture"); }
        const existing = entries.find(entry => entry.record.input.captureId === record.input.captureId);
        if (existing) return existing.record.recordSha256 === record.recordSha256
          ? Object.freeze({ status: "idempotent", receipt: existing.receipt }) : unavailable("conflict");
        if (entries.length >= CALENDAR_OFFLINE_CAPACITY_V1) return unavailable("capacity-exceeded");
        if (record.input.previousCaptureId !== (entries.at(-1)?.record.input.captureId ?? null)) return unavailable("conflict");
        let observedAcknowledgedAt: string;
        try { observedAcknowledgedAt = now(); calendarInstantV1(observedAcknowledgedAt); }
        catch { return unavailable("clock-unavailable"); }
        const receipt = detached({ scope: "volatile-offline-only" as const, sequence: entries.length + 1,
          captureId: record.input.captureId, recordSha256: record.recordSha256, observedAcknowledgedAt });
        const next = [...entries, { record, receipt }];
        try { history(next); } catch { return unavailable("conflict"); }
        // Ensure the bounded, passive full export is recoverable before committing.
        try { detached({ schemaVersion: CALENDAR_OFFLINE_CHECKPOINT_V1, scope: "volatile-offline-only", entries: next }); }
        catch { return unavailable("capacity-exceeded"); }
        try {
          const mode = fault();
          if (mode === "before-append") return unavailable("simulated-failure");
          if (mode !== "none" && mode !== "after-append") return unavailable("simulated-failure");
          entries = Object.freeze(next); // Single synchronous commit point; no await/callback within it.
          if (mode === "after-append") return unavailable("outcome-unknown");
          return Object.freeze({ status: "appended", receipt });
        } catch { return unavailable("simulated-failure"); }
      } finally { busy = false; }
    },
  });
}
