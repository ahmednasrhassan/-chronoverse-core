import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import {
  buildPolicyEventDecisionEvidenceV2, POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2,
  type BuildPolicyEventDecisionEvidenceInputV2,
} from "../../events/policyEventDecisionEvidenceV2";
import { buildPolicyEventDecisionEvidenceV1, type BuildPolicyEventDecisionEvidenceInputV1 } from "../../events/policyEventDecisionEvidence";
import { ecbMonetaryPolicyCanonicalEventIdV1, normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";
import {
  acquireEcbPolicyDecisionActionCaptureV1, createEcbPolicyDecisionActionCaptureAuthorityV1,
  readEcbPolicyDecisionActionCaptureAsKnownAtV1,
  type EcbPolicyDecisionActionCaptureReceiptV1,
} from "../../services/ecbPolicyDecisionActionCaptureAuthority";
import { captureKnownEcbDecisionDocumentHtmlV1 } from "../../providers/ecb/monetaryPolicy/parser";
import { buildEcbPolicyDecisionActionEvidenceV1, reconstructEcbPolicyDecisionActionEvidenceV1 } from "../../providers/ecb/monetaryPolicy/policyDecisionActionEvidence";
import type { EcbPolicyDecisionActionEvidenceV1 } from "../../providers/ecb/monetaryPolicy/policyDecisionActionEvidence";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { buildUsPolicyCanonicalSeriesV1 } from "../../providers/federalReserve/canonical";
import { parseFomcStatementV1 } from "../../providers/federalReserve/fomc";
import { statement } from "../usPolicy/fixtures";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import { BOJ_POLICY_INSTRUMENT_V1, type BojPolicyTargetV1 } from "../../providers/boj/facts";
import { bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { buildBoeBankRateEvidenceV1 } from "../../providers/boe/canonical";
import { parseBoeBankRateDocumentV1 } from "../../providers/boe/facts";
import { document as boeDocument, releaseNotice } from "../boe/fixtures";
import { buildSnbPolicyEvidenceV1 } from "../../providers/snb/canonical";
import { parseSnbPolicyDocumentV1 } from "../../providers/snb/facts";
import { document as snbDocument } from "../snb/fixtures";

// Reduced offline publisher-layout fixtures and canonical event fixtures, not live captures.
const F = 1_789_100_000;
const DATE = "2026-09-10";
const REFERENCE = { sourceInstitution: "ECB", decisionDate: DATE,
  documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html" };
const at = (time = F) => new Date(time * 1_000).toISOString();
const RATE_SENTENCE = "The interest rates on the deposit facility, the main refinancing operations and the marginal lending facility " +
  "will be increased to 2.50%, 2.65% and 2.90% respectively, with effect from 16 September 2026.";
const RAISE = "The Governing Council decided to raise the three key ECB interest rates by 25 basis points. Accordingly, " + RATE_SENTENCE;
const LOWER = RAISE.replace("raise", "lower").replace("increased", "decreased");
const MAINTAIN = RATE_SENTENCE.replace("will be increased to", "will remain unchanged at");
const html = (wording = RAISE) => `<html><body><main><h1>Monetary policy decisions</h1><h2>Key ECB interest rates</h2><p>${wording}</p></main></body></html>`;
const supplied = <S>(snapshot: S) => ({ status: "supplied", snapshot } as const);
const absent = { status: "unavailable", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null } as const;
const unavailable = (reason: string) => ({ availability: "unavailable", reason, upstreamReason: null });
type EcbInput = Extract<BuildPolicyEventDecisionEvidenceInputV2, { provider: "ecb" }>;
interface Acquired { receipt: EcbPolicyDecisionActionCaptureReceiptV1; child: EcbPolicyDecisionActionEvidenceV1; body: string }
async function acquire(wording = RAISE, time = F, reference = REFERENCE): Promise<Acquired> {
  const originalFetch = globalThis.fetch; const originalNow = Date.now;
  const body = html(wording);
  try {
    globalThis.fetch = async (url) => { assert.equal(url, reference.documentUrl); return new Response(body, { headers: { "Content-Type": "text/html" } }); };
    Date.now = () => time * 1_000;
    const result = await acquireEcbPolicyDecisionActionCaptureV1({ reference: { ...reference }, signal: new AbortController().signal });
    assert.ok(result.status === "acquired");
    const read = readEcbPolicyDecisionActionCaptureAsKnownAtV1({ receipt: result.receipt, evaluatedAt: at(time) });
    assert.ok(read.status === "available");
    return { receipt: result.receipt, child: read.evidence, body };
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
}
interface EventOptions {
  knownAt?: number; canonicalDate?: string; meetingDate?: string; documentUrl?: string; digest?: string;
  rates?: readonly [number, number, number] | null; effectiveDate?: string | null; document?: boolean;
}
function snapshot(action: Acquired, options: EventOptions = {}) {
  const { canonicalDate = DATE, meetingDate = DATE, knownAt = F - 60,
    documentUrl = action.child.capture.reference.documentUrl, digest = action.child.capture.semanticContentDigest,
    rates = [2.5, 2.65, 2.9], effectiveDate = "2026-09-16", document = true } = options;
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: canonicalDate, schedule: { meetingDate, fetchedAt: knownAt },
    decision: document ? { decisionDate: meetingDate, documentUrl, contentDigest: digest,
      fetchedAt: knownAt, firstObservedAt: knownAt, actualReleasedAt: null,
      rates: rates === null ? null : { depositFacility: rates[0], mainRefinancingOperations: rates[1], marginalLendingFacility: rates[2], effectiveDate } } : null,
  }));
}
function request(action: Acquired, options: EventOptions = {}): EcbInput {
  const event = snapshot(action, options);
  return { productId: "eurusd", provider: "ecb", evaluatedAt: at(), expectedEcbCanonicalEventId: event.canonicalEventId,
    evidence: supplied(structuredClone(event)), sourceActionReceipt: action.receipt };
}
function build(input: EcbInput) {
  const result = buildPolicyEventDecisionEvidenceV2(input);
  assert.equal(result.provider, "ecb");
  if (result.provider !== "ecb") throw new Error("Expected ECB view.");
  return result;
}
const reject = (input: unknown, expected?: RegExp) => {
  const run = () => buildPolicyEventDecisionEvidenceV2(input as BuildPolicyEventDecisionEvidenceInputV2);
  if (expected === undefined) assert.throws(run);
  else assert.throws(run, expected);
};
function v1Input(input: EcbInput): Extract<BuildPolicyEventDecisionEvidenceInputV1, { provider: "ecb" }> {
  return { productId: input.productId, provider: input.provider, evaluatedAt: input.evaluatedAt,
    expectedEcbCanonicalEventId: input.expectedEcbCanonicalEventId, evidence: input.evidence };
}
function eachObject(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value); for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), visit);
}
for (const [action, wording] of [["raise", RAISE], ["lower", LOWER], ["maintain", MAINTAIN]] as const) {
  test("ECB trusted " + action + " is a separate shared source dimension; V1 remains unchanged", async () => {
    const captured = await acquire(wording); const input = request(captured); const result = build(input);
    assert.equal(result.schemaVersion, POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2);
    assert.equal(result.feature, "policy-event-decision-evidence"); assert.equal(result.semantic, "derived-feature");
    assert.equal(result.coverage, "provided-evidence-only");
    assert.deepEqual(result.sourceAction, { availability: "available", data: action });
    assert.ok(result.sourceActionEvidence.availability === "available");
    assert.deepEqual(result.sourceActionEvidence.data, captured.child);
    assert.equal(result.sourceActionEvidence.data.scope, "three-key-ecb-interest-rates");
    assert.deepEqual(result.announcedSetting, { availability: "available", data: {
      depositFacility: 2.5, mainRefinancingOperations: 2.65, marginalLendingFacility: 2.9, unit: "percent", effectiveDate: "2026-09-16" } });
    assert.deepEqual(result.officialPredecessor, { availability: "unavailable", reason: "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED" });
    assert.equal(result.evidenceKnownAt, F);
    const old = buildPolicyEventDecisionEvidenceV1(v1Input(input));
    assert.equal(old.schemaVersion, "policy-event-decision-evidence-v1");
    assert.deepEqual(old.sourceAction, { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" });
    assert.ok(!Object.hasOwn(old, "sourceActionEvidence"));
    const { schemaVersion: version, sourceAction: branch, sourceActionEvidence: audit, evidenceKnownAt: known, ...rest } = result;
    assert.ok(version && branch && audit && known);
    assert.deepEqual(rest, (({ schemaVersion, sourceAction, evidenceKnownAt, ...retained }) => {
      assert.ok(schemaVersion && sourceAction && evidenceKnownAt); return retained;
    })(old));
  });
}

test("ECB preserves absent effective date and supports action without announced rate values", async () => {
  const captured = await acquire();
  assert.ok(build(request(captured, { effectiveDate: null })).announcedSetting.availability === "available");
  const dated = build(request(captured, { effectiveDate: null }));
  assert.ok(dated.announcedSetting.availability === "available"); assert.equal(dated.announcedSetting.data.effectiveDate, null);
  const actionOnly = build(request(captured, { rates: null }));
  assert.deepEqual(actionOnly.announcedSetting, { availability: "unavailable", reason: "POLICY_SETTING_UNAVAILABLE" });
  assert.deepEqual(actionOnly.sourceAction, { availability: "available", data: "raise" });
  assert.equal(actionOnly.evidenceKnownAt, F); assert.equal(actionOnly.event.availability, "available");
});

test("missing receipt is explicit absence, independent of event/rate availability", async () => {
  const input = request(await acquire()); const result = build({ ...input, sourceActionReceipt: null });
  assert.deepEqual(result.sourceAction, unavailable("NO_CAPTURED_EVIDENCE"));
  assert.deepEqual(result.sourceActionEvidence, unavailable("NO_CAPTURED_EVIDENCE"));
  assert.equal(result.announcedSetting.availability, "available"); assert.equal(result.evidenceKnownAt, F - 60);
  const neither = build({ ...input, evidence: absent, sourceActionReceipt: null });
  assert.equal(neither.evidenceKnownAt, null);
  assert.deepEqual(neither.sourceActionEvidence, unavailable("NO_CAPTURED_EVIDENCE"));
  reject({ ...input, sourceActionReceipt: undefined }, /Unrecognized/);
  const missingField = { ...input }; Reflect.deleteProperty(missingField, "sourceActionReceipt"); reject(missingField, /closed/);
});

test("future action is entirely redacted while admitted rates and aggregation remain unchanged", async () => {
  const captured = await acquire(RAISE, F + 60); const input = request(captured); const result = build(input);
  assert.deepEqual(result.sourceAction, unavailable("KNOWLEDGE_INCONSISTENT"));
  assert.deepEqual(result.sourceActionEvidence, unavailable("KNOWLEDGE_INCONSISTENT"));
  assert.deepEqual(Reflect.ownKeys(result.sourceActionEvidence), ["availability", "reason", "upstreamReason"]);
  assert.equal(result.event.availability, "available"); assert.equal(result.announcedSetting.availability, "available");
  assert.equal(result.evidenceKnownAt, F - 60);
  const expected = build({ ...input, sourceActionReceipt: null });
  assert.deepEqual(result, { ...expected, sourceAction: unavailable("KNOWLEDGE_INCONSISTENT"), sourceActionEvidence: unavailable("KNOWLEDGE_INCONSISTENT") });
  const encodedAction = JSON.stringify(result.sourceActionEvidence);
  for (const value of [captured.child.action, REFERENCE.documentUrl, String(F + 60), captured.child.capture.rawCaptureDigest,
    captured.child.capture.semanticContentDigest, captured.child.schemaVersion, captured.child.parserVersion, captured.child.sourceVersionId]) {
    assert.ok(!encodedAction.includes(value));
  }
});

test("known action cannot bind through missing, schedule-only or future event context", async () => {
  const captured = await acquire(); const input = request(captured);
  for (const evidence of [absent, supplied(snapshot(captured, { document: false })), supplied(snapshot(captured, { knownAt: F + 60 }))]) {
    const result = build({ ...input, evidence });
    assert.deepEqual(result.sourceAction, unavailable("CAPTURE_COVERAGE_UNKNOWN"));
    assert.deepEqual(result.sourceActionEvidence, unavailable("CAPTURE_COVERAGE_UNKNOWN"));
    if (evidence.status === "unavailable" || (evidence.status === "supplied" && evidence.snapshot.knownAt > F)) {
      assert.equal(result.evidenceKnownAt, null);
    } else assert.equal(result.evidenceKnownAt, F - 60);
  }
  const future = build({ ...input, evidence: supplied(snapshot(captured, { knownAt: F + 60 })) });
  assert.deepEqual(future.auditEvidence, unavailable("KNOWLEDGE_INCONSISTENT"));
  for (const key of ["action", "capture", "knownAt", "sourceVersionId", "parserVersion"]) assert.ok(!Object.hasOwn(future.sourceActionEvidence, key));
});

test("future-only revised anchor cannot establish a join from decision date alone", async () => {
  const captured = await acquire(); const input = request(captured, { canonicalDate: "2026-09-09", knownAt: F + 60 });
  assert.equal(input.expectedEcbCanonicalEventId, "ECB:ecb-monetary-policy-decision:2026-09-09");
  const result = build(input);
  assert.deepEqual(result.sourceActionEvidence, unavailable("CAPTURE_COVERAGE_UNKNOWN"));
  assert.equal(result.evidenceKnownAt, null);
  const known = build({ ...input, evidence: supplied(snapshot(captured, { canonicalDate: "2026-09-09" })) });
  assert.deepEqual(known.sourceAction, { availability: "available", data: "raise" });
  assert.equal(known.requestedEvent.canonicalEventId, input.expectedEcbCanonicalEventId);
  reject({ ...input, expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(DATE) }, /identity mismatch/);
});

test("same-day different official documents and semantic content do not join", async () => {
  const captured = await acquire();
  const otherReference = { ...REFERENCE, documentUrl: REFERENCE.documentUrl.replace("314e508016", "abc123") };
  const other = await acquire(RAISE, F, otherReference);
  reject({ ...request(captured), sourceActionReceipt: other.receipt }, /does not match/);
  const revisedContent = await acquire(LOWER);
  reject({ ...request(captured), sourceActionReceipt: revisedContent.receipt }, /does not match/);
  reject(request(captured, { digest: "b".repeat(64) }), /does not match/);
  reject(request(captured, { meetingDate: "2026-09-11", documentUrl: REFERENCE.documentUrl.replace("260910", "260911") }), /does not match/);
});

test("publisher, provider, canonical anchor and scope/schema imitations reject safely", async () => {
  const captured = await acquire();
  for (const [objectPath, key, value] of [
    ["event", "sourceInstitution", "BoJ"], ["decision", "sourceInstitution", "BoJ"],
    ["event", "canonicalEventId", ecbMonetaryPolicyCanonicalEventIdV1("2026-09-09")],
    ["schedule", "meetingDate", "2026-09-09"],
  ] as const) {
    const input = request(captured); assert.ok(input.evidence.status === "supplied");
    const event = input.evidence.snapshot.event;
    const target = objectPath === "event" ? event : objectPath === "decision" ? event.decision : event.schedule;
    assert.ok(target); Reflect.set(target, key, value); reject(input);
  }
  for (const [key, value] of [["scope", "representative-rate"], ["provider", "boj"], ["parserVersion", "fake-parser"],
    ["schemaVersion", "fake-schema"], ["sourceVersionId", "fake-source"]]) {
    const imitation = structuredClone(captured.child); Reflect.set(imitation, key, value);
    reject({ ...request(captured), sourceActionReceipt: imitation }, /Unrecognized/);
  }
  reject({ ...request(captured), productId: "estr" });
  reject({ ...request(captured), provider: "boj" });
});

test("V2 rejects copied, deserialized, imitated, proxied and factory-instance receipts even without event context", async () => {
  const captured = await acquire(); const receipt = captured.receipt;
  const foreignOwner = createEcbPolicyDecisionActionCaptureAuthorityV1({
    fetchImpl: async () => new Response(captured.body, { headers: { "Content-Type": "text/html" } }), nowUnixSeconds: () => F,
  });
  const foreign = await foreignOwner.acquire({ reference: REFERENCE, signal: new AbortController().signal });
  assert.ok(foreign.status === "acquired");
  const copies = [{ ...receipt }, Object.assign({}, receipt), structuredClone(receipt), JSON.parse(JSON.stringify(receipt)),
    Object.create(Object.getPrototypeOf(receipt), Object.getOwnPropertyDescriptors(receipt)),
    { brand: "EcbPolicyDecisionActionCaptureReceiptV1" }, { receipt }, foreign.receipt,
    new Proxy(receipt, { get() { throw new Error("receipt inspected"); } })];
  for (const imitation of copies) for (const evidence of [request(captured).evidence, absent, supplied(snapshot(captured, { knownAt: F + 1 }))]) {
    reject({ ...request(captured), evidence, sourceActionReceipt: imitation }, /Unrecognized/);
  }
  assert.deepEqual(build(request(captured)).sourceAction, { availability: "available", data: "raise" });
});

test("self-consistent backdated raw bundle cannot replace a trusted future receipt", async () => {
  const captured = await acquire(RAISE, F + 60);
  const source = captureKnownEcbDecisionDocumentHtmlV1(captured.body, REFERENCE, F - 60); assert.ok(source.status === "available");
  const rebuilt = buildEcbPolicyDecisionActionEvidenceV1({ html: captured.body, capture: source.data }); assert.ok(rebuilt.status === "available");
  const earlier = reconstructEcbPolicyDecisionActionEvidenceV1({ html: captured.body, capture: source.data, evidence: rebuilt.evidence });
  assert.equal(earlier.sourceVersionId, captured.child.sourceVersionId); assert.equal(earlier.knownAt, F - 60);
  for (const imitation of [earlier, { html: captured.body, capture: source.data, evidence: earlier }, { ...captured.receipt, ...earlier }]) {
    reject({ ...request(captured), sourceActionReceipt: imitation }, /Unrecognized/);
  }
  assert.equal(Reflect.set(captured.receipt, "knownAt", F - 60), false);
  assert.deepEqual(build(request(captured)).sourceAction, unavailable("KNOWLEDGE_INCONSISTENT"));
});

test("action admission handles strict assessment instants, equality, subseconds and offsets", async () => {
  const captured = await acquire(); const input = request(captured);
  for (const evaluatedAt of [at(F - 1), new Date(F * 1_000 - 1).toISOString()]) {
    const result = build({ ...input, evaluatedAt });
    assert.deepEqual(result.sourceActionEvidence, unavailable("KNOWLEDGE_INCONSISTENT")); assert.equal(result.evidenceKnownAt, F - 60);
  }
  for (const evaluatedAt of [at(), at(F + 1), at().replace(".000", ".999"),
    new Date((F + 7200) * 1000).toISOString().replace("Z", "+02:00")]) {
    const result = build({ ...input, evaluatedAt });
    assert.deepEqual(result.sourceAction, { availability: "available", data: "raise" }); assert.equal(result.evidenceKnownAt, F);
  }
  for (const evaluatedAt of [null, undefined, F, "2026-09-10", "2026-02-30T00:00:00Z", "2026-09-10T12:00:00", "1969-12-31T23:59:59Z"]) {
    reject({ ...input, evaluatedAt });
  }
});

test("aggregate knowledge uses admitted evidence only, with independent capture/version identities", async () => {
  const captured = await acquire(RAISE, F - 30); const input = request(captured);
  assert.equal(build(input).evidenceKnownAt, F - 30);
  assert.equal(build(request(captured, { knownAt: F })).evidenceKnownAt, F);
  const futureBoth = build({ ...request(captured, { knownAt: F + 60 }), evaluatedAt: at(F - 40) });
  assert.equal(futureBoth.evidenceKnownAt, null);
  assert.deepEqual(futureBoth.sourceActionEvidence, unavailable("KNOWLEDGE_INCONSISTENT"));
  const admitted = build(input); assert.ok(admitted.auditEvidence.availability === "available");
  assert.notEqual(admitted.auditEvidence.data.eventSourceVersionId, captured.child.sourceVersionId);
  const laterCapture = await acquire(RAISE, F + 30);
  assert.equal(laterCapture.child.sourceVersionId, captured.child.sourceVersionId);
  assert.notEqual(laterCapture.receipt, captured.receipt);
  const recaptured = build({ ...input, sourceActionReceipt: laterCapture.receipt, evaluatedAt: at(F + 30) });
  assert.equal(recaptured.evidenceKnownAt, F + 30);
});

type OtherInput = Exclude<BuildPolicyEventDecisionEvidenceInputV2, { provider: "ecb" }>;
function fomc(action: "maintain" | "raise" | "lower" = "maintain", knownAt = F): OtherInput {
  const date = "2025-01-29";
  const fact = parseFomcStatementV1(statement(`The Committee decided to ${action} the target range for the federal funds rate ${action === "maintain" ? "at" : "to"} 4.25 to 4.5 percent.`, date, null, false), date);
  return { productId: "eurusd", provider: "federal-reserve", evaluatedAt: at(), decisionDate: date,
    evidence: supplied(buildCanonicalStatisticalSeriesSnapshotV1(buildUsPolicyCanonicalSeriesV1(`fomc:${date}`, [fact], knownAt))) };
}
function boj(target: BojPolicyTargetV1 = { shape: "scalar", value: 0.5, qualification: "around" }, knownAt = F): OtherInput {
  const date = "2025-01-24";
  const evidence = buildBojPolicyEvidenceV1({ institution: "Bank of Japan", productId: "eurjpy", instrument: BOJ_POLICY_INSTRUMENT_V1,
    decisionDate: date, documentKind: "guideline-change", target, unit: "percent", sourceUrl: bojPolicyDocumentUrlV1(date),
    releaseTimestamp: null, effectiveDate: null }, knownAt);
  return { productId: "eurjpy", provider: "boj", evaluatedAt: at(), decisionDate: date, evidence: supplied({
    schemaVersion: "boj-policy-evidence-snapshot-v1", evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId,
    sourceVersionId: evidence.metadata.sourceVersionId, knownAt }) };
}
function boe(action: "maintain" | "reduce" | "increase" = "reduce", knownAt = F): OtherInput {
  const date = ({ maintain: "2026-09-17", reduce: "2025-05-08", increase: "2023-08-03" })[action];
  const evidence = buildBoeBankRateEvidenceV1(parseBoeBankRateDocumentV1(boeDocument({ action }), date,
    action === "reduce" ? releaseNotice() : undefined), knownAt);
  return { productId: "eurgbp", provider: "boe", evaluatedAt: at(), publicationDate: date, evidence: supplied({
    schemaVersion: "boe-bank-rate-evidence-snapshot-v1", evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId,
    sourceVersionId: evidence.metadata.sourceVersionId, knownAt }) };
}
function snb(action: "unchanged" | "reduce" | "increase" = "unchanged", rate = 0, knownAt = F): OtherInput {
  const date = "2026-09-24";
  const evidence = buildSnbPolicyEvidenceV1(parseSnbPolicyDocumentV1(snbDocument({ action, rate: String(rate), date }), date), knownAt);
  return { productId: "eurchf", provider: "snb", evaluatedAt: at(), decisionDate: date, evidence: supplied({
    schemaVersion: "snb-policy-evidence-snapshot-v1", evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId,
    sourceVersionId: evidence.metadata.sourceVersionId, knownAt }) };
}
function assertParity(input: OtherInput) {
  const old = buildPolicyEventDecisionEvidenceV1(input); const result = buildPolicyEventDecisionEvidenceV2(input);
  assert.deepEqual(result, { ...old, schemaVersion: POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2 });
  assert.ok(!Object.hasOwn(result, "sourceActionEvidence"));
  return result;
}
for (const action of ["maintain", "raise", "lower"] as const) test("FOMC V1 parity retains native " + action + " and two target bounds", () => {
  const result = assertParity(fomc(action)); assert.ok(result.provider === "federal-reserve");
  assert.deepEqual(result.announcedSetting, { availability: "available", data: { targetLower: 4.25, targetUpper: 4.5, unit: "percent" } });
  assert.deepEqual(result.sourceAction, { availability: "available", data: action });
});
for (const action of ["maintain", "reduce", "increase"] as const) test("BoE V1 parity retains native " + action + " and publication/release audit", () => {
  const input = boe(action); const result = assertParity(input); assert.ok(result.provider === "boe");
  assert.deepEqual(result.sourceAction, { availability: "available", data: action });
  assert.ok(result.auditEvidence.availability === "available" && result.event.availability === "available");
  if (action === "reduce") assert.ok(result.event.data.timing.releaseTimestamp !== null);
});
for (const [action, rate] of [["unchanged", 0], ["reduce", -0.25], ["increase", 0.25], ["unchanged", -0.25]] as const) {
  test("SNB V1 parity preserves signed " + rate + " and native " + action, () => {
    const result = assertParity(snb(action, rate)); assert.ok(result.provider === "snb");
    assert.deepEqual(result.announcedSetting, { availability: "available", data: { policyRate: rate, unit: "percent" } });
    assert.deepEqual(result.sourceAction, { availability: "available", data: action });
  });
}
for (const target of [{ shape: "scalar", value: 0.5, qualification: "around" }, { shape: "scalar", value: 0, qualification: "around" },
  { shape: "range", lower: 0, upper: 0.1, qualification: "around" }] as const) {
  test("BoJ V1 parity preserves " + JSON.stringify(target) + " with unavailable source action", () => {
    const result = assertParity(boj(target)); assert.ok(result.provider === "boj");
    assert.deepEqual(result.announcedSetting, { availability: "available", data: { target, unit: "percent" } });
    assert.deepEqual(result.sourceAction, { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" });
  });
}
for (const [provider, fixture] of [["federal-reserve", fomc], ["boj", boj], ["boe", boe], ["snb", snb]] as const) {
  test(provider + " parity includes future, missing evidence, strict inputs and detachment", () => {
    const input = structuredClone(fixture()); const copy = structuredClone(input);
    const result = assertParity(input); assert.deepEqual(input, copy);
    const cutoff = at(F - 1); const future = assertParity({ ...input, evaluatedAt: cutoff });
    assert.equal(future.evidenceKnownAt, null);
    assertParity({ ...input, evidence: absent });
    const callers = new Set<object>(); eachObject(input, (object) => { callers.add(object); assert.ok(!Object.isFrozen(object)); });
    eachObject(result, (object) => { assert.ok(Object.isFrozen(object)); assert.ok(!callers.has(object)); });
    for (const key of ["sourceActionReceipt", "extra", Symbol("extra")]) for (const enumerable of [true, false]) {
      const root = structuredClone(fixture()); Object.defineProperty(root, key, { value: true, enumerable }); reject(root);
      const envelope = structuredClone(fixture()); Object.defineProperty(envelope.evidence, key, { value: true, enumerable }); reject(envelope);
      const nested = structuredClone(fixture()); assert.ok(nested.evidence.status === "supplied");
      Object.defineProperty(nested.evidence.snapshot, key, { value: true, enumerable }); reject(nested);
    }
  });
}

test("ECB closed original root, envelope, canonical context and receipt-wrapper inputs reject hidden/symbol overrides", async () => {
  const captured = await acquire();
  for (const value of [null, undefined, [], {}, build(request(captured))]) reject(value);
  for (const key of ["html", "capture", "fetchedAt", "knownAt", "sourceAction", "sourceActionEvidence", "parserVersion", "sourceVersionId", "clock", "transport", "history", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const root = request(captured); Object.defineProperty(root, key, { value: true, enumerable }); reject(root, /closed/);
      const envelope = request(captured); Object.defineProperty(envelope.evidence, key, { value: true, enumerable }); reject(envelope);
      const deep = request(captured); assert.ok(deep.evidence.status === "supplied");
      Object.defineProperty(deep.evidence.snapshot.event.schedule, key, { value: true, enumerable }); reject(deep);
      const wrapper = { receipt: captured.receipt }; Object.defineProperty(wrapper, key, { value: true, enumerable });
      reject({ ...request(captured), sourceActionReceipt: wrapper }, /Unrecognized/);
    }
  }
  reject({ ...request(captured), evidence: { ...absent, reason: "invented" } });
  reject({ ...request(captured), evidence: { ...absent, upstreamReason: 1 } });
  reject({ ...request(captured), evidence: { status: "other", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null } });
});

test("ECB output is detached, recursively frozen and immune to caller mutation", async () => {
  const captured = await acquire(); const input = request(captured); const before = structuredClone(v1Input(input));
  const first = build(input); const second = build(input); assert.deepEqual(first, second);
  assert.deepEqual(v1Input(input), before); assert.equal(input.sourceActionReceipt, captured.receipt);
  const callers = new Set<object>(); eachObject(input, (object) => { callers.add(object); if (object !== captured.receipt) assert.ok(!Object.isFrozen(object)); });
  const outputs = new Set<object>();
  eachObject(first, (object) => { outputs.add(object); assert.ok(Object.isFrozen(object)); assert.ok(!callers.has(object)); assert.equal(Reflect.set(object, "injected", true), false); });
  eachObject(second, (object) => { assert.ok(!outputs.has(object)); assert.ok(Object.isFrozen(object)); });
  const copy = structuredClone(first); assert.ok(copy.sourceActionEvidence.availability === "available");
  Reflect.set(copy.sourceActionEvidence.data, "knownAt", 0); Reflect.set(copy.sourceActionEvidence.data.capture, "fetchedAt", 0);
  Reflect.set(copy.sourceActionEvidence.data.capture.reference, "documentUrl", "https://evil.example/");
  assert.deepEqual(build(input), second);
  assert.ok(input.evidence.status === "supplied"); Reflect.set(input.evidence.snapshot.event.schedule, "meetingDate", "2026-09-11");
  assert.deepEqual(first, second); assert.deepEqual(readEcbPolicyDecisionActionCaptureAsKnownAtV1({ receipt: captured.receipt, evaluatedAt: at() }).status, "available");
});

test("V2 build consumes an existing receipt without source reads, clocks, randomness or timers", async () => {
  const captured = await acquire(); const input = request(captured);
  const expected = build(input);
  const originalFetch = globalThis.fetch; const originalNow = Date.now; const originalRandom = Math.random;
  const timerKeys = ["setTimeout", "setInterval", "setImmediate"] as const;
  const timers = timerKeys.map((key) => globalThis[key]);
  const forbidden = () => { throw new Error("V2 side effect"); };
  try {
    globalThis.fetch = forbidden; Date.now = forbidden; Math.random = forbidden;
    timerKeys.forEach((key) => Reflect.set(globalThis, key, forbidden));
    assert.deepEqual(build(input), expected);
    assert.deepEqual(build({ ...input, evaluatedAt: at(F - 1) }).sourceActionEvidence, unavailable("KNOWLEDGE_INCONSISTENT"));
    for (const fixture of [fomc, boj, boe, snb]) assertParity(fixture());
  } finally {
    globalThis.fetch = originalFetch; Date.now = originalNow; Math.random = originalRandom;
    timerKeys.forEach((key, index) => Reflect.set(globalThis, key, timers[index]));
  }
});

test("fresh V2 import performs no acquisition, clock sampling or scheduling", () => {
  const modulePath = resolve("src/lib/markets/events/policyEventDecisionEvidenceV2.ts");
  const script = `
    const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
    const original=Module._load;
    Module._load=function(name,parent,main){
      if(name==='server-only')return {};
      if(name.startsWith('@/'))name=path.resolve('src',name.slice(2));
      return original.call(this,name,parent,main);
    };
    require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
    }).outputText,f);
    const forbidden=()=>{throw new Error('import-time side effect');};
    globalThis.fetch=forbidden;Date.now=forbidden;Math.random=forbidden;
    globalThis.setTimeout=forbidden;globalThis.setInterval=forbidden;globalThis.setImmediate=forbidden;
    const exports=require(${JSON.stringify(modulePath)});
    require('node:assert/strict').deepEqual(Object.keys(exports).sort(),[
      'POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V2','buildPolicyEventDecisionEvidenceV2'
    ].sort());
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("V2 has only the versioned evidence surface and allowed inactive composition dependencies", async () => {
  const captured = await acquire(); const input = request(captured);
  for (const result of [build(input), build({ ...input, evidence: absent }), build({ ...input, sourceActionReceipt: null })]) {
    assert.deepEqual(Reflect.ownKeys(result).sort(), ["schemaVersion", "semantic", "feature", "coverage", "productId", "provider", "evaluatedAt",
      "requestedEvent", "event", "announcedSetting", "sourceAction", "officialPredecessor", "evidenceKnownAt", "auditEvidence", "sourceActionEvidence"].sort());
    const forbidden = new Set(["prior", "history", "delta", "differential", "spread", "representativeRate", "midpoint", "direction", "stance",
      "surprise", "assessment", "recommendation", "confidence", "entry", "exit", "tradeSignal", "marketConfirmation", "latest"]);
    eachObject(result, (object) => { for (const key of Reflect.ownKeys(object)) assert.ok(typeof key !== "string" || !forbidden.has(key)); });
  }
  const modulePath = resolve("src/lib/markets/events/policyEventDecisionEvidenceV2.ts"); const source = readFileSync(modulePath, "utf8");
  const ast = ts.createSourceFile(modulePath, source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
  assert.deepEqual(imports, ["server-only", "./policyEventDecisionEvidence", "../services/ecbPolicyDecisionActionCaptureAuthority",
    "../providers/ecb/monetaryPolicy/policyDecisionActionEvidence", "./bilateralPolicyState"]);
  const forbiddenCalls = new Set(["fetch", "Date.now", "Math.random", "setTimeout", "setInterval", "setImmediate", "acquireEcbPolicyDecisionActionCaptureV1"]);
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) assert.ok(!forbiddenCalls.has(node.expression.getText(ast)));
    if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), "process.env");
    ts.forEachChild(node, visit);
  }
  visit(ast);
});

test("ECB preserves all supported product bindings and requires the exact requested canonical anchor", async () => {
  const captured = await acquire(); const input = request(captured, { canonicalDate: "2026-09-09" });
  for (const productId of ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const) {
    const result = build({ ...input, productId });
    assert.equal(result.productId, productId); assert.deepEqual(result.sourceAction, { availability: "available", data: "raise" });
    assert.equal(result.requestedEvent.canonicalEventId, "ECB:ecb-monetary-policy-decision:2026-09-09");
  }
  for (const expectedEcbCanonicalEventId of ["ECB:wrong", "ECB:ecb-monetary-policy-decision:2026-02-30", ecbMonetaryPolicyCanonicalEventIdV1(DATE)]) {
    reject({ ...input, expectedEcbCanonicalEventId });
  }
});
