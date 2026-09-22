import assert from "node:assert/strict";
import {
  ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  ECB_MONETARY_POLICY_EVENT_FAMILY,
  ECB_POLICY_RATE_SERIES,
  ECB_SOURCE_INSTITUTION,
  ecbMonetaryPolicyCanonicalEventIdV1,
  ecbScheduledInstantV1,
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventInputV1,
} from "../../events/ecbMonetaryPolicy";

const DECISION_URL = "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html";
const CONTENT_DIGEST = "a".repeat(64);
const BASE: EcbMonetaryPolicyEventInputV1 = {
  canonicalMeetingDate: "2026-09-10",
  schedule: { meetingDate: "2026-09-10", fetchedAt: 1_789_000_000 },
  decision: {
    decisionDate: "2026-09-10",
    documentUrl: DECISION_URL,
    contentDigest: CONTENT_DIGEST,
    fetchedAt: 1_789_100_000,
    firstObservedAt: 1_789_099_900,
    rates: {
      depositFacility: 2,
      mainRefinancingOperations: 2.15,
      marginalLendingFacility: 2.4,
      effectiveDate: "2026-09-16",
    },
  },
};

function fact(overrides: Partial<EcbMonetaryPolicyEventInputV1> = {}) {
  return normalizeEcbMonetaryPolicyEventV1({ ...BASE, ...overrides });
}

const original = fact();
const repeated = fact();

// Canonical identity stays anchored to the first captured Governing Council date.
assert.equal(ecbMonetaryPolicyCanonicalEventIdV1("2026-09-10"),
  "ECB:ecb-monetary-policy-decision:2026-09-10");
assert.equal(original.canonicalEventId, repeated.canonicalEventId);
assert.equal(fact({ schedule: { ...BASE.schedule, fetchedAt: BASE.schedule.fetchedAt + 1 } }).canonicalEventId,
  original.canonicalEventId);
assert.equal(fact({ schedule: { ...BASE.schedule, scheduledLocalTime: "14:30" } }).canonicalEventId,
  original.canonicalEventId);
assert.equal(fact({ decision: {
  ...BASE.decision!, rates: { ...BASE.decision!.rates!, effectiveDate: "2026-09-17" },
} }).canonicalEventId, original.canonicalEventId);
const rescheduledWithoutDecision = fact({
  schedule: { meetingDate: "2026-09-17", fetchedAt: BASE.schedule.fetchedAt + 1 },
  decision: null,
});
assert.equal(rescheduledWithoutDecision.canonicalEventId, original.canonicalEventId);
assert.notEqual(rescheduledWithoutDecision.schedule.sourceVersionId,
  original.schedule.sourceVersionId);
const rescheduledWithDecision = fact({
  schedule: { meetingDate: "2026-09-17", fetchedAt: BASE.schedule.fetchedAt + 1 },
  decision: { ...BASE.decision!, decisionDate: "2026-09-17" },
});
assert.equal(rescheduledWithDecision.canonicalEventId, original.canonicalEventId);

// Current ECB decision schedule is Frankfurt civil time; no release instant is inferred.
assert.equal(original.schedule.scheduledAt, "2026-09-10T12:15:00.000Z");
assert.equal(original.decision?.actualReleasedAt, null);
assert.notEqual(original.schedule.scheduledAt, original.decision?.actualReleasedAt);
assert.notEqual(new Date(BASE.decision!.fetchedAt * 1_000).toISOString(),
  original.decision?.actualReleasedAt);
assert.notEqual(new Date(BASE.decision!.firstObservedAt * 1_000).toISOString(),
  original.decision?.actualReleasedAt);
assert.equal(fact({ decision: { ...BASE.decision!, actualReleasedAt: null } })
  .decision?.actualReleasedAt, null);
const releasedAtZulu = fact({ decision: {
  ...BASE.decision!, actualReleasedAt: "2026-09-10T12:16:03Z",
} });
const releasedAtOffset = fact({ decision: {
  ...BASE.decision!, actualReleasedAt: "2026-09-10T14:16:03+02:00",
} });
assert.equal(releasedAtZulu.decision?.actualReleasedAt, "2026-09-10T12:16:03.000Z");
assert.equal(releasedAtOffset.decision?.actualReleasedAt, releasedAtZulu.decision?.actualReleasedAt);
assert.equal(releasedAtZulu.decision?.sourceVersionId, releasedAtOffset.decision?.sourceVersionId);
assert.equal(releasedAtZulu.sourceVersionId, releasedAtOffset.sourceVersionId);
assert.notEqual(releasedAtZulu.decision?.sourceVersionId, original.decision?.sourceVersionId);
assert.notEqual(releasedAtZulu.sourceVersionId, original.sourceVersionId);
assert.equal(releasedAtZulu.schedule.sourceVersionId, original.schedule.sourceVersionId);
assert.equal(releasedAtZulu.canonicalEventId, original.canonicalEventId);
assert.throws(() => fact({ decision: {
  ...BASE.decision!, actualReleasedAt: "2026-09-10T14:16:03",
} }), /actualReleasedAt/);
assert.throws(() => fact({ decision: {
  ...BASE.decision!, actualReleasedAt: "not-a-timestamp",
} }), /actualReleasedAt/);
assert.throws(() => fact({ decision: {
  ...BASE.decision!, actualReleasedAt: "2026-02-30T12:16:03Z",
} }), /actualReleasedAt/);
assert.equal(ecbScheduledInstantV1("2026-01-22", "14:15"), "2026-01-22T13:15:00.000Z");
assert.equal(ecbScheduledInstantV1("2026-06-11", "14:15"), "2026-06-11T12:15:00.000Z");
assert.equal(ecbScheduledInstantV1("2028-02-29", "14:15"), "2028-02-29T13:15:00.000Z");
assert.throws(() => ecbScheduledInstantV1("2026-02-29", "14:15"), /Invalid/);
assert.equal(ecbScheduledInstantV1("2026-03-29", "03:15"), "2026-03-29T01:15:00.000Z");
assert.equal(ecbScheduledInstantV1("2026-10-25", "03:15"), "2026-10-25T02:15:00.000Z");
assert.throws(() => ecbScheduledInstantV1("2026-03-29", "02:30"), /nonexistent/);
assert.throws(() => ecbScheduledInstantV1("2026-10-25", "02:30"), /ambiguous/);

// Rate levels are announced facts, while the effective date is a separate civil date.
assert.deepEqual(ECB_POLICY_RATE_SERIES, {
  depositFacility: "FM.B.U2.EUR.4F.KR.DFR.LEV",
  mainRefinancingOperations: "FM.B.U2.EUR.4F.KR.MRR_FR.LEV",
  marginalLendingFacility: "FM.B.U2.EUR.4F.KR.MLFR.LEV",
});
assert.deepEqual(original.decision?.rates, {
  depositFacility: 2,
  mainRefinancingOperations: 2.15,
  marginalLendingFacility: 2.4,
  unit: "percent",
  effectiveDate: "2026-09-16",
});
assert.notEqual(original.decision?.rates?.effectiveDate, original.schedule.meetingDate);
const zeroRates = fact({ decision: {
  ...BASE.decision!, rates: {
    depositFacility: 0, mainRefinancingOperations: 0,
    marginalLendingFacility: 0, effectiveDate: null,
  },
} });
assert.equal(zeroRates.decision?.rates?.depositFacility, 0);
const negativeRates = fact({ decision: {
  ...BASE.decision!, rates: {
    depositFacility: -0.5, mainRefinancingOperations: -0.25,
    marginalLendingFacility: -0.1, effectiveDate: null,
  },
} });
assert.equal(negativeRates.decision?.rates?.depositFacility, -0.5);
assert.throws(() => fact({ decision: {
  ...BASE.decision!, rates: { ...BASE.decision!.rates!, depositFacility: Number.NaN },
} }), /finite/);
assert.throws(() => fact({ decision: {
  ...BASE.decision!, rates: { ...BASE.decision!.rates!, marginalLendingFacility: Infinity },
} }), /finite/);
const unchangedRates = fact({ decision: {
  ...BASE.decision!, rates: { ...BASE.decision!.rates!, effectiveDate: null },
} });
assert.equal(unchangedRates.availability, "available");
assert.equal(unchangedRates.decision?.rates?.effectiveDate, null);

// Versions are semantic identities, independent of fetch and first-observation times.
assert.equal(original.sourceVersionId, repeated.sourceVersionId);
assert.equal(original.schedule.sourceVersionId, repeated.schedule.sourceVersionId);
assert.equal(original.decision?.sourceVersionId, repeated.decision?.sourceVersionId);
const refetched = fact({
  schedule: { ...BASE.schedule, fetchedAt: BASE.schedule.fetchedAt + 1 },
  decision: { ...BASE.decision!, fetchedAt: BASE.decision!.fetchedAt + 1,
    firstObservedAt: BASE.decision!.firstObservedAt + 1 },
});
assert.equal(refetched.sourceVersionId, original.sourceVersionId);
assert.equal(refetched.schedule.sourceVersionId, original.schedule.sourceVersionId);
assert.equal(refetched.decision?.sourceVersionId, original.decision?.sourceVersionId);
assert.notEqual(fact({ schedule: { ...BASE.schedule, scheduledLocalTime: "14:30" } }).sourceVersionId,
  original.sourceVersionId);
assert.notEqual(fact({ decision: null }).sourceVersionId, original.sourceVersionId);
assert.notEqual(fact({ decision: { ...BASE.decision!, contentDigest: "b".repeat(64) } }).sourceVersionId,
  original.sourceVersionId);
assert.notEqual(fact({ decision: { ...BASE.decision!, rates: {
  ...BASE.decision!.rates!, effectiveDate: "2026-09-17",
} } }).sourceVersionId, original.sourceVersionId);
assert.notEqual(fact({ decision: { ...BASE.decision!, rates: {
  ...BASE.decision!.rates!, depositFacility: 2.25,
} } }).sourceVersionId, original.sourceVersionId);

// The source fact remains internal and does not introduce a product mapping.
assert.equal(original.sourceInstitution, ECB_SOURCE_INSTITUTION);
assert.equal(original.decision?.sourceInstitution, ECB_SOURCE_INSTITUTION);
assert.equal(original.eventFamily, ECB_MONETARY_POLICY_EVENT_FAMILY);
assert.equal(original.schedule.sourceUrl, ECB_GOVERNING_COUNCIL_CALENDAR_URL);
assert.equal(Object.hasOwn(original, "productId"), false);
assert.equal(Object.hasOwn(original, "requestedProductId"), false);
assert.equal(Object.hasOwn(original, "asset"), false);
assert.equal(fact({ decision: null }).availability, "partial");
assert.equal(fact({ decision: { ...BASE.decision!, rates: null } }).availability, "partial");
assert.equal(fact({ decision: null }).decision, null);
assert.ok(Object.isFrozen(original));
assert.ok(Object.isFrozen(original.schedule));
assert.ok(Object.isFrozen(original.decision));
assert.ok(Object.isFrozen(original.decision?.rates));

assert.throws(() => ecbMonetaryPolicyCanonicalEventIdV1("2026-02-30"), /Invalid/);
assert.throws(() => fact({ decision: { ...BASE.decision!, documentUrl: "https://example.com/press/pr/date/x.html" } }), /official ECB/);
assert.throws(() => fact({ decision: {
  ...BASE.decision!,
  documentUrl: "https://www.ecb.europa.eu.attacker.example/press/pr/date/2026/html/fake.html",
} }), /official ECB/);
assert.throws(() => fact({ decision: { ...BASE.decision!, decisionDate: "2026-09-11" } }), /match/);
assert.throws(() => fact({ decision: { ...BASE.decision!, firstObservedAt: BASE.decision!.fetchedAt + 1 } }), /cannot follow/);
