import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ECB_CURRENT_DECISION_LOCAL_TIME,
  ecbMonetaryPolicyCanonicalEventIdV1,
  ecbScheduledInstantV1,
} from "../../events/ecbMonetaryPolicy";
import {
  ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1,
  ECB_MONETARY_POLICY_ACTIVE_EVENT_SCHEMA_VERSION_V1,
  createEcbMonetaryPolicyActiveEventRedisAdapterV1,
  parseEcbMonetaryPolicyActiveEventV1,
  type EcbMonetaryPolicyActiveEventV1,
} from "../../persistence/ecbMonetaryPolicyActiveEventRedis";

interface FakeOptions {
  readonly failRead?: boolean;
  readonly failCompareAndSet?: boolean;
  readonly response?: unknown;
  readonly beforeCompareAndSet?: (
    call: number,
    values: Map<string, string>,
  ) => void;
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

function genericExactStateCas(
  values: Map<string, string>,
  key: string,
  expectedRaw: string | null,
  replacementRaw: string,
): "written" | "race" {
  const current = values.get(key) ?? null;
  if (current !== expectedRaw) return "race";
  values.set(key, replacementRaw);
  return "written";
}

function fakeRedis(
  initial?: string,
  options: FakeOptions = {},
) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1, initial);
  }
  let reads = 0;
  let compareAndSets = 0;
  const adapter = createEcbMonetaryPolicyActiveEventRedisAdapterV1({
    read: async (key) => {
      reads += 1;
      if (options.failRead) throw new Error("GET failed");
      return values.get(key) ?? null;
    },
    compareAndSet: async (key, expectedRaw, replacementRaw) => {
      compareAndSets += 1;
      if (options.failCompareAndSet) throw new Error("EVAL failed");
      options.beforeCompareAndSet?.(compareAndSets, values);
      if (options.response !== undefined) return options.response;
      return genericExactStateCas(values, key, expectedRaw, replacementRaw);
    },
  });
  return {
    adapter,
    reads: () => reads,
    compareAndSets: () => compareAndSets,
    raw: () => values.get(ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1),
  };
}

async function main(): Promise<void> {
  const first = pointer("2027-02-04");
  const next = pointer("2027-03-18");

  const absent = fakeRedis();
  assert.deepEqual(await absent.adapter.read(), { status: "absent" });

  const available = fakeRedis(JSON.stringify(first));
  assert.deepEqual(await available.adapter.read(), {
    status: "available",
    pointer: first,
  });

  for (const invalid of [
    { ...first, schemaVersion: "wrong" },
    { ...first, canonicalEventId: next.canonicalEventId },
    { ...first, currentMeetingDate: "2027-02-30" },
    { ...first, scheduledAt: next.scheduledAt },
    { ...first, unexpected: true },
  ]) {
    assert.equal(parseEcbMonetaryPolicyActiveEventV1(invalid), null);
    assert.equal(
      (await fakeRedis(JSON.stringify(invalid)).adapter.read()).status,
      "stored-pointer-invalid",
    );
  }

  const corrupt = fakeRedis("not-json");
  await assert.rejects(
    corrupt.adapter.write(null, first),
    hasCode("stored-pointer-invalid"),
  );
  assert.equal(corrupt.compareAndSets(), 0);
  assert.equal(corrupt.raw(), "not-json");

  const initialize = fakeRedis();
  assert.deepEqual(await initialize.adapter.write(null, first), {
    status: "initialized",
    pointer: first,
  });
  assert.equal(initialize.reads(), 1);
  assert.equal(initialize.compareAndSets(), 1);
  assert.deepEqual(JSON.parse(initialize.raw()!), first);

  const update = fakeRedis(JSON.stringify(first));
  assert.deepEqual(await update.adapter.write(first, next), {
    status: "updated",
    pointer: next,
  });
  assert.equal(update.reads(), 1);
  assert.equal(update.compareAndSets(), 1);
  assert.deepEqual(JSON.parse(update.raw()!), next);

  const transientRace = fakeRedis(undefined, {
    response: undefined,
    beforeCompareAndSet: (call, values) => {
      if (call === 1) {
        values.set(ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1, "race");
        values.delete(ECB_MONETARY_POLICY_ACTIVE_EVENT_REDIS_KEY_V1);
      }
    },
  });
  assert.equal((await transientRace.adapter.write(null, first)).status, "initialized");
  assert.equal(transientRace.compareAndSets(), 1,
    "a no-state-change hook still permits the exact CAS");

  let raceCalls = 0;
  const raceValues = new Map<string, string>();
  const retrying = createEcbMonetaryPolicyActiveEventRedisAdapterV1({
    read: async (key) => raceValues.get(key) ?? null,
    compareAndSet: async (key, expectedRaw, replacementRaw) => {
      raceCalls += 1;
      if (raceCalls === 1) return "race";
      return genericExactStateCas(raceValues, key, expectedRaw, replacementRaw);
    },
  });
  assert.equal((await retrying.write(null, first)).status, "initialized");
  assert.equal(raceCalls, 2, "a real CAS race is retried");

  const staleWriter = fakeRedis(JSON.stringify(next));
  await assert.rejects(
    staleWriter.adapter.write(first, pointer("2027-04-29")),
    hasCode("concurrency-conflict"),
  );
  assert.equal(staleWriter.compareAndSets(), 0);
  assert.deepEqual(JSON.parse(staleWriter.raw()!), next);

  let exhaustedCalls = 0;
  const exhausted = createEcbMonetaryPolicyActiveEventRedisAdapterV1({
    read: async () => null,
    compareAndSet: async () => {
      exhaustedCalls += 1;
      return "race";
    },
  });
  await assert.rejects(
    exhausted.write(null, first),
    hasCode("concurrency-conflict"),
  );
  assert.equal(exhaustedCalls, 3);

  assert.equal((await fakeRedis(undefined, { failRead: true }).adapter.read()).status,
    "redis-failure");
  await assert.rejects(
    fakeRedis(undefined, { failRead: true }).adapter.write(null, first),
    hasCode("redis-failure"),
  );
  await assert.rejects(
    fakeRedis(undefined, { failCompareAndSet: true }).adapter.write(null, first),
    hasCode("redis-failure"),
  );
  await assert.rejects(
    fakeRedis(undefined, { response: "unexpected" }).adapter.write(null, first),
    hasCode("invalid-response"),
  );

  const invalidRequested = fakeRedis();
  await assert.rejects(
    invalidRequested.adapter.write(null, {
      ...first,
      scheduledAt: next.scheduledAt,
    }),
    hasCode("invalid-current"),
  );
  assert.equal(invalidRequested.reads(), 0);
  assert.equal(invalidRequested.compareAndSets(), 0);

  const unchanged = fakeRedis(JSON.stringify(first));
  assert.equal((await unchanged.adapter.write(null, first)).status, "unchanged");
  assert.equal(unchanged.compareAndSets(), 0);

  const source = readFileSync(join(process.cwd(),
    "src/lib/markets/persistence/ecbMonetaryPolicyActiveEventRedis.ts"), "utf8");
  assert.equal(source.includes("EXPIRE"), false);
  assert.equal(source.includes("PX"), false);
  assert.match(source, /redis\.call\("SET", key, replacement_raw\)/);
  assert.equal(genericExactStateCas.toString().includes("ECB"), false,
    "the test CAS fake has no ECB business logic");

  console.log("PASS: CAS Redis ECB active-event pointer V1");
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) =>
    typeof error === "object" && error !== null &&
    "code" in error && error.code === code;
}

void main();
