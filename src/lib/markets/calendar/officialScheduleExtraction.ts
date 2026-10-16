import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ECB_GOVERNING_COUNCIL_CALENDAR_URL, ECB_SOURCE_INSTITUTION } from "../events/ecbMonetaryPolicy";
import {
  BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1,
  type BojOfficialScheduleInputV1, type EcbOfficialScheduleInputV1,
} from "./officialPolicySchedules";
import type { CalendarTimeV1 } from "./contracts";
import { calendarInstantV1, snapshotCalendarDataV1 } from "./validation";

export const OFFICIAL_SCHEDULE_EXTRACTION_V1 = "official-schedule-extraction-v1" as const;
export const OFFICIAL_SCHEDULE_HTML_PARSER_V1 = "official-schedule-html-parser-v1" as const;
export const OFFICIAL_SCHEDULE_DOCUMENT_V1 = "official-schedule-document-v1" as const;
export const OFFICIAL_SCHEDULE_MAX_BYTES_V1 = 524_288;

export interface OfficialScheduleDocumentV1 {
  readonly schemaVersion: typeof OFFICIAL_SCHEDULE_DOCUMENT_V1;
  readonly publisher: "ecb" | "boj";
  readonly sourceUrl: string;
  /** Acquisition-owned identities. Extraction does not authenticate either. */
  readonly documentId: string;
  readonly sourceVersionId: string;
  readonly mediaType: "text/html" | "application/pdf";
  /** Explicit source qualification; never inferred from a date or client locale. */
  readonly timeZone: "Europe/Berlin" | "Asia/Tokyo";
  readonly content: string;
}
export interface OfficialScheduleDocumentIdentityV1 {
  readonly publisher: "ecb" | "boj";
  readonly sourceUrl: string;
  readonly documentId: string;
  readonly sourceVersionId: string;
  /** Digest of supplied decoded HTML text encoded as UTF-8, NOT response bytes. */
  readonly htmlTextSha256: string;
  readonly parserVersion: typeof OFFICIAL_SCHEDULE_HTML_PARSER_V1;
  readonly format: "ecb-governing-council-dl-v1" | "boj-mpm-index-table-v1";
  readonly timeZone: "Europe/Berlin" | "Asia/Tokyo";
}
export interface OfficialScheduleRowReferenceV1 {
  /** One-based source row, including non-policy entries in the ECB list. */
  readonly rowIndex: number;
  readonly tableYear: number | null;
  readonly dateLabel: string;
}
export interface EcbExtractedScheduleRowV1 {
  readonly candidate: EcbOfficialScheduleInputV1["candidate"];
  readonly eventTime: Extract<CalendarTimeV1, { kind: "date-only" }>;
  readonly reference: OfficialScheduleRowReferenceV1;
}
export interface BojExtractedScheduleRowV1 {
  readonly candidate: BojOfficialScheduleInputV1["candidate"];
  readonly eventTime: Extract<CalendarTimeV1, { kind: "unknown" }>;
  readonly reference: OfficialScheduleRowReferenceV1;
}
type UnavailableReason = "invalid-input" | "unsupported-format" | "unsupported-structure" | "malformed-source";
type ExtractionResult<T> = {
  readonly schemaVersion: typeof OFFICIAL_SCHEDULE_EXTRACTION_V1;
  readonly scope: "provided-document-only";
  readonly sourceAuthentication: "not-performed";
  readonly historicalOwnership: "not-certified";
} & (
  | { readonly status: "available"; readonly document: OfficialScheduleDocumentIdentityV1; readonly rows: readonly T[] }
  | { readonly status: "unavailable"; readonly reason: UnavailableReason }
);
export type EcbOfficialScheduleExtractionV1 = ExtractionResult<EcbExtractedScheduleRowV1>;
export type BojOfficialScheduleExtractionV1 = ExtractionResult<BojExtractedScheduleRowV1>;

class ExtractionError extends Error {
  readonly reason: UnavailableReason;
  constructor(reason: UnavailableReason) { super("Unsupported official schedule document."); this.reason = reason; }
}
function fail(reason: UnavailableReason = "unsupported-structure"): never { throw new ExtractionError(reason); }
const scope = { schemaVersion: OFFICIAL_SCHEDULE_EXTRACTION_V1, scope: "provided-document-only",
  sourceAuthentication: "not-performed", historicalOwnership: "not-certified" } as const;
const inputKeys = ["schemaVersion", "publisher", "sourceUrl", "documentId", "sourceVersionId", "mediaType", "timeZone", "content"];
const isProxy = types.isProxy;

/** Flat passive snapshot; the large primitive HTML string has its own bound,
 * while metadata continues through the existing bounded calendar copier. */
function documentInput(input: unknown, publisher: "ecb" | "boj"): OfficialScheduleDocumentV1 {
  if (typeof input !== "object" || input === null || isProxy(input)) fail("invalid-input");
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) fail("invalid-input");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== inputKeys.length ||
    Object.keys(descriptors).some(key => !inputKeys.includes(key))) fail("invalid-input");
  const data: Record<string, string> = Object.create(null);
  for (const key of inputKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") ||
      typeof descriptor.value !== "string") fail("invalid-input");
    const value: string = descriptor.value;
    if (key !== "content" && (value.length > 1_024 || !value.trim() || /\p{Cc}/u.test(value))) fail("invalid-input");
    data[key] = value;
  }
  if (data.schemaVersion !== OFFICIAL_SCHEDULE_DOCUMENT_V1 || data.publisher !== publisher ||
    data.timeZone !== (publisher === "ecb" ? "Europe/Berlin" : "Asia/Tokyo")) fail("invalid-input");
  if (data.mediaType !== "text/html") fail("unsupported-format"); // No PDF decoding or text-as-PDF fallback.
  const sourceUrl = publisher === "ecb" ? ECB_GOVERNING_COUNCIL_CALENDAR_URL : BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1;
  if (data.sourceUrl !== sourceUrl || data.documentId.length > 160 || data.sourceVersionId.length > 160) fail("invalid-input");
  if (!data.content.trim() || data.content.length > OFFICIAL_SCHEDULE_MAX_BYTES_V1 ||
    Buffer.byteLength(data.content, "utf8") > OFFICIAL_SCHEDULE_MAX_BYTES_V1 ||
    /[\p{Cc}\p{Cs}]/u.test(data.content.replace(/[\t\n\r]/g, ""))) fail("invalid-input");
  const { content, ...metadata } = data;
  return Object.freeze({ ...snapshotCalendarDataV1(metadata) as object, content }) as OfficialScheduleDocumentV1;
}

interface HtmlNode { readonly tag: string; readonly attrs: Record<string, string>; readonly children: readonly (HtmlNode | string)[] }
const allowedTags = new Set(["main", "div", "h1", "h2", "h3", "dl", "dt", "dd", "br", "a", "p", "span",
  "strong", "ul", "li", "table", "caption", "thead", "tbody", "tr", "th", "td"]);
const allowedAttributes = new Set(["class", "id", "href", "lang", "scope", "rowspan", "colspan"]);
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: "",
  parseTagValue: false, parseAttributeValue: false, trimValues: false, htmlEntities: true, unpairedTags: ["br"],
  processEntities: { enabled: true, maxEntityCount: 100, maxEntitySize: 1_000, maxExpandedLength: 131_072, maxTotalExpansions: 1_000 } });

/** Lex the bounded page to locate one real main element. Comments and raw-text
 * elements outside main cannot inject fake schedule markup. Main itself is a
 * strict, balanced subset: no browser repair, scripts, styles, templates or DTDs. */
function mainTree(html: string): HtmlNode {
  const token = /<!--[\s\S]*?-->|<!DOCTYPE\s+html\s*>|<\/?[A-Za-z][A-Za-z0-9:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+/giy;
  const stack: string[] = [];
  const outerContexts: string[] = [];
  const fragments: string[] = [];
  let mainCount = 0;
  let inMain = false;
  let tokens = 0;
  let position = 0;
  while (position < html.length) {
    token.lastIndex = position;
    const match = token.exec(html);
    if (!match || ++tokens > 20_000) fail("malformed-source");
    const part = match[0];
    position = token.lastIndex;
    if (part.startsWith("<!--")) continue;
    if (/^<!DOCTYPE/i.test(part)) { if (inMain) fail(); continue; }
    const tag = /^<(\/?)([A-Za-z][A-Za-z0-9:-]*)/.exec(part);
    if (tag) {
      const closing = tag[1] === "/";
      const name = tag[2].toLowerCase();
      if (name === "template" || name === "plaintext") fail();
      if (!inMain && ["svg", "math", "object", "select"].includes(name)) {
        if (closing) { if (outerContexts.pop() !== name) fail("malformed-source"); }
        else if (!/\/\s*>$/.test(part)) outerContexts.push(name);
      }
      if (!closing && ["script", "style", "noscript", "title", "textarea", "xmp", "iframe", "noembed"].includes(name)) {
        if (inMain) fail();
        const end = new RegExp("</" + name + "\\s*>", "gi");
        end.lastIndex = position;
        if (!end.exec(html)) fail("malformed-source");
        position = end.lastIndex;
        continue;
      }
      if (name === "main") {
        if (!closing) {
          if (++mainCount !== 1 || inMain || outerContexts.length !== 0) fail();
          inMain = true;
        } else if (!inMain) fail("malformed-source");
      }
      if (inMain) {
        if (name !== tag[2] || !allowedTags.has(name)) fail();
        if (closing) {
          if (stack.pop() !== name) fail("malformed-source");
        } else if (name !== "br") {
          if (/\/\s*>$/.test(part)) fail(); // Only the known br void element.
          stack.push(name);
          if (stack.length > 32) fail("malformed-source");
        }
      }
    }
    if (inMain) {
      fragments.push(part);
      if (tag?.[1] === "/" && tag[2] === "main") inMain = false;
    }
  }
  if (mainCount !== 1 || inMain || stack.length !== 0 || outerContexts.length !== 0) fail("malformed-source");
  const main = fragments.join("");
  if (main.length > 131_072 || XMLValidator.validate(main, { unpairedTags: ["br"] }) !== true) fail("malformed-source");
  let nodes = 0;
  function convert(entries: unknown, depth = 0): (HtmlNode | string)[] {
    if (!Array.isArray(entries) || depth > 32) fail("malformed-source");
    const result: (HtmlNode | string)[] = [];
    for (const entry of entries as Record<string, unknown>[]) {
      if (++nodes > 4_096 || typeof entry !== "object" || entry === null) fail("malformed-source");
      const names = Object.keys(entry).filter(key => key !== ":@");
      if (names.length !== 1) fail("malformed-source");
      const name = names[0];
      if (name === "#text") {
        if (typeof entry[name] !== "string") fail("malformed-source");
        result.push(entry[name]);
      } else {
        if (!allowedTags.has(name)) fail();
        const attrs = (entry[":@"] ?? {}) as Record<string, string>;
        for (const [key, value] of Object.entries(attrs)) {
          if (!allowedAttributes.has(key) || typeof value !== "string" || value.length > 1_024 ||
            (key === "class" && /(?:^|\s)(?:hidden|hide|invisible|display-none|d-none)(?:\s|$)/i.test(value))) fail();
        }
        result.push({ tag: name, attrs, children: convert(entry[name], depth + 1) });
      }
    }
    return result;
  }
  const roots = convert(parser.parse(main) as unknown);
  if (roots.length !== 1 || typeof roots[0] === "string" || roots[0].tag !== "main") fail();
  return roots[0];
}
function text(node: HtmlNode): string {
  return node.children.map(child => typeof child === "string" ? child : child.tag === "br" ? " " : text(child))
    .join("").replace(/\s+/gu, " ").trim();
}
function children(node: HtmlNode): HtmlNode[] {
  if (node.children.some(child => typeof child === "string" && child.trim())) fail();
  return node.children.filter((child): child is HtmlNode => typeof child !== "string");
}
function find(node: HtmlNode, tag: string): HtmlNode[] {
  return [...(node.tag === tag ? [node] : []), ...node.children.flatMap(child => typeof child === "string" ? [] : find(child, tag))];
}
function heading(main: HtmlNode, expected: string): void {
  const headings = find(main, "h1");
  if (headings.length !== 1 || text(headings[0]) !== expected) fail();
}
function date(value: string): string {
  try { calendarInstantV1(value + "T00:00:00Z"); return value; }
  catch { return fail("malformed-source"); }
}
function reference(rowIndex: number, tableYear: number | null, dateLabel: string): OfficialScheduleRowReferenceV1 {
  if (!dateLabel || dateLabel.length > 512) fail("malformed-source");
  return { rowIndex, tableYear, dateLabel };
}
function result<T>(input: OfficialScheduleDocumentV1, rows: T[]): ExtractionResult<T> {
  if (rows.length === 0 || rows.length > 128) fail("malformed-source");
  return snapshotCalendarDataV1({ ...scope, status: "available",
    document: { publisher: input.publisher, sourceUrl: input.sourceUrl, documentId: input.documentId,
      sourceVersionId: input.sourceVersionId, htmlTextSha256: createHash("sha256").update(input.content, "utf8").digest("hex"),
      parserVersion: OFFICIAL_SCHEDULE_HTML_PARSER_V1,
      format: input.publisher === "ecb" ? "ecb-governing-council-dl-v1" : "boj-mpm-index-table-v1", timeZone: input.timeZone },
    rows }) as ExtractionResult<T>;
}
function unavailable<T>(error: unknown): ExtractionResult<T> {
  return Object.freeze({ ...scope, status: "unavailable",
    reason: error instanceof ExtractionError ? error.reason : "malformed-source" });
}

/** Strict official English main/dl structure; no flatten-and-search fallback. */
export function extractEcbOfficialScheduleHtmlV1(value: unknown): EcbOfficialScheduleExtractionV1 {
  try {
    const input = documentInput(value, "ecb");
    const main = mainTree(input.content);
    heading(main, "Schedules for the meetings of the Governing Council and General Council of the ECB and related press conferences");
    const lists = find(main, "dl");
    if (lists.length !== 1) fail();
    const entries = children(lists[0]);
    if (!entries.length || entries.length % 2 !== 0 || entries.length > 256) fail();
    const rows: EcbExtractedScheduleRowV1[] = [];
    let previousDate = "";
    for (let index = 0; index < entries.length; index += 2) {
      const [term, definition] = [entries[index], entries[index + 1]];
      if (term.tag !== "dt" || definition.tag !== "dd" ||
        Object.keys(term.attrs).length || Object.keys(definition.attrs).length ||
        childrenInline(term).some(tag => tag !== "span") ||
        childrenInline(definition).some(tag => tag !== "br" && tag !== "span")) fail();
      const label = text(term);
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(label);
      if (!match) fail("malformed-source");
      const meetingDate = date(match[3] + "-" + match[2] + "-" + match[1]);
      if (meetingDate < previousDate) fail("malformed-source");
      previousDate = meetingDate;
      const description = text(definition);
      if (/^Governing Council of the ECB: monetary policy meeting in Frankfurt \(Day 2\), followed by press conference$/.test(description)) {
        if (rows.some(row => row.candidate.meetingDate === meetingDate)) fail("malformed-source");
        rows.push({ candidate: { sourceInstitution: ECB_SOURCE_INSTITUTION,
          sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL, meetingDate },
          eventTime: { kind: "date-only", date: meetingDate, timeZone: "Europe/Berlin" },
          reference: reference(index / 2 + 1, null, label) });
      } else if (!/^(?:Governing Council of the ECB: monetary policy meeting in Frankfurt(?: \(Day 1\))?|Governing Council of the ECB: non-monetary policy meeting(?: \(in Frankfurt\)| \(virtual\)| in Frankfurt)|General Council meeting of the ECB (?:in Frankfurt|\(virtual\))|Press conference following the Governing Council meeting of the ECB in Frankfurt)$/.test(description)) fail();
    }
    return result(input, rows);
  } catch (error) { return unavailable(error); }
}
function childrenInline(node: HtmlNode): string[] {
  return node.children.flatMap(child => typeof child === "string" ? [] : [child.tag, ...childrenInline(child)]);
}

const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const weekdays = ["Sun.", "Mon.", "Tues.", "Wed.", "Thurs.", "Fri.", "Sat."];
function bojDates(label: string, year: number): readonly [string, string] {
  const match = /^([A-Za-z]+\.?) (\d{1,2}) \(([A-Za-z]+\.)\), (\d{1,2}) \(([A-Za-z]+\.)\)(?: \[PDF [\d,]+(?:KB|MB)\])?$/.exec(label);
  if (!match || !months.includes(match[1])) fail("malformed-source");
  const month = String(months.indexOf(match[1]) + 1).padStart(2, "0");
  const first = date(String(year) + "-" + month + "-" + match[2].padStart(2, "0"));
  const last = date(String(year) + "-" + month + "-" + match[4].padStart(2, "0"));
  if (last <= first || weekdays[new Date(first + "T00:00:00Z").getUTCDay()] !== match[3] ||
    weekdays[new Date(last + "T00:00:00Z").getUTCDay()] !== match[5]) fail("malformed-source");
  return [first, last];
}

/** Only the inspected year-captioned, four-column, English MPM table format.
 * Adjacent report/minutes/opinions dates and clocks are never decision timing. */
export function extractBojOfficialScheduleHtmlV1(value: unknown): BojOfficialScheduleExtractionV1 {
  try {
    const input = documentInput(value, "boj");
    const main = mainTree(input.content);
    heading(main, "Monetary Policy Meetings");
    const tables = find(main, "table");
    if (tables.length === 0 || tables.length > 4) fail();
    const rows: BojExtractedScheduleRowV1[] = [];
    let previousYear = 0;
    let previousEnd = "";
    for (const table of tables) {
      const parts = children(table);
      if (parts.map(part => part.tag).join(",") !== "caption,thead,tbody" ||
        Object.keys(table.attrs).length || Object.keys(parts[1].attrs).length || Object.keys(parts[2].attrs).length) fail();
      const yearMatch = /^Table : (\d{4})$/.exec(text(parts[0]));
      if (!yearMatch) fail("malformed-source");
      const year = Number(yearMatch[1]);
      const yearHeading = find(main, "h2").filter(node => node.attrs.id === "p" + year);
      if (year <= previousYear || yearHeading.length !== 1 || text(yearHeading[0]) !== String(year)) fail("malformed-source");
      previousYear = year;
      const header = children(parts[1]);
      if (header.length !== 2 || header.some(row => row.tag !== "tr")) fail();
      const top = children(header[0]);
      const bottom = children(header[1]);
      if (top.length !== 2 || bottom.length !== 3 || [...top, ...bottom].some(cell => cell.tag !== "th") ||
        text(top[0]) !== "Date of MPM" || top[0].attrs.rowspan !== "2" ||
        text(top[1]) !== "Release Schedule" || top[1].attrs.colspan !== "3" ||
        bottom.map(text).join("|") !== "Outlook Report (The Bank's View)|Summary of Opinions|MPM Minutes" ||
        Object.entries(top[0].attrs).some(([key, value]) => !((key === "scope" && value === "col") || (key === "rowspan" && value === "2"))) ||
        Object.entries(top[1].attrs).some(([key, value]) => !((key === "scope" && value === "col") || (key === "colspan" && value === "3"))) ||
        bottom.some(cell => Object.entries(cell.attrs).some(([key, value]) => key !== "scope" || value !== "col")) ||
        header.some(row => Object.keys(row.attrs).length)) fail();
      const body = children(parts[2]);
      if (!body.length || body.length > 64) fail();
      for (let index = 0; index < body.length; index++) {
        if (body[index].tag !== "tr" || Object.keys(body[index].attrs).length) fail();
        const cells = children(body[index]);
        if (cells.length !== 4 || cells.some(cell => cell.tag !== "td" || Object.keys(cell.attrs).length) ||
          cells.some(cell => childrenInline(cell).some(tag => !["a", "br", "span"].includes(tag)))) fail();
        const label = text(cells[0]);
        const [first, last] = bojDates(label, year);
        if (first <= previousEnd) fail("malformed-source");
        previousEnd = last;
        rows.push({ candidate: { sourceUrl: BOJ_OFFICIAL_MEETING_SCHEDULE_URL_V1, meetingStartsOn: first, meetingEndsOn: last },
          eventTime: { kind: "unknown", expectedDate: last, timeZone: "Asia/Tokyo", reason: "announcement-time-unspecified" },
          reference: reference(index + 1, year, label) });
      }
    }
    return result(input, rows);
  } catch (error) { return unavailable(error); }
}
