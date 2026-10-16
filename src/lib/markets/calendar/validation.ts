import "server-only";

import { types } from "node:util";
import { parseEventInstantV1 } from "../events/eventClock";
import {
  CALENDAR_EVENT_SCHEMA_V1, CALENDAR_PRODUCTS_V1,
  type CalendarEventV1, type CalendarProvenanceV1, type CalendarTimeV1,
} from "./contracts";

export class CalendarContractErrorV1 extends TypeError {
  constructor() { super("Unsupported canonical calendar data."); this.name = "CalendarContractErrorV1"; }
}
function fail(): never { throw new CalendarContractErrorV1(); }

/** Bounded passive-data copy: no getters, iterators, toJSON, or proxy inspection. */
export function snapshotCalendarDataV1(input: unknown): unknown {
  let nodes = 0;
  const ancestors = new WeakSet<object>();
  function copy(value: unknown, depth: number): unknown {
    if (++nodes > 25_000 || depth > 24) fail();
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") { if (value.length > 2_048) fail(); return value; }
    if (typeof value === "number") { if (!Number.isFinite(value) || Object.is(value, -0)) fail(); return value; }
    if (typeof value !== "object" || types.isProxy(value) || ancestors.has(value)) fail();
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail();
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    let result: unknown;
    if (array) {
      const length = descriptors.length?.value as unknown;
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length > 512 ||
          keys.length !== length + 1) fail();
      const items: unknown[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail();
        Object.defineProperty(items, String(index), { value: copy(descriptor.value, depth + 1), enumerable: true });
      }
      result = items;
    } else {
      const record: Record<string, unknown> = Object.create(null);
      for (const key of keys) {
        if (typeof key !== "string") fail();
        const descriptor = descriptors[key];
        if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail();
        record[key] = copy(descriptor.value, depth + 1);
      }
      result = record;
    }
    ancestors.delete(value);
    return Object.freeze(result);
  }
  try { return copy(input, 0); } catch { return fail(); }
}

export function calendarRecordV1(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 160): string {
  if (typeof value !== "string" || value.length > maximum || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) fail();
  return value;
}
function oneOf(value: unknown, values: readonly string[]): void {
  if (typeof value !== "string" || !values.includes(value)) fail();
}
export function calendarInstantV1(value: unknown): number {
  if (typeof value !== "string" || value.endsWith("-00:00")) fail();
  const offset = /[+-](\d{2}):(\d{2})$/.exec(value);
  if (offset && Number(offset[1]) * 60 + Number(offset[2]) > 840) fail();
  try {
    const ms = parseEventInstantV1(value, "calendar instant");
    if (!Number.isSafeInteger(ms) || ms < 0 || ms > 253_402_300_799_999) fail();
    return ms;
  } catch { return fail(); }
}
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  calendarInstantV1(value + "T00:00:00Z");
  return value;
}
function zone(value: unknown, nullable = false): void {
  if (nullable && value === null) return;
  text(value);
  // Named zones only; a bare UTC offset is not a civil-time ruleset.
  if (typeof value !== "string" || !/^(?:UTC|[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/.test(value)) fail();
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); } catch { fail(); }
}

function validateTime(value: unknown): asserts value is CalendarTimeV1 {
  const kind = (value as Record<string, unknown> | null)?.kind;
  if (kind === "exact") {
    const data = calendarRecordV1(value, ["kind", "at", "timeZone", "localDateTime"]);
    const instant = calendarInstantV1(data.at);
    zone(data.timeZone);
    if (typeof data.localDateTime !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(data.localDateTime)) fail();
    const civil = calendarInstantV1(data.localDateTime + "Z");
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: data.timeZone as string,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
    const part = (name: string) => parts.find(item => item.type === name)?.value;
    const local = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
    if (local !== data.localDateTime.slice(0, 19) || civil % 1_000 !== instant % 1_000) fail();
  } else if (kind === "date-only") {
    const data = calendarRecordV1(value, ["kind", "date", "timeZone"]);
    date(data.date); zone(data.timeZone, true);
  } else if (kind === "window") {
    const data = calendarRecordV1(value, ["kind", "startsAt", "endsAt", "timeZone"]);
    if (calendarInstantV1(data.endsAt) <= calendarInstantV1(data.startsAt)) fail();
    zone(data.timeZone);
  } else if (kind === "unknown") {
    const data = calendarRecordV1(value, ["kind", "expectedDate", "timeZone", "reason"]);
    if (data.expectedDate !== null) date(data.expectedDate);
    zone(data.timeZone, true);
    oneOf(data.reason, ["not-announced", "announcement-time-unspecified"]);
  } else fail();
}

const publisherHosts = {
  ecb: ["www.ecb.europa.eu", "data.ecb.europa.eu", "data-api.ecb.europa.eu"],
  boj: ["www.boj.or.jp"], "federal-reserve": ["www.federalreserve.gov"],
  "new-york-fed": ["www.newyorkfed.org", "markets.newyorkfed.org"],
  boe: ["www.bankofengland.co.uk"], snb: ["www.snb.ch", "data.snb.ch"],
  eurostat: ["ec.europa.eu"], bls: ["www.bls.gov", "data.bls.gov", "api.bls.gov"],
  bea: ["www.bea.gov", "apps.bea.gov"],
} as const;
function provenance(value: unknown): asserts value is CalendarProvenanceV1 {
  const data = calendarRecordV1(value, ["authority", "publisher", "sourceUrl", "sourceVersionId", "parserVersion"]);
  if (data.authority !== "primary-publisher") fail();
  oneOf(data.publisher, Object.keys(publisherHosts));
  text(data.sourceVersionId); text(data.parserVersion);
  const urlText = text(data.sourceUrl, 1_024);
  let url: URL;
  try { url = new URL(urlText); } catch { return fail(); }
  const hosts: readonly string[] = publisherHosts[data.publisher as keyof typeof publisherHosts];
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      !hosts.includes(url.hostname) || url.href !== urlText) fail();
  if (data.publisher === "eurostat" && !url.pathname.startsWith("/eurostat/")) fail();
}

function timing(value: unknown): asserts value is CalendarEventV1["timing"] {
  const data = calendarRecordV1(value, ["acquisition", "evidenceAvailability", "persistence"]);
  const acquisition = data.acquisition as Record<string, unknown>;
  const availability = data.evidenceAvailability as Record<string, unknown>;
  const persistence = data.persistence as Record<string, unknown>;
  let completed: number | null = null;
  let available: number | null = null;
  if (acquisition?.status === "recorded") {
    calendarRecordV1(acquisition, ["status", "completedAt"]);
    completed = calendarInstantV1(acquisition.completedAt);
  } else {
    calendarRecordV1(acquisition, ["status", "reason"]);
    if (acquisition.status !== "unavailable" || acquisition.reason !== "acquisition-time-unavailable") fail();
  }
  if (availability?.status === "recorded") {
    calendarRecordV1(availability, ["status", "availableAt"]);
    available = calendarInstantV1(availability.availableAt);
    if (completed === null || available < completed) fail();
  } else {
    calendarRecordV1(availability, ["status", "reason"]);
    if (availability.status !== "unavailable" || availability.reason !== "availability-time-unavailable") fail();
  }
  if (persistence?.status === "acknowledged") {
    calendarRecordV1(persistence, ["status", "acknowledgedAt", "recordId"]);
    text(persistence.recordId, 256);
    if (available === null || calendarInstantV1(persistence.acknowledgedAt) < available) fail();
  } else if (persistence?.status === "not-persisted") calendarRecordV1(persistence, ["status"]);
  else {
    calendarRecordV1(persistence, ["status", "reason"]);
    if (persistence.status !== "unavailable" || persistence.reason !== "acknowledgement-unavailable") fail();
  }
}

/** Validates a detached closed description. No acquisition, qualification, or clock sampling. */
export function readCalendarEventV1(input: unknown): CalendarEventV1 {
  const value = snapshotCalendarDataV1(input);
  const data = calendarRecordV1(value, ["schemaVersion", "semantic", "eventId", "versionId", "title", "family",
    "state", "eventTime", "publication", "referencePeriod", "effectiveDate", "provenance", "timing",
    "revision", "relevance", "freshnessPolicy"]);
  if (data.schemaVersion !== CALENDAR_EVENT_SCHEMA_V1 || data.semantic !== "source-fact-description") fail();
  text(data.eventId); text(data.versionId); text(data.title);
  oneOf(data.family, ["policy-decision", "statistical-release", "benchmark-publication", "policy-minutes", "policy-report"]);
  oneOf(data.state, ["scheduled", "published", "cancelled"]);
  validateTime(data.eventTime); provenance(data.provenance); timing(data.timing);
  if (data.referencePeriod !== null) text(data.referencePeriod, 80);
  if (data.effectiveDate !== null) date(data.effectiveDate);
  const publication = data.publication as Record<string, unknown>;
  if (publication?.status === "recorded") {
    calendarRecordV1(publication, ["status", "time", "provenance"]);
    validateTime(publication.time); provenance(publication.provenance);
    if (publication.time.kind === "unknown" || publication.provenance.publisher !== data.provenance.publisher ||
        data.state !== "published" || data.timing.acquisition.status !== "recorded") fail();
    // Civil dates do not supply an absolute lower bound without a separately qualified zone policy.
    const latest = publication.time.kind === "exact" ? calendarInstantV1(publication.time.at)
      : publication.time.kind === "window" ? calendarInstantV1(publication.time.endsAt) : null;
    if (latest !== null && latest > calendarInstantV1(data.timing.acquisition.completedAt)) fail();
  } else {
    calendarRecordV1(publication, ["status", "reason"]);
    if (publication.status !== "unavailable") fail();
    oneOf(publication.reason, ["not-published", "publication-time-unverified"]);
    if (data.state === "published" && publication.reason === "not-published") fail();
  }
  const revision = calendarRecordV1(data.revision, ["sequence", "supersedesVersionId", "change"]);
  if (typeof revision.sequence !== "number" || !Number.isSafeInteger(revision.sequence) || revision.sequence < 1) fail();
  oneOf(revision.change, ["initial", "schedule-revision", "publication-update", "source-correction", "cancellation", "reinstatement"]);
  if (revision.sequence === 1) {
    if (revision.supersedesVersionId !== null || revision.change !== "initial") fail();
  } else {
    text(revision.supersedesVersionId);
    if (revision.supersedesVersionId === data.versionId || revision.change === "initial") fail();
  }
  if ((revision.change === "cancellation" && data.state !== "cancelled") ||
      (revision.change === "reinstatement" && data.state !== "scheduled")) fail();
  if (!Array.isArray(data.relevance) || data.relevance.length === 0 || data.relevance.length > CALENDAR_PRODUCTS_V1.length) fail();
  const products = new Set<string>();
  for (const entry of data.relevance) {
    const relevance = calendarRecordV1(entry, ["productId", "relationship"]);
    oneOf(relevance.productId, CALENDAR_PRODUCTS_V1);
    oneOf(relevance.relationship, ["direct-policy", "counterparty-policy", "macro-context", "benchmark-publication"]);
    if (products.has(relevance.productId as string)) fail();
    products.add(relevance.productId as string);
    if (relevance.relationship === "benchmark-publication" && relevance.productId !== "estr") fail();
    if (data.family === "benchmark-publication" &&
        (relevance.productId !== "estr" || relevance.relationship !== "benchmark-publication" || data.provenance.publisher !== "ecb")) fail();
  }
  const freshness = calendarRecordV1(data.freshnessPolicy, ["maximumAgeMilliseconds"]);
  const age = freshness.maximumAgeMilliseconds;
  if (age !== null) {
    if (typeof age !== "number" || !Number.isSafeInteger(age) || age <= 0) fail();
    if (data.timing.evidenceAvailability.status === "recorded" &&
        calendarInstantV1(data.timing.evidenceAvailability.availableAt) + age > 253_402_300_799_999) fail();
  }
  return value as CalendarEventV1;
}
