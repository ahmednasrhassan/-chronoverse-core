import { XMLParser } from "fast-xml-parser";
import { assertUsPolicyServerV1, fomcDocumentUrlV1, isCivilDateV1, loadUsPolicyTextV1,
  type UsPolicyTransportDependenciesV1,
} from "./transport";

export class UsPolicyValidationError extends Error {
  constructor(readonly code: "source" | "document" | "range" | "ambiguous" | "conflict" | "date" |
    "schema" | "value" | "duplicate-date" | "empty" | "annotation" | "capture-time") {
    super(`U.S. policy evidence validation failed: ${code}.`); this.name = "UsPolicyValidationError";
  }
}
export interface FomcFactV1 {
  readonly decisionDate: string;
  readonly targetLower: number;
  readonly targetUpper: number;
  readonly unit: "percent";
  readonly action: "maintain" | "raise" | "lower";
  readonly statementUrl: string;
  readonly implementationNoteUrl: string | null;
  readonly effectiveDate: string | null;
  /** Null means unavailable, not a scheduled/assumed publication time. */
  readonly releaseTimestamp: number | null;
}
export interface FomcDocumentV1 { readonly url: string; readonly html: string }
export type FomcHtmlLoaderV1 = (url: string, signal: AbortSignal) => Promise<FomcDocumentV1>;
export async function loadFomcDocumentV1(url: string, dependencies: UsPolicyTransportDependenciesV1): Promise<FomcDocumentV1> {
  return Object.freeze({ url, html: await loadUsPolicyTextV1(url, "text/html", dependencies) });
}
type Node = Record<string, unknown>;
const parser = new XMLParser({ allowBooleanAttributes: true, htmlEntities: true, ignoreAttributes: false, preserveOrder: true,
  processEntities: { enabled: true, maxEntityCount: 100, maxEntitySize: 1000, maxExpandedLength: 100000, maxTotalExpansions: 1000 },
  stopNodes: ["*.script", "*.style"], unpairedTags: ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"],
});
const hidden = new Set(["script", "style", "noscript", "template", "nav", "footer", "aside"]);
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const rateToken = "(?:\\d+-[13]/4|\\d+-1/2|[13]/4|1/2|\\d+(?:\\.\\d{1,2})?)";
const rangeSentence = new RegExp(`(?:^|[.!?] )(?:(?:In support of (?:its|these) goals, )?)the Committee decided to (maintain|raise|lower) the target range for the federal funds rate (at|to|by ${rateToken} percentage points? to) (${rateToken}) to (${rateToken}) percent\\.`, "gi");
const directiveRange = new RegExp(`^Undertake open market operations as necessary to maintain the federal funds rate in a target range of (${rateToken}) to (${rateToken}) percent\\.$`);

function attrs(node: Node): Record<string, unknown> { return record(node[":@"]) ? node[":@"] : {}; }
function children(node: Node): Node[] {
  const tag = Object.keys(node).find((key) => key !== ":@"); const value = tag === undefined ? undefined : node[tag];
  return Array.isArray(value) ? value.filter(record) : [];
}
function find(nodes: readonly Node[], predicate: (node: Node) => boolean, depth = 0): Node[] {
  if (depth > 80) throw new UsPolicyValidationError("document");
  return nodes.flatMap((node) => {
    if (Object.keys(node).some((tag) => hidden.has(tag))) return [];
    return [...(predicate(node) ? [node] : []), ...find(children(node), predicate, depth + 1)];
  });
}
function text(nodes: readonly Node[], inline = false, depth = 0): string {
  if (depth > 80) throw new UsPolicyValidationError("document");
  return nodes.map((node) => {
    if (typeof node["#text"] === "string") return node["#text"];
    const tag = Object.keys(node).find((key) => key !== ":@");
    if (tag === undefined || hidden.has(tag) || (inline && !["a", "strong", "em", "span", "br", "sup", "sub"].includes(tag))) return "";
    return text(children(node), inline, depth + 1);
  }).join(" ").replace(/[\u2010\u2011\u2013\u2212]/g, "-").replace(/\s+/g, " ").trim();
}
function one(nodes: Node[], code: "document" | "ambiguous" = "document"): Node {
  if (nodes.length !== 1) throw new UsPolicyValidationError(nodes.length > 1 ? "ambiguous" : code);
  return nodes[0]!;
}
/** Isolate the explicitly closed official main div before XML parsing. The Fed
 * navigation uses HTML optional end tags; it is not an XML ancestor of main.
 * Within main, apply only HTML's paragraph-end rule, leaving fact text intact. */
function officialMainHtml(html: string): string {
  let cursor = 0, start = -1, divDepth = 0, end = -1, paragraph = false;
  const pieces: string[] = [];
  const ignored: string[] = [];
  const paragraphEnds = new Set(["address", "article", "aside", "blockquote", "div", "dl", "fieldset", "footer", "form",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul"]);
  while (cursor < html.length) {
    const opening = html.indexOf("<", cursor);
    if (opening < 0) break;
    if (start >= 0 && end < 0 && ignored.length === 0) pieces.push(html.slice(cursor, opening));
    if (html.startsWith("<!--", opening)) {
      const close = html.indexOf("-->", opening + 4);
      if (close < 0) throw new UsPolicyValidationError("document");
      cursor = close + 3; continue;
    }
    let quote = "", closing = opening + 1;
    for (; closing < html.length; closing++) {
      const character = html[closing]!;
      if (quote) { if (character === quote) quote = ""; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (closing >= html.length) throw new UsPolicyValidationError("document");
    const token = html.slice(opening, closing + 1);
    const tag = /^<(\/?)([a-z][a-z0-9:-]*)(?=[\s/>])/i.exec(token);
    cursor = closing + 1;
    if (!tag) { if (start >= 0 && end < 0) throw new UsPolicyValidationError("document"); continue; }
    const name = tag[2]!.toLowerCase(), isClose = tag[1] === "/";
    if ((name === "script" || name === "style") && !isClose) {
      const close = new RegExp(`</${name}\\s*>`, "gi"); close.lastIndex = cursor;
      const match = close.exec(html);
      if (!match) throw new UsPolicyValidationError("document");
      cursor = close.lastIndex; continue;
    }
    if (hidden.has(name)) {
      if (!isClose) ignored.push(name);
      else if (ignored.at(-1) === name) ignored.pop();
      else if (ignored.length > 0) throw new UsPolicyValidationError("document");
      continue;
    }
    if (ignored.length > 0) continue;
    if (name === "div" && !isClose) {
      const node: unknown = parser.parse(`${token}</div>`);
      if (Array.isArray(node) && record(node[0]) && attrs(node[0])["@_id"] === "content" && attrs(node[0])["@_role"] === "main") {
        if (start >= 0) throw new UsPolicyValidationError("ambiguous");
        start = opening;
      }
    }
    if (start < 0 || end >= 0) continue;
    if (paragraph && (paragraphEnds.has(name) || (isClose && !["a", "strong", "em", "span", "sup", "sub", "br"].includes(name)))) {
      pieces.push("</p>"); paragraph = false;
      if (name === "p" && isClose) continue;
    }
    if (name === "p") { if (isClose) continue; paragraph = true; }
    pieces.push(token);
    if (name === "div") divDepth += isClose ? -1 : 1;
    if (divDepth === 0) end = cursor;
  }
  if (start < 0 || end < 0 || ignored.length > 0) throw new UsPolicyValidationError("document");
  return pieces.join("");
}
function content(document: FomcDocumentV1, date: string, implementation = false): Node[] {
  assertUsPolicyServerV1();
  if (document.url !== fomcDocumentUrlV1(date, implementation) || typeof document.html !== "string") throw new UsPolicyValidationError("source");
  let nodes: unknown;
  try {
    if (/<!ENTITY/i.test(document.html) || /<!DOCTYPE(?!\s+html\s*>)/i.test(document.html)) throw new UsPolicyValidationError("document");
    nodes = parser.parse(officialMainHtml(document.html));
  } catch (error) {
    if (error instanceof UsPolicyValidationError || error instanceof TypeError || error instanceof ReferenceError) throw error;
    throw new UsPolicyValidationError("document");
  }
  if (!Array.isArray(nodes)) throw new UsPolicyValidationError("document");
  const main = one(find(nodes.filter(record), (node) => attrs(node)["@_id"] === "content" && attrs(node)["@_role"] === "main"));
  const scope = children(main);
  const dates = find(scope, (node) => Object.hasOwn(node, "p") && String(attrs(node)["@_class"] ?? "").split(/\s+/).includes("article__time"));
  if (englishDate(text(children(one(dates)), true)) !== date) throw new UsPolicyValidationError("date");
  const heading = one(find(scope, (node) => Object.hasOwn(node, "h3")));
  if (text(children(heading)) !== (implementation ? `Implementation Note issued ${englishFromIso(date)}` : "Federal Reserve issues FOMC statement")) {
    throw new UsPolicyValidationError("source");
  }
  return scope;
}
function englishDate(value: string): string {
  const match = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(value); const month = match ? months.indexOf(match[1]!) + 1 : 0;
  const date = match ? `${match[3]}-${String(month).padStart(2, "0")}-${match[2]!.padStart(2, "0")}` : "";
  if (month === 0 || !isCivilDateV1(date)) throw new UsPolicyValidationError("date"); return date;
}
function englishFromIso(date: string): string { return `${months[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}, ${date.slice(0, 4)}`; }
function officialLink(node: Node, base: string): string {
  const href = attrs(node)["@_href"];
  if (typeof href !== "string" || !URL.canParse(href, base)) throw new UsPolicyValidationError("source");
  return new URL(href, base).toString();
}
function rate(value: string): number {
  const mixed = /^(?:(\d+)-)?([13])\/(2|4)$/.exec(value);
  const result = mixed ? Number(mixed[1] ?? 0) + Number(mixed[2]) / Number(mixed[3]) : Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 100) throw new UsPolicyValidationError("range"); return result;
}
function release(scope: Node[], date: string): number | null {
  const nodes = find(scope, (node) => Object.hasOwn(node, "p") && String(attrs(node)["@_class"] ?? "").split(/\s+/).includes("releaseTime"));
  if (nodes.length === 0) return null;
  const value = text(children(one(nodes)), true);
  const match = /^For release at (\d{1,2}):(\d{2}) (a|p)\.m\. (EST|EDT)$/.exec(value);
  if (!match) return null; // ET/approximate/unrecognized time is explicitly unavailable.
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) throw new UsPolicyValidationError("date");
  return Date.parse(`${date}T${String(hour % 12 + (match[3] === "p" ? 12 : 0)).padStart(2, "0")}:${match[2]}:00${match[4] === "EST" ? "-05:00" : "-04:00"}`) / 1000;
}

export function parseFomcStatementV1(document: FomcDocumentV1, decisionDate: string): FomcFactV1 {
  const scope = content(document, decisionDate); const article = one(find(scope, (node) => attrs(node)["@_id"] === "article"));
  const body = one(find(children(article), (node) => Object.hasOwn(node, "div") && attrs(node)["@_class"] === "col-xs-12 col-sm-8 col-md-8"));
  const paragraphs = children(body).filter((node) => Object.hasOwn(node, "p"));
  const candidateCount = paragraphs.reduce((count, node) => count +
    (text(children(node), true).match(/the Committee decided to (?:maintain|raise|lower) the target range for the federal funds rate/gi)?.length ?? 0), 0);
  if (candidateCount !== 1) throw new UsPolicyValidationError(candidateCount > 1 ? "ambiguous" : "range");
  const matches = paragraphs.flatMap((node) => Array.from(text(children(node), true).matchAll(rangeSentence)));
  if (matches.length !== 1) throw new UsPolicyValidationError(matches.length > 1 ? "ambiguous" : "range");
  const match = matches[0]!;
  if ((match[1]!.toLowerCase() === "maintain") !== (match[2]!.toLowerCase() === "at")) throw new UsPolicyValidationError("range");
  const targetLower = rate(match[3]!), targetUpper = rate(match[4]!);
  if (targetLower >= targetUpper) throw new UsPolicyValidationError("range");
  const links = find(children(body), (node) => Object.hasOwn(node, "a") && text(children(node)).startsWith("Implementation Note issued"));
  let implementationNoteUrl: string | null = null;
  if (links.length > 0) {
    const link = one(links); const expected = fomcDocumentUrlV1(decisionDate, true);
    if (text(children(link)) !== `Implementation Note issued ${englishFromIso(decisionDate)}` ||
        officialLink(link, document.url) !== expected) throw new UsPolicyValidationError("source");
    implementationNoteUrl = expected;
  }
  return Object.freeze({ decisionDate, targetLower, targetUpper, unit: "percent", action: match[1]!.toLowerCase() as FomcFactV1["action"],
    statementUrl: document.url, implementationNoteUrl, effectiveDate: null, releaseTimestamp: release(scope, decisionDate) });
}

export function attachFomcImplementationV1(fact: FomcFactV1, document: FomcDocumentV1): FomcFactV1 {
  if (fact.implementationNoteUrl === null || document.url !== fact.implementationNoteUrl) throw new UsPolicyValidationError("source");
  const scope = content(document, fact.decisionDate, true);
  const link = one(find(scope, (node) => Object.hasOwn(node, "a") && text(children(node)) === "statement"));
  if (officialLink(link, document.url) !== fact.statementUrl) throw new UsPolicyValidationError("source");
  const directive = one(find(scope, (node) => Object.hasOwn(node, "li") &&
    text(children(node), true).startsWith("As part of its policy decision, the Federal Open Market Committee voted to direct the Open Market Desk")));
  const quote = one(find(children(directive), (node) => Object.hasOwn(node, "blockquote")));
  const effective = /^"Effective (.+?), the Federal Open Market Committee directs the Desk to:$/.exec(text(children(one(children(quote).filter((node) => Object.hasOwn(node, "p")))), true));
  if (!effective) throw new UsPolicyValidationError("date");
  const effectiveDate = englishDate(effective[1]!);
  if (effectiveDate < fact.decisionDate) throw new UsPolicyValidationError("date");
  const ranges = find(children(quote), (node) => Object.hasOwn(node, "li"))
    .map((node) => directiveRange.exec(text(children(node), true))).filter((value) => value !== null);
  if (ranges.length !== 1) throw new UsPolicyValidationError(ranges.length > 1 ? "ambiguous" : "range");
  if (rate(ranges[0]![1]!) !== fact.targetLower || rate(ranges[0]![2]!) !== fact.targetUpper) throw new UsPolicyValidationError("conflict");
  return Object.freeze({ ...fact, effectiveDate });
}
function record(value: unknown): value is Node { return typeof value === "object" && value !== null && !Array.isArray(value); }
