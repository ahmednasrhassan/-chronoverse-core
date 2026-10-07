import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { buildPolicyEventDecisionEvidenceV3 as build, POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3 as VERSION,
  type BuildPolicyEventDecisionEvidenceInputV3, type PolicyEventDecisionEvidenceV3 } from "../../events/policyEventDecisionEvidenceV3";
import { buildPolicyEventDecisionEvidenceV2 } from "../../events/policyEventDecisionEvidenceV2";
import { buildPolicyEventDecisionEvidenceV1 } from "../../events/policyEventDecisionEvidence";
import { normalizeEcbMonetaryPolicyEventV1, ecbMonetaryPolicyCanonicalEventIdV1 } from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";
import { acquireEcbPolicyDecisionActionCaptureV1, readEcbPolicyDecisionActionCaptureAsKnownAtV1,
  createEcbPolicyDecisionActionCaptureAuthorityV1, type EcbPolicyDecisionActionCaptureReceiptV1 } from "../../services/ecbPolicyDecisionActionCaptureAuthority";
import { acquireBojPolicyDecisionCaptureV1, readBojPolicyDecisionActionCaptureAsKnownAtV1,
  createBojPolicyDecisionCaptureAuthorityV1, type BojPolicyDecisionCaptureReceiptV1 } from "../../services/bojPolicyDecisionCaptureAuthority";
import type { EcbPolicyDecisionActionEvidenceV1 } from "../../providers/ecb/monetaryPolicy/policyDecisionActionEvidence";
import { buildBojPolicyDecisionActionEvidenceV1, type BojPolicyDecisionActionEvidenceV1 } from "../../providers/boj/policyDecisionActionEvidence";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import type { BojPolicyFactV1 } from "../../providers/boj/facts";
import { document as bojDocument, captureTime as F, date as BOJ_DATE } from "../boj/fixtures";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { buildUsPolicyCanonicalSeriesV1 } from "../../providers/federalReserve/canonical";
import { parseFomcStatementV1 } from "../../providers/federalReserve/fomc";
import { statement } from "../usPolicy/fixtures";
import { buildBoeBankRateEvidenceV1 } from "../../providers/boe/canonical";
import { parseBoeBankRateDocumentV1 } from "../../providers/boe/facts";
import { document as boeDocument, releaseNotice } from "../boe/fixtures";
import { buildSnbPolicyEvidenceV1 } from "../../providers/snb/canonical";
import { parseSnbPolicyDocumentV1 } from "../../providers/snb/facts";
import { document as snbDocument } from "../snb/fixtures";

// Offline publisher-layout fixtures; existing production APIs establish receipt membership.
const at = (time = F) => new Date(time * 1_000).toISOString();
const supplied = <S>(snapshot: S) => ({ status: "supplied", snapshot } as const);
const absent = { status: "unavailable", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null } as const;
const unavailable = (reason: string) => ({ availability: "unavailable", reason, upstreamReason: null });
type BojInput = Extract<BuildPolicyEventDecisionEvidenceInputV3, { provider: "boj" }>;
type EcbInput = Extract<BuildPolicyEventDecisionEvidenceInputV3, { provider: "ecb" }>;
interface BojCapture { receipt: BojPolicyDecisionCaptureReceiptV1; child: BojPolicyDecisionActionEvidenceV1; doc: ReturnType<typeof bojDocument> }
interface EcbCapture { receipt: EcbPolicyDecisionActionCaptureReceiptV1; child: EcbPolicyDecisionActionEvidenceV1; html: string }
const ECB_DATE = "2026-09-10";
const reference = { sourceInstitution: "ECB" as const, decisionDate: ECB_DATE,
  documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html" };
const rates = "The interest rates on the deposit facility, the main refinancing operations and the marginal lending facility " +
  "will be increased to 2.50%, 2.65% and 2.90% respectively, with effect from 16 September 2026.";
const raise = "The Governing Council decided to raise the three key ECB interest rates by 25 basis points. Accordingly, " + rates;
const lower = raise.replace("raise", "lower").replace("increased", "decreased");
const maintain = rates.replace("will be increased to", "will remain unchanged at");
const ecbHtml = (wording = raise) => '<html><body><main><h1>Monetary policy decisions</h1><h2>Key ECB interest rates</h2><p>' + wording + '</p></main></body></html>';
async function bojCapture(doc = bojDocument(), time = F, decisionDate = BOJ_DATE): Promise<BojCapture> {
  const fetchBefore = globalThis.fetch; const nowBefore = Date.now;
  try {
    globalThis.fetch = async (url) => { assert.equal(url, doc.url); return new Response(doc.html, { headers: { "Content-Type": "text/html;charset=UTF-8" } }); };
    Date.now = () => time * 1_000;
    const acquired = await acquireBojPolicyDecisionCaptureV1({ decisionDate, signal: new AbortController().signal });
    const action = readBojPolicyDecisionActionCaptureAsKnownAtV1({ receipt: acquired.receipt, evaluatedAt: at(time) });
    assert.ok(action.status === "available"); return { receipt: acquired.receipt, child: action.evidence, doc };
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; }
}
async function ecbCapture(wording = raise, time = F): Promise<EcbCapture> {
  const fetchBefore = globalThis.fetch; const nowBefore = Date.now; const html = ecbHtml(wording);
  try {
    globalThis.fetch = async (url) => { assert.equal(url, reference.documentUrl); return new Response(html, { headers: { "Content-Type": "text/html" } }); };
    Date.now = () => time * 1_000;
    const acquired = await acquireEcbPolicyDecisionActionCaptureV1({ reference, signal: new AbortController().signal });
    assert.ok(acquired.status === "acquired");
    const action = readEcbPolicyDecisionActionCaptureAsKnownAtV1({ receipt: acquired.receipt, evaluatedAt: at(time) });
    assert.ok(action.status === "available"); return { receipt: acquired.receipt, child: action.evidence, html };
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; }
}
function bojInput(capture: BojCapture, knownAt = F - 60, fact = capture.child.capture.evidence.fact): BojInput {
  const evidence = buildBojPolicyEvidenceV1(fact, knownAt);
  return { productId: "eurjpy", provider: "boj", evaluatedAt: at(), decisionDate: fact.decisionDate,
    bojSourceActionReceipt: capture.receipt, evidence: supplied(structuredClone({ schemaVersion: "boj-policy-evidence-snapshot-v1" as const,
      evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt })) };
}
function ecbInput(capture: EcbCapture, options: { knownAt?: number; canonicalDate?: string; noRates?: boolean; noDecision?: boolean;
  documentUrl?: string; digest?: string } = {}): EcbInput {
  const knownAt = options.knownAt ?? F - 60;
  const snapshot = buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.canonicalDate ?? ECB_DATE, schedule: { meetingDate: ECB_DATE, fetchedAt: knownAt },
    decision: options.noDecision ? null : { decisionDate: ECB_DATE, documentUrl: options.documentUrl ?? reference.documentUrl,
      contentDigest: options.digest ?? capture.child.capture.semanticContentDigest, fetchedAt: knownAt,
      firstObservedAt: knownAt, actualReleasedAt: null, rates: options.noRates ? null : {
        depositFacility: 2.5, mainRefinancingOperations: 2.65, marginalLendingFacility: 2.9, effectiveDate: "2026-09-16" } },
  }));
  return { productId: "eurusd", provider: "ecb", evaluatedAt: at(), expectedEcbCanonicalEventId: snapshot.canonicalEventId,
    evidence: supplied(structuredClone(snapshot)), ecbSourceActionReceipt: capture.receipt };
}
function bojBase(input: BojInput) { const { bojSourceActionReceipt, ...base } = input; assert.ok(bojSourceActionReceipt === null || typeof bojSourceActionReceipt === "object"); return base; }
function ecbV2(input: EcbInput) { const { ecbSourceActionReceipt, ...base } = input; return { ...base, sourceActionReceipt: ecbSourceActionReceipt }; }
function bojView(input: BojInput) { const view = build(input); assert.ok(view.provider === "boj"); return view; }
function reject(input: unknown, expected?: RegExp) {
  const run = () => build(input as BuildPolicyEventDecisionEvidenceInputV3);
  if (expected) assert.throws(run, expected); else assert.throws(run);
}
function objects(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value); for (const key of Reflect.ownKeys(value)) objects(Reflect.get(value, key), visit);
}
function assertActionUnavailable(view: PolicyEventDecisionEvidenceV3, reason: string) {
  assert.ok(view.provider === "boj" || view.provider === "ecb");
  assert.deepEqual(view.sourceAction, unavailable(reason)); assert.deepEqual(view.sourceActionEvidence, unavailable(reason));
  assert.deepEqual(Reflect.ownKeys(view.sourceActionEvidence), ["availability", "reason", "upstreamReason"]);
}

for (const [action, wording] of [["raise", raise], ["lower", lower], ["maintain", maintain]] as const) test("ECB delegates V2 native " + action + " and preserves V1", async () => {
  const captured = await ecbCapture(wording); const input = ecbInput(captured);
  const v2 = buildPolicyEventDecisionEvidenceV2(ecbV2(input)); const view = build(input);
  assert.deepEqual(view, { ...v2, schemaVersion: VERSION }); assert.deepEqual(view.sourceAction, { availability: "available", data: action });
  const { sourceActionReceipt, ...v1Input } = ecbV2(input); assert.equal(sourceActionReceipt, captured.receipt);
  const v1 = buildPolicyEventDecisionEvidenceV1(v1Input);
  assert.deepEqual(v1.sourceAction, { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" });
  assert.equal(v1.schemaVersion, "policy-event-decision-evidence-v1"); assert.equal(v2.schemaVersion, "policy-event-decision-evidence-v2");
});
test("ECB parity includes missing/future action, revised anchor and admitted decision without rates", async () => {
  const capture = await ecbCapture();
  for (const input of [ecbInput(capture, { canonicalDate: "2026-09-09" }), ecbInput(capture, { noRates: true }),
    { ...ecbInput(capture), ecbSourceActionReceipt: null }, { ...ecbInput(capture), evaluatedAt: at(F - 1) },
    { ...ecbInput(capture), evidence: absent }, ecbInput(capture, { knownAt: F + 60 }), ecbInput(capture, { noDecision: true })]) {
    assert.deepEqual(build(input), { ...buildPolicyEventDecisionEvidenceV2(ecbV2(input)), schemaVersion: VERSION });
  }
  const noRates = build(ecbInput(capture, { noRates: true }));
  assert.equal(noRates.announcedSetting.availability, "unavailable"); assert.equal(noRates.sourceAction.availability, "available");
  const revised = build(ecbInput(capture, { canonicalDate: "2026-09-09" }));
  assert.ok(revised.provider === "ecb"); assert.equal(revised.requestedEvent.canonicalEventId, ecbMonetaryPolicyCanonicalEventIdV1("2026-09-09"));
  const future = await ecbCapture(raise, F + 60); const input = ecbInput(future); const view = build(input);
  assertActionUnavailable(view, "KNOWLEDGE_INCONSISTENT"); assert.equal(view.evidenceKnownAt, F - 60);
  assert.deepEqual(view, { ...buildPolicyEventDecisionEvidenceV2(ecbV2(input)), schemaVersion: VERSION });
});
test("ECB delegates exact document/content/canonical-anchor mismatch rejection", async () => {
  const captured = await ecbCapture();
  for (const input of [ecbInput(captured, { documentUrl: reference.documentUrl.replace("314e508016", "abc123") }),
    ecbInput(captured, { digest: "b".repeat(64) }), { ...ecbInput(captured), expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1("2026-09-09") }]) reject(input, /match/);
});

for (const [kind, date, target] of [["statement", BOJ_DATE, "0"], ["guideline-change", BOJ_DATE, "0.5"],
  ["guideline-change", BOJ_DATE, "0.5 to 0.75"], ["framework-transition", "2024-03-19", "0 to 0.1"]] as const) {
  test("BoJ admits only native set-guideline for " + kind + " " + target, async () => {
    const captured = await bojCapture(bojDocument({ kind, date, target }), F, date); const input = bojInput(captured); const view = bojView(input);
    assert.equal(view.schemaVersion, VERSION); assert.equal(view.semantic, "derived-feature");
    assert.equal(view.feature, "policy-event-decision-evidence"); assert.equal(view.coverage, "provided-evidence-only");
    assert.deepEqual(view.sourceAction, { availability: "available", data: "set-guideline" });
    assert.deepEqual(view.sourceActionEvidence, { availability: "available", data: captured.child });
    assert.ok(view.announcedSetting.availability === "available");
    assert.deepEqual(view.announcedSetting.data, { target: captured.child.capture.evidence.fact.target, unit: "percent" });
    assert.equal(view.announcedSetting.data.target.qualification, "around");
    assert.equal(captured.child.scope, "uncollateralized-overnight-call-rate-guideline"); assert.equal(view.evidenceKnownAt, F);
    for (const old of [buildPolicyEventDecisionEvidenceV1(bojBase(input)), buildPolicyEventDecisionEvidenceV2(bojBase(input))]) {
      assert.deepEqual(old.sourceAction, { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" });
      assert.equal(Object.hasOwn(old, "sourceActionEvidence"), false);
    }
    assert.throws(() => buildPolicyEventDecisionEvidenceV2(input as unknown as Parameters<typeof buildPolicyEventDecisionEvidenceV2>[0]), /closed/);
    for (const extra of ["bojSourceActionReceipt", "sourceActionReceipt", Symbol("receipt")]) {
      const base = bojBase(input); Object.defineProperty(base, extra, { value: captured.receipt });
      assert.throws(() => buildPolicyEventDecisionEvidenceV2(base), /closed/);
    }
  });
}
test("BoJ missing/future action preserves base branches and excludes future knowledge and payload", async () => {
  const captured = await bojCapture(undefined, F + 60); const input = bojInput(captured); const base = buildPolicyEventDecisionEvidenceV2(bojBase(input));
  const missing = bojView({ ...input, bojSourceActionReceipt: null }); const future = bojView(input);
  assertActionUnavailable(missing, "NO_CAPTURED_EVIDENCE"); assertActionUnavailable(future, "KNOWLEDGE_INCONSISTENT");
  for (const result of [missing, future]) {
    assert.deepEqual(result.event, base.event); assert.deepEqual(result.announcedSetting, base.announcedSetting);
    assert.deepEqual(result.auditEvidence, base.auditEvidence); assert.equal(result.evidenceKnownAt, F - 60);
  }
  const encoded = JSON.stringify(future);
  for (const value of [String(F + 60), captured.child.sourceVersionId, captured.child.capture.decodedSourceDigest, captured.child.parserVersion,
    captured.child.schemaVersion, "set-guideline"]) assert.equal(encoded.includes(value), false);
});
test("known BoJ action cannot bind through absent/future context, including a conflicting future fact", async () => {
  const captured = await bojCapture(); const input = bojInput(captured);
  const changed = { ...captured.child.capture.evidence.fact, target: { shape: "scalar" as const, value: 0.75, qualification: "around" as const } };
  for (const request of [{ ...input, evidence: absent }, bojInput(captured, F + 60), bojInput(captured, F + 60, changed)]) {
    const view = bojView(request); assertActionUnavailable(view, "CAPTURE_COVERAGE_UNKNOWN"); assert.equal(view.evidenceKnownAt, null);
    const encoded = JSON.stringify(view); assert.equal(encoded.includes(captured.child.sourceVersionId), false);
    assert.equal(encoded.includes(captured.child.capture.decodedSourceDigest), false); assert.equal(encoded.includes('"value":0.75'), false);
  }
  const neither = bojView({ ...input, evidence: absent, bojSourceActionReceipt: null });
  assertActionUnavailable(neither, "NO_CAPTURED_EVIDENCE"); assert.equal(neither.evidenceKnownAt, null);
  const futureBoth = bojView({ ...bojInput(captured, F + 60), evaluatedAt: at(F - 1) });
  assertActionUnavailable(futureBoth, "KNOWLEDGE_INCONSISTENT"); assert.equal(futureBoth.evidenceKnownAt, null);
});
for (const [name, change] of [
  ["scalar value", (f: BojPolicyFactV1) => ({ ...f, target: { shape: "scalar" as const, value: 0.75, qualification: "around" as const } })],
  ["scalar/range", (f: BojPolicyFactV1) => ({ ...f, target: { shape: "range" as const, lower: 0.5, upper: 0.75, qualification: "around" as const } })],
  ["document kind", (f: BojPolicyFactV1) => ({ ...f, documentKind: "statement" as const })],
  ["effective date", (f: BojPolicyFactV1) => ({ ...f, effectiveDate: "2025-01-28" })],
  ["release timestamp", (f: BojPolicyFactV1) => ({ ...f, releaseTimestamp: Date.parse("2025-01-24T12:23:00+09:00") / 1000 })],
] as const) test("independently canonical BoJ " + name + " mismatch cannot join", async () => {
  const captured = await bojCapture(); const input = bojInput(captured, F - 60, change(captured.child.capture.evidence.fact));
  assert.equal(buildPolicyEventDecisionEvidenceV2(bojBase(input)).event.availability, "available");
  reject(input, /selected fact and source identity/);
});
for (const [name, target] of [["lower endpoint", "0.4 to 0.75"], ["upper endpoint", "0.5 to 0.8"]] as const) {
  test("BoJ range " + name + " mismatch cannot join", async () => {
    const captured = await bojCapture(bojDocument({ target: "0.5 to 0.75" })); const other = await bojCapture(bojDocument({ target }));
    reject({ ...bojInput(captured), bojSourceActionReceipt: other.receipt }, /selected fact and source identity/);
  });
}
for (const [path, value] of [["evidence.fact.sourceUrl", "https://evil.example/decision"], ["evidence.fact.target.qualification", "exact"],
  ["canonicalSeriesId", "forged"], ["sourceVersionId", "forged"], ["evidence.metadata.canonicalSeriesId", "forged"],
  ["evidence.metadata.sourceSeriesId", "forged"], ["evidence.metadata.sourceVersionId", "forged"],
  ["evidence.fact.institution", "Fake Bank"], ["evidence.metadata.originalPublisher", "Fake Bank"]] as const) {
  test("BoJ inconsistent original " + path + " rejects before admission", async () => {
    const input = bojInput(await bojCapture()); assert.ok(input.evidence.status === "supplied"); let object: object = input.evidence.snapshot;
    const keys = path.split("."); for (const key of keys.slice(0, -1)) object = Reflect.get(object, key);
    Reflect.set(object, keys.at(-1)!, value); reject(input);
  });
}
test("known receipt for another requested decision rejects even without available context", async () => {
  const first = await bojCapture(); const other = await bojCapture(bojDocument({ date: "2025-01-25", effective: null }), F, "2025-01-25");
  for (const input of [bojInput(other), { ...bojInput(other), evidence: absent }, bojInput(other, F + 60)]) {
    reject({ ...input, bojSourceActionReceipt: first.receipt }, /requested decision/);
  }
});

test("BoJ capture times stay independent and aggregate admitted evidence only", async () => {
  for (const [baseTime, actionTime, aggregate] of [[F - 60, F, F], [F, F - 60, F], [F - 90, F - 60, F - 60]] as const) {
    const capture = await bojCapture(undefined, actionTime); const view = bojView(bojInput(capture, baseTime));
    assert.equal(view.evidenceKnownAt, aggregate); assert.ok(view.event.availability === "available" && view.auditEvidence.availability === "available");
    assert.equal(view.event.data.knownAt, baseTime); assert.equal(view.auditEvidence.data.knownAt, baseTime);
    assert.equal(view.auditEvidence.data.evidence.metadata.fetchedAt, baseTime);
    assert.ok(view.sourceActionEvidence.availability === "available"); assert.equal(view.sourceActionEvidence.data.knownAt, actionTime);
    assert.equal(view.sourceActionEvidence.data.capture.evidence.metadata.fetchedAt, actionTime);
  }
});
test("matching semantic identity never authenticates an earlier legacy capture time", async () => {
  const captured = await bojCapture(); const input = bojInput(captured, F - 120);
  const early = bojView({ ...input, evaluatedAt: at(F - 60) }); assertActionUnavailable(early, "KNOWLEDGE_INCONSISTENT");
  assert.equal(early.evidenceKnownAt, F - 120);
  const admitted = bojView(input); assert.ok(admitted.auditEvidence.availability === "available");
  assert.equal(admitted.auditEvidence.data.knownAt, F - 120);
  assert.equal(admitted.auditEvidence.data.sourceVersionId, captured.child.capture.evidence.metadata.sourceVersionId);
  const backdated = buildBojPolicyDecisionActionEvidenceV1({ document: captured.doc,
    capture: { ...captured.child.capture, knownAt: F - 120, evidence: buildBojPolicyEvidenceV1(captured.child.capture.evidence.fact, F - 120) } });
  assert.equal(backdated.sourceVersionId, captured.child.sourceVersionId);
  reject({ ...input, bojSourceActionReceipt: backdated }, /Unrecognized/);
});
test("unrelated decoded revisions share selected-fact binding without inventing legacy digest equality", async () => {
  const first = await bojCapture(); const changed = { ...first.doc, html: first.doc.html.replace("Inflation 2 percent", "Inflation 3 percent") };
  const second = await bojCapture(changed, F - 30);
  assert.equal(first.child.sourceVersionId, second.child.sourceVersionId);
  assert.notEqual(first.child.capture.decodedSourceDigest, second.child.capture.decodedSourceDigest);
  const view = bojView({ ...bojInput(first), bojSourceActionReceipt: second.receipt });
  assert.ok(view.sourceActionEvidence.availability === "available" && view.auditEvidence.availability === "available");
  assert.deepEqual(view.sourceActionEvidence.data, second.child); assert.equal(view.evidenceKnownAt, F - 30);
  assert.equal(Object.hasOwn(view.auditEvidence.data, "decodedSourceDigest"), false);
  assert.equal(Object.hasOwn(view.auditEvidence.data.evidence, "decodedSourceDigest"), false);
});
test("forged, wrapped, copied, serialized, proxied, factory and cross-provider receipts always throw", async () => {
  const b = await bojCapture(); const e = await ecbCapture();
  const bOwner = createBojPolicyDecisionCaptureAuthorityV1({ fetchImpl: async () => new Response(b.doc.html, { headers: { "Content-Type": "text/html" } }), nowUnixSeconds: () => F });
  const bForeign = await bOwner.acquire({ decisionDate: BOJ_DATE, signal: new AbortController().signal });
  const eOwner = createEcbPolicyDecisionActionCaptureAuthorityV1({ fetchImpl: async () => new Response(e.html, { headers: { "Content-Type": "text/html" } }), nowUnixSeconds: () => F });
  const eForeign = await eOwner.acquire({ reference, signal: new AbortController().signal }); assert.ok(eForeign.status === "acquired");
  const imitations = (receipt: object, child: unknown, foreign: unknown, cross: unknown) => [{}, { ...receipt }, structuredClone(receipt),
    JSON.parse(JSON.stringify(receipt)), new Proxy(receipt, { get() { throw new Error("receipt inspected"); } }), foreign, cross, child, { receipt }, undefined];
  for (const receipt of imitations(b.receipt, b.child, bForeign.receipt, e.receipt)) {
    for (const evidence of [bojInput(b).evidence, absent, bojInput(b, F + 60).evidence]) reject({ ...bojInput(b), evidence, bojSourceActionReceipt: receipt }, /Unrecognized/);
  }
  for (const receipt of imitations(e.receipt, e.child, eForeign.receipt, b.receipt)) {
    for (const evidence of [ecbInput(e).evidence, absent, ecbInput(e, { knownAt: F + 60 }).evidence]) reject({ ...ecbInput(e), evidence, ecbSourceActionReceipt: receipt }, /Unrecognized/);
  }
});
for (const provider of ["ecb", "boj"] as const) test(provider + " time boundaries preserve equality, subseconds, offsets and admitted-only aggregation", async () => {
  const input = provider === "boj" ? bojInput(await bojCapture()) : ecbInput(await ecbCapture());
  const equal = build(input);
  for (const evaluatedAt of [at(F - 1), new Date(F * 1_000 - 1).toISOString()]) {
    const future = build({ ...input, evaluatedAt }); assertActionUnavailable(future, "KNOWLEDGE_INCONSISTENT"); assert.equal(future.evidenceKnownAt, F - 60);
  }
  for (const evaluatedAt of [at(), at(F + 1), at().replace(".000", ".001"), at().replace(".000", ".999"),
    new Date((F + 7200) * 1000).toISOString().replace("Z", "+02:00")]) {
    const view = build({ ...input, evaluatedAt }); assert.deepEqual(view.sourceAction, equal.sourceAction); assert.equal(view.evidenceKnownAt, F);
  }
  for (const evaluatedAt of [null, undefined, F, "2026-10-04", "2026-02-30T00:00:00Z", "2026-10-04T12:00:00", "1969-12-31T23:59:59Z"]) reject({ ...input, evaluatedAt });
});

type OtherInput = Exclude<BuildPolicyEventDecisionEvidenceInputV3, { provider: "ecb" | "boj" }>;
function fomc(action: "maintain" | "raise" | "lower"): OtherInput {
  const date = "2025-01-29"; const fact = parseFomcStatementV1(statement('The Committee decided to ' + action + ' the target range for the federal funds rate ' +
    (action === "maintain" ? "at" : "to") + ' 4.25 to 4.5 percent.', date, null, false), date);
  return { productId: "eurusd", provider: "federal-reserve", evaluatedAt: at(), decisionDate: date,
    evidence: supplied(buildCanonicalStatisticalSeriesSnapshotV1(buildUsPolicyCanonicalSeriesV1(`fomc:${date}` as const, [fact], F - 60))) };
}

for (const provider of ["ecb", "boj"] as const) test(provider + " rejects original root/envelope/snapshot extras before projection", async () => {
  const capture = provider === "boj" ? await bojCapture() : await ecbCapture();
  const make = () => provider === "boj" ? bojInput(capture as BojCapture) : ecbInput(capture as EcbCapture);
  for (const key of ["extra", "html", "capture", "knownAt", "fetchedAt", "sourceActionReceipt", "sourceActionEvidence", "provenance", "clock", "transport", "decodedSourceDigest", Symbol("extra")]) {
    for (const enumerable of [true, false]) for (const location of ["root", "envelope", "snapshot", "nested"] as const) {
      const input = make(); let target: object = input;
      if (location !== "root") target = input.evidence;
      if (location === "snapshot" || location === "nested") {
        if (input.provider === "boj") {
          assert.ok(input.evidence.status === "supplied"); target = location === "nested" ? input.evidence.snapshot.evidence.fact : input.evidence.snapshot;
        } else {
          assert.ok(input.evidence.status === "supplied"); target = location === "nested" ? input.evidence.snapshot.event.schedule : input.evidence.snapshot;
        }
      }
      Object.defineProperty(target, key, { value: true, enumerable }); reject(input);
    }
  }
  const missing = make(); Reflect.deleteProperty(missing, provider === "boj" ? "bojSourceActionReceipt" : "ecbSourceActionReceipt"); reject(missing, /closed/);
  const wrongField = make(); Object.defineProperty(wrongField, provider === "boj" ? "ecbSourceActionReceipt" : "bojSourceActionReceipt", { value: capture.receipt }); reject(wrongField, /closed/);
});
test("invalid root, wrong product/provider, and unrelated programming defects propagate", async () => {
  for (const input of [null, undefined, [], {}, { provider: "unknown" }]) reject(input);
  const input = bojInput(await bojCapture()); reject({ ...input, productId: "eurusd" });
  const error = new ReferenceError("input getter sentinel"); Object.defineProperty(input, "evidence", { get() { throw error; } });
  assert.throws(() => build(input), (caught) => caught === error);
});
for (const provider of ["ecb", "boj"] as const) test(provider + " output is detached, frozen, deterministic and does not mutate callers or V2", async () => {
  const input = provider === "boj" ? bojInput(await bojCapture()) : ecbInput(await ecbCapture());
  const delegated = input.provider === "boj" ? buildPolicyEventDecisionEvidenceV2(bojBase(input)) : buildPolicyEventDecisionEvidenceV2(ecbV2(input));
  const before = structuredClone(input);
  if (input.provider === "boj") Reflect.set(before, "bojSourceActionReceipt", input.bojSourceActionReceipt);
  else Reflect.set(before, "ecbSourceActionReceipt", input.ecbSourceActionReceipt);
  const first = build(input); const second = build(input);
  assert.deepEqual(first, second); assert.deepEqual(input, before); assert.equal(delegated.schemaVersion, "policy-event-decision-evidence-v2");
  const callers = new Set<object>(); objects(input, (o) => callers.add(o)); const originals = new Set<object>();
  objects(first, (o) => { assert.ok(Object.isFrozen(o)); assert.ok(!callers.has(o)); originals.add(o); assert.equal(Reflect.set(o, "extra", true), false); });
  objects(second, (o) => { assert.ok(Object.isFrozen(o)); assert.ok(!originals.has(o)); });
  const receipt = input.provider === "boj" ? input.bojSourceActionReceipt : input.ecbSourceActionReceipt;
  objects(input, (o) => { if (o !== receipt) assert.equal(Object.isFrozen(o), false); });
  assert.ok(input.evidence.status === "supplied"); Reflect.set(input.evidence.snapshot, "knownAt", 0); assert.deepEqual(first, second);
});
test("consumer build uses no current clock, network, environment, randomness or scheduling", async () => {
  const inputs = [bojInput(await bojCapture()), ecbInput(await ecbCapture()), fomc("maintain"), boe("reduce"), snb("unchanged")];
  const expected = inputs.map(build); const fetchBefore = globalThis.fetch; const nowBefore = Date.now; const randomBefore = Math.random;
  const keys = ["setTimeout", "setInterval", "setImmediate"] as const; const timers = keys.map(k => globalThis[k]);
  const envBefore = process.env;
  const forbidden = () => { throw new Error("V3 side effect"); };
  try {
    globalThis.fetch = forbidden; Date.now = forbidden; Math.random = forbidden; keys.forEach(k => Reflect.set(globalThis, k, forbidden));
    process.env = new Proxy(envBefore, { get: forbidden, ownKeys: forbidden });
    inputs.forEach((input, i) => assert.deepEqual(build(input), expected[i]));
    assertActionUnavailable(build({ ...inputs[0] as BojInput, evaluatedAt: at(F - 1) }), "KNOWLEDGE_INCONSISTENT");
  } finally { process.env = envBefore; globalThis.fetch = fetchBefore; Date.now = nowBefore; Math.random = randomBefore; keys.forEach((k, i) => Reflect.set(globalThis, k, timers[i])); }
});
test("fresh import and dependency surface stay inactive and exclude downstream semantics", () => {
  const file = resolve("src/lib/markets/events/policyEventDecisionEvidenceV3.ts");
  const script = `
    const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');const original=Module._load;
    Module._load=function(name,parent,main){if(name==='server-only')return {};if(/redis|persistence|aws-sdk/i.test(name))throw new Error('storage import');if(name.startsWith('@/'))name=path.resolve('src',name.slice(2));return original.call(this,name,parent,main);};
    require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);
    const forbidden=()=>{throw new Error('import side effect');};globalThis.fetch=forbidden;Date.now=forbidden;Math.random=forbidden;globalThis.setTimeout=forbidden;globalThis.setInterval=forbidden;globalThis.setImmediate=forbidden;
    const old=process.env;process.env=new Proxy(old,{get:forbidden,ownKeys:forbidden});let value;try{value=require(${JSON.stringify(file)});}finally{process.env=old;}
    require('node:assert/strict').deepEqual(Object.keys(value).sort(),['POLICY_EVENT_DECISION_EVIDENCE_SCHEMA_VERSION_V3','buildPolicyEventDecisionEvidenceV3'].sort());
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr || result.stdout);
  const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).filter(n => !n.importClause?.isTypeOnly).map(n => (n.moduleSpecifier as ts.StringLiteral).text);
  assert.deepEqual(imports, ["server-only", "node:util", "./policyEventDecisionEvidenceV2", "../services/bojPolicyDecisionCaptureAuthority", "../providers/boj/policyDecisionActionEvidence"]);
  function visit(n: ts.Node): void {
    assert.ok(!ts.isCatchClause(n));
    if (ts.isCallExpression(n)) assert.ok(!/^(fetch|Date\.now|Math\.random|setTimeout|setInterval|setImmediate|acquire|create.*Authority|parse.*Document)/.test(n.expression.getText(ast)));
    if (ts.isPropertyAccessExpression(n)) assert.notEqual(n.getText(ast), "process.env");
    ts.forEachChild(n, visit);
  }
  visit(ast);
});
test("all providers retain predecessor absence and expose no new interpretation or arithmetic", async () => {
  const inputs = [bojInput(await bojCapture()), ecbInput(await ecbCapture()), fomc("raise"), boe("reduce"), snb("increase")];
  const forbidden = new Set(["direction", "delta", "prior", "history", "predecessor", "midpoint", "representativeRate", "differential", "spread",
    "stance", "fxDirection", "surprise", "recommendation", "confidence", "entry", "exit", "tradeSignal", "marketConfirmation", "latest", "current"]);
  for (const input of inputs) {
    const view = build(input); assert.deepEqual(view.officialPredecessor, { availability: "unavailable", reason: "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED" });
    objects(view, (o) => { for (const k of Reflect.ownKeys(o)) assert.ok(typeof k !== "string" || !forbidden.has(k)); });
  }
});

// Full tsc checks these negative assignments without executing fabricated values.
type BojAction = Extract<Extract<PolicyEventDecisionEvidenceV3, { provider: "boj" }>["sourceAction"], { availability: "available" }>["data"];
type EcbAction = Extract<Extract<PolicyEventDecisionEvidenceV3, { provider: "ecb" }>["sourceAction"], { availability: "available" }>["data"];
function typeAssertions(b: BojInput, e: EcbInput, bReceipt: BojPolicyDecisionCaptureReceiptV1, eReceipt: EcbPolicyDecisionActionCaptureReceiptV1) {
  // @ts-expect-error BoJ action does not encode raise.
  const raiseAction: BojAction = "raise";
  // @ts-expect-error BoJ action does not encode lower.
  const lowerAction: BojAction = "lower";
  // @ts-expect-error BoJ action does not encode maintain.
  const maintainAction: BojAction = "maintain";
  // @ts-expect-error ECB action does not encode set-guideline.
  const setAction: EcbAction = "set-guideline";
  // @ts-expect-error Independent authority brands cannot be interchanged.
  const wrongBoj: BojInput = { ...b, bojSourceActionReceipt: eReceipt };
  // @ts-expect-error Independent authority brands cannot be interchanged.
  const wrongEcb: EcbInput = { ...e, ecbSourceActionReceipt: bReceipt };
  // @ts-expect-error BoJ is bound to eurjpy.
  const wrongProduct: BuildPolicyEventDecisionEvidenceInputV3 = { ...b, productId: "eurusd" };
  return [raiseAction, lowerAction, maintainAction, setAction, wrongBoj, wrongEcb, wrongProduct];
}
void typeAssertions;
function boe(action: "maintain" | "reduce" | "increase"): OtherInput {
  const date = ({ maintain: "2026-09-17", reduce: "2025-05-08", increase: "2023-08-03" })[action];
  const evidence = buildBoeBankRateEvidenceV1(parseBoeBankRateDocumentV1(boeDocument({ action }), date, action === "reduce" ? releaseNotice() : undefined), F - 60);
  return { productId: "eurgbp", provider: "boe", evaluatedAt: at(), publicationDate: date, evidence: supplied({ schemaVersion: "boe-bank-rate-evidence-snapshot-v1",
    evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: F - 60 }) };
}
function snb(action: "unchanged" | "reduce" | "increase", rate = -0.25): OtherInput {
  const date = "2026-09-24"; const evidence = buildSnbPolicyEvidenceV1(parseSnbPolicyDocumentV1(snbDocument({ action, rate: String(rate), date }), date), F - 60);
  return { productId: "eurchf", provider: "snb", evaluatedAt: at(), decisionDate: date, evidence: supplied({ schemaVersion: "snb-policy-evidence-snapshot-v1",
    evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId, sourceVersionId: evidence.metadata.sourceVersionId, knownAt: F - 60 }) };
}
for (const [provider, inputs] of [["federal-reserve", [fomc("maintain"), fomc("raise"), fomc("lower")]],
  ["boe", [boe("maintain"), boe("reduce"), boe("increase")]],
  ["snb", [snb("unchanged"), snb("reduce"), snb("increase"), snb("unchanged", 0), snb("increase", 0.25)]]] as const) {
  test(provider + " delegates complete native semantics, missing/future branches and original strictness", () => {
    for (const input of inputs) for (const request of [input, { ...input, evaluatedAt: at(F - 61) }, { ...input, evidence: absent }]) {
      const view = build(request); assert.deepEqual(view, { ...buildPolicyEventDecisionEvidenceV2(request), schemaVersion: VERSION });
      assert.equal(Object.hasOwn(view, "sourceActionEvidence"), false);
      if (request === input) assert.equal(view.evidenceKnownAt, F - 60);
      for (const key of ["extra", "sourceActionReceipt", "ecbSourceActionReceipt", "bojSourceActionReceipt", Symbol("extra")]) {
        const original = structuredClone(request); Object.defineProperty(original, key, { value: true }); reject(original, /closed/);
      }
    }
  });
}
