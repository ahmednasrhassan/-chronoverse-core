import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  assertBojPolicyServerV1, assertBojPolicyUrlV1, bojPolicyDocumentUrlV1,
  isBojCivilDateV1, BOJ_POLICY_MAX_RESPONSE_BYTES_V1, type BojPolicyDocumentV1,
} from "./transport";

export const BOJ_POLICY_INSTRUMENT_V1 = "uncollateralized-overnight-call-rate-guideline" as const;
export const BOJ_POLICY_REGIME_START_V1 = "2024-03-19" as const;
export const BOJ_POLICY_DOCUMENT_TITLES_V1 = Object.freeze({
  statement: "Statement on Monetary Policy",
  "guideline-change": "Change in the Guideline for Money Market Operations",
  "framework-transition": "Changes in the Monetary Policy Framework",
});
export type BojPolicyDocumentKindV1 = keyof typeof BOJ_POLICY_DOCUMENT_TITLES_V1;

export class BojPolicyValidationError extends Error {
  constructor(readonly code:
    | "source" | "document" | "unsupported-historical-regime" | "unsupported-instrument"
    | "ambiguous" | "target" | "date" | "annotation" | "capture-time") {
    super(`BoJ policy validation failed: ${code}.`);
    this.name = "BojPolicyValidationError";
  }
}

export type BojPolicyTargetV1 =
  | { readonly shape: "scalar"; readonly value: number; readonly qualification: "around" }
  | { readonly shape: "range"; readonly lower: number; readonly upper: number; readonly qualification: "around" };

export interface BojPolicyFactV1 {
  readonly institution: "Bank of Japan";
  readonly productId: "eurjpy";
  readonly instrument: typeof BOJ_POLICY_INSTRUMENT_V1;
  readonly decisionDate: string;
  readonly documentKind: BojPolicyDocumentKindV1;
  readonly target: BojPolicyTargetV1;
  readonly unit: "percent";
  readonly sourceUrl: string;
  readonly releaseTimestamp: number | null;
  readonly effectiveDate: string | null;
}

type Node = Record<string, unknown>;
const unpairedTags = ["br", "hr"];
const parser = new XMLParser({
  preserveOrder: true, ignoreAttributes: false, htmlEntities: true, unpairedTags,
  processEntities: { enabled: true, maxEntityCount: 100, maxEntitySize: 1000, maxExpandedLength: 100000, maxTotalExpansions: 1000 },
});
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const intro = /^At the Monetary Policy Meeting(?: \(MPM\))? held today, the Policy Board of the Bank of Japan decided, by (?:a unanimous vote|an? \d+-\d+ majority vote), to set the following guideline for money market operations for the intermeeting period:$/;

function record(value: unknown): value is Node { return typeof value === "object" && value !== null && !Array.isArray(value); }
function tag(node: Node): string { return Object.keys(node).find((key) => key !== ":@") ?? ""; }
function children(node: Node): Node[] { const value = node[tag(node)]; return Array.isArray(value) ? value.filter(record) : []; }
function attrs(node: Node): Node { return record(node[":@"]) ? node[":@"] : {}; }
function elements(nodes: readonly Node[]): Node[] { return nodes.filter((node) => !tag(node).startsWith("#")); }
function text(nodes: readonly Node[], depth = 0): string {
  if (depth > 60) throw new BojPolicyValidationError("document");
  return nodes.map((node) => {
    if (typeof node["#text"] === "string") return node["#text"];
    if (tag(node) === "sup" || (tag(node) === "a" && String(attrs(node)["@_title"] ?? "").startsWith("Return"))) return "";
    return text(children(node), depth + 1);
  }).join(" ").replace(/\s+/g, " ").trim();
}
function find(nodes: readonly Node[], predicate: (node: Node) => boolean, depth = 0): Node[] {
  if (depth > 60) throw new BojPolicyValidationError("document");
  return nodes.flatMap((node) => [...(predicate(node) ? [node] : []), ...find(children(node), predicate, depth + 1)]);
}
function one(nodes: Node[], code: "document" | "ambiguous" = "document"): Node {
  if (nodes.length !== 1) throw new BojPolicyValidationError(nodes.length > 1 ? "ambiguous" : code);
  return nodes[0]!;
}
function fragment(html: string): Node[] {
  const wrapped = `<boj-fragment>${html}</boj-fragment>`;
  if (XMLValidator.validate(wrapped, { unpairedTags }) !== true) throw new BojPolicyValidationError("document");
  return children(one(parser.parse(wrapped) as Node[]));
}
function dateFromEnglish(value: string): string {
  const match = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(value);
  if (match === null || !months.includes(match[1]!)) throw new BojPolicyValidationError("date");
  const date = `${match[3]}-${String(months.indexOf(match[1]!) + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  if (!isBojCivilDateV1(date)) throw new BojPolicyValidationError("date");
  return date;
}
function exactKeys(value: Node, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function rate(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100; }

/** Closed source model. Does not establish publication evidence for caller-invented facts. */
export function normalizeBojPolicyFactV1(value: unknown): BojPolicyFactV1 {
  if (!record(value) || !exactKeys(value, ["institution", "productId", "instrument", "decisionDate", "documentKind", "target", "unit", "sourceUrl", "releaseTimestamp", "effectiveDate"])) {
    throw new BojPolicyValidationError("annotation");
  }
  if (value.institution !== "Bank of Japan" || value.productId !== "eurjpy" || value.instrument !== BOJ_POLICY_INSTRUMENT_V1 || value.unit !== "percent") {
    throw new BojPolicyValidationError("unsupported-instrument");
  }
  if (!isBojCivilDateV1(value.decisionDate)) throw new BojPolicyValidationError("date");
  if (value.decisionDate < BOJ_POLICY_REGIME_START_V1) throw new BojPolicyValidationError("unsupported-historical-regime");
  if (value.sourceUrl !== bojPolicyDocumentUrlV1(value.decisionDate)) throw new BojPolicyValidationError("source");
  if (typeof value.documentKind !== "string" || !Object.hasOwn(BOJ_POLICY_DOCUMENT_TITLES_V1, value.documentKind) ||
      ((value.documentKind === "framework-transition") !== (value.decisionDate === BOJ_POLICY_REGIME_START_V1))) {
    throw new BojPolicyValidationError("document");
  }
  const supplied = value.target;
  if (!record(supplied) || supplied.qualification !== "around") throw new BojPolicyValidationError("target");
  let target: BojPolicyTargetV1;
  if (supplied.shape === "scalar" && exactKeys(supplied, ["shape", "value", "qualification"]) && rate(supplied.value)) {
    target = Object.freeze({ shape: "scalar", value: supplied.value, qualification: "around" });
  } else if (supplied.shape === "range" && exactKeys(supplied, ["shape", "lower", "upper", "qualification"]) &&
      rate(supplied.lower) && rate(supplied.upper) && supplied.lower < supplied.upper) {
    target = Object.freeze({ shape: "range", lower: supplied.lower, upper: supplied.upper, qualification: "around" });
  } else throw new BojPolicyValidationError("target");
  if (value.effectiveDate !== null && (!isBojCivilDateV1(value.effectiveDate) || value.effectiveDate < value.decisionDate)) {
    throw new BojPolicyValidationError("date");
  }
  if (value.releaseTimestamp !== null && (!Number.isSafeInteger(value.releaseTimestamp) || Number(value.releaseTimestamp) < 0 || Number(value.releaseTimestamp) > 253402268399 ||
      new Date((Number(value.releaseTimestamp) + 9 * 3600) * 1000).toISOString().slice(0, 10) !== value.decisionDate)) {
    throw new BojPolicyValidationError("date");
  }
  return Object.freeze({ institution: "Bank of Japan", productId: "eurjpy", instrument: BOJ_POLICY_INSTRUMENT_V1,
    decisionDate: value.decisionDate, documentKind: value.documentKind as BojPolicyDocumentKindV1,
    target, unit: "percent", sourceUrl: value.sourceUrl as string,
    releaseTimestamp: value.releaseTimestamp as number | null, effectiveDate: value.effectiveDate as string | null });
}

/** Verified English HTML structure only. Never search arbitrary document percentages. */
export function parseBojPolicyDocumentV1(document: BojPolicyDocumentV1, decisionDate: string): BojPolicyFactV1 {
  assertBojPolicyServerV1();
  if (document.url !== bojPolicyDocumentUrlV1(decisionDate) || assertBojPolicyUrlV1(document.url) !== decisionDate) {
    throw new BojPolicyValidationError("source");
  }
  if (decisionDate < BOJ_POLICY_REGIME_START_V1) throw new BojPolicyValidationError("unsupported-historical-regime");
  if (Buffer.byteLength(document.html, "utf8") > BOJ_POLICY_MAX_RESPONSE_BYTES_V1) throw new BojPolicyValidationError("document");
  const mains = document.html.match(/<main\b[^>]*>[\s\S]*?<\/main\s*>/gi) ?? [];
  if (mains.length !== 1) throw new BojPolicyValidationError("document");
  const main = one(fragment(mains[0]!));
  if (tag(main) !== "main" || attrs(main)["@_id"] !== "contents" ||
      find([main], (node) => ["script", "style", "nav", "footer", "template", "noscript"].includes(tag(node)) ||
        Object.hasOwn(attrs(node), "@_hidden") || attrs(node)["@_aria-hidden"] === "true" ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(String(attrs(node)["@_style"] ?? ""))).length !== 0) {
    throw new BojPolicyValidationError("document");
  }
  const title = text(children(one(find(children(main), (node) => tag(node) === "h1"))));
  const documentKind = (Object.keys(BOJ_POLICY_DOCUMENT_TITLES_V1) as BojPolicyDocumentKindV1[])
    .find((kind) => BOJ_POLICY_DOCUMENT_TITLES_V1[kind] === title);
  if (documentKind === undefined) throw new BojPolicyValidationError("document");
  if ((documentKind === "framework-transition") !== (decisionDate === BOJ_POLICY_REGIME_START_V1)) {
    throw new BojPolicyValidationError("unsupported-historical-regime");
  }
  const blocks = [...mains[0]!.matchAll(/<!-- \[START\] CONTENT_([12]) -->([\s\S]*?)<!-- \[END\] CONTENT_\1 -->/g)];
  if (blocks.length !== 2 || blocks[0]![1] !== "1" || blocks[1]![1] !== "2") throw new BojPolicyValidationError("document");
  const header = elements(fragment(blocks[0]![2]!));
  if (header.length !== 2 || tag(header[0]!) !== "p" || tag(header[1]!) !== "ul") throw new BojPolicyValidationError("document");
  const officialDate = text(children(header[0]!)).match(/^(.+) Bank of Japan$/);
  if (officialDate === null || dateFromEnglish(officialDate[1]!) !== decisionDate) throw new BojPolicyValidationError("date");
  const pdfLinks = find([header[1]!], (node) => tag(node) === "a");
  const expectedPdf = `/en/mopo/mpmdeci/mpr_${decisionDate.slice(0, 4)}/k${decisionDate.slice(2).replaceAll("-", "")}a.pdf`;
  if (pdfLinks.length !== 1 || attrs(pdfLinks[0]!)["@_href"] !== expectedPdf || !text(children(pdfLinks[0]!)).startsWith("PDF Version")) {
    throw new BojPolicyValidationError("source");
  }
  const body = elements(fragment(blocks[1]![2]!));
  const first = body[0];
  if (first === undefined) throw new BojPolicyValidationError("document");
  let targetParagraph: Node;
  if (documentKind === "framework-transition") {
    if (tag(first) !== "ol") throw new BojPolicyValidationError("document");
    const meeting = elements(children(first))[0];
    if (meeting === undefined || tag(meeting) !== "li") throw new BojPolicyValidationError("document");
    const meetingText = text(children(meeting));
    if (!meetingText.startsWith("At the Monetary Policy Meeting held today, the Policy Board of the Bank of Japan assessed") ||
        !meetingText.includes("the policy framework of Quantitative and Qualitative Monetary Easing (QQE) with Yield Curve Control and the negative interest rate policy to date have fulfilled their roles.") ||
        !meetingText.includes("guiding the short-term interest rate as a primary policy tool")) {
      throw new BojPolicyValidationError("unsupported-historical-regime");
    }
    const guidelines = one(elements(children(meeting)).filter((node) => tag(node) === "ol" && attrs(node)["@_class"] === "number-en"));
    const guideline = elements(children(guidelines))[0];
    if (guideline === undefined || tag(guideline) !== "li" || !text(children(guideline)).startsWith("(1) Guideline for market operations (")) {
      throw new BojPolicyValidationError("unsupported-instrument");
    }
    const section = one(elements(children(guideline)).filter((node) => tag(node) === "div" && attrs(node)["@_class"] === "indent0"));
    const paragraphs = elements(children(section));
    if (paragraphs.length !== 2 || paragraphs.some((node) => tag(node) !== "p") ||
        text(children(paragraphs[0]!)) !== "The Bank decided to set the following guideline for market operations for the intermeeting period.") {
      throw new BojPolicyValidationError("unsupported-instrument");
    }
    targetParagraph = paragraphs[1]!;
  } else {
    let section: Node;
    if (tag(first) === "p" && intro.test(text(children(first)))) {
      if (body[1] === undefined || tag(body[1]) !== "div") throw new BojPolicyValidationError("document");
      section = body[1];
    } else if (tag(first) === "ol") {
      const meeting = elements(children(first))[0];
      if (meeting === undefined || tag(meeting) !== "li") throw new BojPolicyValidationError("document");
      const meetingNodes = children(meeting);
      const sectionIndex = meetingNodes.findIndex((node) => tag(node) === "div");
      if (sectionIndex < 0 || !intro.test(text(meetingNodes.slice(0, sectionIndex)))) throw new BojPolicyValidationError("unsupported-instrument");
      section = meetingNodes[sectionIndex]!;
      if (elements(meetingNodes.slice(sectionIndex + 1)).length !== 0) throw new BojPolicyValidationError("document");
    } else throw new BojPolicyValidationError("unsupported-instrument");
    const paragraphs = elements(children(section));
    if (paragraphs.length !== 1 || tag(paragraphs[0]!) !== "p") throw new BojPolicyValidationError("document");
    targetParagraph = paragraphs[0]!;
  }
  const candidates = find(body, (node) => tag(node) === "p" && text(children(node)).startsWith("The Bank will encourage the uncollateralized overnight call rate"));
  if (candidates.length > 1 || (candidates.length === 1 && candidates[0] !== targetParagraph)) throw new BojPolicyValidationError("ambiguous");
  const targetText = text(children(targetParagraph));
  const targetMatch = /^The Bank will encourage the uncollateralized overnight call rate to remain at around ([+-]?\d+(?:\.\d+)?)(?: to ([+-]?\d+(?:\.\d+)?))? percent\.$/.exec(targetText);
  if (targetMatch === null) throw new BojPolicyValidationError("unsupported-instrument");
  const target: BojPolicyTargetV1 = targetMatch[2] === undefined
    ? { shape: "scalar", value: Number(targetMatch[1]), qualification: "around" }
    : { shape: "range", lower: Number(targetMatch[1]), upper: Number(targetMatch[2]), qualification: "around" };
  return normalizeBojPolicyFactV1({ institution: "Bank of Japan", productId: "eurjpy", instrument: BOJ_POLICY_INSTRUMENT_V1,
    decisionDate, documentKind, target, unit: "percent", sourceUrl: document.url,
    releaseTimestamp: releaseTime(body, title, decisionDate), effectiveDate: effectiveDate(body, targetParagraph) });
}

function effectiveDate(body: Node[], target: Node): string | null {
  const references = find(children(target), (node) => tag(node) === "a" && /^#fn\d+$/.test(String(attrs(node)["@_href"] ?? "")));
  const dates: string[] = [];
  for (const reference of references) {
    const id = String(attrs(reference)["@_href"]).slice(1);
    const footnote = one(find(body, (node) => tag(node) === "li" && attrs(node)["@_id"] === id));
    const noteText = text(children(footnote));
    const matches = [...noteText.matchAll(/The new guideline for (?:money )?market operations(?: and the new interest rate on the current account balances)? will be effective from ([A-Za-z]+ \d{1,2}, \d{4})\./g)];
    if (matches.length === 0 && /guideline.*effective/i.test(noteText)) throw new BojPolicyValidationError("date");
    dates.push(...matches.map((match) => dateFromEnglish(match[1]!)));
  }
  if (dates.length > 1) throw new BojPolicyValidationError("ambiguous");
  return dates[0] ?? null;
}

function releaseTime(body: Node[], title: string, decisionDate: string): number | null {
  const sections = find(body, (node) => tag(node) === "dl" && elements(children(node)).some((item) =>
    tag(item) === "dt" && text(children(item)) === "Release dates and times:"));
  if (sections.length === 0) return null;
  const section = one(sections);
  const entries = elements(children(section)).filter((node) => tag(node) === "dd" && text(children(node)).startsWith(`${title} -- `));
  if (entries.length === 0) return null;
  const entry = text(children(one(entries))).slice(title.length + 4);
  // Verified pages omit a timezone. Never infer JST from bank location or other releases.
  const match = /^([A-Za-z]+), ([A-Za-z]+) (\d{1,2}) at (\d{1,2}):([0-5]\d) (?:JST|\(Japan Standard Time\))$/.exec(entry);
  if (match === null) return null;
  const date = dateFromEnglish(`${match[2]} ${match[3]}, ${decisionDate.slice(0, 4)}`);
  if (date !== decisionDate || weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()] !== match[1] || Number(match[4]) > 23) {
    throw new BojPolicyValidationError("date");
  }
  return Date.parse(`${date}T${match[4]!.padStart(2, "0")}:${match[5]}:00+09:00`) / 1000;
}
