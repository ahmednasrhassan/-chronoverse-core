import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ECB_CURRENT_DECISION_LOCAL_TIME,
  ECB_GOVERNING_COUNCIL_CALENDAR_URL,
  ecbMonetaryPolicyCanonicalEventIdV1,
  ecbScheduledInstantV1,
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventMemoryV1,
} from "../../events/ecbMonetaryPolicyMemory";
import {
  ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1,
  type EcbMonetaryPolicyActiveEventRedisAdapterV1,
  type EcbMonetaryPolicyActiveEventV1,
} from "../../persistence/ecbMonetaryPolicyActiveEventRedis";
import type { EcbMonetaryPolicyEventMemoryRedisAdapterV1 } from
  "../../persistence/ecbMonetaryPolicyEventMemoryRedis";
import type { EcbMonetaryPolicySourceResultV1 } from
  "../../providers/ecb/monetaryPolicy/client";
import type { EcbMonetaryPolicyScheduleCandidateV1 } from
  "../../providers/ecb/monetaryPolicy/parser";
import {
  createEcbMonetaryPolicyEventRuntimeV1,
  type EcbMonetaryPolicyEventRuntimeResultV1,
} from "../../services/ecbMonetaryPolicyEventRuntime";

type ScheduleResult = EcbMonetaryPolicySourceResultV1<
  readonly EcbMonetaryPolicyScheduleCandidateV1[]
>;

interface HarnessOptions {
  readonly active?: EcbMonetaryPolicyActiveEventV1 | null;
  readonly memories?: ReadonlyMap<string, EcbMonetaryPolicyEventMemoryV1>;
  readonly activeReadStatus?: "stored-pointer-invalid" | "redis-failure";
  readonly memoryReadStatus?: "stored-memory-invalid" | "redis-failure";
  readonly activeWriteFailure?: Error;
  readonly memoryAdvanceFailure?: Error;
}

function candidate(meetingDate: string): EcbMonetaryPolicyScheduleCandidateV1 {
  return Object.freeze({
    sourceInstitution: "ECB",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    meetingDate,
  });
}

function pointer(
  currentMeetingDate: string,
  canonicalMeetingDate = currentMeetingDate,
): EcbMonetaryPolicyActiveEventV1 {
  return Object.freeze({
    schemaVersion: ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1,
    canonicalEventId:
      ecbMonetaryPolicyCanonicalEventIdV1(canonicalMeetingDate),
    canonicalMeetingDate,
    currentMeetingDate,
    scheduledAt: ecbScheduledInstantV1(
      currentMeetingDate,
      ECB_CURRENT_DECISION_LOCAL_TIME,
    ),
  });
}

function scheduleEvent(
  meetingDate: string,
  fetchedAt: number,
): EcbMonetaryPolicyEventFactV1 {
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: meetingDate,
    schedule: { meetingDate, fetchedAt },
    decision: null,
  });
}

function decisionEvent(
  meetingDate: string,
  scheduleFetchedAt: number,
  decisionFetchedAt: number,
  actualReleasedAt: string | null,
): EcbMonetaryPolicyEventFactV1 {
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: meetingDate,
    schedule: { meetingDate, fetchedAt: scheduleFetchedAt },
    decision: {
      decisionDate: meetingDate,
      documentUrl:
        "https://www.ecb.europa.eu/press/pr/date/2027/html/ecb.mp270204~abcdef1234.en.html",
      contentDigest: "ab".repeat(32),
      fetchedAt: decisionFetchedAt,
      firstObservedAt: decisionFetchedAt,
      actualReleasedAt,
      rates: {
        depositFacility: 2,
        mainRefinancingOperations: 2.15,
        marginalLendingFacility: 2.4,
        effectiveDate: "2027-02-11",
      },
    },
  });
}

function memoryOf(
  ...events: readonly EcbMonetaryPolicyEventFactV1[]
): EcbMonetaryPolicyEventMemoryV1 {
  let memory: EcbMonetaryPolicyEventMemoryV1 | null = null;
  for (const event of events) {
    const result = advanceEcbMonetaryPolicyEventMemoryV1(memory, event);
    if (result.status !== "initialized" && result.status !== "advanced") {
      throw new Error(`Could not build fixture memory: ${result.status}`);
    }
    memory = result.memory;
  }
  return memory!;
}

function availableSource(
  dates: readonly string[],
  fetchedAt: number,
): ScheduleResult {
  return Object.freeze({
    status: "available",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    fetchedAt,
    data: Object.freeze(dates.map(candidate)),
  });
}

function createHarness(
  sourceInitial: ScheduleResult,
  options: HarnessOptions = {},
) {
  let source = sourceInitial;
  let active = options.active ?? null;
  let activeWrites = 0;
  let scheduleCalls = 0;
  let memoryAdvances = 0;
  const memories = new Map(options.memories ?? []);

  const activeEvent: EcbMonetaryPolicyActiveEventRedisAdapterV1 = {
    read: async () => {
      if (options.activeReadStatus !== undefined) {
        return Object.freeze({ status: options.activeReadStatus });
      }
      return active === null
        ? Object.freeze({ status: "absent" as const })
        : Object.freeze({ status: "available" as const, pointer: active });
    },
    write: async (expected, replacement) => {
      activeWrites += 1;
      if (options.activeWriteFailure !== undefined) {
        throw options.activeWriteFailure;
      }
      assert.equal(JSON.stringify(active), JSON.stringify(expected));
      const status = active === null ? "initialized" : "updated";
      active = replacement;
      return Object.freeze({ status, pointer: replacement });
    },
  };

  const eventMemory: EcbMonetaryPolicyEventMemoryRedisAdapterV1 = {
    read: async (canonicalEventId) => {
      if (options.memoryReadStatus !== undefined) {
        return Object.freeze({ status: options.memoryReadStatus });
      }
      const memory = memories.get(canonicalEventId);
      return memory === undefined
        ? Object.freeze({ status: "absent" as const })
        : Object.freeze({ status: "available" as const, memory });
    },
    advance: async (canonicalEventId, event) => {
      memoryAdvances += 1;
      if (options.memoryAdvanceFailure !== undefined) {
        throw options.memoryAdvanceFailure;
      }
      const result = advanceEcbMonetaryPolicyEventMemoryV1(
        memories.get(canonicalEventId) ?? null,
        event,
      );
      if (result.status === "initialized" || result.status === "advanced") {
        memories.set(canonicalEventId, result.memory);
      }
      return result;
    },
  };

  const runtime = createEcbMonetaryPolicyEventRuntimeV1({
    getSchedule: async () => {
      scheduleCalls += 1;
      return source;
    },
    activeEvent,
    eventMemory,
  });

  return {
    evaluate: (evaluatedAt: string) => runtime.evaluate({ evaluatedAt }),
    setSource: (value: ScheduleResult) => { source = value; },
    active: () => active,
    activeWrites: () => activeWrites,
    scheduleCalls: () => scheduleCalls,
    memoryAdvances: () => memoryAdvances,
    memory: (id: string) => memories.get(id),
  };
}

async function main(): Promise<void> {
  const meeting = "2027-02-04";
  const nextMeeting = "2027-03-18";
  const fetchedBefore = unix("2027-02-01T00:00:00.000Z");

  const firstFuture = createHarness(
    availableSource([nextMeeting, meeting], fetchedBefore),
  );
  const firstResult = await firstFuture.evaluate("2027-02-02T00:00:00.000Z");
  assertAvailable(firstResult);
  assert.equal(firstResult.currentMeetingDate, meeting,
    "the earliest relevant event is selected deterministically");
  assert.equal(firstFuture.active()?.canonicalMeetingDate, meeting);
  assert.equal(firstFuture.activeWrites(), 1);
  assert.equal(firstResult.selectionState, "next-scheduled");
  assert.equal(firstResult.source.sourceUrl, ECB_GOVERNING_COUNCIL_CALENDAR_URL);
  assert.equal(firstResult.source.fetchedAt, fetchedBefore);

  const atSchedule = createHarness(availableSource([meeting], fetchedBefore));
  const scheduledResult = await atSchedule.evaluate("2027-02-04T13:15:00.000Z");
  assertAvailable(scheduledResult);
  assert.equal(scheduledResult.selectionState, "current-window");
  assert.equal(scheduledResult.intelligence.phase, "release-time-unverified");

  const withinHorizonMemory = memoryOf(scheduleEvent(meeting, fetchedBefore));
  const withinHorizon = createHarness(availableSource([meeting, nextMeeting], fetchedBefore), {
    active: pointer(meeting),
    memories: new Map([[ecbMonetaryPolicyCanonicalEventIdV1(meeting), withinHorizonMemory]]),
  });
  const withinResult = await withinHorizon.evaluate("2027-02-04T14:15:00.000Z");
  assertAvailable(withinResult);
  assert.equal(withinResult.currentMeetingDate, meeting);
  assert.equal(withinHorizon.activeWrites(), 0,
    "the active event remains owner at the inclusive +1h boundary");

  const oldId = ecbMonetaryPolicyCanonicalEventIdV1(meeting);
  const oldMemory = memoryOf(scheduleEvent(meeting, fetchedBefore));
  const rollover = createHarness(
    availableSource([meeting, nextMeeting], unix("2027-02-04T14:16:01.000Z")),
    { active: pointer(meeting), memories: new Map([[oldId, oldMemory]]) },
  );
  const rolled = await rollover.evaluate("2027-02-04T14:16:01.000Z");
  assertAvailable(rolled);
  assert.equal(rolled.currentMeetingDate, nextMeeting);
  assert.equal(rollover.activeWrites(), 1);
  assert.equal(rollover.memory(oldId), oldMemory,
    "rollover never changes or deletes the old per-event memory");

  const missing = createHarness(availableSource(["2027-02-11"], fetchedBefore), {
    active: pointer(meeting),
  });
  assertReconciliation(
    await missing.evaluate("2027-02-02T00:00:00.000Z"),
    "active-date-missing",
  );
  assert.equal(missing.activeWrites(), 0,
    "a nearby replacement date is not guessed to be the same identity");

  const earlier = createHarness(
    availableSource(["2027-01-28", meeting], unix("2027-01-20T00:00:00.000Z")),
    { active: pointer(meeting) },
  );
  const earlierResult = await earlier.evaluate("2027-01-20T00:00:00.000Z");
  assertReconciliation(earlierResult, "new-earlier-event");
  if (earlierResult.status === "reconciliation-required") {
    assert.equal(earlierResult.conflictingMeetingDate, "2027-01-28");
  }
  assert.equal(earlier.activeWrites(), 0);

  const repeated = createHarness(availableSource([meeting], fetchedBefore));
  assertAvailable(await repeated.evaluate("2027-02-02T00:00:00.000Z"));
  const repeatedId = ecbMonetaryPolicyCanonicalEventIdV1(meeting);
  const firstVersion = repeated.memory(repeatedId)?.snapshots[0]?.eventSourceVersionId;
  repeated.setSource(availableSource([meeting], fetchedBefore + 3_600));
  assertAvailable(await repeated.evaluate("2027-02-02T02:00:00.000Z"));
  assert.equal(repeated.memory(repeatedId)?.snapshots.length, 1);
  assert.equal(repeated.memory(repeatedId)?.snapshots[0]?.eventSourceVersionId,
    firstVersion, "later fetchedAt alone creates no semantic version");

  const releaseAt = "2027-02-04T13:15:00.000Z";
  const decisionKnownAt = unix("2027-02-04T13:16:00.000Z");
  const observedEvent = decisionEvent(
    meeting,
    fetchedBefore,
    decisionKnownAt,
    releaseAt,
  );
  const observedMemory = memoryOf(observedEvent);
  const preserved = createHarness(
    availableSource([meeting], unix("2027-02-04T13:17:00.000Z")),
    { active: pointer(meeting), memories: new Map([[oldId, observedMemory]]) },
  );
  const preservedResult = await preserved.evaluate("2027-02-04T13:20:00.000Z");
  assertAvailable(preservedResult);
  assert.equal(preservedResult.intelligence.decisionEvidence.status, "observed");
  assert.deepEqual(preservedResult.intelligence.releaseTiming, {
    status: "verified",
    actualReleasedAt: releaseAt,
  });
  assert.equal(preservedResult.intelligence.rateFacts.availability, "available");
  assert.equal(preservedResult.intelligence.phase, "post-5m");
  const preservedDecision = preserved.memory(oldId)?.snapshots.at(-1)?.event.decision;
  assert.deepEqual(preservedDecision, observedEvent.decision,
    "schedule refresh preserves Decision evidence, release time, and rates exactly");
  assert.notEqual(preservedDecision, null,
    "a schedule-only refresh never regresses Decision to null");

  const unavailable = createHarness(Object.freeze({
    status: "source-unavailable",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    reason: "request-failed",
  }));
  assert.equal((await unavailable.evaluate("2027-02-02T00:00:00.000Z")).status,
    "source-unavailable");
  const malformed = createHarness(Object.freeze({
    status: "source-malformed",
    sourceUrl: ECB_GOVERNING_COUNCIL_CALENDAR_URL,
    reason: "bad document",
  }));
  assert.equal((await malformed.evaluate("2027-02-02T00:00:00.000Z")).status,
    "source-malformed");
  const invalidProvenance = createHarness(Object.freeze({
    status: "available",
    sourceUrl: "https://example.com/calendar",
    fetchedAt: fetchedBefore,
    data: Object.freeze([candidate(meeting)]),
  }));
  assert.equal((await invalidProvenance.evaluate("2027-02-02T00:00:00.000Z")).status,
    "source-malformed");

  const none = createHarness(availableSource([meeting], fetchedBefore));
  assert.equal((await none.evaluate("2027-02-04T14:15:01.000Z")).status,
    "no-relevant-event");

  const corruptActive = createHarness(availableSource([meeting], fetchedBefore), {
    activeReadStatus: "stored-pointer-invalid",
  });
  assert.deepEqual(await corruptActive.evaluate("2027-02-02T00:00:00.000Z"), {
    status: "stored-state-invalid",
    owner: "active-event",
  });
  assert.equal(corruptActive.activeWrites(), 0);

  const corruptMemory = createHarness(availableSource([meeting], fetchedBefore), {
    active: pointer(meeting),
    memoryReadStatus: "stored-memory-invalid",
  });
  assert.deepEqual(await corruptMemory.evaluate("2027-02-02T00:00:00.000Z"), {
    status: "stored-state-invalid",
    owner: "event-memory",
  });
  assert.equal(corruptMemory.memoryAdvances(), 0);

  const persistenceFailure = createHarness(availableSource([meeting], fetchedBefore), {
    activeReadStatus: "redis-failure",
  });
  assert.deepEqual(await persistenceFailure.evaluate("2027-02-02T00:00:00.000Z"), {
    status: "persistence-unavailable",
    owner: "active-event",
    reason: "redis-failure",
  });

  const scheduleOnly = scheduleEvent(meeting, fetchedBefore);
  const decisionLater = decisionEvent(
    meeting,
    fetchedBefore,
    decisionKnownAt,
    releaseAt,
  );
  const historicalMemory = memoryOf(scheduleOnly, decisionLater);
  const historical = createHarness(availableSource([meeting], fetchedBefore), {
    active: pointer(meeting),
    memories: new Map([[oldId, historicalMemory]]),
  });
  const historicalResult = await historical.evaluate("2027-02-04T13:15:30.000Z");
  assertAvailable(historicalResult);
  assert.equal(historicalResult.selectedSnapshotKnownAt, fetchedBefore);
  assert.equal(historicalResult.intelligence.decisionEvidence.status, "not-observed",
    "as-known selection does not leak a newer Decision snapshot");
  assert.equal(historicalResult.intelligence.releaseTiming.status, "unverified");
  assert.equal(historicalResult.intelligence.rateFacts.availability, "unavailable");

  const noAsKnown = createHarness(availableSource(
    [meeting],
    unix("2027-02-02T01:00:00.000Z"),
  ));
  assert.equal((await noAsKnown.evaluate("2027-02-02T00:00:00.000Z")).status,
    "insufficient-as-known-state");

  await assertPhase("2027-02-03T00:00:00.000Z", "pre-event");
  await assertPhase("2027-02-03T13:15:00.000Z", "t-24h");
  await assertPhase("2027-02-04T12:15:00.000Z", "t-1h");
  await assertPhase("2027-02-04T13:00:00.000Z", "t-15m");
  await assertPhase("2027-02-04T13:15:00.000Z", "release-time-unverified");

  const inferredNothing = createHarness(availableSource([meeting], fetchedBefore));
  const inferredNothingResult = await inferredNothing.evaluate(
    "2027-02-04T13:15:00.000Z",
  );
  assertAvailable(inferredNothingResult);
  assert.equal(inferredNothingResult.intelligence.decisionEvidence.status,
    "not-observed");
  assert.equal(inferredNothingResult.intelligence.rateFacts.availability,
    "unavailable");
  assert.equal(inferredNothing.scheduleCalls(), 1,
    "one shared schedule call serves the canonical runtime operation");
  assert.equal(inferredNothingResult.intelligence.evaluatedAt,
    "2027-02-04T13:15:00.000Z");

  const offsetEvaluation = createHarness(availableSource([meeting], fetchedBefore));
  const offsetResult = await offsetEvaluation.evaluate("2027-02-04T15:15:00+02:00");
  assertAvailable(offsetResult);
  assert.equal(offsetResult.intelligence.evaluatedAt, "2027-02-04T13:15:00.000Z",
    "one normalized evaluation instant is reused consistently");
  await assert.rejects(
    offsetEvaluation.evaluate("not-an-instant"),
    /Invalid evaluatedAt/,
  );

  const runtimeSource = readFileSync(join(process.cwd(),
    "src/lib/markets/services/ecbMonetaryPolicyEventRuntime.ts"), "utf8");
  assert.equal(runtimeSource.includes('import "server-only"'), true);
  assert.equal(runtimeSource.includes("getEcbKnownMonetaryPolicyDecision"), false);
  assert.equal(runtimeSource.includes("discoverEcbDecision"), false);
  assert.equal(runtimeSource.includes("unstable_cache"), false,
    "time-sensitive Event Intelligence has no final cache");
  assert.equal(runtimeSource.includes("Date.now"), false);

  console.log("PASS: canonical ECB monetary-policy event runtime V1");
}

async function assertPhase(
  evaluatedAt: string,
  phase: string,
): Promise<void> {
  const fetchedAt = unix("2027-02-01T00:00:00.000Z");
  const harness = createHarness(availableSource(["2027-02-04"], fetchedAt));
  const result = await harness.evaluate(evaluatedAt);
  assertAvailable(result);
  assert.equal(result.intelligence.phase, phase);
}

function assertAvailable(
  result: EcbMonetaryPolicyEventRuntimeResultV1,
): asserts result is Extract<EcbMonetaryPolicyEventRuntimeResultV1,
  { readonly status: "available" }> {
  assert.equal(result.status, "available");
}

function assertReconciliation(
  result: EcbMonetaryPolicyEventRuntimeResultV1,
  reason: string,
): void {
  assert.equal(result.status, "reconciliation-required");
  if (result.status === "reconciliation-required") {
    assert.equal(result.reason, reason);
  }
}

function unix(value: string): number {
  return Math.floor(Date.parse(value) / 1_000);
}

void main();
