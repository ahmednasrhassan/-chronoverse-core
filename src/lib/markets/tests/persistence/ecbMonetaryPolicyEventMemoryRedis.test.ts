import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizeEcbMonetaryPolicyEventV1,
  type EcbMonetaryPolicyEventFactV1,
} from "../../events/ecbMonetaryPolicy";
import {
  advanceEcbMonetaryPolicyEventMemoryV1,
  type EcbMonetaryPolicyEventMemoryV1,
} from "../../events/ecbMonetaryPolicyMemory";
import {
  buildEcbMonetaryPolicyEventMemoryRedisKeyV1,
  createEcbMonetaryPolicyEventMemoryRedisAdapterV1,
  EcbMonetaryPolicyEventMemoryPersistenceError,
} from "../../persistence/ecbMonetaryPolicyEventMemoryRedis";

const MEETING_DATE = "2026-09-10";
const DECISION_URL =
  "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html";
const FIRST_CAPTURE = unix("2026-09-08T10:00:00.000Z");

interface EventOptions {
  readonly canonicalMeetingDate?: string;
  readonly meetingDate?: string;
  readonly scheduledLocalTime?: string;
  readonly fetchedAt?: number;
  readonly digestCharacter?: string;
  readonly withDecision?: boolean;
}

interface FakeCasContext {
  readonly call: number;
  readonly key: string;
  readonly expectedRaw: string | null;
  readonly replacementRaw: string;
  readonly values: Map<string, string>;
}

interface FakeOptions {
  readonly failRead?: boolean;
  readonly failCompareAndSet?: boolean;
  readonly compareAndSetResponse?: unknown;
  readonly beforeCompareAndSet?: (context: FakeCasContext) => void;
}

interface MutableMemory {
  schemaVersion: string;
  canonicalEventId: string;
  snapshots: Array<{
    canonicalEventId: string;
    knownAt: number;
    eventSourceVersionId: string;
    event: {
      canonicalEventId: string;
      sourceVersionId: string;
      schedule: { sourceVersionId: string };
      decision: null | {
        documentUrl: string;
        actualReleasedAt?: string | null;
        rates?: null | { effectiveDate?: string | null };
        sourceVersionId: string;
      };
    };
  }>;
}

function event(options: EventOptions = {}): EcbMonetaryPolicyEventFactV1 {
  const meetingDate = options.meetingDate ?? MEETING_DATE;
  const fetchedAt = options.fetchedAt ?? FIRST_CAPTURE;
  return normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: options.canonicalMeetingDate ?? MEETING_DATE,
    schedule: {
      meetingDate,
      scheduledLocalTime: options.scheduledLocalTime,
      fetchedAt,
    },
    decision: options.withDecision
      ? {
          decisionDate: meetingDate,
          documentUrl: DECISION_URL,
          contentDigest: (options.digestCharacter ?? "a").repeat(64),
          fetchedAt,
          firstObservedAt: fetchedAt,
          actualReleasedAt: null,
          rates: null,
        }
      : null,
  });
}

function createFakeRedis(
  initial: ReadonlyMap<string, string> = new Map(),
  options: FakeOptions = {},
) {
  const values = new Map(initial);
  let reads = 0;
  let compareAndSets = 0;
  let writes = 0;

  const adapter = createEcbMonetaryPolicyEventMemoryRedisAdapterV1({
    read: async (key) => {
      reads += 1;
      if (options.failRead) throw new Error("Redis GET failed");
      return values.get(key) ?? null;
    },
    compareAndSet: async (key, expectedRaw, replacementRaw) => {
      compareAndSets += 1;
      if (options.failCompareAndSet) throw new Error("Redis EVAL failed");
      options.beforeCompareAndSet?.({
        call: compareAndSets,
        key,
        expectedRaw,
        replacementRaw,
        values,
      });
      if (options.compareAndSetResponse !== undefined) {
        return options.compareAndSetResponse;
      }

      const currentRaw = values.get(key);
      const matches = expectedRaw === null
        ? currentRaw === undefined
        : currentRaw === expectedRaw;
      if (!matches) return "race";

      values.set(key, replacementRaw);
      writes += 1;
      return "written";
    },
  });

  return {
    adapter,
    reads: () => reads,
    compareAndSets: () => compareAndSets,
    writes: () => writes,
    raw: (canonicalEventId: string) =>
      values.get(buildEcbMonetaryPolicyEventMemoryRedisKeyV1(canonicalEventId)),
  };
}

async function main(): Promise<void> {
  const first = event();
  const eventId = first.canonicalEventId;
  const key = buildEcbMonetaryPolicyEventMemoryRedisKeyV1(eventId);
  assert.equal(
    key,
    `chronoverse:events:ecb-monetary-policy:memory-v1:${eventId}`,
  );
  assert.throws(
    () => buildEcbMonetaryPolicyEventMemoryRedisKeyV1("not-an-ecb-event"),
    /canonical event identity/,
  );

  const absent = createFakeRedis();
  const initialized = await absent.adapter.advance(eventId, first);
  assert.equal(initialized.status, "initialized");
  assert.equal(initialized.memory.snapshots.length, 1);
  assert.equal(absent.reads(), 1);
  assert.equal(absent.compareAndSets(), 1);
  assert.equal(absent.writes(), 1);

  const firstMemory = memory(first);
  const firstRaw = JSON.stringify(firstMemory);
  const revised = event({
    scheduledLocalTime: "14:30",
    fetchedAt: FIRST_CAPTURE + 3_600,
  });

  const advancing = createFakeRedis(new Map([[key, firstRaw]]));
  const advanced = await advancing.adapter.advance(eventId, revised);
  assert.equal(advanced.status, "advanced");
  assert.equal(advanced.memory.snapshots.length, 2);
  assert.equal(advancing.reads(), 1);
  assert.equal(advancing.compareAndSets(), 1);
  assert.equal(advancing.writes(), 1);

  const revisedMemory = append(firstMemory, revised);
  const revisedRaw = JSON.stringify(revisedMemory);
  const unchangedRedis = createFakeRedis(new Map([[key, revisedRaw]]));
  const unchanged = await unchangedRedis.adapter.advance(eventId, event({
    scheduledLocalTime: "14:30",
    fetchedAt: FIRST_CAPTURE + 7_200,
  }));
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchangedRedis.reads(), 1);
  assert.equal(unchangedRedis.compareAndSets(), 0);
  assert.equal(unchangedRedis.writes(), 0);

  const staleRedis = createFakeRedis(new Map([[key, revisedRaw]]));
  const stale = await staleRedis.adapter.advance(eventId, event({
    scheduledLocalTime: "14:45",
    fetchedAt: FIRST_CAPTURE + 1_800,
  }));
  assert.equal(stale.status, "stale");
  assert.equal(staleRedis.compareAndSets(), 0);
  assert.equal(staleRedis.writes(), 0);

  const conflictRedis = createFakeRedis(new Map([[key, revisedRaw]]));
  const conflict = await conflictRedis.adapter.advance(eventId, event({
    scheduledLocalTime: "14:45",
    fetchedAt: FIRST_CAPTURE + 3_600,
  }));
  assert.equal(conflict.status, "conflict");
  assert.equal(conflictRedis.compareAndSets(), 0);
  assert.equal(conflictRedis.writes(), 0);

  const differentMeeting = event({
    canonicalMeetingDate: "2026-10-29",
    meetingDate: "2026-10-29",
    fetchedAt: FIRST_CAPTURE + 10_000,
  });
  const mismatchRedis = createFakeRedis();
  const mismatch = await mismatchRedis.adapter.advance(eventId, differentMeeting);
  assert.equal(mismatch.status, "event-id-mismatch");
  assert.equal(mismatchRedis.reads(), 1);
  assert.equal(mismatchRedis.compareAndSets(), 0);
  assert.equal(mismatchRedis.writes(), 0);

  const historyRedis = createFakeRedis();
  assert.equal((await historyRedis.adapter.advance(eventId, first)).status,
    "initialized");
  assert.equal((await historyRedis.adapter.advance(eventId, revised)).status,
    "advanced");
  const aAgain = event({ fetchedAt: FIRST_CAPTURE + 10_800 });
  const returnedToA = await historyRedis.adapter.advance(eventId, aAgain);
  assert.equal(returnedToA.status, "advanced");
  assert.deepEqual(
    returnedToA.memory.snapshots.map((snapshot) => snapshot.eventSourceVersionId),
    [first.sourceVersionId, revised.sourceVersionId, first.sourceVersionId],
  );

  await assertCorruptState(key, eventId, revised, "{malformed", "malformed JSON");

  const withDecision = memory(event({
    fetchedAt: FIRST_CAPTURE + 8_000,
    withDecision: true,
  }));
  const missingNullable = mutable(withDecision);
  delete missingNullable.snapshots[0]!.event.decision!.actualReleasedAt;
  await assertCorruptState(
    key,
    eventId,
    revised,
    JSON.stringify(missingNullable),
    "missing required nullable field",
  );

  const forgedVersions = mutable(firstMemory);
  forgedVersions.snapshots[0]!.event.sourceVersionId = "forged-event-version";
  forgedVersions.snapshots[0]!.eventSourceVersionId = "forged-event-version";
  await assertCorruptState(
    key,
    eventId,
    revised,
    JSON.stringify(forgedVersions),
    "forged sourceVersionIds",
  );

  const invalidUrl = mutable(withDecision);
  invalidUrl.snapshots[0]!.event.decision!.documentUrl =
    "https://www.ecb.europa.eu/press/pr/date/2026/../../evil.html";
  await assertCorruptState(
    key,
    eventId,
    revised,
    JSON.stringify(invalidUrl),
    "invalid normalized document URL",
  );

  const invalidChronology = mutable(revisedMemory);
  invalidChronology.snapshots.reverse();
  await assertCorruptState(
    key,
    eventId,
    revised,
    JSON.stringify(invalidChronology),
    "invalid chronology",
  );

  const readAbsent = createFakeRedis();
  assert.deepEqual(await readAbsent.adapter.read(eventId), { status: "absent" });
  assert.equal(readAbsent.reads(), 1);
  assert.equal(readAbsent.compareAndSets(), 0);

  const readAvailable = createFakeRedis(new Map([[key, revisedRaw]]));
  const available = await readAvailable.adapter.read(eventId);
  assert.equal(available.status, "available");
  assert.equal(
    available.status === "available" ? available.memory.snapshots.length : 0,
    2,
  );
  assert.equal(readAvailable.compareAndSets(), 0);

  const readCorrupt = createFakeRedis(new Map([[key, "not-json"]]));
  assert.deepEqual(await readCorrupt.adapter.read(eventId), {
    status: "stored-memory-invalid",
  });
  assert.equal(readCorrupt.compareAndSets(), 0);

  const invalidReadId = createFakeRedis();
  assert.deepEqual(await invalidReadId.adapter.read("invalid"), {
    status: "stored-memory-invalid",
  });
  assert.equal(invalidReadId.reads(), 0, "invalid identity is rejected pre-Redis");

  const invalidAdvanceId = createFakeRedis();
  await assert.rejects(
    invalidAdvanceId.adapter.advance("invalid", first),
    hasCode("invalid-current"),
  );
  assert.equal(
    invalidAdvanceId.reads(),
    0,
    "invalid advance identity is rejected pre-Redis",
  );

  const getFailure = createFakeRedis(new Map(), { failRead: true });
  await assert.rejects(
    getFailure.adapter.advance(eventId, first),
    hasCode("redis-failure"),
  );
  assert.deepEqual(await getFailure.adapter.read(eventId), {
    status: "redis-failure",
  });

  const casFailure = createFakeRedis(new Map(), {
    failCompareAndSet: true,
  });
  await assert.rejects(
    casFailure.adapter.advance(eventId, first),
    hasCode("redis-failure"),
  );

  const invalidCasResponse = createFakeRedis(new Map(), {
    compareAndSetResponse: "unexpected",
  });
  await assert.rejects(
    invalidCasResponse.adapter.advance(eventId, first),
    hasCode("invalid-response"),
  );

  const initializationRace = createFakeRedis(new Map(), {
    beforeCompareAndSet: ({ call, key: raceKey, values }) => {
      if (call === 1) values.set(raceKey, firstRaw);
    },
  });
  const initializationRaceResult = await initializationRace.adapter.advance(
    eventId,
    first,
  );
  assert.equal(initializationRaceResult.status, "unchanged");
  assert.equal(initializationRace.reads(), 2);
  assert.equal(initializationRace.compareAndSets(), 1);
  assert.equal(initializationRace.writes(), 0);

  const newest = event({
    scheduledLocalTime: "14:45",
    fetchedAt: FIRST_CAPTURE + 20_000,
  });
  const newestRaw = JSON.stringify(append(firstMemory, newest));
  const advanceRace = createFakeRedis(new Map([[key, firstRaw]]), {
    beforeCompareAndSet: ({ call, key: raceKey, values }) => {
      if (call === 1) values.set(raceKey, newestRaw);
    },
  });
  const advanceRaceResult = await advanceRace.adapter.advance(eventId, revised);
  assert.equal(advanceRaceResult.status, "stale");
  assert.equal(advanceRace.reads(), 2);
  assert.equal(advanceRace.compareAndSets(), 1);
  assert.equal(advanceRace.writes(), 0);
  assert.equal(advanceRace.raw(eventId), newestRaw);

  const intermediateEvents = [
    event({ scheduledLocalTime: "14:20", fetchedAt: FIRST_CAPTURE + 1_000 }),
    event({ scheduledLocalTime: "14:25", fetchedAt: FIRST_CAPTURE + 2_000 }),
    event({ scheduledLocalTime: "14:35", fetchedAt: FIRST_CAPTURE + 3_000 }),
  ];
  let intermediateMemory = firstMemory;
  const racingRaw: string[] = [];
  for (const intermediate of intermediateEvents) {
    intermediateMemory = append(intermediateMemory, intermediate);
    racingRaw.push(JSON.stringify(intermediateMemory));
  }
  const repeatedRace = createFakeRedis(new Map([[key, firstRaw]]), {
    beforeCompareAndSet: ({ call, key: raceKey, values }) => {
      values.set(raceKey, racingRaw[call - 1]!);
    },
  });
  await assert.rejects(
    repeatedRace.adapter.advance(eventId, event({
      scheduledLocalTime: "15:00",
      fetchedAt: FIRST_CAPTURE + 50_000,
    })),
    hasCode("concurrency-conflict"),
  );
  assert.equal(repeatedRace.reads(), 3);
  assert.equal(repeatedRace.compareAndSets(), 3);
  assert.equal(repeatedRace.writes(), 0);

  const corruptAfterRace = createFakeRedis(new Map([[key, firstRaw]]), {
    beforeCompareAndSet: ({ call, key: raceKey, values }) => {
      if (call === 1) values.set(raceKey, "{corrupt-after-race");
    },
  });
  await assert.rejects(
    corruptAfterRace.adapter.advance(eventId, revised),
    hasCode("stored-memory-invalid"),
  );
  assert.equal(corruptAfterRace.reads(), 2);
  assert.equal(corruptAfterRace.compareAndSets(), 1);
  assert.equal(corruptAfterRace.writes(), 0);

  const invalidCurrent = { ...first, canonicalEventId: "" } as
    EcbMonetaryPolicyEventFactV1;
  await assert.rejects(
    createFakeRedis().adapter.advance(eventId, invalidCurrent),
    hasCode("invalid-current"),
  );

  assertMinimalCasScript();
  console.log("PASS: CAS Redis ECB event-memory adapter V1");
}

async function assertCorruptState(
  key: string,
  eventId: string,
  candidate: EcbMonetaryPolicyEventFactV1,
  corruptRaw: string,
  label: string,
): Promise<void> {
  const fake = createFakeRedis(new Map([[key, corruptRaw]]));
  await assert.rejects(
    fake.adapter.advance(eventId, candidate),
    hasCode("stored-memory-invalid"),
    label,
  );
  assert.equal(fake.compareAndSets(), 0, `${label}: no CAS attempted`);
  assert.equal(fake.writes(), 0, `${label}: no write`);
  assert.equal(fake.raw(eventId), corruptRaw, `${label}: raw history preserved`);
}

function memory(
  initialEvent: EcbMonetaryPolicyEventFactV1,
): EcbMonetaryPolicyEventMemoryV1 {
  const result = advanceEcbMonetaryPolicyEventMemoryV1(null, initialEvent);
  assert.equal(result.status, "initialized");
  return result.memory;
}

function append(
  current: EcbMonetaryPolicyEventMemoryV1,
  nextEvent: EcbMonetaryPolicyEventFactV1,
): EcbMonetaryPolicyEventMemoryV1 {
  const result = advanceEcbMonetaryPolicyEventMemoryV1(current, nextEvent);
  assert.equal(result.status, "advanced");
  return result.memory;
}

function mutable(value: EcbMonetaryPolicyEventMemoryV1): MutableMemory {
  return JSON.parse(JSON.stringify(value)) as MutableMemory;
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof EcbMonetaryPolicyEventMemoryPersistenceError &&
    error.code === code;
}

function assertMinimalCasScript(): void {
  const source = readFileSync(join(
    process.cwd(),
    "src/lib/markets/persistence/ecbMonetaryPolicyEventMemoryRedis.ts",
  ), "utf8");
  const script = /const ECB_EVENT_MEMORY_CAS_SCRIPT = String\.raw`([\s\S]*?)`;/.exec(
    source,
  )?.[1];
  assert.notEqual(script, undefined, "CAS Lua script is present");
  assert.match(script!, /redis\.call\("GET", key\)/);
  assert.match(script!, /current_raw ~= expected_raw/);
  assert.match(script!, /redis\.call\("SET", key, replacement_raw\)/);
  assert.match(script!, /return "written"/);
  assert.match(script!, /return "race"/);
  assert.doesNotMatch(
    script!,
    /cjson|knownAt|sourceVersionId|decision|rates|documentUrl|schemaVersion|EXPIRE/i,
  );
}

function unix(value: string): number {
  return Math.floor(Date.parse(value) / 1_000);
}

void main();
