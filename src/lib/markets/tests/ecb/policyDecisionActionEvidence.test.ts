import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { XMLParser } from "fast-xml-parser";
import ts from "typescript";
import {
  buildEcbPolicyDecisionActionEvidenceV1,
  reconstructEcbPolicyDecisionActionEvidenceV1,
  ECB_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1,
  ECB_POLICY_DECISION_ACTION_PARSER_VERSION_V1,
  type BuildEcbPolicyDecisionActionEvidenceInputV1,
  type EcbPolicyDecisionActionEvidenceV1,
} from "../../providers/ecb/monetaryPolicy/policyDecisionActionEvidence";
import { captureKnownEcbDecisionDocumentHtmlV1 } from "../../providers/ecb/monetaryPolicy/parser";
import { extractEcbPolicyDecisionFactsV1, attachEcbPolicyDecisionFactsV1 } from "../../providers/ecb/monetaryPolicy/policyDecisionFacts";
import { normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1, advanceEcbMonetaryPolicyEventMemoryV1 } from "../../events/ecbMonetaryPolicyMemory";
import { buildPolicyEventDecisionEvidenceV1 } from "../../events/policyEventDecisionEvidence";

// Reduced offline publisher-layout fixtures matching policyDecisionFacts.test.ts; not live official captures.
const DATE = "2026-09-10";
const FETCHED = 1_789_100_000;
const REFERENCE = { sourceInstitution: "ECB", decisionDate: DATE,
  documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html" };
const OPENING = "The Governing Council decided to raise the three key ECB interest rates by 25 basis points. ";
const RATE_SENTENCE = "The interest rates on the deposit facility, the main refinancing operations and the marginal lending facility " +
  "will be increased to 2.50%, 2.65% and 2.90% respectively, with effect from 16 September 2026.";
const RAISE = OPENING + "Accordingly, " + RATE_SENTENCE;
const LOWER = RAISE.replace("raise", "lower").replace("increased", "decreased");
const MAINTAIN = RATE_SENTENCE.replace("will be increased to", "will remain unchanged at");
const wrap = (section: string, before = "", after = "") => `<html><body><main><h1>Monetary policy decisions</h1>${before}` +
  `<h2>Key ECB interest rates</h2>${section}<h2>Other measures</h2>${after}</main></body></html>`;
function captured(html: string, fetchedAt = FETCHED): BuildEcbPolicyDecisionActionEvidenceInputV1 {
  const result = captureKnownEcbDecisionDocumentHtmlV1(html, REFERENCE, fetchedAt);
  assert.equal(result.status, "available");
  if (result.status !== "available") throw new Error("Invalid fixture capture.");
  return structuredClone({ html, capture: result.data });
}
const input = (sentence = RAISE, fetchedAt = FETCHED) => captured(wrap(`<p>${sentence}</p>`), fetchedAt);
function evidence(source = input()): EcbPolicyDecisionActionEvidenceV1 {
  const result = buildEcbPolicyDecisionActionEvidenceV1(source);
  assert.equal(result.status, "available");
  return result.evidence;
}
function fails(source: BuildEcbPolicyDecisionActionEvidenceInputV1, reason: string): void {
  assert.deepEqual(buildEcbPolicyDecisionActionEvidenceV1(source), { status: "policy-facts-unavailable", reason });
}
const reject = (source: unknown) => assert.throws(() => buildEcbPolicyDecisionActionEvidenceV1(source as BuildEcbPolicyDecisionActionEvidenceInputV1));
function eachObject(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), visit);
}

for (const [action, sentence] of [["raise", RAISE], ["lower", LOWER], ["maintain", MAINTAIN]] as const) {
  test("source wording establishes shared " + action, () => {
    const source = input(sentence);
    const result = evidence(source);
    assert.equal(result.action, action);
    assert.equal(result.schemaVersion, ECB_POLICY_DECISION_ACTION_EVIDENCE_SCHEMA_VERSION_V1);
    assert.equal(result.parserVersion, ECB_POLICY_DECISION_ACTION_PARSER_VERSION_V1);
    assert.equal(result.semantic, "source-fact"); assert.equal(result.provider, "ecb");
    assert.equal(result.scope, "three-key-ecb-interest-rates");
    assert.equal(result.knownAt, FETCHED);
    assert.deepEqual(result.capture, source.capture);
    assert.equal(result.capture.reference.decisionDate, DATE);
    assert.equal(result.capture.reference.documentUrl, REFERENCE.documentUrl);
    assert.match(result.sourceVersionId, /^ecb-policy-decision-action-evidence-v1:sha256:[a-f\d]{64}$/);
    assert.deepEqual(reconstructEcbPolicyDecisionActionEvidenceV1({ ...source, evidence: result }), result);
  });
}
for (const [verb, action] of [["increased", "raise"], ["decreased", "lower"]] as const) test("ordered " + verb + " sentence alone establishes action", () => {
  assert.equal(evidence(input(RATE_SENTENCE.replace("increased", verb))).action, action);
  assert.equal(evidence(input("Accordingly, " + RATE_SENTENCE.replace("increased", verb))).action, action);
});
test("wording, never numeric rate levels or published magnitude, controls action", () => {
  for (const sentence of [RAISE, LOWER, MAINTAIN]) {
    const action = evidence(input(sentence)).action;
    for (const value of ["-0.50%", "0.00%", "9.00%", "2.65%"]) {
      assert.equal(evidence(input(sentence.replace("2.50%", value))).action, action);
    }
  }
  assert.equal(evidence(input(RAISE.replace("25 basis points", "0 basis points"))).action, "raise");
});
for (const opening of ["raise", "lower"] as const) for (const operative of ["will be increased to", "will be decreased to", "will remain unchanged at"] as const) {
  if ((opening === "raise" && operative === "will be increased to") || (opening === "lower" && operative === "will be decreased to")) continue;
  test("contradictory " + opening + "/" + operative + " fails closed", () => {
    fails(input(RAISE.replace("decided to raise", `decided to ${opening}`).replace("will be increased to", operative)), "ambiguous-section");
  });
}
test("supported operative verbs remain case insensitive and preserve inline markup", () => {
  assert.equal(evidence(input(RAISE.replace("decided to raise", "DECIDED TO RAISE").replace("will be increased to", "WILL BE INCREASED TO"))).action, "raise");
  assert.equal(evidence(input(RAISE.replace("increased", "<strong>increased</strong>"))).action, "raise");
});
const badSections: readonly [string, string, string][] = [
  ["duplicate heading", `<p>${RAISE}</p><h2>Key ECB interest rates</h2><p>${MAINTAIN}</p>`, "ambiguous-section"],
  ["duplicate sentences", `<p>${RAISE}</p><p>${RAISE}</p>`, "ambiguous-section"],
  ["repeated component", `<p>${RAISE.replace("deposit facility", "deposit facility deposit facility")}</p>`, "ambiguous-section"],
  ["partial component set", `<p>${RAISE.replace("marginal lending facility", "unsupported member")}</p>`, "incomplete-rate-set"],
  ["partial value set", `<p>${RAISE.replace("2.65%", "")}</p>`, "incomplete-rate-set"],
  ["extra percentage", `<p>${RAISE}</p><p>Another rate 3.00%.</p>`, "ambiguous-section"],
  ["table", `<table><tr><td>${RAISE}</td></tr></table>`, "unsupported-structure"],
  ["no operative verb", `<p>${RATE_SENTENCE.replace("will be increased to", "are")}</p>`, "malformed-section"],
  ["generic keep wording", `<p>The Governing Council decided to keep the three key ECB interest rates unchanged. ${MAINTAIN}</p>`, "malformed-section"],
  ["duplicate opening", `<p>${OPENING}${RAISE}</p>`, "malformed-section"],
  ["component-specific verbs", `<p>${RATE_SENTENCE.replace("will be increased to", "will be increased, decreased and unchanged at")}</p>`, "malformed-section"],
  ["past decision inside section", `<p>Last year ${RAISE}</p>`, "malformed-section"],
  ["future guidance inside section", `<p>${MAINTAIN} The Governing Council may raise rates later.</p>`, "invalid-effective-date"],
  ["invalid rate", `<p>${RAISE.replace("2.50%", "two%")}</p>`, "invalid-rate"],
  ["invalid date", `<p>${RAISE.replace("16 September 2026", "31 February 2026")}</p>`, "invalid-effective-date"],
];
for (const [name, section, reason] of badSections) test(name + " cannot establish canonical action", () => fails(captured(wrap(section)), reason));
test("past/future/action-like wording outside the section supplies no authority", () => {
  const source = captured(wrap(`<p>${MAINTAIN}</p>`, `<p>Last year ${RAISE}</p>`, `<p>The Council may lower rates later. ${LOWER}</p>`));
  assert.equal(evidence(source).action, "maintain");
  fails(captured(wrap("<p>No explicit values.</p>", `<p>${RAISE}</p>`, `<p>${LOWER}</p>`)), "incomplete-rate-set");
  fails(captured(wrap(`<p>${RATE_SENTENCE}</p>`).replace("<h2>Key ECB interest rates</h2>", "<h3>Key ECB interest rates</h3>")), "unsupported-structure");
});

test("exact bytes and semantic capture digests must match", () => {
  const source = input();
  fails({ ...source, html: source.html.replace("increased", "decreased") }, "source-mismatch");
  fails({ ...source, capture: { ...source.capture, rawCaptureDigest: "a".repeat(64) } }, "source-mismatch");
  fails({ ...source, capture: { ...source.capture, semanticContentDigest: "a".repeat(64) } }, "source-mismatch");
});
test("official decision host, URL path and URL/date identity remain mandatory", () => {
  const source = input();
  for (const documentUrl of [REFERENCE.documentUrl.replace("www.ecb.europa.eu", "evil.example"),
    REFERENCE.documentUrl.replace("https:", "http:"), REFERENCE.documentUrl + "?extra=yes", REFERENCE.documentUrl + "#fragment",
    REFERENCE.documentUrl.replace("ecb.mp260910", "ecb.mp260911"), "https://www.ecb.europa.eu/other.html"]) {
    fails({ ...source, capture: { ...source.capture, reference: { ...source.capture.reference, documentUrl } } }, "source-mismatch");
  }
  fails({ ...source, capture: { ...source.capture, reference: { ...source.capture.reference, decisionDate: "2026-09-11" } } }, "source-mismatch");
  fails({ ...source, capture: { ...source.capture, reference: { ...source.capture.reference, sourceInstitution: "NOT_ECB" as "ECB" } } }, "source-mismatch");
});
test("capture time is explicit, validated and independent of document date", () => {
  for (const fetchedAt of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined, null, "1789100000"]) {
    const source = input(); reject({ ...source, capture: { ...source.capture, fetchedAt } });
  }
  for (const fetchedAt of [0, FETCHED, FETCHED + 60]) assert.equal(evidence(input(RAISE, fetchedAt)).knownAt, fetchedAt);
  const before = evidence(input()); const later = evidence(input(RAISE, FETCHED + 60));
  assert.equal(later.sourceVersionId, before.sourceVersionId, "capture metadata is not visible-source semantics");
  assert.notEqual(later.knownAt, before.knownAt);
  assert.notEqual(before.knownAt, Date.parse(DATE) / 1000);
});
test("raw response identity is retained without changing visible-source version semantics", () => {
  const first = input(); const second = captured(first.html.replace("<body>", "<body><script>ignored</script>"));
  const a = evidence(first); const b = evidence(second);
  assert.notEqual(a.capture.rawCaptureDigest, b.capture.rawCaptureDigest);
  assert.equal(a.capture.semanticContentDigest, b.capture.semanticContentDigest);
  assert.equal(a.sourceVersionId, b.sourceVersionId);
});
test("semantic version is independent of caller reference property order", () => {
  const source = input();
  const reordered = { ...source, capture: { ...source.capture, reference: {
    documentUrl: REFERENCE.documentUrl, decisionDate: DATE, sourceInstitution: "ECB" as const,
  } } };
  assert.deepEqual(evidence(reordered), evidence(source));
});
const mutations: readonly [string, (value: EcbPolicyDecisionActionEvidenceV1) => void][] = [
  ["action", (v) => Reflect.set(v, "action", "lower")],
  ["unknown action", (v) => Reflect.set(v, "action", "keep")],
  ["schema", (v) => Reflect.set(v, "schemaVersion", "other-v1")],
  ["parser", (v) => Reflect.set(v, "parserVersion", "other-parser")],
  ["provider", (v) => Reflect.set(v, "provider", "boe")],
  ["semantic", (v) => Reflect.set(v, "semantic", "derived-feature")],
  ["scope", (v) => Reflect.set(v, "scope", "deposit-facility-only")],
  ["version hash", (v) => Reflect.set(v, "sourceVersionId", "a".repeat(64))],
  ["knowledge", (v) => Reflect.set(v, "knownAt", FETCHED - 1)],
  ["capture time", (v) => Reflect.set(v.capture, "fetchedAt", FETCHED + 1)],
  ["raw digest", (v) => Reflect.set(v.capture, "rawCaptureDigest", "a".repeat(64))],
  ["semantic digest", (v) => Reflect.set(v.capture, "semanticContentDigest", "a".repeat(64))],
  ["date", (v) => Reflect.set(v.capture.reference, "decisionDate", "2026-09-11")],
  ["document", (v) => Reflect.set(v.capture.reference, "documentUrl", "https://evil.example/decision.html")],
  ["publisher", (v) => Reflect.set(v.capture.reference, "sourceInstitution", "NOT_ECB")],
];
for (const [name, mutate] of mutations) test("strict reconstruction rejects forged " + name, () => {
  const source = input(); const supplied = structuredClone(evidence(source)); mutate(supplied);
  assert.throws(() => reconstructEcbPolicyDecisionActionEvidenceV1({ ...source, evidence: supplied }), TypeError);
});
test("an otherwise authentic child from different source wording cannot pass reconstruction", () => {
  const source = input(); const lower = evidence(input(LOWER));
  assert.throws(() => reconstructEcbPolicyDecisionActionEvidenceV1({ ...source, evidence: lower }), TypeError);
  assert.throws(() => reconstructEcbPolicyDecisionActionEvidenceV1({ ...input(MAINTAIN), evidence: evidence(source) }), TypeError);
});
test("reconstruction cannot accept evidence when source parsing is unavailable", () => {
  const supplied = evidence();
  const source = input(RAISE.replace("increased", "decreased"));
  assert.throws(() => reconstructEcbPolicyDecisionActionEvidenceV1({ ...source, evidence: supplied }), TypeError);
});
for (const location of ["root", "capture", "reference"] as const) test("builder original " + location + " rejects enumerable, hidden and symbol extras", () => {
  for (const key of ["action", "rates", "history", "sourceAction", Symbol("extra")]) for (const enumerable of [true, false]) {
    const source = input();
    const target = location === "root" ? source : location === "capture" ? source.capture : source.capture.reference;
    Object.defineProperty(target, key, { value: "raise", enumerable }); reject(source);
  }
});
for (const location of ["root", "evidence", "capture", "reference"] as const) test("reconstruction original " + location + " rejects hidden/symbol extras", () => {
  for (const key of ["extra", Symbol("extra")]) for (const enumerable of [true, false]) {
    const source = input(); const child = structuredClone(evidence(source)); const value = { ...source, evidence: child };
    const target = location === "root" ? value : location === "evidence" ? child : location === "capture" ? child.capture : child.capture.reference;
    Object.defineProperty(target, key, { value: true, enumerable });
    assert.throws(() => reconstructEcbPolicyDecisionActionEvidenceV1(value), TypeError);
  }
});
test("malformed shapes, missing fields and malformed digests reject", () => {
  for (const source of [null, undefined, [], {}, { action: "raise" }, { ...input(), html: null }, { ...input(), capture: null }]) reject(source);
  for (const digest of ["", "a".repeat(63), "g".repeat(64), "A".repeat(64), null, 123]) {
    const source = input(); reject({ ...source, capture: { ...source.capture, rawCaptureDigest: digest } });
    reject({ ...source, capture: { ...source.capture, semanticContentDigest: digest } });
  }
  const source = input(); Reflect.deleteProperty(source.capture.reference, "decisionDate"); reject(source);
});
test("available output and reconstruction are detached, recursively frozen and deterministic", () => {
  const source = input(); const before = structuredClone(source); const callerObjects = new Set<object>();
  eachObject(source, (object) => { assert.ok(!Object.isFrozen(object)); callerObjects.add(object); });
  const result = buildEcbPolicyDecisionActionEvidenceV1(source);
  assert.deepEqual(result, buildEcbPolicyDecisionActionEvidenceV1(source));
  eachObject(result, (object) => { assert.ok(Object.isFrozen(object)); assert.ok(!callerObjects.has(object)); });
  assert.deepEqual(source, before);
  const child = structuredClone(evidence(source)); const reconstructed = reconstructEcbPolicyDecisionActionEvidenceV1({ ...source, evidence: child });
  eachObject(child, (object) => assert.ok(!Object.isFrozen(object)));
  const rebuiltObjects = new Set<object>(); eachObject(reconstructed, (object) => { assert.ok(Object.isFrozen(object)); rebuiltObjects.add(object); });
  eachObject(child, (object) => assert.ok(!rebuiltObjects.has(object)));
  Reflect.set(source.capture.reference, "decisionDate", "2026-09-11"); Reflect.set(child, "action", "lower");
  assert.equal(reconstructed.action, "raise"); assert.equal(reconstructed.capture.reference.decisionDate, DATE);
  assert.deepEqual(result, { status: "available", evidence: reconstructed });
});
test("unavailable output is frozen without freezing caller input", () => {
  const source = input(RAISE.replace("increased", "decreased")); const before = structuredClone(source);
  const result = buildEcbPolicyDecisionActionEvidenceV1(source);
  assert.ok(Object.isFrozen(result)); assert.deepEqual(source, before);
  eachObject(source, (object) => assert.ok(!Object.isFrozen(object)));
});
test("legacy events, snapshots, memory, semantic hashes and consumer action remain unchanged", () => {
  const source = input(); const rates = extractEcbPolicyDecisionFactsV1(source.html, source.capture);
  assert.equal(rates.status, "available");
  assert.deepEqual(Reflect.ownKeys(rates).sort(), ["capture", "rates", "status"]);
  const event = normalizeEcbMonetaryPolicyEventV1({ canonicalMeetingDate: DATE,
    schedule: { meetingDate: DATE, fetchedAt: FETCHED - 60 }, decision: {
      decisionDate: DATE, documentUrl: REFERENCE.documentUrl, contentDigest: source.capture.semanticContentDigest,
      fetchedAt: FETCHED, firstObservedAt: FETCHED, actualReleasedAt: null, rates: null,
    } });
  const attached = attachEcbPolicyDecisionFactsV1(event, rates);
  assert.equal(attached.status, "available");
  const snapshot = buildEcbMonetaryPolicyEventSnapshotV1(attached.event);
  const memory = advanceEcbMonetaryPolicyEventMemoryV1(null, attached.event).memory;
  const before = JSON.stringify({ event: attached.event, snapshot, memory });
  evidence(source);
  assert.equal(JSON.stringify({ event: attached.event, snapshot, memory }), before);
  eachObject({ event: attached.event, snapshot, memory }, (object) => {
    assert.ok(!Object.hasOwn(object, "action")); assert.ok(!Object.hasOwn(object, "sourceAction"));
  });
  const assessed = buildPolicyEventDecisionEvidenceV1({ provider: "ecb", productId: "eurusd",
    evaluatedAt: new Date((FETCHED + 1) * 1000).toISOString(), expectedEcbCanonicalEventId: event.canonicalEventId,
    evidence: { status: "supplied", snapshot } });
  assert.deepEqual(assessed.sourceAction, { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" });
  assert.equal(assessed.officialPredecessor.reason, "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED");
});
test("programming failures are not disguised as missing source evidence", () => {
  const source = input(); const error = new ReferenceError("sentinel");
  Object.defineProperty(source.capture, "rawCaptureDigest", { get() { throw error; } });
  assert.throws(() => buildEcbPolicyDecisionActionEvidenceV1(source), (caught) => caught === error);
  assert.throws(() => buildEcbPolicyDecisionActionEvidenceV1(new Proxy(input(), { ownKeys() { throw error; } })), (caught) => caught === error);
  const fresh = input(); const original = XMLParser.prototype.parse;
  try { XMLParser.prototype.parse = () => { throw error; }; assert.throws(() => evidence(fresh), (caught) => caught === error); }
  finally { XMLParser.prototype.parse = original; }
});
test("construction and reconstruction use no implicit clock, randomness or network", () => {
  const source = input(); const child = evidence(source);
  const fetchBefore = globalThis.fetch; const nowBefore = Date.now; const randomBefore = Math.random;
  try {
    globalThis.fetch = () => { throw new Error("network used"); }; Date.now = () => { throw new Error("clock used"); };
    Math.random = () => { throw new Error("random used"); };
    assert.deepEqual(evidence(source), child);
    assert.deepEqual(reconstructEcbPolicyDecisionActionEvidenceV1({ ...source, evidence: child }), child);
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; Math.random = randomBefore; }
});
test("public evidence has no numeric/action inference or economic/trading semantics", () => {
  const forbidden = new Set(["rates", "rate", "depositFacility", "mainRefinancingOperations", "marginalLendingFacility", "midpoint", "representativeRate",
    "previous", "predecessor", "delta", "direction", "tightening", "easing", "restrictive", "accommodative", "neutral", "hawkish", "dovish",
    "bullish", "bearish", "fxDirection", "surprise", "confidence", "recommendation", "trade", "current", "latest"]);
  for (const sentence of [RAISE, LOWER, MAINTAIN]) eachObject(evidence(input(sentence)), (object) => {
    for (const key of Reflect.ownKeys(object)) assert.ok(!forbidden.has(String(key)), String(key));
  });
});
test("production module has no I/O, acquisition, arithmetic owner, catches or implicit clock", () => {
  const source = readFileSync("src/lib/markets/providers/ecb/monetaryPolicy/policyDecisionActionEvidence.ts", "utf8");
  const ast = ts.createSourceFile("action.ts", source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    assert.ok(!ts.isCatchClause(node));
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) assert.ok(!/persistence|redis|node:fs|runtime|acquisition|transport|PriorSelection|DecisionChange|DecisionDirection|aws|R2/.test((node.moduleSpecifier as ts.StringLiteral).text));
    if (ts.isCallExpression(node)) assert.ok(!/^(fetch|setTimeout|setInterval|Date\.now|Math\.random)/.test(node.expression.getText(ast)));
    if (ts.isNewExpression(node)) assert.notEqual(node.expression.getText(ast), "Date");
    if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), "process.env");
    if (ts.isBinaryExpression(node)) assert.ok(![ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind));
    ts.forEachChild(node, visit);
  }
  visit(ast);
});
