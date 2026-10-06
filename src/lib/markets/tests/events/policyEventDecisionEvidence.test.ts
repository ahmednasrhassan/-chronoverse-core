import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { buildPolicyEventDecisionEvidenceV1, type BuildPolicyEventDecisionEvidenceInputV1 } from "../../events/policyEventDecisionEvidence";
import { ecbMonetaryPolicyCanonicalEventIdV1, normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";
import { buildCanonicalStatisticalSeriesSnapshotV1 } from "../../services/canonicalStatisticalSeriesMemory";
import { buildUsPolicyCanonicalSeriesV1 } from "../../providers/federalReserve/canonical";
import { parseFomcStatementV1, UsPolicyValidationError, type FomcFactV1 } from "../../providers/federalReserve/fomc";
import { statement, canonical as usCanonical } from "../usPolicy/fixtures";
import { buildBojPolicyEvidenceV1 } from "../../providers/boj/canonical";
import { BOJ_POLICY_INSTRUMENT_V1, BojPolicyValidationError, type BojPolicyTargetV1 } from "../../providers/boj/facts";
import { bojPolicyDocumentUrlV1 } from "../../providers/boj/transport";
import { buildBoeBankRateEvidenceV1 } from "../../providers/boe/canonical";
import { parseBoeBankRateDocumentV1, BoeBankRateValidationError } from "../../providers/boe/facts";
import { document as boeDocument, releaseNotice } from "../boe/fixtures";
import { buildSnbPolicyEvidenceV1 } from "../../providers/snb/canonical";
import { parseSnbPolicyDocumentV1, SnbPolicyValidationError } from "../../providers/snb/facts";
import { document as snbDocument } from "../snb/fixtures";
import { buildBilateralPolicyDecisionDirectionV1 } from "../../events/bilateralPolicyDecisionDirection";

// Synthetic canonical captures / reduced publisher-layout fixtures, not acquired official decisions.
const PROVIDERS = ["ecb", "federal-reserve", "boj", "boe", "snb"] as const;
type Provider = (typeof PROVIDERS)[number];
const AT = "2026-10-05T10:00:00.000Z";
const T = Date.parse(AT) / 1000;
const CAPTURE = T - 60;
const clone = <V>(value: V): V => structuredClone(value);
const supplied = <S>(snapshot: S) => ({ status: "supplied", snapshot } as const);
const absent = { status: "unavailable", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null } as const;
const ecbDate = "2026-09-10";
const fomcDate = "2025-01-29";
const bojDate = "2025-01-24";
const boeDate = "2025-05-08";
const snbDate = "2026-09-24";

function ecb(date = ecbDate, capture = CAPTURE, rates: readonly [number, number, number] | null = [2.5, 2.65, 2.9],
  options: { scheduleCapture?: number; document?: boolean } = {}) {
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: date, schedule: { meetingDate: date, fetchedAt: options.scheduleCapture ?? capture },
    decision: options.document === false ? null : {
      decisionDate: date, documentUrl: `https://www.ecb.europa.eu/press/pr/date/${date.slice(0, 4)}/html/ecb.mp${date.replaceAll("-", "").slice(2)}~abc123.en.html`,
      contentDigest: "a".repeat(64), fetchedAt: capture, firstObservedAt: capture - 1, actualReleasedAt: null,
      rates: rates === null ? null : { depositFacility: rates[0], mainRefinancingOperations: rates[1], marginalLendingFacility: rates[2], effectiveDate: "2026-09-16" },
    },
  }));
}
function fomc(date = fomcDate, capture = CAPTURE, action: FomcFactV1["action"] = "maintain", lower = 4.25, upper = 4.5) {
  const wording = `The Committee decided to ${action} the target range for the federal funds rate ${action === "maintain" ? "at" : "to"} ${lower} to ${upper} percent. ` +
    "A dissenting member preferred to lower the target range for the federal funds rate to 1 to 2 percent.";
  const fact = parseFomcStatementV1(statement(wording, date, null, false), date);
  return buildCanonicalStatisticalSeriesSnapshotV1(buildUsPolicyCanonicalSeriesV1(`fomc:${date}`, [fact], capture));
}
function boj(date = bojDate, capture = CAPTURE, target: BojPolicyTargetV1 = { shape: "scalar", value: 0.5, qualification: "around" }) {
  const evidence = buildBojPolicyEvidenceV1({ institution: "Bank of Japan", productId: "eurjpy", instrument: BOJ_POLICY_INSTRUMENT_V1,
    decisionDate: date, documentKind: date === "2024-03-19" ? "framework-transition" : "guideline-change", target, unit: "percent",
    sourceUrl: bojPolicyDocumentUrlV1(date), releaseTimestamp: null, effectiveDate: null }, capture);
  return { schemaVersion: "boj-policy-evidence-snapshot-v1" as const, evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId,
    sourceVersionId: evidence.metadata.sourceVersionId, knownAt: capture };
}
function boe(action: "maintain" | "reduce" | "increase" = "reduce", capture = CAPTURE, timing = false) {
  const document = boeDocument({ action });
  const date = ({ maintain: "2026-09-17", reduce: boeDate, increase: "2023-08-03" })[action];
  const evidence = buildBoeBankRateEvidenceV1(parseBoeBankRateDocumentV1(document, date, timing ? releaseNotice() : undefined), capture);
  return { schemaVersion: "boe-bank-rate-evidence-snapshot-v1" as const, evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId,
    sourceVersionId: evidence.metadata.sourceVersionId, knownAt: capture };
}
function snb(action: "unchanged" | "reduce" | "increase" = "unchanged", rate = 0, capture = CAPTURE) {
  const evidence = buildSnbPolicyEvidenceV1(parseSnbPolicyDocumentV1(snbDocument({ action, rate: String(rate), date: snbDate }), snbDate), capture);
  return { schemaVersion: "snb-policy-evidence-snapshot-v1" as const, evidence, canonicalSeriesId: evidence.metadata.canonicalSeriesId,
    sourceVersionId: evidence.metadata.sourceVersionId, knownAt: capture };
}
function request(provider?: "federal-reserve", capture?: number): Extract<BuildPolicyEventDecisionEvidenceInputV1, { provider: "federal-reserve" }>;
function request<P extends Provider>(provider: P, capture?: number): Extract<BuildPolicyEventDecisionEvidenceInputV1, { provider: P }>;
function request(provider: Provider = "federal-reserve", capture = CAPTURE): BuildPolicyEventDecisionEvidenceInputV1 {
  switch (provider) {
    case "ecb": return clone({ provider, productId: "eurusd", evaluatedAt: AT, expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(ecbDate), evidence: supplied(ecb(ecbDate, capture)) });
    case "federal-reserve": return clone({ provider, productId: "eurusd", evaluatedAt: AT, decisionDate: fomcDate, evidence: supplied(fomc(fomcDate, capture)) });
    case "boj": return clone({ provider, productId: "eurjpy", evaluatedAt: AT, decisionDate: bojDate, evidence: supplied(boj(bojDate, capture)) });
    case "boe": return clone({ provider, productId: "eurgbp", evaluatedAt: AT, publicationDate: boeDate, evidence: supplied(boe("reduce", capture)) });
    case "snb": return clone({ provider, productId: "eurchf", evaluatedAt: AT, decisionDate: snbDate, evidence: supplied(snb("unchanged", 0, capture)) });
  }
}
const build = (input: BuildPolicyEventDecisionEvidenceInputV1 = request()) => buildPolicyEventDecisionEvidenceV1(input);
const reject = (input: unknown) => assert.throws(() => buildPolicyEventDecisionEvidenceV1(input as BuildPolicyEventDecisionEvidenceInputV1));
function eachObject(value: unknown, visit: (object: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value);
  for (const key of Reflect.ownKeys(value)) eachObject(Reflect.get(value, key), visit);
}

for (const provider of PROVIDERS) test(provider + ": independent branches, canonical audit and deterministic frozen detached result", () => {
  const input = request(provider);
  const before = clone(input);
  const callers = new Set<object>();
  eachObject(input, (object) => { callers.add(object); assert.ok(!Object.isFrozen(object)); });
  const result = build(input);
  assert.deepEqual(result, build(input));
  assert.equal(result.schemaVersion, "policy-event-decision-evidence-v1");
  assert.equal(result.semantic, "derived-feature");
  assert.equal(result.coverage, "provided-evidence-only");
  assert.equal(result.provider, provider);
  assert.equal(result.evaluatedAt, AT);
  assert.equal(result.event.availability, "available");
  assert.equal(result.announcedSetting.availability, "available");
  assert.equal(result.auditEvidence.availability, "available");
  assert.equal(result.evidenceKnownAt, CAPTURE);
  assert.deepEqual(result.officialPredecessor, { availability: "unavailable", reason: "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED" });
  assert.ok(input.evidence.status === "supplied" && result.auditEvidence.availability === "available");
  assert.deepEqual(result.auditEvidence.data, input.evidence.snapshot);
  assert.deepEqual(input, before);
  eachObject(result, (object) => { assert.ok(Object.isFrozen(object)); assert.ok(!callers.has(object)); assert.equal(Reflect.set(object, "injected", true), false); });
  const expected = clone(result);
  eachObject(input, (object) => { assert.ok(!Object.isFrozen(object)); Reflect.set(object, "later", true); });
  assert.deepEqual(result, expected);
});

test("closed root rejects detached facts, actions, history, raw text and enumerable/hidden/symbol overrides", () => {
  for (const value of [null, undefined, [], {}, build(), { ...request(), evidence: fomc() }]) reject(value);
  for (const key of ["sourceAction", "rates", "history", "direction", "rawText", "methodologyKnownAt", "predecessor", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const input = request(); Object.defineProperty(input, key, { value: 1, enumerable }); reject(input);
    }
  }
});
for (const provider of PROVIDERS) test(provider + ": closed evidence envelopes and deep snapshot hidden/symbol fields rejected", () => {
  for (const key of ["extra", Symbol("extra")]) for (const enumerable of [true, false]) {
    const input = request(provider);
    Object.defineProperty(input.evidence, key, { value: true, enumerable }); reject(input);
    const next = request(provider);
    assert.ok(next.evidence.status === "supplied");
    Object.defineProperty(next.evidence.snapshot, key, { value: true, enumerable }); reject(next);
    const deep = request(provider);
    assert.ok(deep.evidence.status === "supplied");
    const object = provider === "ecb" && "event" in deep.evidence.snapshot ? deep.evidence.snapshot.event.schedule
      : "series" in deep.evidence.snapshot ? deep.evidence.snapshot.series.metadata : "evidence" in deep.evidence.snapshot ? deep.evidence.snapshot.evidence.fact : null;
    assert.ok(object); Object.defineProperty(object, key, { value: true, enumerable }); reject(deep);
  }
});
test("explicit nonnegative ISO assessment instant required; offsets and subsecond boundaries retained", () => {
  for (const evaluatedAt of [undefined, null, T, -1, NaN, Infinity, "2026-10-05", "2026-02-30T00:00:00Z", "1969-12-31T23:59:59Z", "2026-10-05T10:00:00"]) {
    reject({ ...request(), evaluatedAt });
  }
  assert.equal(build({ ...request(), evaluatedAt: "2026-10-05T12:00:00+02:00" }).evaluatedAt, AT);
  assert.equal(build({ ...request(), evaluatedAt: AT.replace(".000", ".999") }).evaluatedAt, AT.replace(".000", ".999"));
});
for (const provider of PROVIDERS) test(provider + ": knowledge equality admitted, future capture excluded without any future facts", () => {
  const equal = build(request(provider, T));
  assert.equal(equal.event.availability, "available");
  for (const capture of [T + 1, T + 2]) {
    const result = build(request(provider, capture));
    const unavailable = { availability: "unavailable", reason: "KNOWLEDGE_INCONSISTENT", upstreamReason: null };
    assert.deepEqual(result.event, unavailable); assert.deepEqual(result.sourceAction, unavailable);
    assert.deepEqual(result.announcedSetting, unavailable); assert.deepEqual(result.auditEvidence, unavailable);
    assert.equal(result.evidenceKnownAt, null);
    assert.ok(!JSON.stringify(result).includes(String(capture)));
  }
});
for (const provider of PROVIDERS) test(provider + ": unavailable input preserves reason without changing predecessor capability", () => {
  const result = build({ ...request(provider), evidence: absent });
  assert.deepEqual(result.sourceAction, { availability: "unavailable", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null });
  assert.equal(result.event.availability, "unavailable");
  assert.equal(result.officialPredecessor.reason, "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED");
  assert.equal(result.evidenceKnownAt, null);
});
test("closed unavailable reasons and invalid evidence discriminators reject", () => {
  for (const evidence of [{ ...absent, reason: "invented" }, { ...absent, upstreamReason: 1 }, { status: "other", reason: "NO_CAPTURED_EVIDENCE", upstreamReason: null }, { status: "supplied", snapshot: null }, { ...absent, snapshot: fomc() }]) reject({ ...request(), evidence });
  const input = request();
  assert.deepEqual(build({ ...input, evidence: { status: "unavailable", reason: "NOT_KNOWN_AS_OF", upstreamReason: "not-known-as-of" } }).event,
    { availability: "unavailable", reason: "NOT_KNOWN_AS_OF", upstreamReason: "not-known-as-of" });
});
test("fixed product/provider binding excludes estr, unknown products/providers and mismatches", () => {
  for (const productId of ["estr", "gbpusd", "unknown", "toString", null]) reject({ ...request(), productId });
  for (const provider of ["FOMC", "new-york-fed", "unknown", "toString", null]) reject({ ...request(), provider });
  for (const provider of PROVIDERS.filter((p) => p !== "ecb")) for (const productId of ["eurusd", "eurjpy", "eurgbp", "eurchf"]) {
    const input = request(provider);
    if (productId !== input.productId) reject({ ...input, productId });
  }
  for (const productId of ["eurusd", "eurjpy", "eurgbp", "eurchf"] as const) assert.equal(build({ ...request("ecb"), productId } as BuildPolicyEventDecisionEvidenceInputV1).event.availability, "available");
});
for (const provider of PROVIDERS) test(provider + ": requested event identity must match admitted evidence, including future captures", () => {
  for (const capture of [CAPTURE, T + 1]) {
    const input = request(provider, capture);
    const key = provider === "ecb" ? "expectedEcbCanonicalEventId" : provider === "boe" ? "publicationDate" : "decisionDate";
    Reflect.set(input, key, provider === "ecb" ? ecbMonetaryPolicyCanonicalEventIdV1("2026-04-30") : "2025-01-30");
    reject(input);
  }
});
test("invalid event identity rejected even without captured evidence", () => {
  reject({ ...request("ecb"), evidence: absent, expectedEcbCanonicalEventId: "ECB:wrong" });
  reject({ ...request(), evidence: absent, decisionDate: "2025-02-30" });
});

for (const action of ["maintain", "raise", "lower"] as const) test("FOMC explicit " + action + " retains both bounds and ignores dissent", () => {
  const input = request(); Reflect.set(input, "evidence", supplied(fomc(fomcDate, CAPTURE, action)));
  const result = build(input);
  assert.equal(result.provider, "federal-reserve");
  assert.deepEqual(result.sourceAction, { availability: "available", data: action });
  assert.deepEqual(result.announcedSetting, { availability: "available", data: { targetLower: 4.25, targetUpper: 4.5, unit: "percent" } });
  assert.equal(result.officialPredecessor.availability, "unavailable");
});
test("FOMC MAINTAIN survives actual supplied-history DECREASE; no prior required for evidence", () => {
  const snapshot = fomc();
  const policyInput = { productId: "eurusd" as const, evaluatedAt: AT, expectedEcbCanonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(ecbDate),
    euro: supplied(ecb()), counterparty: { decisionDate: fomcDate, evidence: supplied(snapshot) } };
  const prior = fomc("2023-07-26", CAPTURE, "raise", 5.25, 5.5);
  const history = { institution: "FOMC" as const, histories: [{ decisionDate: "2023-07-26", snapshots: [prior] }] };
  const juxtapositionInput = { readinessInput: { policyInput, focusSide: "right" as const }, knowledgeCutoff: CAPTURE,
    leftHistory: { institution: "ECB" as const, memories: [] }, rightHistory: history };
  assert.equal(buildBilateralPolicyDecisionDirectionV1({ juxtapositionInput, methodologyKnownAt: CAPTURE }).right.direction, "DECREASE");
  assert.deepEqual(build({ ...request(), evidence: supplied(snapshot) }).sourceAction, { availability: "available", data: "maintain" });
  const raised = fomc(fomcDate, CAPTURE, "raise");
  const missing = { ...juxtapositionInput, readinessInput: { ...juxtapositionInput.readinessInput,
    policyInput: { ...policyInput, counterparty: { decisionDate: fomcDate, evidence: supplied(raised) } } }, rightHistory: { institution: "FOMC" as const, histories: [] } };
  assert.equal(buildBilateralPolicyDecisionDirectionV1({ juxtapositionInput: missing, methodologyKnownAt: CAPTURE }).right.direction, "UNAVAILABLE");
  assert.deepEqual(build({ ...request(), evidence: supplied(raised) }).sourceAction, { availability: "available", data: "raise" });
});
test("FOMC cannot substitute EFFR; exact release/effective evidence retained independently", () => {
  reject({ ...request(), evidence: supplied(buildCanonicalStatisticalSeriesSnapshotV1(usCanonical("effr"))) });
  const snapshot = buildCanonicalStatisticalSeriesSnapshotV1(usCanonical());
  const result = build({ ...request(), evidence: supplied(snapshot) });
  assert.ok(result.provider === "federal-reserve" && result.event.availability === "available");
  assert.equal(result.event.data.timing.releaseTimestamp, Date.parse("2025-01-29T19:00:00Z") / 1000);
  assert.equal(result.event.data.timing.effectiveDate, "2025-01-30");
  assert.equal(result.evidenceKnownAt, snapshot.knownAt);
});

for (const rates of [[2.5, 2.65, 2.9], [2, 2.15, 2.4], [3, 2, 4]] as const) test("ECB independent rates " + rates.join("/") + " never establish action", () => {
  const result = build({ ...request("ecb"), evidence: supplied(ecb(ecbDate, CAPTURE, rates)) } as BuildPolicyEventDecisionEvidenceInputV1);
  assert.deepEqual(result.announcedSetting, { availability: "available", data: { depositFacility: rates[0], mainRefinancingOperations: rates[1], marginalLendingFacility: rates[2], unit: "percent", effectiveDate: "2026-09-16" } });
  assert.deepEqual(result.sourceAction, { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" });
});
test("ECB conservative schedule/decision knowledge; incomplete captures retain only their actual context", () => {
  const lateSchedule = ecb(ecbDate, CAPTURE, [2.5, 2.65, 2.9], { scheduleCapture: T + 1 });
  assert.equal(build({ ...request("ecb"), evidence: supplied(lateSchedule) } as BuildPolicyEventDecisionEvidenceInputV1).event.availability, "unavailable");
  for (const document of [true, false]) {
    const snapshot = ecb(ecbDate, CAPTURE, null, { document });
    const result = build({ ...request("ecb"), evidence: supplied(snapshot) } as BuildPolicyEventDecisionEvidenceInputV1);
    assert.equal(result.event.availability, "available");
    assert.deepEqual(result.announcedSetting, { availability: "unavailable", reason: "POLICY_SETTING_UNAVAILABLE" });
    assert.ok(result.provider === "ecb" && result.event.availability === "available");
    assert.equal(result.event.data.timing.decisionDate, document ? ecbDate : null);
    assert.equal(result.event.data.timing.actualReleasedAt, null);
  }
});
for (const target of [{ shape: "scalar", value: 0, qualification: "around" }, { shape: "scalar", value: 0.5, qualification: "around" },
  { shape: "range", lower: 0, upper: 0.1, qualification: "around" }] as const) test("BoJ preserves " + JSON.stringify(target) + " without action or predecessor normalization", () => {
  const result = build({ ...request("boj"), evidence: supplied(boj(bojDate, CAPTURE, target)) } as BuildPolicyEventDecisionEvidenceInputV1);
  assert.deepEqual(result.announcedSetting, { availability: "available", data: { target, unit: "percent" } });
  assert.deepEqual(result.sourceAction, { availability: "unavailable", reason: "SOURCE_ACTION_NOT_REPRESENTED" });
});
test("BoJ March transition is modern evidence, with no prior-framework equivalence", () => {
  const date = "2024-03-19";
  const result = build({ provider: "boj", productId: "eurjpy", evaluatedAt: AT, decisionDate: date,
    evidence: supplied(boj(date, CAPTURE, { shape: "range", lower: 0, upper: 0.1, qualification: "around" })) });
  assert.equal(result.announcedSetting.availability, "available");
  assert.ok(result.auditEvidence.availability === "available" && result.provider === "boj");
  assert.equal(result.auditEvidence.data.evidence.fact.documentKind, "framework-transition");
  assert.throws(() => build({ ...request("boj"), decisionDate: "2024-03-18" } as BuildPolicyEventDecisionEvidenceInputV1),
    (error: unknown) => error instanceof BojPolicyValidationError && error.code === "unsupported-historical-regime");
});
for (const action of ["maintain", "reduce", "increase"] as const) test("BoE native committee " + action + " independent of minority preferences", () => {
  const snapshot = boe(action);
  const result = build({ provider: "boe", productId: "eurgbp", evaluatedAt: AT, publicationDate: snapshot.evidence.fact.publicationDate, evidence: supplied(snapshot) });
  assert.deepEqual(result.sourceAction, { availability: "available", data: action });
  assert.deepEqual(result.announcedSetting, { availability: "available", data: { bankRate: snapshot.evidence.fact.decision.rate, unit: "percent" } });
  assert.equal(result.officialPredecessor.reason, "OFFICIAL_PREDECESSOR_NOT_ESTABLISHED");
});
test("BoE retains separately canonical meeting/publication/release notice timing and published change only in audit", () => {
  const result = build({ ...request("boe"), evidence: supplied(boe("reduce", CAPTURE, true)) } as BuildPolicyEventDecisionEvidenceInputV1);
  assert.ok(result.provider === "boe" && result.event.availability === "available" && result.auditEvidence.availability === "available");
  assert.equal(result.event.data.timing.meetingEndDate, "2025-05-07");
  assert.equal(result.event.data.timing.publicationDate, boeDate);
  assert.equal(result.event.data.timing.releaseTimestamp, Date.parse("2025-05-08T11:02:00Z") / 1000);
  assert.equal(result.event.data.timing.effectiveDate, null);
  assert.equal(result.auditEvidence.data.evidence.fact.decision.changePercentagePoints, 0.25);
});
for (const action of ["unchanged", "reduce", "increase"] as const) for (const rate of [-0.25, 0, 0.25]) test("SNB " + action + " at signed " + rate + " has no zero-crossing classification", () => {
  const result = build({ ...request("snb"), evidence: supplied(snb(action, rate)) } as BuildPolicyEventDecisionEvidenceInputV1);
  assert.deepEqual(result.sourceAction, { availability: "available", data: action });
  assert.deepEqual(result.announcedSetting, { availability: "available", data: { policyRate: rate, unit: "percent" } });
  assert.equal(result.officialPredecessor.availability, "unavailable");
});
test("SNB regime and instrument validation cannot admit Libor or SARON", () => {
  assert.throws(() => build({ ...request("snb"), decisionDate: "2019-06-12" } as BuildPolicyEventDecisionEvidenceInputV1),
    (error: unknown) => error instanceof SnbPolicyValidationError && error.code === "unsupported-regime");
  for (const instrument of ["SARON", "CHF Libor target range"]) {
    const input = request("snb"); assert.ok(input.evidence.status === "supplied" && "evidence" in input.evidence.snapshot);
    Reflect.set(input.evidence.snapshot.evidence.fact, "instrument", instrument);
    assert.throws(() => build(input), (error: unknown) => error instanceof SnbPolicyValidationError && error.code === "unsupported-instrument");
  }
});
test("canonical typed failures and dependency programming defects propagate unchanged", () => {
  const boeInput = request("boe"); assert.ok(boeInput.evidence.status === "supplied" && "evidence" in boeInput.evidence.snapshot);
  Reflect.set(boeInput.evidence.snapshot.evidence.fact, "instrument", "SONIA");
  assert.throws(() => build(boeInput), (error: unknown) => error instanceof BoeBankRateValidationError && error.code === "unsupported-instrument");
  const fedInput = request(); assert.ok(fedInput.evidence.status === "supplied" && "series" in fedInput.evidence.snapshot);
  Reflect.set(fedInput.evidence.snapshot.series.metadata, "provider", "unknown");
  assert.throws(() => build(fedInput), (error: unknown) => error instanceof UsPolicyValidationError && error.code === "source");
  const error = new ReferenceError("sentinel"); const input = request();
  Object.defineProperty(input, "evidence", { get() { throw error; } });
  assert.throws(() => build(input), (caught) => caught === error);
  assert.throws(() => build(new Proxy(request(), { ownKeys() { throw error; } })), (caught) => caught === error);
});
test("no implicit current clock or network, including during repeat builds", () => {
  const inputs = PROVIDERS.map((provider) => request(provider));
  const fetchBefore = globalThis.fetch; const nowBefore = Date.now; const randomBefore = Math.random;
  try {
    globalThis.fetch = () => { throw new Error("network used"); };
    Date.now = () => { throw new Error("clock used"); }; Math.random = () => { throw new Error("random used"); };
    for (const input of inputs) assert.deepEqual(build(input), build(input));
  } finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; Math.random = randomBefore; }
});
test("output has no representative rates, economic semantics, predecessor arithmetic or total-policy claims", () => {
  const forbidden = new Set(["midpoint", "representativeRate", "previousRate", "deltaBasisPoints", "deltaPercentagePoints", "history", "direction",
    "tightening", "easing", "restrictive", "accommodative", "neutral", "hawkish", "dovish", "divergence", "convergence", "bullish", "bearish",
    "fxDirection", "surprise", "confidence", "recommendation", "entry", "exit", "trade", "current", "latest", "relationship", "totalPolicyUnchanged"]);
  for (const provider of PROVIDERS) {
    const result = build(request(provider));
    eachObject(result, (object) => { for (const key of Reflect.ownKeys(object)) assert.ok(!forbidden.has(String(key)), String(key)); });
  }
});
test("production imports only canonical evidence/clock paths and contains no I/O, arithmetic owner, parser or catch", () => {
  const source = readFileSync("src/lib/markets/events/policyEventDecisionEvidence.ts", "utf8");
  const ast = ts.createSourceFile("evidence.ts", source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    assert.ok(!ts.isCatchClause(node));
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) assert.ok(!/persistence|redis|node:fs|runtime|projection|acquisition|delivery|transport|PriorSelection|DecisionChange|DecisionDirection|aws|R2/.test((node.moduleSpecifier as ts.StringLiteral).text));
    if (ts.isCallExpression(node)) assert.ok(!/^(fetch|setTimeout|setInterval|Date\.now|Math\.random|parse.*Document|parseFomcStatement)/.test(node.expression.getText(ast)));
    if (ts.isPropertyAccessExpression(node)) assert.notEqual(node.getText(ast), "process.env");
    if (ts.isBinaryExpression(node)) assert.ok(![ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken].includes(node.operatorToken.kind));
    ts.forEachChild(node, visit);
  }
  visit(ast);
});
