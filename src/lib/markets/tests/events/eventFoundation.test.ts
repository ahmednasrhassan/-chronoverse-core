import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { defineEventFactV1, eventFactFromEcbMonetaryPolicyV1,
  type EventFactV1, type EventSourceReferenceV1 } from "../../events/eventFact";
import { evaluateEventLifecycleV1,
  type EventLifecycleEvidenceV1, type EventLifecycleSnapshotV1 } from "../../events/eventLifecycle";
import type { CanonicalProductIdV1 } from "../../services/canonicalProductResultOwnership";

const AT = "2026-09-10T12:15:00.000Z";
const LATER = "2026-09-10T13:15:00.000Z";
const unix = (instant: string) => Date.parse(instant) / 1_000;
const products = ["eurusd", "eurjpy", "eurgbp", "eurchf", "estr"] as const;
const ecb = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-10", fetchedAt: unix("2026-09-08T12:15:00Z") },
  decision: {
    decisionDate: "2026-09-10",
    documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html",
    contentDigest: "a".repeat(64), fetchedAt: unix(AT), firstObservedAt: unix(AT),
    actualReleasedAt: AT,
    rates: { depositFacility: 2, mainRefinancingOperations: 2.15,
      marginalLendingFacility: 2.4, effectiveDate: "2026-09-16" },
  },
});
const event = eventFactFromEcbMonetaryPolicyV1(ecb, products);
assert.equal(event.canonicalEventId, ecb.canonicalEventId);
assert.equal(event.schedule.provenance.sourceVersionId, ecb.schedule.sourceVersionId);
assert.equal(event.semantic, "source-fact");
assert.equal(event.consensus.availability, "unavailable");
assert.equal(event.previous.availability, "unavailable");
assert.deepEqual(event.revision, { status: "unknown" });
assert.equal(event.release.availability, "available");
if (event.release.availability === "available") {
  assert.equal(event.release.data.provenance.sourceVersionId, ecb.decision!.sourceVersionId);
  assert.equal(event.release.data.actualReleasedAt, AT);
  assert.equal(event.release.data.firstObservedAt, ecb.decision!.firstObservedAt);
}
const rescheduled = eventFactFromEcbMonetaryPolicyV1(normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-17", fetchedAt: unix(AT) },
}), ["estr"]);
assert.equal(rescheduled.canonicalEventId, event.canonicalEventId);
assert.deepEqual(rescheduled.affectedProducts, ["estr"]);
for (const productId of products) {
  assert.equal(evaluateEventLifecycleV1({ event, productId, assessmentId: "hypothesis-1",
    evaluatedAt: AT, previous: null, evidence: [] }).state, "INITIAL_REACTION");
}
assert.throws(() => eventFactFromEcbMonetaryPolicyV1(ecb, ["gold" as CanonicalProductIdV1]), /five-product/);
// Compile-time protection also rejects an outside product.
// @ts-expect-error Gold is outside the canonical launch universe.
const sixth: CanonicalProductIdV1 = "gold";
assert.equal(sixth, "gold");

function evidence(assessment: EventLifecycleEvidenceV1["assessment"],
  overrides: Partial<EventLifecycleEvidenceV1> = {}): EventLifecycleEvidenceV1 {
  return {
    semantic: "engine-assessment", canonicalEventId: event.canonicalEventId,
    productId: "eurusd", assessmentId: "hypothesis-1", assessment,
    basis: "official-release", evidenceReferences: [{
      sourceVersionId: ecb.decision!.sourceVersionId, sourceUrl: ecb.decision!.documentUrl,
    }],
    observedAt: AT, knownAt: unix(AT), freshness: "within-cadence", ...overrides,
  };
}
function evaluate(evidenceItems: readonly EventLifecycleEvidenceV1[] = [],
  overrides: Partial<Parameters<typeof evaluateEventLifecycleV1>[0]> = {}) {
  return evaluateEventLifecycleV1({ event, productId: "eurusd", assessmentId: "hypothesis-1",
    evaluatedAt: AT, previous: null, evidence: evidenceItems, ...overrides });
}
const scheduled = eventFactFromEcbMonetaryPolicyV1({ ...ecb, decision: null }, ["eurusd"]);
assert.equal(evaluate([], { event: scheduled, evaluatedAt: "2026-09-08T12:15:00Z" }).state, "WAIT");
assert.equal(evaluate([], { event: scheduled, evaluatedAt: "2026-09-09T12:15:00Z" }).state, "WATCH");
for (const evaluatedAt of [AT, "2026-09-10T12:20:00Z", "2026-09-10T12:30:00Z",
  "2026-09-10T12:45:00Z", LATER, "2026-09-11T12:15:00Z"]) {
  assert.equal(evaluate([], { evaluatedAt }).state, "INITIAL_REACTION");
  assert.equal(evaluate([], { event: scheduled, evaluatedAt }).state, "WATCH");
}
assert.equal(evaluate([evidence("supporting")]).state, "CONFIRMING");
assert.equal(evaluate([evidence("confirmation")]).state, "CONFIRMED");
assert.equal(evaluate([evidence("contradiction")]).state, "CONTRADICTED");
assert.equal(evaluate([evidence("invalidation")]).state, "INVALIDATED");
for (const assessments of [
  ["confirmation", "contradiction"], ["contradiction", "confirmation"],
] as const) assert.equal(evaluate(assessments.map((value) => evidence(value))).state, "CONTRADICTED");
assert.equal(evaluate([evidence("confirmation"), evidence("invalidation")]).state, "INVALIDATED");
assert.equal(evaluate([evidence("confirmation")], { event: scheduled }).state, "WATCH");
const initial = evaluate();
assert.equal(evaluate([], { previous: initial, evaluatedAt: LATER }).state, "INITIAL_REACTION");
const invalidated = evaluate([evidence("invalidation")]);
assert.equal(evaluate([], { previous: invalidated, evaluatedAt: LATER }).state, "INVALIDATED");
assert.equal(evaluate([evidence("confirmation")], { previous: invalidated }).state, "INVALIDATED");
assert.equal(evaluate([evidence("contradiction")], { previous: invalidated }).state, "INVALIDATED");
assert.equal(evaluate([evidence("reentry-watch")], { previous: invalidated }).state, "REENTRY_WATCH");
assert.equal(evaluate([evidence("reentry-watch")]).state, "INITIAL_REACTION");
const contradicted = evaluate([evidence("contradiction")]);
assert.equal(evaluate([evidence("confirmation")], { previous: contradicted }).state, "CONTRADICTED");
assert.equal(evaluate([evidence("reentry-watch")], { previous: contradicted }).state, "REENTRY_WATCH");
assert.equal(evaluate([evidence("confirmation")], {
  previous: evaluate([evidence("reentry-watch")], { previous: invalidated }),
}).state, "CONFIRMED");
for (const overrides of [
  { freshness: "unknown" }, { freshness: "stale" }, { freshness: "unavailable" },
  { basis: "market-reaction" }, { evidenceReferences: [] },
  { evidenceReferences: [{ sourceVersionId: "fabricated", sourceUrl: ecb.decision!.documentUrl }] },
  { canonicalEventId: "another-event" }, { productId: "estr" }, { assessmentId: "other-hypothesis" },
  { knownAt: unix(LATER), observedAt: LATER },
  { observedAt: "2026-09-10T12:14:59Z" },
] satisfies Partial<EventLifecycleEvidenceV1>[]) {
  const result = evaluate([evidence("confirmation", overrides)]);
  assert.equal(result.state, "INITIAL_REACTION");
  assert.deepEqual(result.acceptedEvidence, []);
}
assert.deepEqual(initial.marketReaction, { availability: "unavailable", reason: "MARKET_FEED_UNAVAILABLE" });
assert.equal(initial.checkpoint.availability, "unavailable");
assert.equal(initial.eventData.availability, "available");
assert.equal(evaluate([], { event: scheduled }).eventData.availability, "partial");
assert.throws(() => evaluate([], { evaluatedAt: "2026-09-10T12:14:59Z" }), /knowledge/);
assert.throws(() => evaluate([evidence("confirmation", { observedAt: "invalid" })]), TypeError);
assert.throws(() => evaluate([evidence("confirmation", { knownAt: -1 })]), TypeError);
for (const previous of [
  { ...initial, productId: "estr" }, { ...initial, canonicalEventId: "other" },
  { ...initial, assessmentId: "other" }, { ...initial, evaluatedAt: LATER },
] satisfies EventLifecycleSnapshotV1[]) assert.throws(() => evaluate([], { previous }), TypeError);
assert.deepEqual(evaluate(), evaluate([], { evaluatedAt: "2026-09-10T14:15:00+02:00" }));
const unverified = eventFactFromEcbMonetaryPolicyV1({ ...ecb,
  decision: { ...ecb.decision!, actualReleasedAt: null },
}, ["eurusd"]);
assert.equal(evaluate([], { event: unverified }).state, "INITIAL_REACTION");
assert.equal(evaluate([], { event: unverified }).clock.phase, "release-time-unverified");
assert.equal(evaluate([], { event: unverified }).clock.release, null);
assert.equal(evaluate([], { event: unverified }).checkpoint.availability, "unavailable");
const incomplete = eventFactFromEcbMonetaryPolicyV1({ ...ecb,
  decision: { ...ecb.decision!, rates: null },
}, ["eurusd"]);
assert.equal(evaluate([evidence("confirmation")], { event: incomplete }).state, "INITIAL_REACTION");
assert.equal(evaluate([evidence("supporting")], { event: incomplete }).state, "INITIAL_REACTION");
assert.equal(evaluate([], { event: incomplete }).eventData.availability, "partial");

// Capture, not publication or first observation, is the canonical source-state knowledge boundary.
const CAPTURED_AT = "2026-09-10T12:30:00Z";
const capturedLater = eventFactFromEcbMonetaryPolicyV1({ ...ecb,
  decision: { ...ecb.decision!, fetchedAt: unix(CAPTURED_AT), firstObservedAt: unix(AT) },
}, ["eurusd"]);
for (const [knownAt, expected] of [
  [unix(CAPTURED_AT) - 1, "INITIAL_REACTION"],
  [unix(CAPTURED_AT), "CONFIRMED"],
  [unix(CAPTURED_AT) + 1, "CONFIRMED"],
] as const) {
  const assessment = evidence("confirmation", { knownAt });
  const result = evaluate([assessment], { event: capturedLater, evaluatedAt: LATER });
  assert.equal(result.state, expected, "source capture must precede or equal assessment knowledge");
  assert.equal(result.acceptedEvidence.length, expected === "CONFIRMED" ? 1 : 0);
  assert.equal(assessment.knownAt, knownAt, "evaluation must not rewrite assessment knowledge");
}
const premature = evidence("confirmation", { knownAt: unix("2026-09-10T12:16:00Z") });
for (const evaluatedAt of [CAPTURED_AT, LATER]) {
  const result = evaluate([premature], { event: capturedLater, evaluatedAt });
  assert.equal(result.state, "INITIAL_REACTION", "later evaluation cannot repair earlier look-ahead");
  assert.deepEqual(result.acceptedEvidence, []);
}
assert.equal(evaluate([evidence("confirmation", { knownAt: unix(CAPTURED_AT) + 1 })], {
  event: capturedLater, evaluatedAt: CAPTURED_AT,
}).state, "INITIAL_REACTION", "future assessment knowledge remains ineligible");
const scheduleReference = [{
  sourceUrl: event.schedule.provenance.sourceUrl, sourceVersionId: event.schedule.provenance.sourceVersionId,
}];
assert.equal(evaluate([evidence("confirmation", { evidenceReferences: scheduleReference })], {
  event: capturedLater, evaluatedAt: LATER,
}).state, "INITIAL_REACTION", "required release facts must be known even when only schedule is referenced");
assert.equal(evaluate([evidence("confirmation", { evidenceReferences: scheduleReference })], {
  event: { ...event, schedule: { ...event.schedule,
    provenance: { ...event.schedule.provenance, fetchedAt: unix(CAPTURED_AT) },
  } }, evaluatedAt: LATER,
}).state, "INITIAL_REACTION", "each referenced source has its own capture boundary");
if (event.actual.availability !== "available") throw new Error("Expected available policy facts.");
assert.equal(evaluate([evidence("confirmation")], {
  event: { ...event, actual: { availability: "available", data: { ...event.actual.data,
    provenance: { ...event.actual.data.provenance, fetchedAt: unix(CAPTURED_AT) },
  } } }, evaluatedAt: LATER,
}).state, "INITIAL_REACTION", "required actual facts cannot be learned after assessment knowledge");

// Statistical facts retain explicit periods, units, zero/negative values and revisions.
const source: EventSourceReferenceV1 = {
  provider: "eurostat", source: "Eurostat", originalPublisher: "Eurostat", substitution: { status: "none" },
  sourceUrl: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr",
  sourceVersionId: "official-vintage-a", fetchedAt: unix(AT),
};
const value = (amount: number, period = "2026-08") => ({
  value: { value: amount, referencePeriod: period, unit: "percent", officialStatus: "p" }, provenance: source,
});
const statistical: EventFactV1 = {
  semantic: "source-fact", kind: "statistical-release", canonicalEventId: "eurostat:hicp:2026-08",
  eventFamily: "hicp", economicRegion: "euro-area", affectedProducts: ["estr"],
  schedule: { scheduledAt: AT, scheduledTimezone: "Europe/Luxembourg", provenance: source },
  release: { availability: "available", data: { actualReleasedAt: AT,
    firstObservedAt: unix(AT), provenance: source } },
  actual: { availability: "available", data: value(0) },
  previous: { availability: "available", data: value(-0.1, "2026-07") },
  revision: { status: "revised", revisedPrevious: value(-0.2, "2026-07") },
  consensus: { availability: "unavailable", reason: "CONSENSUS_SOURCE_UNAVAILABLE" },
};
assert.equal(defineEventFactV1(statistical).kind, "statistical-release");
assert.throws(() => defineEventFactV1({ ...statistical,
  actual: { availability: "available", data: value(NaN) } }), /finite/);
assert.throws(() => defineEventFactV1({ ...statistical,
  schedule: { ...statistical.schedule, scheduledAt: "2026-02-30T12:15:00Z" } }), TypeError);
assert.throws(() => defineEventFactV1({ ...statistical,
  schedule: { ...statistical.schedule, scheduledTimezone: "invented/timezone" } }), TypeError);
assert.throws(() => defineEventFactV1({ ...statistical,
  release: { availability: "available", data: { actualReleasedAt: LATER,
    firstObservedAt: unix(AT), provenance: source } } }), /Publication/);
assert.throws(() => defineEventFactV1({ ...statistical,
  schedule: { ...statistical.schedule, provenance: { ...source,
    substitution: { status: "substituted", provider: "reseller", source: "reseller" },
  } as unknown as EventSourceReferenceV1 } }), /primary/);

// Untrusted adapter data must pass runtime union membership checks.
for (const overrides of [
  { revision: { status: "invented" } },
  { revision: { availability: "available" } },
  { revision: { status: "none", availability: "unavailable" } },
  { previous: { availability: "not-computed" } },
  { previous: { availability: "invented" } },
  { actual: { availability: "not-applicable" } },
  { actual: { availability: "invented" } },
  { release: { availability: "not-computed" } },
  { release: { availability: "invented" } },
  { consensus: { availability: "available", reason: "CONSENSUS_SOURCE_UNAVAILABLE" } },
  { consensus: { availability: "invented", reason: "CONSENSUS_SOURCE_UNAVAILABLE" } },
  { kind: "invented" },
] satisfies Record<string, unknown>[]) {
  assert.throws(() => defineEventFactV1({ ...statistical, ...overrides } as unknown as EventFactV1), TypeError);
}
for (const revision of [
  { status: "unknown" }, { status: "none" },
  { status: "revised", revisedPrevious: value(-0.2, "2026-07") },
  { availability: "not-applicable" },
] as const) {
  assert.doesNotThrow(() => defineEventFactV1({ ...statistical, revision }));
}
for (const previous of [
  { availability: "available", data: value(-0.1, "2026-07") },
  { availability: "partial", data: value(-0.1, "2026-07"), missing: ["official-status"] },
  { availability: "unavailable" }, { availability: "not-applicable" },
] as const) {
  assert.doesNotThrow(() => defineEventFactV1({ ...statistical, previous }));
}
if (statistical.actual.availability !== "available" || statistical.release.availability !== "available") {
  throw new Error("Expected available statistical facts.");
}
const statisticalActualData = statistical.actual.data;
const statisticalReleaseData = statistical.release.data;
assert.doesNotThrow(() => defineEventFactV1({ ...statistical,
  actual: { availability: "partial", data: statisticalActualData, missing: ["official-status"] },
  release: { availability: "partial", data: statisticalReleaseData, missing: ["release-detail"] },
}));

function policyFactWithDate(effectiveDate: unknown, field: "actual" | "previous" | "revision"): EventFactV1 {
  const sourced = { provenance: event.schedule.provenance,
    value: { kind: "ecb-policy-rates", rates: { ...ecb.decision!.rates!, effectiveDate } },
  };
  const update = field === "revision"
    ? { revision: { status: "revised", revisedPrevious: sourced } }
    : { [field]: { availability: "available", data: sourced } };
  return { ...event, ...update } as unknown as EventFactV1;
}
for (const field of ["actual", "previous", "revision"] as const) {
  for (const invalid of ["2026-02-30", "2027-02-29", "2026-2-01", "02/01/2026",
    "2026-02-01T00:00:00Z", "invalid", "", undefined, 42]) {
    assert.throws(() => defineEventFactV1(policyFactWithDate(invalid, field)), /effectiveDate/);
  }
  for (const valid of ["2028-02-29", "2026-02-28", null]) {
    assert.doesNotThrow(() => defineEventFactV1(policyFactWithDate(valid, field)));
  }
}
const statement = defineEventFactV1({ ...event, kind: "policy-decision" as const,
  actual: { availability: "available" as const, data: { provenance: source,
    value: { kind: "policy-statement" as const, decision: "Official policy decision text supplied by adapter." } } },
});
assert.equal(statement.actual.data.value.kind, "policy-statement");
const originalNow = Date.now;
try {
  Date.now = () => { throw new Error("Hidden current-clock dependency"); };
  assert.deepEqual(evaluate([evidence("confirmation")]), evaluate([evidence("confirmation")]));
} finally { Date.now = originalNow; }
for (const name of ["eventClock.ts", "eventFact.ts", "eventLifecycle.ts"]) {
  const code = readFileSync(join(process.cwd(), "src/lib/markets/events", name), "utf8");
  assert.doesNotMatch(code, /Date\.now\s*\(|new Date\s*\(\s*\)|Math\.random\s*\(|set(?:Timeout|Interval)\s*\(/);
}
console.log("Event foundation: source facts, five products, evidence transitions and safety checks passed.");
