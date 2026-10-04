import { XMLParser, XMLValidator } from "fast-xml-parser";
import { assertBoeBankRateServerV1, assertBoeBankRateDecisionUrlV1, boeBankRateDocumentUrlV1,
  isBoeCivilDateV1, BOE_MONTHS_V1, BOE_BANK_RATE_MAX_RESPONSE_BYTES_V1,
  BOE_MAY_2025_RELEASE_NOTICE_URL_V1, type BoeBankRateDocumentV1 } from "./transport";

export const BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1 = "Statement on the timing of the Monetary Policy Report and Minutes of the Monetary Policy Committee meeting on Thursday 8 May 2025";
export class BoeBankRateValidationError extends Error {
  constructor(readonly code: "source" | "document" | "unsupported-structure" | "unsupported-wording" |
    "unsupported-instrument" | "ambiguous" | "rate" | "date" | "annotation" | "capture-time") {
    super(`BoE Bank Rate validation failed: ${code}.`);
    this.name = "BoeBankRateValidationError";
  }
}

export type BoeBankRateDecisionV1 =
  | { readonly action: "maintain"; readonly rate: number; readonly changePercentagePoints: null }
  | { readonly action: "reduce" | "increase"; readonly rate: number; readonly changePercentagePoints: number };

export interface BoeBankRateReleaseEvidenceV1 {
  readonly sourceUrl: typeof BOE_MAY_2025_RELEASE_NOTICE_URL_V1;
  readonly documentTitle: typeof BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1;
  readonly publicationDate: string;
  readonly localTime: string;
  readonly timezone: "GMT" | "BST";
}

export interface BoeBankRateFactV1 {
  readonly institution: "Bank of England";
  readonly committee: "Monetary Policy Committee";
  readonly productId: "eurgbp";
  readonly instrument: "Bank Rate";
  readonly documentId: string;
  readonly meetingEndDate: string;
  readonly publicationDate: string;
  readonly decision: BoeBankRateDecisionV1;
  readonly unit: "percent";
  readonly sourceUrl: string;
  readonly releaseTimestamp: number | null;
  readonly releaseEvidence: BoeBankRateReleaseEvidenceV1 | null;
  /** V1's inspected decision structures establish no explicit effective date. */
  readonly effectiveDate: null;
}

type Node = Record<string, unknown>;
const record = (value: unknown): value is Node => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Node, keys: readonly string[]): boolean => Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const rate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const unpairedTags = ["br", "hr", "img", "input", "link", "meta", "source", "wbr", "area", "embed", "param", "track", "col"];
const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, htmlEntities: true, allowBooleanAttributes: true, unpairedTags,
  processEntities: { enabled: true, maxEntityCount: 100, maxEntitySize: 1000, maxExpandedLength: 100000, maxTotalExpansions: 1000 } });
const tag = (node: Node): string => Object.keys(node).find((key) => key !== ":@") ?? "";
const children = (node: Node): Node[] => Array.isArray(node[tag(node)]) ? (node[tag(node)] as unknown[]).filter(record) : [];
const attrs = (node: Node): Node => record(node[":@"]) ? node[":@"] : {};
const elements = (nodes: readonly Node[]): Node[] => nodes.filter((node) => !tag(node).startsWith("#"));
const classes = (node: Node): string[] => String(attrs(node)["@_class"] ?? "").split(/\s+/);
function hidden(node: Node): boolean {
  const a = attrs(node);
  return ["script", "style", "noscript", "template", "nav", "footer"].includes(tag(node)) || Object.hasOwn(a, "@_hidden") ||
    a["@_aria-hidden"] === "true" || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(String(a["@_style"] ?? ""));
}
function text(nodes: readonly Node[], depth = 0): string {
  if (depth > 60) throw new BoeBankRateValidationError("document");
  return nodes.filter((node) => !hidden(node)).map((node) => typeof node["#text"] === "string" ? node["#text"] : text(children(node), depth + 1))
    .join(" ").replace(/\s+/g, " ").trim();
}
function find(nodes: readonly Node[], predicate: (node: Node) => boolean, depth = 0): Node[] {
  if (depth > 60) throw new BoeBankRateValidationError("document");
  return nodes.filter((node) => !hidden(node)).flatMap((node) => [...(predicate(node) ? [node] : []), ...find(children(node), predicate, depth + 1)]);
}
function one(nodes: Node[]): Node {
  if (nodes.length !== 1) throw new BoeBankRateValidationError(nodes.length > 1 ? "ambiguous" : "unsupported-structure");
  return nodes[0]!;
}
function fragment(html: string): Node[] {
  const wrapped = `<boe-fragment>${html}</boe-fragment>`;
  if (XMLValidator.validate(wrapped, { unpairedTags, allowBooleanAttributes: true }) !== true) throw new BoeBankRateValidationError("document");
  return children(one(parser.parse(wrapped) as Node[]));
}
const englishDate = (value: string): string => {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value);
  if (match === null || !BOE_MONTHS_V1.includes(match[2]!)) throw new BoeBankRateValidationError("date");
  const date = `${match[3]}-${String(BOE_MONTHS_V1.indexOf(match[2]!) + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  if (!isBoeCivilDateV1(date)) throw new BoeBankRateValidationError("date");
  return date;
};

/** Require the source label's offset and civil time to agree with runtime Europe/London rules. */
export function boeLondonReleaseTimestampV1(date: string, localTime: string, timezone: "GMT" | "BST"): number {
  if (!isBoeCivilDateV1(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime) || !["GMT", "BST"].includes(timezone)) throw new BoeBankRateValidationError("date");
  const timestamp = Date.parse(`${date}T${localTime}:00${timezone === "BST" ? "+01:00" : "+00:00"}`) / 1000;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).formatToParts(new Date(timestamp * 1000));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  const offset = part("timeZoneName");
  const labelMatchesOffset = timezone === "BST" ? offset === "GMT+01:00" : offset === "GMT" || offset === "GMT+00:00";
  if (`${part("year")}-${part("month")}-${part("day")}` !== date || `${part("hour")}:${part("minute")}` !== localTime ||
      !labelMatchesOffset) throw new BoeBankRateValidationError("date");
  return timestamp;
}

/** Closed source fact; normalization does not attest caller-invented publication evidence. */
export function normalizeBoeBankRateFactV1(value: unknown): BoeBankRateFactV1 {
  if (!record(value) || !exactKeys(value, ["institution", "committee", "productId", "instrument", "documentId", "meetingEndDate", "publicationDate", "decision", "unit", "sourceUrl", "releaseTimestamp", "releaseEvidence", "effectiveDate"])) throw new BoeBankRateValidationError("annotation");
  if (value.institution !== "Bank of England" || value.committee !== "Monetary Policy Committee" || value.productId !== "eurgbp" ||
      value.instrument !== "Bank Rate" || value.unit !== "percent") throw new BoeBankRateValidationError("unsupported-instrument");
  if (!isBoeCivilDateV1(value.publicationDate) || !isBoeCivilDateV1(value.meetingEndDate) || value.meetingEndDate > value.publicationDate || value.effectiveDate !== null) throw new BoeBankRateValidationError("date");
  if (value.sourceUrl !== boeBankRateDocumentUrlV1(value.publicationDate) || value.documentId !== `monetary-policy-summary-and-minutes:${value.publicationDate.slice(0, 7)}`) throw new BoeBankRateValidationError("source");
  const d = value.decision;
  if (!record(d) || !exactKeys(d, ["action", "rate", "changePercentagePoints"]) || !rate(d.rate)) throw new BoeBankRateValidationError("rate");
  let decision: BoeBankRateDecisionV1;
  if (d.action === "maintain" && d.changePercentagePoints === null) decision = Object.freeze({ action: "maintain", rate: d.rate, changePercentagePoints: null });
  else if ((d.action === "reduce" || d.action === "increase") && rate(d.changePercentagePoints) && d.changePercentagePoints > 0) {
    decision = Object.freeze({ action: d.action, rate: d.rate, changePercentagePoints: d.changePercentagePoints });
  } else throw new BoeBankRateValidationError("rate");
  let releaseEvidence: BoeBankRateReleaseEvidenceV1 | null = null;
  if (value.releaseEvidence === null) {
    if (value.releaseTimestamp !== null) throw new BoeBankRateValidationError("date");
  } else {
    const r = value.releaseEvidence;
    if (!record(r) || !exactKeys(r, ["sourceUrl", "documentTitle", "publicationDate", "localTime", "timezone"]) ||
        r.sourceUrl !== BOE_MAY_2025_RELEASE_NOTICE_URL_V1 || r.documentTitle !== BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1 ||
        value.publicationDate !== "2025-05-08" || !isBoeCivilDateV1(r.publicationDate) || r.publicationDate < "2025-05-01" || r.publicationDate > value.publicationDate ||
        typeof r.localTime !== "string" || (r.timezone !== "GMT" && r.timezone !== "BST") ||
        value.releaseTimestamp !== boeLondonReleaseTimestampV1(value.publicationDate, r.localTime, r.timezone)) throw new BoeBankRateValidationError("date");
    releaseEvidence = Object.freeze({ sourceUrl: BOE_MAY_2025_RELEASE_NOTICE_URL_V1, documentTitle: BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1,
      publicationDate: r.publicationDate, localTime: r.localTime, timezone: r.timezone });
  }
  return Object.freeze({ institution: "Bank of England", committee: "Monetary Policy Committee", productId: "eurgbp", instrument: "Bank Rate",
    documentId: value.documentId as string, meetingEndDate: value.meetingEndDate, publicationDate: value.publicationDate,
    decision, unit: "percent", sourceUrl: value.sourceUrl as string, releaseTimestamp: value.releaseTimestamp as number | null, releaseEvidence, effectiveDate: null });
}

function page(document: BoeBankRateDocumentV1, sourceUrl: string): { main: Node; publicationDate: string; title: string } {
  if (document.url !== sourceUrl) throw new BoeBankRateValidationError("source");
  if (Buffer.byteLength(document.html, "utf8") > BOE_BANK_RATE_MAX_RESPONSE_BYTES_V1) throw new BoeBankRateValidationError("document");
  const canonical = [...document.html.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/g)];
  if (canonical.length !== 1 || attrs(one(fragment(canonical[0]![0])))["@_href"] !== sourceUrl) throw new BoeBankRateValidationError("source");
  const documentTitles = [...document.html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/g)];
  if (documentTitles.length !== 1 || !text(fragment(documentTitles[0]![1]!)).includes(" | Bank of England")) throw new BoeBankRateValidationError("source");
  const mains = [...document.html.matchAll(/<main\b[^>]*>[\s\S]*?<\/main>/g)];
  if (mains.length !== 1 || (document.html.match(/<main\b/g) ?? []).length !== 1) throw new BoeBankRateValidationError("unsupported-structure");
  const main = one(fragment(mains[0]![0]));
  if (attrs(main)["@_id"] !== "main-content" || attrs(main)["@_role"] !== "main" || hidden(main)) throw new BoeBankRateValidationError("unsupported-structure");
  const title = text(children(one(find([main], (node) => tag(node) === "h1"))));
  const published = text(children(one(find([main], (node) => tag(node) === "div" && classes(node).includes("published-date")))));
  if (!published.startsWith("Published on ")) throw new BoeBankRateValidationError("date");
  return { main, title, publicationDate: englishDate(published.slice(13)) };
}

const number = "(?:0|[1-9]\\d*)(?:\\.\\d+)?";
const mandate = "The Bank of England’s Monetary Policy Committee (MPC) sets monetary policy to meet the 2% inflation target, and in a way that helps to sustain growth and employment.";
const newMandate = "The Monetary Policy Committee (MPC) sets monetary policy to meet the 2% inflation target, and in a way that helps to sustain growth and employment. The MPC adopts a medium-term and forward-looking approach to determine the monetary stance required to achieve the inflation target sustainably.";
const decisionPattern = new RegExp(`^At its meeting ending on (\\d{1,2} [A-Za-z]+ \\d{4}), the (?:MPC|Monetary Policy Committee \\(MPC\\)) voted by a majority of ([1-9])[–-]([0-9]) to (maintain Bank Rate at (${number})|(?:reduce|increase) Bank Rate by (${number}) percentage points, to (${number}))%\\.`);
const actionFrom = (sentence: string): "maintain" | "reduce" | "increase" => sentence.includes("maintain Bank Rate") ? "maintain" : sentence.includes("reduce Bank Rate") ? "reduce" : "increase";

/** Verified HTML layouts only; the committee sentence is cross-checked against its minutes proposition. */
export function parseBoeBankRateDocumentV1(document: BoeBankRateDocumentV1, publicationDate: string, releaseDocument?: BoeBankRateDocumentV1): BoeBankRateFactV1 {
  assertBoeBankRateServerV1();
  const sourceUrl = boeBankRateDocumentUrlV1(publicationDate);
  assertBoeBankRateDecisionUrlV1(sourceUrl);
  const verified = page(document, sourceUrl);
  if (verified.publicationDate !== publicationDate) throw new BoeBankRateValidationError("date");
  const monthYear = `${BOE_MONTHS_V1[Number(publicationDate.slice(5, 7)) - 1]} ${publicationDate.slice(0, 4)}`;
  const headline = new RegExp(`^Bank (?:Rate|rate) (maintained at|reduced to|increased to) (${number})% - ${monthYear}(?: Monetary Policy Summary and Minutes)?$`).exec(verified.title);
  if (headline === null) throw new BoeBankRateValidationError("unsupported-structure");
  const content = one(find([verified.main], (node) => tag(node) === "div" && attrs(node)["@_id"] === "content"));
  const output = one(find([content], (node) => tag(node) === "div" && attrs(node)["@_id"] === "output"));
  const sections = elements(children(output));
  if (sections.length !== 2 || sections.some((node) => tag(node) !== "section" || hidden(node) || !classes(node).includes("page-section"))) throw new BoeBankRateValidationError("unsupported-structure");
  const summary = elements(children(sections[0]!));
  const minutes = elements(children(sections[1]!));
  if (tag(summary[0] ?? {}) !== "h2" || hidden(summary[0]!) || text(children(summary[0]!)) !== `Monetary Policy Summary, ${monthYear}` ||
      tag(minutes[0] ?? {}) !== "h2" || hidden(minutes[0]!) || summary.slice(1).some((node) => tag(node) !== "p")) throw new BoeBankRateValidationError("unsupported-structure");
  const paragraphs = summary.slice(1).filter((node) => !hidden(node)).map((node) => text(children(node)));
  if (paragraphs.length === 0) throw new BoeBankRateValidationError("unsupported-structure");
  // Count all meeting-decision candidates, not just the first percentage or preferred rate.
  if (paragraphs.reduce((count, p) => count + (p.match(/At its meeting ending on /g) ?? []).length, 0) > 1) throw new BoeBankRateValidationError("ambiguous");
  let selected = paragraphs[0]!;
  if (selected.startsWith(`${mandate} `)) selected = selected.slice(mandate.length + 1);
  else if (selected === newMandate) selected = paragraphs[1] ?? "";
  const match = decisionPattern.exec(selected);
  if (match === null) throw new BoeBankRateValidationError(/(?:SONIA|ISONIA|gilt|OIS|mortgage)/i.test(selected) ? "unsupported-instrument" : "unsupported-wording");
  if (Number(match[2]) + Number(match[3]) !== 9 || Number(match[2]) <= Number(match[3])) throw new BoeBankRateValidationError("unsupported-wording");
  const meetingEndDate = englishDate(match[1]!);
  const action = actionFrom(match[4]!);
  const decision = { action, rate: Number(match[5] ?? match[7]), changePercentagePoints: match[6] === undefined ? null : Number(match[6]) };
  const tail = selected.slice(match[0].length).trim();
  if (tail !== "" && !/^(?:One|Two|Three|Four|Five|Six|Seven|Eight) members? (?:preferred|voted) to (?:maintain|reduce|increase) Bank Rate\b/.test(tail)) throw new BoeBankRateValidationError("unsupported-wording");
  if (/At its meeting|the (?:MPC|Committee) (?:voted|decided)/i.test(tail)) throw new BoeBankRateValidationError("ambiguous");
  if (text(children(minutes[0]!)) !== `Minutes of the Monetary Policy Committee meeting ending on ${match[1]}`) throw new BoeBankRateValidationError("date");
  const expectedPdf = `/-/media/boe/files/monetary-policy-summary-and-minutes/${publicationDate.slice(0, 4)}/monetary-policy-summary-and-minutes-${monthYear.toLowerCase().replace(" ", "-")}.pdf`;
  one(find([verified.main], (node) => tag(node) === "a" && attrs(node)["@_href"] === expectedPdf));
  if (Number(headline[2]) !== decision.rate || headline[1] !== ({ maintain: "maintained at", reduce: "reduced to", increase: "increased to" })[action]) throw new BoeBankRateValidationError("rate");
  for (const p of paragraphs) {
    if (/^(?:At this meeting, the (?:MPC|Monetary Policy Committee)|The (?:MPC|Committee|Monetary Policy Committee)) (?:voted|decided) to\b/.test(p)) throw new BoeBankRateValidationError("ambiguous");
    const restated = new RegExp(`^At this meeting, the Committee voted to (maintain|reduce|increase) Bank Rate (?:at|to) (${number})%[,.]`).exec(p);
    if (p.startsWith("At this meeting, the Committee voted to ") && restated === null) throw new BoeBankRateValidationError("unsupported-wording");
    if (restated !== null && (restated[1] !== action || Number(restated[2]) !== decision.rate)) throw new BoeBankRateValidationError("ambiguous");
  }
  const immediate = minutes.map((node, index) => !hidden(node) && tag(node) === "h3" && /^The immediate policy decisions?$/.test(text(children(node))) ? index : -1).filter((index) => index >= 0);
  if (immediate.length !== 1) throw new BoeBankRateValidationError("unsupported-structure");
  const start = immediate[0]!;
  const next = minutes.findIndex((node, index) => index > start && tag(node) === "h3");
  const immediateNodes = minutes.slice(start + 1, next < 0 ? undefined : next);
  const chair = immediateNodes.filter((node) => !hidden(node) && tag(node) === "p" && /^\d+: The Chair invited the Committee to vote on the propositions? that:$/.test(text(children(node))));
  const chairNode = one(chair);
  const propositions = immediateNodes[immediateNodes.indexOf(chairNode) + 1];
  if (propositions === undefined || tag(propositions) !== "ul" || hidden(propositions)) throw new BoeBankRateValidationError("unsupported-structure");
  const candidates = elements(children(propositions)).filter((node) => !hidden(node) && /^Bank Rate should be /.test(text(children(node))));
  const selectedProposition = one(candidates);
  const allRatePropositions = find(immediateNodes, (node) => tag(node) === "li" && /^Bank Rate should be /.test(text(children(node))));
  if (one(allRatePropositions) !== selectedProposition) throw new BoeBankRateValidationError("ambiguous");
  const proposition = text(children(selectedProposition));
  const propositionPattern = new RegExp(`^Bank Rate should be (maintained at (${number})|(?:reduced|increased) by (${number}) percentage points, to (${number}))%(?:\\.|; and)$`);
  const prop = propositionPattern.exec(proposition);
  if (prop === null) throw new BoeBankRateValidationError("unsupported-wording");
  const propAction = proposition.includes("maintained") ? "maintain" : proposition.includes("reduced") ? "reduce" : "increase";
  if (propAction !== action || Number(prop[2] ?? prop[4]) !== decision.rate || (prop[3] === undefined ? null : Number(prop[3])) !== decision.changePercentagePoints) throw new BoeBankRateValidationError("ambiguous");
  const timing = releaseDocument === undefined ? { releaseTimestamp: null, releaseEvidence: null } : parseReleaseNotice(releaseDocument, publicationDate);
  return normalizeBoeBankRateFactV1({ institution: "Bank of England", committee: "Monetary Policy Committee", productId: "eurgbp", instrument: "Bank Rate",
    documentId: `monetary-policy-summary-and-minutes:${publicationDate.slice(0, 7)}`, meetingEndDate, publicationDate, decision, unit: "percent", sourceUrl, ...timing, effectiveDate: null });
}

function parseReleaseNotice(document: BoeBankRateDocumentV1, publicationDate: string) {
  if (publicationDate !== "2025-05-08") throw new BoeBankRateValidationError("source");
  const verified = page(document, BOE_MAY_2025_RELEASE_NOTICE_URL_V1);
  if (verified.title !== BOE_MAY_2025_RELEASE_NOTICE_TITLE_V1) throw new BoeBankRateValidationError("source");
  const body = find([verified.main], (node) => tag(node) === "div" && classes(node).includes("page-content"));
  const paragraph = text(children(one(body)));
  const match = /^In light of the national two minutes of silence to commemorate the 80th anniversary of VE day, the Monetary Policy Report and minutes of the Monetary Policy Committee meeting will be published at (\d{1,2})\.(\d{2})(am|pm) \((GMT|BST)\) on Thursday 8 May 2025, instead of the regular time of 12pm \(BST\)\.$/.exec(paragraph);
  if (match === null) throw new BoeBankRateValidationError("unsupported-wording");
  const hour = Number(match[1]);
  if (hour < 1 || hour > 12) throw new BoeBankRateValidationError("date");
  const localTime = `${String(hour % 12 + (match[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${match[2]}`;
  const timezone = match[4] as "GMT" | "BST";
  return { releaseTimestamp: boeLondonReleaseTimestampV1(publicationDate, localTime, timezone),
    releaseEvidence: { sourceUrl: BOE_MAY_2025_RELEASE_NOTICE_URL_V1, documentTitle: verified.title,
      publicationDate: verified.publicationDate, localTime, timezone } };
}
