import { XMLParser, XMLValidator } from "fast-xml-parser";
import { assertSnbPolicyServerV1, snbPolicyDocumentUrlV1, isSnbCivilDateV1, SNB_MONTHS_V1,
  SNB_POLICY_REGIME_START_V1, SNB_POLICY_MAX_RESPONSE_BYTES_V1, type SnbPolicyDocumentV1 } from "./transport";

export class SnbPolicyValidationError extends Error {
  constructor(readonly code: "source" | "document" | "unsupported-structure" | "unsupported-wording" |
    "unsupported-regime" | "unsupported-instrument" | "ambiguous" | "rate" | "date" | "annotation" | "capture-time") {
    super(`SNB policy validation failed: ${code}.`);
    this.name = "SnbPolicyValidationError";
  }
}

export type SnbPolicyDecisionV1 =
  | { readonly action: "unchanged"; readonly rate: number; readonly changePercentagePoints: null }
  | { readonly action: "reduce" | "increase"; readonly rate: number; readonly changePercentagePoints: number };

export interface SnbPolicyFactV1 {
  readonly institution: "Swiss National Bank";
  readonly decisionBody: "Governing Board";
  readonly productId: "eurchf";
  readonly instrument: "SNB policy rate";
  readonly documentId: string;
  readonly documentTitle: string;
  readonly decisionDate: string;
  readonly publicationDate: string;
  readonly decision: SnbPolicyDecisionV1;
  readonly unit: "percent";
  readonly sourceUrl: string;
  /** No exact timezone-aware press-release instant was verified for V1. */
  readonly releaseTimestamp: null;
  readonly effectiveDate: string | null;
}

type Node = Record<string, unknown>;
const record = (value: unknown): value is Node => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Node, keys: readonly string[]): boolean => Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const rate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= -100 && value <= 100;
const english = (date: string) => `${Number(date.slice(8))} ${SNB_MONTHS_V1[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

/** Closed source fact. Normalization is not publisher attestation of caller-invented facts. */
export function normalizeSnbPolicyFactV1(value: unknown): SnbPolicyFactV1 {
  if (!record(value) || !exactKeys(value, ["institution", "decisionBody", "productId", "instrument", "documentId", "documentTitle",
    "decisionDate", "publicationDate", "decision", "unit", "sourceUrl", "releaseTimestamp", "effectiveDate"])) throw new SnbPolicyValidationError("annotation");
  if (value.institution !== "Swiss National Bank" || value.decisionBody !== "Governing Board" || value.productId !== "eurchf" ||
      value.instrument !== "SNB policy rate" || value.unit !== "percent") throw new SnbPolicyValidationError("unsupported-instrument");
  if (!isSnbCivilDateV1(value.decisionDate) || !isSnbCivilDateV1(value.publicationDate)) throw new SnbPolicyValidationError("date");
  if (value.decisionDate < SNB_POLICY_REGIME_START_V1 || value.publicationDate < SNB_POLICY_REGIME_START_V1) throw new SnbPolicyValidationError("unsupported-regime");
  if (value.publicationDate !== value.decisionDate || value.releaseTimestamp !== null ||
      (value.effectiveDate !== null && (!isSnbCivilDateV1(value.effectiveDate) || value.effectiveDate <= value.decisionDate))) throw new SnbPolicyValidationError("date");
  const sourceUrl = snbPolicyDocumentUrlV1(value.decisionDate);
  const documentId = sourceUrl.slice(sourceUrl.lastIndexOf("/") + 1);
  const documentTitle = `Monetary policy assessment of ${english(value.decisionDate)}`;
  if (value.sourceUrl !== sourceUrl || value.documentId !== documentId || value.documentTitle !== documentTitle) throw new SnbPolicyValidationError("source");
  const d = value.decision;
  if (!record(d) || !exactKeys(d, ["action", "rate", "changePercentagePoints"]) || !rate(d.rate)) throw new SnbPolicyValidationError("rate");
  let decision: SnbPolicyDecisionV1;
  if (d.action === "unchanged" && d.changePercentagePoints === null) decision = Object.freeze({ action: "unchanged", rate: d.rate === 0 ? 0 : d.rate, changePercentagePoints: null });
  else if ((d.action === "reduce" || d.action === "increase") && rate(d.changePercentagePoints) && d.changePercentagePoints > 0) {
    decision = Object.freeze({ action: d.action, rate: d.rate === 0 ? 0 : d.rate, changePercentagePoints: d.changePercentagePoints });
  } else throw new SnbPolicyValidationError("rate");
  return Object.freeze({ institution: "Swiss National Bank", decisionBody: "Governing Board", productId: "eurchf", instrument: "SNB policy rate",
    documentId, documentTitle, decisionDate: value.decisionDate, publicationDate: value.publicationDate, decision, unit: "percent",
    sourceUrl, releaseTimestamp: null, effectiveDate: value.effectiveDate as string | null });
}

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
    a["@_aria-hidden"] === "true" || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(String(a["@_style"] ?? "")) ||
    classes(node).some((name) => ["hidden", "d-none", "h-hidden", "h-sr-only", "sr-only"].includes(name));
}
function text(nodes: readonly Node[], depth = 0): string {
  if (depth > 60) throw new SnbPolicyValidationError("document");
  return nodes.filter((node) => !hidden(node)).map((node) => typeof node["#text"] === "string" ? node["#text"] : text(children(node), depth + 1))
    .join(" ").replace(/\s+/g, " ").trim();
}
function find(nodes: readonly Node[], predicate: (node: Node) => boolean, depth = 0): Node[] {
  if (depth > 60) throw new SnbPolicyValidationError("document");
  return nodes.filter((node) => !hidden(node)).flatMap((node) => [...(predicate(node) ? [node] : []), ...find(children(node), predicate, depth + 1)]);
}
function one(nodes: Node[]): Node {
  if (nodes.length !== 1) throw new SnbPolicyValidationError(nodes.length > 1 ? "ambiguous" : "unsupported-structure");
  return nodes[0]!;
}
function fragment(html: string): Node[] {
  const wrapped = `<snb-fragment>${html}</snb-fragment>`;
  if (XMLValidator.validate(wrapped, { unpairedTags, allowBooleanAttributes: true }) !== true) throw new SnbPolicyValidationError("document");
  // Charts/embedded inflation tables are structurally validated but cannot supply
  // policy evidence. Their large SVG/srcdoc payloads are outside fact extraction.
  const scoped = wrapped.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/g, "<snb-ignored-chart/>")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g, "<snb-ignored-table/>");
  try { return children(one(parser.parse(scoped) as Node[])); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("[EntityReplacer]")) throw new SnbPolicyValidationError("document");
    throw error;
  }
}
function englishDate(value: string): string {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value);
  if (match === null || !SNB_MONTHS_V1.includes(match[2]!)) throw new SnbPolicyValidationError("date");
  const date = `${match[3]}-${String(SNB_MONTHS_V1.indexOf(match[2]!) + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  if (!isSnbCivilDateV1(date)) throw new SnbPolicyValidationError("date");
  return date;
}

const unsigned = "(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?";
const signed = `[-−–]?${unsigned}`;
const scalar = (value: string) => Number(value.replace(/[−–]/, "-"));
const headlinePattern = new RegExp(`^Swiss National Bank (leaves SNB policy rate unchanged at|lowers SNB policy rate to|tightens monetary policy further and raises SNB policy rate to) (${signed})%$`);
const unchangedPattern = new RegExp(`^The Swiss National Bank is leaving the SNB policy rate unchanged at (${signed})%\\.`);
const cutPattern = new RegExp(`^The Swiss National Bank is lowering the SNB policy rate by (${unsigned}) percentage points to (${signed})%\\.`);
const increasePattern = new RegExp(`^The SNB is tightening its monetary policy further and is raising the SNB policy rate by (${unsigned}) percentage points to (${signed})%\\.`);
const decisionCandidate = /(?:Swiss National Bank|\bSNB) (?:is (?:(?:tightening its monetary policy further and is )?(?:leaving|lowering|raising))|tightens monetary policy further and raises|leaves|lowers|raises|(?:has )?decided|cuts|hikes|sets)\b/gi;

/** Verified SNB HTML layout and independently verified decision grammar; PDF-only pages fail closed. */
export function parseSnbPolicyDocumentV1(document: SnbPolicyDocumentV1, decisionDate: string): SnbPolicyFactV1 {
  assertSnbPolicyServerV1();
  if (!isSnbCivilDateV1(decisionDate)) throw new SnbPolicyValidationError("date");
  if (decisionDate < SNB_POLICY_REGIME_START_V1) throw new SnbPolicyValidationError("unsupported-regime");
  const sourceUrl = snbPolicyDocumentUrlV1(decisionDate);
  if (document.url !== sourceUrl) throw new SnbPolicyValidationError("source");
  if (Buffer.byteLength(document.html, "utf8") > SNB_POLICY_MAX_RESPONSE_BYTES_V1) throw new SnbPolicyValidationError("document");
  const withoutComments = document.html.replace(/<!--[\s\S]*?-->/g, "");
  const sourceHtml = withoutComments.replace(/<(script|style|noscript|template|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  if (withoutComments.includes("<!--") || /<\/?(?:script|style|noscript|template|nav|footer)\b/i.test(sourceHtml)) throw new SnbPolicyValidationError("document");
  const canonical = [...sourceHtml.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/g)];
  if (canonical.length !== 1 || attrs(one(fragment(canonical[0]![0])))["@_href"] !== sourceUrl) throw new SnbPolicyValidationError("source");
  const titles = [...sourceHtml.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/g)];
  const expectedTitle = `Monetary policy assessment of ${english(decisionDate)}`;
  if (titles.length !== 1 || text(fragment(titles[0]![1]!)) !== expectedTitle) throw new SnbPolicyValidationError("source");
  const mains = [...sourceHtml.matchAll(/<main\b[^>]*>[\s\S]*?<\/main>/g)];
  if (mains.length !== 1 || (sourceHtml.match(/<main\b/g) ?? []).length !== 1) throw new SnbPolicyValidationError("unsupported-structure");
  const prefix = sourceHtml.slice(0, sourceHtml.indexOf(mains[0]![0]));
  const ancestors: { name: string; opening: string }[] = [];
  for (const token of prefix.matchAll(/<(\/?)([A-Za-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
    const name = token[2]!.toLowerCase();
    if (unpairedTags.includes(name)) continue;
    if (token[1] === "/") {
      if (ancestors.pop()?.name !== name) throw new SnbPolicyValidationError("document");
    } else if (!token[0].endsWith("/>")) {
      ancestors.push({ name, opening: token[0] });
      if (ancestors.length > 60) throw new SnbPolicyValidationError("document");
    }
  }
  if (!ancestors.some((node) => node.name === "html") || !ancestors.some((node) => node.name === "body") ||
      ancestors.some((node) => hidden(one(fragment(node.opening.replace(/>$/, "/>")))))) throw new SnbPolicyValidationError("unsupported-structure");
  const main = one(fragment(mains[0]![0]));
  if (attrs(main)["@_id"] !== "a11y-main" || hidden(main)) throw new SnbPolicyValidationError("unsupported-structure");
  const title = text(children(one(find([main], (node) => tag(node) === "h1"))));
  if (title !== expectedTitle) throw new SnbPolicyValidationError("date");
  const published = one(find([main], (node) => tag(node) === "div" && classes(node).includes("cms-stage__date")));
  const publicationDate = englishDate(text(children(published)));
  if (publicationDate !== decisionDate) throw new SnbPolicyValidationError("date");
  const rich = one(find([main], (node) => tag(node) === "div" && classes(node).includes("cms-richtext")));
  const headline = text(children(one(find([rich], (node) => tag(node) === "h3"))));
  const h = headlinePattern.exec(headline);
  if (h === null) throw new SnbPolicyValidationError(/SARON|Libor|sight deposits|repo|inflation/i.test(headline) ? "unsupported-instrument" : "unsupported-wording");
  const content = one(find([rich], (node) => tag(node) === "div" && classes(node).includes("a-text")));
  const html = one(elements(children(content)));
  if (tag(html) !== "html" || hidden(html)) throw new SnbPolicyValidationError("unsupported-structure");
  const body = one(find([html], (node) => tag(node) === "body"));
  const bodyNodes = elements(children(body));
  if (bodyNodes.length === 0 || bodyNodes.some((node) => tag(node) !== "p")) throw new SnbPolicyValidationError("unsupported-structure");
  if (hidden(bodyNodes[0]!)) throw new SnbPolicyValidationError("unsupported-structure");
  const paragraphs = bodyNodes.filter((node) => !hidden(node)).map((node) => text(children(node)));
  const lead = paragraphs[0]!;
  const unchanged = unchangedPattern.exec(lead), cut = cutPattern.exec(lead), increase = increasePattern.exec(lead);
  const operative = lead.slice(0, lead.includes("%.") ? lead.indexOf("%.") + 2 : lead.length);
  if (unchanged === null && cut === null && increase === null) throw new SnbPolicyValidationError(!/\bSNB policy rate\b/.test(operative) && /SARON|Libor|sight deposits|repo|inflation/i.test(operative) ? "unsupported-instrument" : "unsupported-wording");
  const decision = unchanged !== null ? { action: "unchanged" as const, rate: scalar(unchanged[1]!), changePercentagePoints: null }
    : { action: cut !== null ? "reduce" as const : "increase" as const, rate: scalar((cut ?? increase)![2]!), changePercentagePoints: Number((cut ?? increase)![1]) };
  const action = h[1]!.startsWith("leaves") ? "unchanged" : h[1]!.startsWith("lowers") ? "reduce" : "increase";
  if (action !== decision.action || scalar(h[2]!) !== decision.rate) throw new SnbPolicyValidationError("rate");
  // The visible document must contain exactly its one headline and one operative sentence.
  // Count candidates anywhere in main, including unsupported verbs and appended contradictions.
  if ((text([main]).match(decisionCandidate) ?? []).length !== 2) throw new SnbPolicyValidationError("ambiguous");
  for (const p of paragraphs) {
    const assumptions = [...p.matchAll(new RegExp(`the SNB policy rate is (${signed})% over the entire forecast horizon`, "g"))];
    if (assumptions.some((m) => scalar(m[1]!) !== decision.rate)) throw new SnbPolicyValidationError("ambiguous");
    const rest = p === lead ? p.slice((unchanged ?? cut ?? increase)![0].length) : p;
    const remainder = rest.replace(new RegExp(`the SNB policy rate is (${signed})% over the entire forecast horizon`, "g"), "");
    if (/\b(?:SNB policy rate|new policy rate)\s*(?:[:=]|[-−–]?\d|(?:is|stands|currently|remains|will be|has been|was|at|to|by|unchanged at)\b)/i.test(remainder)) throw new SnbPolicyValidationError("ambiguous");
  }
  const board = one(find([body], (node) => tag(node) === "a" && /^introductory remarks (?:by|of) the Governing Board$/.test(text(children(node)))));
  const boardPath = `/en/publications/communication/speeches-restricted/ref_${decisionDate.replaceAll("-", "")}_mslanmargpe`;
  if (![boardPath, `https://www.snb.ch${boardPath}`].includes(String(attrs(board)["@_href"]))) throw new SnbPolicyValidationError("source");
  const id = sourceUrl.slice(sourceUrl.lastIndexOf("/") + 1);
  const asset = `/public/asset/en/www-snb-ch/publications/communication/press-releases-restricted/${id}/publications${decisionDate === "2025-06-19" ? "1" : "0"}_en/${id}.en.pdf`;
  one(find([main], (node) => tag(node) === "a" && attrs(node)["@_href"] === asset && text(children(node)) === expectedTitle));
  const effectiveMatches = [...paragraphs.join(" ").matchAll(/(?:The new policy rate|The SNB policy rate change) applies from tomorrow, (\d{1,2} [A-Za-z]+ \d{4})\./g)];
  if (effectiveMatches.length > 1) throw new SnbPolicyValidationError("ambiguous");
  let effectiveDate: string | null = null;
  if (effectiveMatches.length === 1) {
    effectiveDate = englishDate(effectiveMatches[0]![1]!);
    const next = new Date(`${decisionDate}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    if (decision.action === "unchanged" || effectiveDate !== next.toISOString().slice(0, 10)) throw new SnbPolicyValidationError("date");
  }
  if (/\b(?:new policy rate|SNB policy rate change) (?:applies|takes effect)\b/i.test(paragraphs.join(" ")) && effectiveMatches.length !== 1) throw new SnbPolicyValidationError("unsupported-wording");
  return normalizeSnbPolicyFactV1({ institution: "Swiss National Bank", decisionBody: "Governing Board", productId: "eurchf", instrument: "SNB policy rate",
    documentId: id, documentTitle: expectedTitle, decisionDate, publicationDate, decision, unit: "percent", sourceUrl, releaseTimestamp: null, effectiveDate });
}
