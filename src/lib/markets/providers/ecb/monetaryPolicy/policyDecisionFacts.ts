import "server-only";

import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
  type EcbPolicyRateFactsV1,
} from "../../../events/ecbMonetaryPolicy";
import {
  ecbDecisionVisibleTextV1,
  readCapturedEcbDecisionMainV1,
  type EcbMonetaryPolicyDocumentCaptureV1,
} from "./parser";

export type EcbPolicyFactsUnavailableV1 = {
  readonly status: "policy-facts-unavailable";
  readonly reason: "unsupported-structure" | "malformed-section" | "incomplete-rate-set"
    | "ambiguous-section" | "invalid-rate" | "invalid-effective-date" | "source-mismatch";
};

export type EcbPolicyDecisionFactsResultV1 =
  | { readonly status: "available"; readonly rates: EcbPolicyRateFactsV1; readonly capture: EcbMonetaryPolicyDocumentCaptureV1 }
  | EcbPolicyFactsUnavailableV1;

interface Block { readonly tag: string; readonly text: string }
const NON_CONTENT = new Set(["script", "style", "noscript", "template", "nav", "footer", "aside"]);
const OTHER_BLOCKS = new Set(["ul", "ol", "table", "blockquote", "pre"]);
const RATE_MEMBERS = ["deposit facility", "main refinancing operations", "marginal lending facility"] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CHANGE_SENTENCE = /^The Governing Council decided to (?:raise|lower) the three key ECB interest rates by (?:0|[1-9]\d*)(?:\.\d{1,2})? basis points\.\s*/i;
const RATE_SENTENCE = /^(?:Accordingly, )?The interest rates on the deposit facility, the main refinancing operations and the marginal lending facility (?:will be (?:increased|decreased) to|will remain unchanged at) (.+?) respectively(?:, with effect from (.+?))?\.$/i;

/**
 * Only English h2 "Key ECB interest rates", paragraphs up to the next heading,
 * with one explicit ordered three-rate sentence and optional same-sentence date.
 * Current changed/unchanged shapes were inspected on the official 2026-09-10
 * and 2026-04-30 publications. No universal historical compatibility is claimed.
 */
export function extractEcbPolicyDecisionFactsV1(
  html: string,
  capture: EcbMonetaryPolicyDocumentCaptureV1,
): EcbPolicyDecisionFactsResultV1 {
  if (typeof window !== "undefined") throw new Error("ECB policy extraction is server-only.");
  const main = readCapturedEcbDecisionMainV1(html, capture);
  if (main.status !== "available") return unavailable("source-mismatch");
  const blocks = orderedBlocks(main.data);
  const headings = blocks.flatMap((block, index) =>
    block.tag === "h2" && block.text === "Key ECB interest rates" ? [index] : []);
  if (headings.length === 0) return unavailable("unsupported-structure");
  if (headings.length !== 1) return unavailable("ambiguous-section");
  const section: Block[] = [];
  for (const block of blocks.slice(headings[0] + 1)) {
    if (/^h[1-6]$/.test(block.tag)) break;
    section.push(block);
  }
  if (section.length === 0 || section.some((block) => block.tag !== "p")) {
    return unavailable("unsupported-structure");
  }
  const text = section.map((block) => block.text).join(" ").replace(CHANGE_SENTENCE, "");
  const members = RATE_MEMBERS.map((member) => text.match(new RegExp(member, "gi"))?.length ?? 0);
  if (members.some((count) => count > 1)) return unavailable("ambiguous-section");
  if (members.some((count) => count === 0)) return unavailable("incomplete-rate-set");
  const percentages = text.match(/%/g)?.length ?? 0;
  if (percentages > 3) return unavailable("ambiguous-section");
  if (percentages < 3) return unavailable("incomplete-rate-set");
  const sentence = RATE_SENTENCE.exec(text);
  if (sentence === null) return unavailable("malformed-section");
  const values = /^(.+?), (.+?) and (.+?)$/.exec(sentence[1]);
  if (values === null) return unavailable("incomplete-rate-set");
  const rates = values.slice(1).map((value) => percentValue(value.trim()));
  if (rates.some((value) => value === null)) return unavailable("invalid-rate");
  let effectiveDate: string | null = null;
  if (sentence[2] !== undefined) {
    effectiveDate = englishCivilDate(sentence[2]);
    if (effectiveDate === null) return unavailable("invalid-effective-date");
  }
  return Object.freeze({ status: "available", capture, rates: Object.freeze({
    depositFacility: rates[0]!, mainRefinancingOperations: rates[1]!, marginalLendingFacility: rates[2]!,
    unit: "percent", effectiveDate,
  }) });
}

/** Attach only to the matching canonical captured decision; keep all capture times. */
export function attachEcbPolicyDecisionFactsV1(
  event: EcbMonetaryPolicyEventFactV1,
  extracted: Extract<EcbPolicyDecisionFactsResultV1, { readonly status: "available" }>,
): { readonly status: "available"; readonly event: EcbMonetaryPolicyEventFactV1 } | EcbPolicyFactsUnavailableV1 {
  const decision = event.decision;
  const capture = extracted.capture;
  if (decision === null || decision.documentUrl !== capture.reference.documentUrl ||
      decision.decisionDate !== capture.reference.decisionDate ||
      decision.sourceInstitution !== capture.reference.sourceInstitution ||
      decision.contentDigest !== capture.semanticContentDigest || decision.fetchedAt !== capture.fetchedAt) {
    return unavailable("source-mismatch");
  }
  return { status: "available", event: normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: event.canonicalMeetingDate,
    schedule: { meetingDate: event.schedule.meetingDate,
      scheduledLocalTime: event.schedule.scheduledLocalTime, fetchedAt: event.schedule.fetchedAt },
    decision: { ...decision, rates: extracted.rates },
  }) };
}

function orderedBlocks(nodes: readonly unknown[], result: Block[] = []): Block[] {
  for (const node of nodes) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) continue;
    for (const [tag, children] of Object.entries(node)) {
      if (tag === ":@" || NON_CONTENT.has(tag)) continue;
      if (tag === "#text") {
        if (typeof children === "string" && children.trim()) result.push({ tag: "unsupported-text", text: children });
        continue;
      }
      if (!Array.isArray(children)) continue;
      if (/^h[1-6]$/.test(tag) || tag === "p" || OTHER_BLOCKS.has(tag)) {
        result.push({ tag, text: ecbDecisionVisibleTextV1(children) });
      } else if (["div", "section", "article"].includes(tag)) {
        orderedBlocks(children, result);
      } else {
        result.push({ tag: "unsupported-structure", text: "" });
      }
    }
  }
  return result;
}

function percentValue(text: string): number | null {
  // Existing canonical representation is a percent number, not a decimal object.
  // Validate at most two decimal places, then convert exact integer hundredths; no rounding.
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?%$/.test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace(/^-/, "").slice(0, -1).split(".");
  const hundredths = Number(`${whole}${fraction.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(hundredths)) return null;
  const value = hundredths / 100;
  const [convertedWhole, convertedFraction = ""] = String(value).split(".");
  if (convertedFraction.length > 2 ||
      Number(`${convertedWhole}${convertedFraction.padEnd(2, "0")}`) !== hundredths) return null;
  return hundredths === 0 ? 0 : value * (negative ? -1 : 1);
}

function englishCivilDate(text: string): string | null {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(text);
  if (match === null) return null;
  const month = MONTHS.indexOf(match[2]) + 1;
  if (month === 0) return null;
  const value = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const date = new Date(Date.UTC(Number(match[3]), month - 1, Number(match[1])));
  return date.toISOString().slice(0, 10) === value ? value : null;
}

function unavailable(reason: EcbPolicyFactsUnavailableV1["reason"]): EcbPolicyFactsUnavailableV1 {
  return Object.freeze({ status: "policy-facts-unavailable", reason });
}
