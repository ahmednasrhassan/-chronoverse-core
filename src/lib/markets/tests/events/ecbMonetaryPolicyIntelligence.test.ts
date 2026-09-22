import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbAnnouncedPolicyRatesInputV1,
} from "../../events/ecbMonetaryPolicy";
import {
  buildEcbMonetaryPolicyEventIntelligenceV1,
} from "../../events/ecbMonetaryPolicyIntelligence";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  buildEcbMonetaryPolicyEventSnapshotV1,
  selectEcbMonetaryPolicyEventAsKnownAtV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "../../events/ecbMonetaryPolicyMemory";

const SCHEDULED_AT = "2026-09-10T12:15:00.000Z";
const RELEASED_AT = "2026-09-10T12:16:00.000Z";
const DECISION_URL =
  "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html";
const SCHEDULE_FETCHED_AT = unix("2026-09-08T10:00:00.000Z");

interface SnapshotOptions {
  readonly scheduleFetchedAt?: number;
  readonly decision?: {
    readonly fetchedAt: number;
    readonly firstObservedAt?: number;
    readonly actualReleasedAt?: string | null;
    readonly rates?: EcbAnnouncedPolicyRatesInputV1 | null;
  } | null;
}

function snapshot(options: SnapshotOptions = {}): EcbMonetaryPolicyEventSnapshotV1 {
  const decision = options.decision === undefined || options.decision === null
    ? null
    : {
        decisionDate: "2026-09-10",
        documentUrl: DECISION_URL,
        contentDigest: "a".repeat(64),
        fetchedAt: options.decision.fetchedAt,
        firstObservedAt: options.decision.firstObservedAt ??
          options.decision.fetchedAt,
        actualReleasedAt: options.decision.actualReleasedAt ?? null,
        rates: options.decision.rates ?? null,
      };

  return buildEcbMonetaryPolicyEventSnapshotV1(
    normalizeEcbMonetaryPolicyEventV1({
      canonicalMeetingDate: "2026-09-10",
      schedule: {
        meetingDate: "2026-09-10",
        fetchedAt: options.scheduleFetchedAt ?? SCHEDULE_FETCHED_AT,
      },
      decision,
    }),
  );
}

const scheduleSnapshot = snapshot();
assert.equal(scheduleSnapshot.event.schedule.scheduledAt, SCHEDULED_AT);

for (const [evaluatedAt, expected] of [
  ["2026-09-09T12:14:59.000Z", "pre-event"],
  ["2026-09-09T12:15:00.000Z", "t-24h"],
  ["2026-09-10T08:00:00.000Z", "t-24h"],
  ["2026-09-10T11:15:00.000Z", "t-1h"],
  ["2026-09-10T11:30:00.000Z", "t-1h"],
  ["2026-09-10T12:00:00.000Z", "t-15m"],
  ["2026-09-10T12:14:59.999Z", "t-15m"],
] as const) {
  assert.equal(intelligence(scheduleSnapshot, evaluatedAt).phase, expected,
    `${evaluatedAt} resolves to ${expected}`);
}

const atSchedule = intelligence(scheduleSnapshot, SCHEDULED_AT);
assert.equal(atSchedule.phase, "release-time-unverified");
assert.equal(atSchedule.decisionEvidence.status, "not-observed");
assert.equal(atSchedule.releaseTiming.status, "unverified");
assert.equal(atSchedule.rateFacts.availability, "unavailable");

const unverifiedDecision = snapshot({
  decision: {
    fetchedAt: unix("2026-09-10T12:20:00.000Z"),
    firstObservedAt: unix("2026-09-10T12:17:00.000Z"),
    actualReleasedAt: null,
  },
});
const observedAtFetch = intelligence(
  unverifiedDecision,
  "2026-09-10T12:20:00.000Z",
);
assert.equal(observedAtFetch.phase, "release-time-unverified",
  "decision observation without actual release verification stays unverified");
assert.equal(observedAtFetch.decisionEvidence.status, "observed");
assert.equal(observedAtFetch.releaseTiming.status, "unverified");
assert.equal(observedAtFetch.rateFacts.availability, "unavailable");
if (observedAtFetch.decisionEvidence.status === "observed") {
  assert.equal(observedAtFetch.decisionEvidence.firstObservedAt,
    unix("2026-09-10T12:17:00.000Z"));
  assert.equal(observedAtFetch.decisionEvidence.documentUrl, DECISION_URL);
}
assert.equal(intelligence(
  unverifiedDecision,
  "2026-09-10T12:25:00.000Z",
).phase, "release-time-unverified",
"neither firstObservedAt nor fetchedAt starts a post-release window");

const verifiedSnapshot = snapshot({
  decision: {
    fetchedAt: unix(RELEASED_AT),
    firstObservedAt: unix(RELEASED_AT),
    actualReleasedAt: RELEASED_AT,
  },
});
assert.equal(intelligence(verifiedSnapshot, RELEASED_AT).phase, "release",
  "actual release exactly at snapshot knownAt is valid");
for (const futureRelease of [
  "2026-09-10T12:16:00.001Z",
  "2026-09-10T12:16:00.500Z",
]) {
  const eventWithFutureRelease = normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: "2026-09-10",
    schedule: {
      meetingDate: "2026-09-10",
      fetchedAt: SCHEDULE_FETCHED_AT,
    },
    decision: {
      decisionDate: "2026-09-10",
      documentUrl: DECISION_URL,
      contentDigest: "b".repeat(64),
      fetchedAt: unix(RELEASED_AT),
      firstObservedAt: unix(RELEASED_AT),
      actualReleasedAt: futureRelease,
      rates: null,
    },
  });
  const futureReleaseSnapshot: EcbMonetaryPolicyEventSnapshotV1 = Object.freeze({
    schemaVersion: verifiedSnapshot.schemaVersion,
    canonicalEventId: eventWithFutureRelease.canonicalEventId,
    knownAt: unix(RELEASED_AT),
    eventSourceVersionId: eventWithFutureRelease.sourceVersionId,
    event: eventWithFutureRelease,
  });
  assert.throws(() => intelligence(
    futureReleaseSnapshot,
    futureRelease,
  ), /knowledge boundary/,
  `${futureRelease} cannot exist in a snapshot known at 12:16:00.000Z`);
}
for (const [evaluatedAt, expected] of [
  [RELEASED_AT, "release"],
  ["2026-09-10T12:20:59.999Z", "release"],
  ["2026-09-10T12:21:00.000Z", "post-5m"],
  ["2026-09-10T12:31:00.000Z", "post-15m"],
  ["2026-09-10T12:46:00.000Z", "post-30m"],
  ["2026-09-10T13:16:00.000Z", "post-1h"],
] as const) {
  assert.equal(intelligence(verifiedSnapshot, evaluatedAt).phase, expected,
    `${evaluatedAt} resolves from verified release to ${expected}`);
}

const verified = intelligence(
  verifiedSnapshot,
  "2026-09-10T13:16:00.000Z",
);
assert.equal(verified.releaseTiming.status, "verified");
assert.deepEqual(verified.milestones.schedule, {
  t24hAt: "2026-09-09T12:15:00.000Z",
  t1hAt: "2026-09-10T11:15:00.000Z",
  t15mAt: "2026-09-10T12:00:00.000Z",
  scheduledAt: SCHEDULED_AT,
});
assert.deepEqual(verified.milestones.release, {
  releaseAt: RELEASED_AT,
  post5mAt: "2026-09-10T12:21:00.000Z",
  post15mAt: "2026-09-10T12:31:00.000Z",
  post30mAt: "2026-09-10T12:46:00.000Z",
  post1hAt: "2026-09-10T13:16:00.000Z",
});
assert.equal(atSchedule.milestones.release, null,
  "post-release milestones require verified actualReleasedAt");
assert.equal(verified.sessionReview.status, "not-computed");
assert.equal(verified.readiness.sessionReview, "not-computed");
assert.equal("sessionReviewAt" in verified.milestones, false,
  "no session-review instant is fabricated");

const verifiedLaterSnapshot = snapshot({
  decision: {
    fetchedAt: unix("2026-09-10T12:20:00.000Z"),
    firstObservedAt: unix("2026-09-10T12:17:00.000Z"),
    actualReleasedAt: RELEASED_AT,
  },
});
assert.equal(intelligence(
  verifiedLaterSnapshot,
  "2026-09-10T12:20:00.000Z",
).phase, "release",
"a historical release verified later is usable only from its later knownAt boundary");

const rates = {
  depositFacility: 2,
  mainRefinancingOperations: 2.15,
  marginalLendingFacility: 2.4,
  effectiveDate: "2026-09-16",
} as const;
const ratesSnapshot = snapshot({
  decision: {
    fetchedAt: unix(RELEASED_AT),
    actualReleasedAt: RELEASED_AT,
    rates,
  },
});
const withRates = intelligence(ratesSnapshot, RELEASED_AT);
assert.equal(withRates.rateFacts.availability, "available");
assert.equal(withRates.readiness.rateFacts, "available");
if (withRates.rateFacts.availability === "available") {
  assert.deepEqual(withRates.rateFacts.data, { ...rates, unit: "percent" });
}

assert.throws(() => intelligence(
  unverifiedDecision,
  "2026-09-10T12:19:59.000Z",
), /knowledge boundary/, "a future snapshot cannot be evaluated early");
assert.throws(() => snapshot({
  decision: {
    fetchedAt: unix("2026-09-10T12:15:30.000Z"),
    actualReleasedAt: RELEASED_AT,
  },
}), /knowledge boundary/,
"verified release evidence cannot predate its own event in capture chronology");

const scheduledEvent = scheduleSnapshot.event;
const verifiedEvent = verifiedSnapshot.event;
const first = advanceEcbMonetaryPolicyEventMemoryV1(null, scheduledEvent);
const second = advanceEcbMonetaryPolicyEventMemoryV1(first.memory, verifiedEvent);
assert.equal(second.status, "advanced");
const beforeReleaseKnowledge = selectEcbMonetaryPolicyEventAsKnownAtV1(
  second.memory,
  unix("2026-09-10T12:15:59.000Z"),
);
assert.notEqual(beforeReleaseKnowledge, null);
if (beforeReleaseKnowledge === null) {
  throw new Error("Expected schedule knowledge before decision capture.");
}
const beforeReleaseIntelligence = intelligence(
  beforeReleaseKnowledge,
  "2026-09-10T12:15:59.000Z",
);
assert.equal(beforeReleaseIntelligence.decisionEvidence.status, "not-observed");
assert.equal(beforeReleaseIntelligence.releaseTiming.status, "unverified");
assert.equal(beforeReleaseIntelligence.phase, "release-time-unverified");
assert.equal(beforeReleaseIntelligence.milestones.release, null,
  "later verified release evidence cannot leak through earlier selection");

const deterministicA = intelligence(
  verifiedSnapshot,
  "2026-09-10T12:31:00.000Z",
);
const deterministicB = intelligence(
  verifiedSnapshot,
  "2026-09-10T12:31:00.000Z",
);
assert.deepEqual(deterministicA, deterministicB);
assert.equal(Object.isFrozen(deterministicA), true);
assert.equal(Object.isFrozen(deterministicA.milestones), true);
assert.equal(Object.isFrozen(deterministicA.milestones.schedule), true);
assert.equal(Object.isFrozen(deterministicA.milestones.release), true);
assert.equal(Object.isFrozen(deterministicA.readiness), true);
assert.equal(Object.isFrozen(verifiedSnapshot), true);

const source = readFileSync(join(
  process.cwd(),
  "src/lib/markets/events/ecbMonetaryPolicyIntelligence.ts",
), "utf8");
for (const forbidden of [
  "Date.now(",
  "fetch(",
  "setInterval(",
  "setTimeout(",
  "bullish",
  "bearish",
  "hawkish",
  "dovish",
  "recommendation",
  "probability",
  "price target",
]) {
  assert.equal(source.includes(forbidden), false, `intelligence excludes ${forbidden}`);
}

console.log("PASS: ECB monetary-policy deterministic event intelligence V1");

function intelligence(
  selectedSnapshot: EcbMonetaryPolicyEventSnapshotV1,
  evaluatedAt: string,
) {
  return buildEcbMonetaryPolicyEventIntelligenceV1({
    snapshot: selectedSnapshot,
    evaluatedAt,
  });
}

function unix(value: string): number {
  return Math.floor(Date.parse(value) / 1_000);
}
