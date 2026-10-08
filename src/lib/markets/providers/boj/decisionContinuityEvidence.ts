import "server-only";

import { createHash } from "node:crypto";
import { types } from "node:util";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export const BOJ_DECISION_CONTINUITY_EVIDENCE_SCHEMA_VERSION_V1 = "boj-decision-continuity-source-evidence-v1" as const;
export const BOJ_DECISION_CONTINUITY_PARSER_QUALIFICATION_V1 = "boj-june-2024-minutes-explicit-reference-v1" as const;

export interface BojDecisionContinuityDocumentInputV1 {
  readonly sourceUrl: string;
  readonly documentKind: "mpm-minutes-english-html";
  /** Caller-supplied qualified <main> fragment, with optional outer whitespace only; no authenticated capture. */
  readonly html: string;
}

export interface BojDecisionContinuityEvidenceV1 {
  readonly schemaVersion: typeof BOJ_DECISION_CONTINUITY_EVIDENCE_SCHEMA_VERSION_V1;
  readonly parserQualificationVersion: typeof BOJ_DECISION_CONTINUITY_PARSER_QUALIFICATION_V1;
  readonly semantic: "source-fact-description";
  readonly provenance: {
    readonly basis: "parsed-caller-supplied-document";
    readonly acquisitionTrust: "not-established";
    readonly officialSuccessionVerification: "not-performed";
  };
  readonly source: {
    readonly publisher: "Bank of Japan";
    readonly host: "www.boj.or.jp";
    readonly url: string;
    readonly documentKind: "mpm-minutes-english-html";
    readonly documentId: "BOJ:mpm-minutes:2024-06-13:2024-06-14:en";
    readonly publication: { readonly semantic: "source-stated-publication-date"; readonly date: "2024-08-05" };
    /** Whole input string encoded as UTF-8, unchanged; not wire bytes or a publisher revision ID. */
    readonly documentDigest: {
      readonly algorithm: "sha256";
      readonly representation: "caller-supplied-decoded-html-utf8";
      readonly value: string;
    };
  };
  readonly currentMeeting: { readonly startDate: "2024-06-13"; readonly endDate: "2024-06-14" };
  readonly referencedPreviousMeeting: { readonly startDate: "2024-04-25"; readonly endDate: "2024-04-26" };
  readonly relationship: "source-stated-previous-meeting";
  readonly instrument: "uncollateralized-overnight-call-rate-guideline";
  readonly referencedGuideline: {
    readonly shape: "range"; readonly lower: 0; readonly upper: 0.1;
    readonly qualification: "around"; readonly unit: "percent";
  };
  /** Meeting end-date interpretation, not authenticated decision occurrence or succession. */
  readonly canonicalMapping: {
    readonly semantic: "qualified-meeting-end-date-mapping";
    readonly currentDecisionId: "japan-boj-policy-decision:2024-06-14";
    readonly referencedDecisionId: "japan-boj-policy-decision:2024-04-26";
  };
  readonly evidenceReference: {
    readonly section: "I.A"; readonly footnote: "7";
    readonly relationshipText: string; readonly guidelineText: string;
  };
}

const sourceUrl = "https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/g240614.htm";
const pdfPath = "/en/mopo/mpmsche_minu/minu_2024/g240614.pdf";
const maxBytes = 2 * 1024 * 1024;
const previousText = "The Bank had been conducting money market operations in accordance with the guideline for money market operations decided at the previous meeting on April 25 and 26, 2024.";
const observedText = "The uncollateralized overnight call rate had been in the range of 0.076 to 0.078 percent.";
const guidelineText = "The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.";
const meetingText = "A Monetary Policy Meeting of the Bank of Japan Policy Board was held in the Head Office of the Bank of Japan in Tokyo on Thursday, June 13, 2024, from 2:00 p.m. to 3:33 p.m., and on Friday, June 14, from 9:00 a.m. to 12:16 p.m.";
type Node = Record<string, unknown>;

/** Pure, inactive parser for one inspected English minutes layout and explicit relationship.
 * Qualified source: https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/g240614.htm
 * Caller-authored HTML can reproduce these source facts; output conveys no origin trust.
 * No discovery, date sorting, clocks, acquisition, receipts or trusted proof issuance.
 */
export function parseBojDecisionContinuityEvidenceV1(input: unknown): BojDecisionContinuityEvidenceV1 {
  const retained = readInput(input);
  const { html } = retained;
  if (retained.sourceUrl !== sourceUrl || retained.documentKind !== "mpm-minutes-english-html") fail("source");
  // Character preflight bounds work before well-formedness and UTF-8 scans.
  if (typeof html !== "string" || html.length > maxBytes || !html.isWellFormed() ||
      Buffer.byteLength(html, "utf8") > maxBytes) fail("document");
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, "");
  if ((uncommented.match(/<main\b/gi) ?? []).length !== 1 ||
      (uncommented.match(/<\/main\s*>/gi) ?? []).length !== 1) fail("document");
  const main = html.match(/<main id="contents">[\s\S]*?<\/main>/)?.[0];
  // The qualified fragment must be the entire non-whitespace input.
  if (!main || html.trim() !== main) fail("document");
  // Exact inspected wrapper and ordered publisher content blocks.
  const wrapper = /^<main id="contents">\s*(<h1>[\s\S]*?<\/h1>)\s*(?:<!--[\s\S]*?-->\s*)*<div class="outline mod_outer">\s*<!-- \[START\] CONTENT_1 -->([\s\S]*?)<!-- \[END\] CONTENT_1 -->\s*<!-- \[START\] CONTENT_2 -->([\s\S]*?)<!-- \[END\] CONTENT_2 -->\s*<\/div>\s*(?:<!--[\s\S]*?-->\s*)*<\/main>$/.exec(main);
  if (!wrapper || /<!--|<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(wrapper[2]! + wrapper[3]!)) fail("document");
  if (space(wrapper[1]!) !== "<h1> Minutes of the Monetary Policy Meeting <span>on June 13 and 14, 2024</span> </h1>") fail("context");
  const header = fragment(wrapper[2]!);
  if (header.length !== 3 || tag(header[0]) !== "p" || text(header[0]!) !== "August 5, 2024 Bank of Japan" ||
      tag(header[1]) !== "p" || text(header[1]!) !== "(English translation prepared by the Bank's staff based on the Japanese original)" ||
      tag(header[2]) !== "ul" || attrs(header[2]!)["@_class"] !== "link-list01") fail("source");
  const pdf = one(walk(header[2]!).filter(n => tag(n) === "a"), "source");
  if (attrs(pdf)["@_href"] !== pdfPath || text(pdf) !== "PDF Version [PDF 375KB]") fail("source");
  const body = fragment(wrapper[3]!);
  if (tag(body[0]) !== "p" || text(body[0]!) !== meetingText) fail("context");
  const nodes = body.flatMap(n => walk(n));
  const ids = nodes.map(n => attrs(n)["@_id"]).filter(v => v !== undefined);
  if (new Set(ids).size !== ids.length) fail("document");
  const first = body.findIndex(n => tag(n) === "h2");
  if (first < 0 || sectionTitle(body[first]!) !== "I. Summary of Staff Reports on Economic and Financial Developments" ||
      tag(body[first + 1]) !== "h3" || text(body[first + 1]!) !== "A. Market Operations in the Intermeeting Period" ||
      tag(body[first + 2]) !== "p" || text(body[first + 2]!) !== previousText + " " + observedText ||
      tag(body[first + 3]) !== "p" || text(body[first + 3]!) !== "Meanwhile, regarding purchases of Japanese government bonds (JGBs), CP, and corporate bonds, the Bank conducted the purchases in accordance with the decisions made at the March 2024 meeting." ||
      tag(body[first + 4]) !== "h3" || text(body[first + 4]!) !== "B. Recent Developments in Financial Markets") fail("reference");
  const paragraph = body[first + 2]!;
  if (Object.keys(attrs(paragraph)).length !== 0 ||
      children(paragraph).map(tag).join("|") !== "#text|sup|#text" ||
      text(children(paragraph)[0]!) !== previousText || text(children(paragraph)[2]!) !== observedText) fail("reference");
  const reference = one(walk(paragraph).filter(n => tag(n) === "sup"), "reference");
  const link = one(elements(children(reference)), "reference");
  if (Object.keys(attrs(reference)).length !== 0 || children(reference).length !== 1 ||
      Object.keys(attrs(link)).length !== 4 || attrs(link)["@_class"] !== "red" ||
      attrs(link)["@_style"] !== "background: none; padding: 0px;" || children(link).length !== 1 ||
      tag(children(link)[0]) !== "#text" || tag(link) !== "a" || attrs(link)["@_href"] !== "#fn7" || attrs(link)["@_id"] !== "p7" || text(link) !== "7") fail("reference");
  // Any additional dated previous-meeting assertion is outside this qualification.
  const dated = nodes.filter(n => tag(n) === "p" && /previous meeting on\b/i.test(text(n)));
  if (dated.length !== 1 || dated[0] !== paragraph) fail("reference");
  const predecessorReference = /\b(?:previous|preceding|prior|earlier|last)\s+(?:(?:monetary\s+)?policy\s+)?(?:meeting|MPM)\b/i;
  const otherReferences = nodes.filter(n => tag(n) === "p" && n !== paragraph && predecessorReference.test(text(n)));
  const economicCommentary = "With regard to economic activity, members agreed that Japan's economy had recovered moderately, although some weakness had been seen in part. One member expressed the view that, although there had been some data showing relatively weak developments and some information raising concerns since the previous meeting, the virtuous economic cycle remained intact, being supported from the income side by significantly high levels of corporate profits and by the highest level of wage growth in around three decades, achieved in the 2024 annual spring labor-management wage negotiations.";
  if (otherReferences.length !== 1 || text(otherReferences[0]!) !== economicCommentary) fail("reference");
  const allowedReferenceNodes = new Set([...walk(paragraph), ...walk(otherReferences[0]!)]);
  if (nodes.some(n => predecessorReference.test(text(n)) &&
      !allowedReferenceNodes.has(n))) fail("reference");
  const footnote = one(nodes.filter(n => attrs(n)["@_id"] === "fn7"), "guideline");
  if (Object.keys(attrs(footnote)).length !== 1 || children(footnote).map(tag).join("|") !== "#text|p" ||
      text(children(footnote)[0]!) !== "The guideline was as follows:" || tag(footnote) !== "li" || text(footnote) !== "The guideline was as follows: " + guidelineText) fail("guideline");
  const footnoteParagraph = one(elements(children(footnote)), "guideline");
  if (Object.keys(attrs(footnoteParagraph)).length !== 1 ||
      attrs(footnoteParagraph)["@_class"] !== "ml2em mt0 mb0" || children(footnoteParagraph).map(tag).join("|") !== "#text|a" ||
      tag(footnoteParagraph) !== "p" || text(footnoteParagraph) !== guidelineText) fail("guideline");
  const back = one(walk(footnote).filter(n => tag(n) === "a"), "guideline");
  if (Object.keys(attrs(back)).length !== 2 || attrs(back)["@_href"] !== "#p7" || attrs(back)["@_title"] !== "Return7") fail("guideline");
  const list = one(nodes.filter(n => tag(n) === "ol" && attrs(n)["@_class"] === "red-number"), "guideline");
  if (!elements(children(list)).includes(footnote)) fail("guideline");
  // Current policy, observed market rates and the referenced guideline remain distinct.
  const votes = body.findIndex(n => tag(n) === "h2" && sectionTitle(n) === "V. Votes");
  if (votes < 0 || tag(body[votes + 1]) !== "h3" ||
      text(body[votes + 1]!) !== "A. Vote on the Guideline for Money Market Operations" ||
      tag(body[votes + 6]) !== "div" || tag(elements(children(body[votes + 6]!))[0]) !== "p" ||
      text(elements(children(body[votes + 6]!))[0]!) !== guidelineText) fail("guideline");
  if (body.slice(votes + 2, votes + 6).some(n => tag(n) !== "p") ||
      attrs(body[votes + 6]!)["@_class"] !== "ml1em" ||
      elements(children(body[votes + 6]!)).map(tag).join("|") !== "p|p|p" ||
      text(body[votes + 2]!) !== "Based on the above discussions, to reflect the view of the members, the chairman formulated the following proposal on the guideline for money market operations and put it to a vote." ||
      text(body[votes + 3]!) !== "The Policy Board decided the proposal by a unanimous vote." ||
      text(body[votes + 4]!) !== "The Chairman's Policy Proposal on the Guideline for Money Market Operations:" ||
      text(body[votes + 5]!) !== "The guideline for money market operations for the intermeeting period will be as follows.") fail("guideline");
  const guidelines = nodes.filter(n => tag(n) === "p" && text(n).startsWith("The Bank will encourage"));
  // Exactly the footnote, current vote and attached statement, with matching selected settings.
  if (guidelines.length !== 3 || guidelines.some(n => text(n) !== guidelineText)) fail("guideline");
  const attached = body.findIndex(n => tag(n) === "p" && attrs(n)["@_id"] === "attach");
  if (attached < 0 || text(body[attached]!) !== "Attachment" || tag(body[attached + 1]) !== "p" ||
      text(body[attached + 1]!) !== "June 14, 2024 Bank of Japan" || tag(body[attached + 2]) !== "h2" ||
      text(body[attached + 2]!) !== "Statement on Monetary Policy" || tag(body[attached + 3]) !== "ol") fail("context");
  const attachedGuidelines = walk(body[attached + 3]!).filter(n => guidelines.includes(n));
  const attachedDecision = elements(children(body[attached + 3]!))[0];
  if (!attachedDecision || tag(attachedDecision) !== "li" ||
      children(attachedDecision).map(tag).join("|") !== "#text|div|p" ||
      space(children(attachedDecision).filter(n => tag(n) === "#text").map(text).join(" ")) !==
        "At the Monetary Policy Meeting (MPM) held today, the Policy Board of the Bank of Japan decided, by a unanimous vote, to set the following guideline for money market operations for the intermeeting period:") fail("guideline");
  if (attachedGuidelines.length !== 1 || attachedGuidelines[0] === footnoteParagraph ||
      walk(body[votes + 6]!).includes(attachedGuidelines[0]!)) fail("guideline");

  return Object.freeze({
    schemaVersion: BOJ_DECISION_CONTINUITY_EVIDENCE_SCHEMA_VERSION_V1,
    parserQualificationVersion: BOJ_DECISION_CONTINUITY_PARSER_QUALIFICATION_V1,
    semantic: "source-fact-description",
    provenance: Object.freeze({ basis: "parsed-caller-supplied-document", acquisitionTrust: "not-established", officialSuccessionVerification: "not-performed" }),
    source: Object.freeze({ publisher: "Bank of Japan", host: "www.boj.or.jp", url: sourceUrl,
      documentKind: "mpm-minutes-english-html", documentId: "BOJ:mpm-minutes:2024-06-13:2024-06-14:en",
      publication: Object.freeze({ semantic: "source-stated-publication-date", date: "2024-08-05" }),
      documentDigest: Object.freeze({ algorithm: "sha256", representation: "caller-supplied-decoded-html-utf8",
        value: createHash("sha256").update(html, "utf8").digest("hex") }) }),
    currentMeeting: Object.freeze({ startDate: "2024-06-13", endDate: "2024-06-14" }),
    referencedPreviousMeeting: Object.freeze({ startDate: "2024-04-25", endDate: "2024-04-26" }),
    relationship: "source-stated-previous-meeting", instrument: "uncollateralized-overnight-call-rate-guideline",
    referencedGuideline: Object.freeze({ shape: "range", lower: 0, upper: 0.1, qualification: "around", unit: "percent" }),
    canonicalMapping: Object.freeze({ semantic: "qualified-meeting-end-date-mapping",
      currentDecisionId: "japan-boj-policy-decision:2024-06-14", referencedDecisionId: "japan-boj-policy-decision:2024-04-26" }),
    evidenceReference: Object.freeze({ section: "I.A", footnote: "7", relationshipText: previousText, guidelineText }),
  });
}

function fail(code: string): never { throw new TypeError("BoJ continuity V1: " + code + "."); }

/** Retain descriptor values once; never read or clone caller objects after validation. */
function readInput(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || types.isProxy(value)) fail("input");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("input");
  const keys = ["sourceUrl", "documentKind", "html"];
  const retained: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key)) fail("input");
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !d.enumerable || !Object.hasOwn(d, "value")) fail("input");
    retained[key] = d.value;
  }
  if (keys.some(key => !Object.hasOwn(retained, key))) fail("input");
  return retained;
}

function space(value: string): string { return value.replace(/\s+/g, " ").trim(); }
function tag(node: Node | undefined): string { return node ? Object.keys(node).find(k => k !== ":@") ?? "" : ""; }
function children(node: Node): Node[] { const v = node[tag(node)]; return Array.isArray(v) ? v as Node[] : []; }
function attrs(node: Node): Node { return (node[":@"] as Node | undefined) ?? {}; }
function elements(nodes: Node[]): Node[] { return nodes.filter(n => tag(n) !== "#text"); }
function one(nodes: Node[], code: string): Node { if (nodes.length !== 1) fail(code); return nodes[0]!; }
function text(node: Node): string {
  if (tag(node) === "#text") return String(node["#text"]);
  if (tag(node) === "sup" || (tag(node) === "a" && String(attrs(node)["@_title"] ?? "").startsWith("Return"))) return "";
  return space(children(node).map(text).join(" ")).replace(/\s+([,.;:])/g, "$1");
}
function sectionTitle(node: Node): string {
  return space(children(node).filter(n => !(tag(n) === "span" && attrs(n)["@_class"] === "txt-hide")).map(text).join(" ")).replace(/\s+\./, ".");
}
function walk(node: Node, depth = 0): Node[] {
  if (depth > 60) fail("document");
  return [node, ...children(node).flatMap(n => walk(n, depth + 1))];
}
function fragment(html: string): Node[] {
  const wrapped = "<boj-fragment>" + html + "</boj-fragment>";
  if (XMLValidator.validate(wrapped, { unpairedTags: ["br", "hr"] }) !== true) fail("document");
  let parsed: Node[];
  try {
    parsed = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false,
      unpairedTags: ["br", "hr"], htmlEntities: true,
      processEntities: { enabled: true, maxEntityCount: 100, maxEntitySize: 1000, maxExpandedLength: 100000, maxTotalExpansions: 1000 },
    }).parse(wrapped) as Node[];
  } catch { fail("document"); }
  const root = one(parsed, "document");
  const nodes = walk(root);
  if (nodes.length > 20000) fail("document");
  const allowedTags = new Set(["boj-fragment", "#text", "p", "br", "ul", "li", "a", "sup", "div", "dl", "dt", "strong", "dd", "h2", "h3", "h4", "em", "ol", "hr", "span"]);
  const allowedClasses = new Set(["link-list01", "red", "mt0 mb0", "no-list", "ml2em", "mt2em", "ml25em", "number-en", "ml1em", "ml2em mt0 mb0", "red-number", "double", "no-list indent3"]);
  for (const node of nodes) {
    if (!allowedTags.has(tag(node))) fail("document");
    if (tag(node) === "a" && String(attrs(node)["@_title"] ?? "").startsWith("Return") &&
        (children(node).some(n => tag(n) !== "#text") ||
         space(children(node).map(text).join(" ")) !== "Return to text")) fail("document");
    if (tag(node) === "sup") {
      const link = one(elements(children(node)), "document");
      if (tag(link) !== "a" || !/^(?:[1-7]|\[Note\])$/.test(text(link)) ||
          children(node).some(n => tag(n) === "#text" && space(text(n)) !== "")) fail("document");
    }
    for (const [key, value] of Object.entries(attrs(node))) {
      if (key === "@_class" && allowedClasses.has(String(value))) continue;
      if (key === "@_id" && /^(?:p[1-7]|fn[1-7]|attach|nt01|note01)$/.test(String(value))) continue;
      if (key === "@_href" && (value === pdfPath || /^#(?:fn[1-7]|p[1-7]|note01|nt01)$/.test(String(value)))) continue;
      if (key === "@_title" && /^Return(?:[1-7]| nt01)$/.test(String(value))) continue;
      if (key === "@_style" && tag(node) === "a" && value === "background: none; padding: 0px;") continue;
      // Only the actual h2 numeral decorations may be hidden; never evidence text.
      if (tag(node) === "span" && ((key === "@_aria-hidden" && value === "true") || (key === "@_class" && value === "txt-hide")) &&
          nodes.some(parent => tag(parent) === "h2" && children(parent).includes(node) &&
            /^(?:I|II|III|IV|V|VI)$/.test(text(one(elements(children(parent)).filter(n => attrs(n)["@_aria-hidden"] === "true"), "document"))) &&
            /^[1-6]$/.test(text(one(elements(children(parent)).filter(n => attrs(n)["@_class"] === "txt-hide"), "document"))))) continue;
      fail("document");
    }
  }
  if (children(root).some(n => tag(n) === "#text" && space(text(n)) !== "")) fail("document");
  return elements(children(root));
}
