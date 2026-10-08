import "server-only";

import { createHash } from "node:crypto";
import { isDeepStrictEqual, types } from "node:util";
import { assertBojPolicyServerV1, type BojPolicyDocumentV1 } from "./transport";
import { BOJ_POLICY_INSTRUMENT_V1, parseBojPolicyDocumentV1, type BojPolicyDocumentKindV1 } from "./facts";
import { buildBojPolicyEvidenceV1, buildBojPolicySourceVersionIdV1, getBojPolicySpecV1,
  readBojPolicyFactV1, type BojPolicyEvidenceV1 } from "./canonical";

export const BOJ_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1 = "boj-policy-decision-action-evidence-v1" as const;
export const BOJ_POLICY_DECISION_ACTION_PARSER_VERSION_V1 = "boj-policy-decision-source-action-parser-v1" as const;

/** Structural capture context. Its reconstruction does not establish acquisition origin. */
export interface BojPolicyDecisionActionSourceCaptureV1 {
  readonly knownAt: number;
  readonly evidence: BojPolicyEvidenceV1;
  /** SHA-256 of decoded HTML encoded as UTF-8, not original wire bytes. */
  readonly decodedSourceDigest: string;
}

/** Separate sibling of the announced setting; no comparative direction or predecessor. */
export interface BojPolicyDecisionActionEvidenceV1 {
  readonly schemaVersion: typeof BOJ_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1;
  readonly parserVersion: typeof BOJ_POLICY_DECISION_ACTION_PARSER_VERSION_V1;
  readonly semantic: "source-fact";
  readonly provider: "boj";
  readonly productId: "eurjpy";
  readonly institution: "Bank of Japan";
  readonly scope: typeof BOJ_POLICY_INSTRUMENT_V1;
  readonly decisionDate: string;
  readonly documentKind: BojPolicyDocumentKindV1;
  readonly sourceUrl: string;
  /** Only the explicit decision to set this guideline; no comparison with an earlier setting. */
  readonly action: "set-guideline";
  readonly knownAt: number;
  readonly sourceVersionId: string;
  readonly capture: BojPolicyDecisionActionSourceCaptureV1;
}

export interface BuildBojPolicyDecisionActionEvidenceInputV1 {
  readonly document: BojPolicyDocumentV1;
  readonly capture: BojPolicyDecisionActionSourceCaptureV1;
}

/** Pure canonical reconstruction. Only the authority receipt reader establishes production trust. */
export function buildBojPolicyDecisionActionEvidenceV1(
  input: BuildBojPolicyDecisionActionEvidenceInputV1,
): BojPolicyDecisionActionEvidenceV1 {
  assertBojPolicyServerV1();
  assertSourceData(input, ["document", "capture"]);
  const { document, capture } = input;
  assertCaptureData(capture);
  validateCapture(capture);
  return prepareBojPolicyDecisionActionEvidenceV1({ document,
    decisionDate: capture.evidence.fact.decisionDate })(capture);
}

/** Validate complete source semantics before an authority samples its clock.
 * The returned structural constructor grants no acquisition/time authority. */
export function prepareBojPolicyDecisionActionEvidenceV1(input: {
  readonly document: BojPolicyDocumentV1; readonly decisionDate: string;
}): (capture: BojPolicyDecisionActionSourceCaptureV1) => BojPolicyDecisionActionEvidenceV1 {
  assertBojPolicyServerV1();
  assertSourceData(input, ["document", "decisionDate"]);
  const { document, decisionDate } = input;
  assertSourceData(document, ["url", "html"]);
  const { url, html } = document;
  if (typeof url !== "string" || typeof html !== "string") {
    throw new TypeError("Expected decoded BoJ decision document.");
  }
  // No caller accessor runs between closed-key validation and source detachment.
  const source = { document: { url, html }, decisionDate };
  // Every supported parser branch requires the explicit set decision context and its
  // selected guideline paragraph. Neither the title nor 'remain at around' alone suffices.
  const fact = parseBojPolicyDocumentV1(source.document, source.decisionDate);
  const spec = getBojPolicySpecV1(fact.decisionDate);
  const settingSourceVersionId = buildBojPolicySourceVersionIdV1(fact.decisionDate, fact);
  const decodedSourceDigest = `sha256:${createHash("sha256").update(source.document.html, "utf8").digest("hex")}`;
  const schemaVersion = BOJ_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1;
  const parserVersion = BOJ_POLICY_DECISION_ACTION_PARSER_VERSION_V1;
  const action = "set-guideline" as const;
  const scope = BOJ_POLICY_INSTRUMENT_V1;
  // Bind the native action and complete selected-fact identity. Acquisition time and
  // unrelated decoded source text belong to provenance, not semantic policy content.
  const sourceVersionId = `${schemaVersion}:sha256:${createHash("sha256").update(JSON.stringify([
    schemaVersion, parserVersion, "source-fact", "boj", fact.productId, fact.institution,
    scope, fact.decisionDate, fact.documentKind, fact.sourceUrl, action,
    spec.canonicalSeriesId, spec.sourceSeriesId, settingSourceVersionId,
  ]), "utf8").digest("hex")}`;
  return Object.freeze((capture: BojPolicyDecisionActionSourceCaptureV1): BojPolicyDecisionActionEvidenceV1 => {
    assertBojPolicyServerV1();
    assertCaptureData(capture);
    validateCapture(capture);
    // The original tree has only data properties: these synchronous reads and
    // cloning cannot invoke caller code or substitute any validated value.
    const captured = structuredClone(capture);
    validateCapture(captured);
    const evidence = buildBojPolicyEvidenceV1(fact, captured.knownAt);
    assertCanonical(captured.evidence, evidence);
    if (captured.decodedSourceDigest !== decodedSourceDigest) throw new TypeError("BoJ action decoded-source digest disagrees.");
    return freezeCopy({ schemaVersion, parserVersion, semantic: "source-fact", provider: "boj",
      productId: fact.productId, institution: fact.institution, scope, decisionDate: fact.decisionDate,
      documentKind: fact.documentKind, sourceUrl: fact.sourceUrl, action, knownAt: captured.knownAt,
      sourceVersionId, capture: { knownAt: captured.knownAt, evidence, decodedSourceDigest } });
  });
}

/** Strict source-backed consistency, never a receipt adoption or production-origin proof. */
export function reconstructBojPolicyDecisionActionEvidenceV1(input: BuildBojPolicyDecisionActionEvidenceInputV1 & {
  readonly evidence: BojPolicyDecisionActionEvidenceV1;
}): BojPolicyDecisionActionEvidenceV1 {
  assertBojPolicyServerV1();
  assertSourceData(input, ["document", "capture", "evidence"]);
  const { document, capture, evidence: supplied } = input;
  assertSourceData(supplied, ["schemaVersion", "parserVersion", "semantic", "provider", "productId", "institution", "scope",
    "decisionDate", "documentKind", "sourceUrl", "action", "knownAt", "sourceVersionId", "capture"]);
  assertDataTree(supplied);
  validateCapture(supplied.capture);
  const rebuilt = buildBojPolicyDecisionActionEvidenceV1({ document, capture });
  assertCanonical(supplied, rebuilt);
  return rebuilt;
}

function assertCaptureData(capture: BojPolicyDecisionActionSourceCaptureV1): void {
  assertSourceData(capture, ["knownAt", "evidence", "decodedSourceDigest"]);
  assertDataTree(capture);
}

function assertDataTree(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value === "function") throw new TypeError("Expected BoJ source data properties.");
  if (typeof value !== "object" || value === null) return;
  if (types.isProxy(value)) throw new TypeError("Expected BoJ source data properties.");
  // Exclude inherited accessors too, including on fields absent from malformed input.
  for (let prototype = Object.getPrototypeOf(value); prototype !== null && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)) {
    if (types.isProxy(prototype)) throw new TypeError("Expected BoJ source data properties.");
    for (const key of Reflect.ownKeys(prototype)) {
      if (!Object.hasOwn(Object.getOwnPropertyDescriptor(prototype, key)!, "value")) {
        throw new TypeError("Expected BoJ source data properties.");
      }
    }
  }
  if (seen.has(value)) return;
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("Expected closed BoJ action evidence object.");
  assertSourceData(value, keys as string[]);
  for (const key of keys) assertDataTree(Object.getOwnPropertyDescriptor(value, key)!.value, seen);
}

function validateCapture(capture: BojPolicyDecisionActionSourceCaptureV1): void {
  assertKeys(capture, ["knownAt", "evidence", "decodedSourceDigest"]);
  assertKeys(capture.evidence, ["schemaVersion", "fact", "metadata"]);
  if (!Number.isSafeInteger(capture.knownAt) || capture.knownAt < 0 ||
      typeof capture.decodedSourceDigest !== "string" || !/^sha256:[a-f\d]{64}$/.test(capture.decodedSourceDigest)) {
    throw new TypeError("Invalid BoJ action capture context.");
  }
  const evidence = capture.evidence;
  // The existing strict reader validates all original fact/target/provenance keys.
  const fact = readBojPolicyFactV1(evidence.fact.decisionDate, evidence);
  assertCanonical(evidence, buildBojPolicyEvidenceV1(fact, capture.knownAt));
}

function assertSourceData(value: unknown, keys: readonly string[]): void {
  // Proxies cannot supply trustworthy own-property descriptors; cloning rejected them too.
  if (types.isProxy(value)) throw new TypeError("Expected BoJ source data properties.");
  assertKeys(value, keys);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError("Expected BoJ source data properties.");
    }
  }
}

function assertKeys(value: unknown, keys: readonly string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value) ||
      Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError("Expected closed BoJ action evidence object.");
  }
}

function assertCanonical(supplied: unknown, rebuilt: unknown): void {
  function sameFields(left: unknown, right: unknown): boolean {
    if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return true;
    const keys = Reflect.ownKeys(left);
    return keys.length === Reflect.ownKeys(right).length && keys.every((key) =>
      Object.hasOwn(right, key) && sameFields(Reflect.get(left, key), Reflect.get(right, key)));
  }
  if (!sameFields(supplied, rebuilt) || !isDeepStrictEqual(supplied, rebuilt)) {
    throw new TypeError("BoJ action evidence disagrees with canonical source reconstruction.");
  }
}

function freezeCopy<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(nested: unknown): void {
    if (typeof nested !== "object" || nested === null) return;
    for (const child of Object.values(nested)) freeze(child);
    Object.freeze(nested);
  }
  freeze(copy);
  return copy;
}
