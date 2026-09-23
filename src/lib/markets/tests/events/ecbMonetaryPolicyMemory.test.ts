import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbAnnouncedPolicyRatesInputV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  buildEcbMonetaryPolicyEventSnapshotV1,
  parseEcbMonetaryPolicyEventMemoryV1,
  selectEcbMonetaryPolicyEventAsKnownAtV1,
  type EcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventSnapshotV1,
} from "../../events/ecbMonetaryPolicyMemory";

const DECISION_URL =
  "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html";
const BASE_MEETING_DATE = "2026-09-10";
const SCHEDULE_KNOWN_AT = unix("2026-09-08T10:00:00.000Z");

interface EventOptions {
  readonly canonicalMeetingDate?: string;
  readonly meetingDate?: string;
  readonly scheduledLocalTime?: string;
  readonly scheduleFetchedAt?: number;
  readonly decision?: {
    readonly fetchedAt: number;
    readonly firstObservedAt?: number;
    readonly actualReleasedAt?: string | null;
    readonly digestCharacter?: string;
    readonly rates?: EcbAnnouncedPolicyRatesInputV1 | null;
  } | null;
}

function event(options: EventOptions = {}): EcbMonetaryPolicyEventFactV1 {
  const meetingDate = options.meetingDate ?? BASE_MEETING_DATE;
  const decision = options.decision === undefined || options.decision === null
    ? null
    : {
        decisionDate: meetingDate,
        documentUrl: DECISION_URL,
        contentDigest: (options.decision.digestCharacter ?? "a").repeat(64),
        fetchedAt: options.decision.fetchedAt,
        firstObservedAt: options.decision.firstObservedAt ??
          options.decision.fetchedAt,
        actualReleasedAt: options.decision.actualReleasedAt ?? null,
        rates: options.decision.rates ?? null,
      };

  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.canonicalMeetingDate ?? BASE_MEETING_DATE,
    schedule: {
      meetingDate,
      scheduledLocalTime: options.scheduledLocalTime,
      fetchedAt: options.scheduleFetchedAt ?? SCHEDULE_KNOWN_AT,
    },
    decision,
  });
}

const scheduleOnly = event();
const firstSnapshot = buildEcbMonetaryPolicyEventSnapshotV1(scheduleOnly);
assert.equal(firstSnapshot.knownAt, scheduleOnly.schedule.fetchedAt,
  "schedule-only knownAt is the schedule capture time");
assert.equal(firstSnapshot.canonicalEventId, scheduleOnly.canonicalEventId);
assert.equal(firstSnapshot.eventSourceVersionId, scheduleOnly.sourceVersionId);

const decisionEarlierThanSchedule = event({
  scheduleFetchedAt: unix("2026-09-10T12:20:00.000Z"),
  decision: {
    fetchedAt: unix("2026-09-10T12:19:00.000Z"),
    firstObservedAt: unix("2026-09-10T12:18:00.000Z"),
  },
});
assert.equal(
  buildEcbMonetaryPolicyEventSnapshotV1(decisionEarlierThanSchedule).knownAt,
  decisionEarlierThanSchedule.schedule.fetchedAt,
  "knownAt uses the later schedule capture",
);

const decisionLaterThanSchedule = event({
  decision: {
    fetchedAt: unix("2026-09-10T12:20:00.000Z"),
    firstObservedAt: unix("2026-09-10T12:17:00.000Z"),
  },
});
assert.equal(
  buildEcbMonetaryPolicyEventSnapshotV1(decisionLaterThanSchedule).knownAt,
  decisionLaterThanSchedule.decision?.fetchedAt,
  "knownAt uses the later decision capture",
);
assert.notEqual(
  buildEcbMonetaryPolicyEventSnapshotV1(decisionLaterThanSchedule).knownAt,
  decisionLaterThanSchedule.decision?.firstObservedAt,
  "firstObservedAt is not the snapshot knowledge boundary",
);
assert.notEqual(firstSnapshot.knownAt,
  unix(scheduleOnly.schedule.scheduledAt), "scheduledAt is not knownAt");

const historicallyVerified = event({
  decision: {
    fetchedAt: unix("2026-09-10T12:20:00.000Z"),
    firstObservedAt: unix("2026-09-10T12:17:00.000Z"),
    actualReleasedAt: "2026-09-10T12:16:00.000Z",
  },
});
const historicallyVerifiedSnapshot =
  buildEcbMonetaryPolicyEventSnapshotV1(historicallyVerified);
assert.equal(historicallyVerifiedSnapshot.knownAt,
  historicallyVerified.decision?.fetchedAt);
assert.notEqual(historicallyVerifiedSnapshot.knownAt,
  unix(historicallyVerified.decision!.actualReleasedAt!),
"actualReleasedAt remains event time rather than snapshot knowledge time");

const exactReleaseBoundary = event({
  decision: {
    fetchedAt: unix("2026-09-10T12:16:00.000Z"),
    actualReleasedAt: "2026-09-10T12:16:00.000Z",
  },
});
assert.equal(
  buildEcbMonetaryPolicyEventSnapshotV1(exactReleaseBoundary).knownAt,
  unix("2026-09-10T12:16:00.000Z"),
  "actual release exactly at knownAt is valid",
);
for (const futureRelease of [
  "2026-09-10T12:16:00.001Z",
  "2026-09-10T12:16:00.500Z",
]) {
  assert.throws(() => buildEcbMonetaryPolicyEventSnapshotV1(event({
    decision: {
      fetchedAt: unix("2026-09-10T12:16:00.000Z"),
      actualReleasedAt: futureRelease,
    },
  })), /knowledge boundary/,
  `${futureRelease} is after the Unix-second knowledge boundary`);
}

const initialized = advanceEcbMonetaryPolicyEventMemoryV1(null, scheduleOnly);
assert.equal(initialized.status, "initialized");
let memory = initialized.memory;
assert.equal(memory.snapshots.length, 1);
assert.equal(memory.canonicalEventId, scheduleOnly.canonicalEventId);

const refetchedSameState = event({
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 3_600,
});
assert.equal(refetchedSameState.sourceVersionId, scheduleOnly.sourceVersionId);
const unchanged = advanceEcbMonetaryPolicyEventMemoryV1(
  memory,
  refetchedSameState,
);
assert.equal(unchanged.status, "unchanged");
assert.equal(unchanged.memory, memory);
assert.equal(unchanged.memory.snapshots.length, 1,
  "a later recapture of the latest semantic version is not duplicated");

const revisedSchedule = event({
  scheduledLocalTime: "14:30",
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 7_200,
});
const advanced = advanceEcbMonetaryPolicyEventMemoryV1(memory, revisedSchedule);
assert.equal(advanced.status, "advanced");
assert.equal(advanced.memory.snapshots.length, 2);
assert.equal(advanced.memory.canonicalEventId, memory.canonicalEventId);
assert.equal(memory.snapshots.length, 1, "advancement does not mutate prior memory");
memory = advanced.memory;

const staleCandidate = event({
  scheduledLocalTime: "14:45",
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 6_000,
});
const stale = advanceEcbMonetaryPolicyEventMemoryV1(memory, staleCandidate);
assert.equal(stale.status, "stale");
assert.equal(stale.memory, memory);
assert.equal(stale.memory.snapshots.length, 2);

const conflictCandidate = event({
  scheduledLocalTime: "14:45",
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 7_200,
});
const conflict = advanceEcbMonetaryPolicyEventMemoryV1(
  memory,
  conflictCandidate,
);
assert.equal(conflict.status, "conflict");
assert.equal(conflict.memory, memory);
assert.notEqual(
  conflict.status === "conflict"
    ? conflict.candidate.eventSourceVersionId
    : null,
  memory.snapshots.at(-1)?.eventSourceVersionId,
);

const differentMeeting = event({
  canonicalMeetingDate: "2026-10-29",
  meetingDate: "2026-10-29",
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 10_000,
});
const mismatch = advanceEcbMonetaryPolicyEventMemoryV1(
  memory,
  differentMeeting,
);
assert.equal(mismatch.status, "event-id-mismatch");
assert.equal(mismatch.memory, memory);

const rescheduled = event({
  meetingDate: "2026-09-17",
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 10_000,
});
const rescheduleResult = advanceEcbMonetaryPolicyEventMemoryV1(
  initialized.memory,
  rescheduled,
);
assert.equal(rescheduleResult.status, "advanced");
assert.equal(rescheduled.canonicalEventId, scheduleOnly.canonicalEventId,
  "schedule revision retains the first captured meeting identity");
assert.notEqual(rescheduled.schedule.sourceVersionId,
  scheduleOnly.schedule.sourceVersionId);

const withDecision = event({
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 7_200,
  scheduledLocalTime: "14:30",
  decision: {
    fetchedAt: SCHEDULE_KNOWN_AT + 16_200,
    firstObservedAt: SCHEDULE_KNOWN_AT + 16_100,
  },
});
const attached = advanceEcbMonetaryPolicyEventMemoryV1(memory, withDecision);
assert.equal(attached.status, "advanced");
assert.equal(attached.memory.snapshots.length, 3,
  "decision evidence creates a later semantic snapshot");

const history = buildHistory();
assert.equal(selectEcbMonetaryPolicyEventAsKnownAtV1(
  history,
  SCHEDULE_KNOWN_AT - 1,
), null, "knowledge before the first capture is empty");
assert.equal(selectEcbMonetaryPolicyEventAsKnownAtV1(
  history,
  SCHEDULE_KNOWN_AT + 3_600,
)?.event.schedule.scheduledLocalTime, "14:15");
assert.equal(selectEcbMonetaryPolicyEventAsKnownAtV1(
  history,
  SCHEDULE_KNOWN_AT + 10_000,
)?.event.schedule.scheduledLocalTime, "14:30");
assert.equal(selectEcbMonetaryPolicyEventAsKnownAtV1(
  history,
  SCHEDULE_KNOWN_AT + 15_000,
)?.event.decision, null,
"an as-known selection before decision capture cannot see the decision");
assert.notEqual(selectEcbMonetaryPolicyEventAsKnownAtV1(
  history,
  SCHEDULE_KNOWN_AT + 17_000,
)?.event.decision, null,
"an as-known selection after decision capture exposes captured evidence");

const aThenB = advanceEcbMonetaryPolicyEventMemoryV1(
  initialized.memory,
  revisedSchedule,
);
assert.equal(aThenB.status, "advanced");
const aAgain = event({
  scheduledLocalTime: "14:15",
  scheduleFetchedAt: SCHEDULE_KNOWN_AT + 10_800,
});
const aAgainResult = advanceEcbMonetaryPolicyEventMemoryV1(
  aThenB.memory,
  aAgain,
);
assert.equal(aAgainResult.status, "advanced",
  "A after A-B is a later transition, not a global duplicate");
assert.equal(aAgainResult.memory.snapshots.length, 3);
assert.equal(aAgain.sourceVersionId, scheduleOnly.sourceVersionId);

assert.equal(Object.isFrozen(firstSnapshot), true);
assert.equal(Object.isFrozen(firstSnapshot.event), true);
assert.equal(Object.isFrozen(firstSnapshot.event.schedule), true);
assert.equal(Object.isFrozen(history), true);
assert.equal(Object.isFrozen(history.snapshots), true);
assert.notEqual(firstSnapshot.event, scheduleOnly,
  "snapshot owns an immutable copy without mutating its input");
const mutableSnapshots = history.snapshots as EcbMonetaryPolicyEventSnapshotV1[];
assert.throws(() => mutableSnapshots.push(firstSnapshot), TypeError);

const parsedHistory = parseEcbMonetaryPolicyEventMemoryV1(
  JSON.parse(JSON.stringify(history)) as unknown,
);
assert.notEqual(parsedHistory, null, "valid serialized history parses");
assert.equal(Object.isFrozen(parsedHistory), true);
assert.equal(Object.isFrozen(parsedHistory?.snapshots), true);
assert.equal(Object.isFrozen(parsedHistory?.snapshots[0]), true);
assert.equal(Object.isFrozen(parsedHistory?.snapshots[0]?.event), true);
assert.equal(Object.isFrozen(parsedHistory?.snapshots[0]?.event.schedule), true);
assert.equal(
  Object.isFrozen(parsedHistory?.snapshots.at(-1)?.event.decision),
  true,
);

const wrongSchema = mutableMemory(history);
wrongSchema.schemaVersion = "wrong-schema";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(wrongSchema), null);

const emptyHistory = mutableMemory(history);
emptyHistory.snapshots = [];
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(emptyHistory), null);

const identityMismatch = mutableMemory(history);
identityMismatch.snapshots[0]!.canonicalEventId = "ECB:other:2026-09-10";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(identityMismatch), null);

const sourceVersionMismatch = mutableMemory(history);
sourceVersionMismatch.snapshots[0]!.event.sourceVersionId = "different";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(sourceVersionMismatch), null);

const forgedScheduleVersion = mutableMemory(history);
forgedScheduleVersion.snapshots[0]!.event.schedule.sourceVersionId =
  "forged-schedule-version";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(forgedScheduleVersion), null);

const forgedAlignedEventVersion = mutableMemory(history);
forgedAlignedEventVersion.snapshots[0]!.event.sourceVersionId =
  "forged-event-version";
forgedAlignedEventVersion.snapshots[0]!.eventSourceVersionId =
  "forged-event-version";
assert.equal(
  parseEcbMonetaryPolicyEventMemoryV1(forgedAlignedEventVersion),
  null,
);

const forgedDecisionVersion = mutableMemory(history);
forgedDecisionVersion.snapshots.at(-1)!.event.decision!.sourceVersionId =
  "forged-decision-version";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(forgedDecisionVersion), null);

const mutuallyForgedVersions = mutableMemory(history);
const forgedFinal = mutuallyForgedVersions.snapshots.at(-1)!;
forgedFinal.event.schedule.sourceVersionId = "forged-schedule-version";
forgedFinal.event.decision!.sourceVersionId = "forged-decision-version";
forgedFinal.event.sourceVersionId = "forged-event-version";
forgedFinal.eventSourceVersionId = "forged-event-version";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(mutuallyForgedVersions), null);

const malformedCanonicalIdentity = mutableMemory(history);
malformedCanonicalIdentity.canonicalEventId =
  "ECB:ecb-monetary-policy-decision:2026-99-99";
for (const snapshot of malformedCanonicalIdentity.snapshots) {
  snapshot.canonicalEventId = malformedCanonicalIdentity.canonicalEventId;
  snapshot.event.canonicalEventId = malformedCanonicalIdentity.canonicalEventId;
}
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(malformedCanonicalIdentity), null);

const nonMonotonic = mutableMemory(history);
nonMonotonic.snapshots.reverse();
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(nonMonotonic), null);

const sameTimeA = buildEcbMonetaryPolicyEventSnapshotV1(event());
const sameTimeB = buildEcbMonetaryPolicyEventSnapshotV1(event({
  scheduledLocalTime: "14:30",
}));
const duplicateKnownAt = {
  schemaVersion: history.schemaVersion,
  canonicalEventId: history.canonicalEventId,
  snapshots: [sameTimeA, sameTimeB],
};
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(duplicateKnownAt), null);

const wrongKnownAt = mutableMemory(history);
wrongKnownAt.snapshots[0]!.knownAt += 1;
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(wrongKnownAt), null);

const reversedObservation = mutableMemory(history);
const finalDecision = reversedObservation.snapshots.at(-1)!.event.decision!;
finalDecision.firstObservedAt = finalDecision.fetchedAt + 1;
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(reversedObservation), null);

const releaseBoundaryEvent = event({
  decision: {
    fetchedAt: unix("2026-09-10T12:16:00.000Z"),
    actualReleasedAt: "2026-09-10T12:16:00.000Z",
  },
});
const releaseBoundaryMemory = advanceEcbMonetaryPolicyEventMemoryV1(
  null,
  releaseBoundaryEvent,
).memory;
assert.notEqual(
  parseEcbMonetaryPolicyEventMemoryV1(releaseBoundaryMemory),
  null,
  "exact actual-release/knownAt millisecond boundary parses",
);
const futureReleaseMemory = mutableMemory(releaseBoundaryMemory);
futureReleaseMemory.snapshots[0]!.event.decision!.actualReleasedAt =
  "2026-09-10T12:16:00.001Z";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(futureReleaseMemory), null);

const malformedSchedule = mutableMemory(history);
malformedSchedule.snapshots[0]!.event.schedule.scheduledAt = "not-an-instant";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(malformedSchedule), null);

const malformedEvent = mutableMemory(history);
malformedEvent.snapshots[0]!.event.eventFamily = "not-ecb-policy";
assert.equal(parseEcbMonetaryPolicyEventMemoryV1(malformedEvent), null);

for (const malformed of [
  undefined,
  null,
  42,
  "not-json",
  [],
  { snapshots: null },
  { schemaVersion: history.schemaVersion, canonicalEventId: "x" },
]) {
  assert.doesNotThrow(() => parseEcbMonetaryPolicyEventMemoryV1(malformed));
  assert.equal(parseEcbMonetaryPolicyEventMemoryV1(malformed), null);
}

assert.notEqual(
  parseEcbMonetaryPolicyEventMemoryV1(aAgainResult.memory),
  null,
  "chronologically valid A-B-A history parses",
);

const source = readFileSync(join(
  process.cwd(),
  "src/lib/markets/events/ecbMonetaryPolicyMemory.ts",
), "utf8");
assert.equal(source.includes("Date.now("), false);

console.log("PASS: ECB monetary-policy immutable as-known memory V1");

function buildHistory(): EcbMonetaryPolicyEventMemoryV1 {
  const first = advanceEcbMonetaryPolicyEventMemoryV1(null, event());
  const second = advanceEcbMonetaryPolicyEventMemoryV1(first.memory, event({
    scheduledLocalTime: "14:30",
    scheduleFetchedAt: SCHEDULE_KNOWN_AT + 7_200,
  }));
  const third = advanceEcbMonetaryPolicyEventMemoryV1(second.memory, event({
    scheduledLocalTime: "14:30",
    scheduleFetchedAt: SCHEDULE_KNOWN_AT + 7_200,
    decision: {
      fetchedAt: SCHEDULE_KNOWN_AT + 16_200,
      firstObservedAt: SCHEDULE_KNOWN_AT + 16_100,
    },
  }));
  assert.equal(second.status, "advanced");
  assert.equal(third.status, "advanced");
  return third.memory;
}

function unix(value: string): number {
  return Math.floor(Date.parse(value) / 1_000);
}

interface MutableMemory {
  schemaVersion: string;
  canonicalEventId: string;
  snapshots: Array<{
    schemaVersion: string;
    canonicalEventId: string;
    knownAt: number;
    eventSourceVersionId: string;
    event: {
      canonicalEventId: string;
      eventFamily: string;
      sourceVersionId: string;
      schedule: {
        scheduledAt: string;
        sourceVersionId: string;
      };
      decision: null | {
        fetchedAt: number;
        firstObservedAt: number;
        actualReleasedAt: string | null;
        sourceVersionId: string;
      };
    };
  }>;
}

function mutableMemory(memoryValue: EcbMonetaryPolicyEventMemoryV1): MutableMemory {
  return JSON.parse(JSON.stringify(memoryValue)) as MutableMemory;
}
