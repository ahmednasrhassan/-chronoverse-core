import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ecbMonetaryPolicyCanonicalEventIdV1 } from "../../events/ecbMonetaryPolicy";
import {
  ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_REDIS_KEY_V1 as KEY,
  ECB_MONETARY_POLICY_OWNERSHIP_LEDGER_SCHEMA_VERSION_V1 as VERSION,
  EcbMonetaryPolicyOwnershipLedgerPersistenceError as LedgerError,
  createEcbMonetaryPolicyOwnershipLedgerRedisAdapterV1 as createAdapter,
  type EcbMonetaryPolicyOwnershipAppendV1 as Input,
  type EcbMonetaryPolicyOwnershipLedgerErrorCode as ErrorCode,
} from "../../persistence/ecbMonetaryPolicyOwnershipLedgerRedis";

const NOW = Date.parse("2026-10-11T10:00:00.000Z");
const source = readFileSync(new URL("../../persistence/ecbMonetaryPolicyOwnershipLedgerRedis.ts", import.meta.url), "utf8");

function input(overrides: Partial<Input> = {}): Input {
  const canonicalMeetingDate = overrides.canonicalMeetingDate ?? "2026-10-29";
  return {
    transitionId: "operation-1",
    expectedHeadTransitionId: null,
    canonicalMeetingDate,
    canonicalEventId: ecbMonetaryPolicyCanonicalEventIdV1(canonicalMeetingDate),
    effectiveAt: NOW + 1_000,
    ...overrides,
  };
}
const next = () => input({ transitionId: "operation-2", expectedHeadTransitionId: "operation-1",
  canonicalMeetingDate: "2026-12-17", effectiveAt: NOW + 2_000 });

function hasCode(code: ErrorCode) {
  return (error: unknown) => error instanceof LedgerError && error.code === code;
}

/** Local command model; eval executes without yielding, like Redis scripts. */
function fakeRedis() {
  const state = {
    raw: [] as string[],
    now: NOW,
    microsecondRemainder: 0,
    reads: 0,
    evals: 0,
    writes: 0,
    failRead: false,
    failEval: false,
    loseResponse: false,
    forceResponse: undefined as unknown,
    readResponse: undefined as unknown,
    beforeEval: undefined as undefined | (() => void),
    script: "",
  };
  const transport = {
    read: async (key: string): Promise<unknown> => {
      assert.equal(key, KEY);
      state.reads += 1;
      if (state.failRead) throw new Error("read unavailable");
      return state.readResponse === undefined ? [...state.raw] : state.readResponse;
    },
    eval: async (script: string, keys: string[], args: string[]): Promise<unknown> => {
      assert.deepEqual(keys, [KEY]);
      state.script = script;
      state.evals += 1;
      if (state.failEval) throw new Error("eval unavailable");
      state.beforeEval?.();
      if (state.forceResponse !== undefined) return state.forceResponse;
      if (JSON.stringify(state.raw) !== args[0]) return ["race"];
      if (state.now + (state.microsecondRemainder === 0 ? 0 : 1) > 253_402_300_799_999) return ["invalid-time"];
      if (state.now < Number(args[3])) return ["clock-regression"];
      if (state.now + (state.microsecondRemainder === 0 ? 0 : 1) > Number(args[2])) return ["backdated-transition"];
      // Mirror the wire format, leaving existing raw entries untouched.
      const raw = args[1].slice(0, -1) + ',"recordedAt":' + state.now + '}';
      state.raw.push(raw);
      state.writes += 1;
      if (state.loseResponse) throw new Error("response lost after commit");
      return ["appended", raw];
    },
  };
  return { state, transport, adapter: createAdapter(transport) };
}

test("absent ledger stays absent; append records explicit identity, chain and distinct times", async () => {
  const { state, adapter } = fakeRedis();
  assert.deepEqual(await adapter.read(), { status: "absent" });
  assert.equal(state.evals, 0);
  const result = await adapter.append(input());
  assert.deepEqual(result, { status: "appended", transition: {
    schemaVersion: VERSION, transitionId: "operation-1", previousTransitionId: null,
    sequence: 1, fromCanonicalEventId: null, canonicalEventId: input().canonicalEventId,
    canonicalMeetingDate: "2026-10-29", effectiveAt: NOW + 1_000,
    recordedAt: NOW, recordedAtSource: "redis-time",
  } });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.transition));
  const original = state.raw[0];
  state.now += 500;
  const second = await adapter.append(next());
  assert.equal(second.transition.sequence, 2);
  assert.equal(second.transition.previousTransitionId, result.transition.transitionId);
  assert.equal(second.transition.fromCanonicalEventId, result.transition.canonicalEventId);
  assert.equal(state.raw[0], original);
  const read = await adapter.read();
  assert.equal(read.status, "available");
  if (read.status !== "available") throw new Error("Expected ledger");
  assert.ok(Object.isFrozen(read));
  assert.ok(Object.isFrozen(read.transitions));
  assert.ok(read.transitions.every(Object.isFrozen));
  assert.throws(() => { (read.transitions[0] as { recordedAt: number }).recordedAt = 0; }, TypeError);
});

test("retries preserve original recording time even after ownership moves on", async () => {
  const { state, adapter } = fakeRedis();
  const first = await adapter.append(input());
  await adapter.append(next());
  state.now = NOW + 100_000; // A retry is not a new backdated append.
  assert.deepEqual(await adapter.append(input()), { status: "unchanged", transition: first.transition });
  assert.equal(state.writes, 2);
  assert.equal(state.evals, 2);
});

test("lost response after append is recoverable without a second record", async () => {
  const { state, adapter } = fakeRedis();
  state.loseResponse = true;
  await assert.rejects(adapter.append(input()), hasCode("redis-failure"));
  assert.equal(state.raw.length, 1);
  state.loseResponse = false;
  state.now += 10_000;
  const retry = await adapter.append(input());
  assert.equal(retry.status, "unchanged");
  assert.equal(retry.transition.recordedAt, NOW);
  assert.equal(state.writes, 1);
});

test("same operation identity rejects any different intent, including predecessor", async () => {
  const { state, adapter } = fakeRedis();
  await adapter.append(input());
  for (const change of [
    { effectiveAt: NOW + 1_001 },
    { canonicalMeetingDate: "2026-12-17" },
    { expectedHeadTransitionId: "another-head" },
  ]) {
    await assert.rejects(adapter.append(input(change)), hasCode("conflicting-duplicate"));
  }
  assert.equal(state.writes, 1);
});

test("concurrent distinct operations cannot fork the expected head", async () => {
  const { state, adapter } = fakeRedis();
  const results = await Promise.allSettled([
    adapter.append(input()),
    adapter.append(input({ transitionId: "competing-operation", canonicalMeetingDate: "2026-12-17" })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failure = results.find((result) => result.status === "rejected");
  assert.ok(failure?.status === "rejected" && hasCode("concurrency-conflict")(failure.reason));
  assert.equal(state.writes, 1);
  assert.equal(state.raw.length, 1);
});

test("concurrent identical retries converge on one immutable record", async () => {
  const { state, adapter } = fakeRedis();
  const results = await Promise.all([adapter.append(input()), adapter.append(input())]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["appended", "unchanged"]);
  assert.deepEqual(results[0].transition, results[1].transition);
  assert.equal(state.writes, 1);
});

test("concurrent conflicting duplicates are rejected after the race", async () => {
  const { state, adapter } = fakeRedis();
  const results = await Promise.allSettled([
    adapter.append(input()), adapter.append(input({ effectiveAt: NOW + 1_001 })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failure = results.find((result) => result.status === "rejected");
  assert.ok(failure?.status === "rejected" && hasCode("conflicting-duplicate")(failure.reason));
  assert.equal(state.writes, 1);
});

test("stale heads, same-owner changes and non-increasing effective times fail closed", async () => {
  const { state, adapter } = fakeRedis();
  await adapter.append(input());
  await assert.rejects(adapter.append(input({ transitionId: "stale" })), hasCode("concurrency-conflict"));
  await assert.rejects(adapter.append(nextWith({ effectiveAt: NOW + 1_000 })), hasCode("invalid-transition"));
  await assert.rejects(adapter.append(nextWith({ effectiveAt: NOW + 999 })), hasCode("invalid-transition"));
  await assert.rejects(adapter.append(nextWith({
    canonicalEventId: input().canonicalEventId, canonicalMeetingDate: input().canonicalMeetingDate,
  })), hasCode("invalid-transition"));
  assert.equal(state.writes, 1);
});
function nextWith(overrides: Partial<Input>): Input { return { ...next(), ...overrides }; }

test("validation rejects forged recording provenance and malformed inputs before Redis", async () => {
  const { state, adapter } = fakeRedis();
  for (const invalid of [
    null, undefined, [], {}, { ...input(), recordedAt: NOW - 100 },
    { ...input(), recordedAtSource: "redis-time" },
    { ...input(), effectiveAt: "2026-10-11T10:00:00Z" },
    ...[NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER].map((effectiveAt) => ({ ...input(), effectiveAt })),
    { ...input(), canonicalEventId: next().canonicalEventId },
    { ...input(), canonicalMeetingDate: "2026-02-30" },
    { ...input(), canonicalMeetingDate: "2026-2-03" },
    { ...input(), transitionId: "" }, { ...input(), transitionId: "x".repeat(129) },
    { ...input(), transitionId: " operation " },
    { ...input(), expectedHeadTransitionId: "operation-1" },
    { ...input(), expectedHeadTransitionId: 1 },
    { ...input(), extra: true },
    { ...input(), [Symbol("recordedAt")]: NOW },
    Object.defineProperty({ ...input() }, "recordedAt", { value: NOW }),
    Object.defineProperty({ ...input() }, "effectiveAt", { get: () => NOW }),
    Object.assign(Object.create({ recordedAt: NOW }), input()),
  ]) {
    await assert.rejects(adapter.append(invalid as Input), hasCode("invalid-transition"));
  }
  assert.equal(state.reads, 0);
  assert.equal(state.evals, 0);
});

test("input is captured before awaits, and dependency replacement cannot change authority", async () => {
  const { state, transport } = fakeRedis();
  const adapter = createAdapter(transport);
  const mutable = { ...input() };
  const pending = adapter.append(mutable);
  mutable.effectiveAt = 0;
  transport.eval = async () => { throw new Error("replacement must not execute"); };
  const result = await pending;
  assert.equal(result.transition.effectiveAt, NOW + 1_000);
  assert.equal(state.writes, 1);
});

test("no backfill and no clock-regression timestamp fabrication", async () => {
  const { state, adapter } = fakeRedis();
  await assert.rejects(adapter.append(input({ effectiveAt: NOW - 1 })), hasCode("backdated-transition"));
  assert.equal(state.writes, 0);
  await adapter.append(input({ effectiveAt: NOW }));
  state.now = NOW - 1;
  await assert.rejects(adapter.append(next()), hasCode("clock-regression"));
  assert.equal(state.writes, 1);
});

test("Redis read/eval failures and every unexpected protocol response fail closed", async () => {
  const { state, adapter } = fakeRedis();
  state.failRead = true;
  assert.deepEqual(await adapter.read(), { status: "redis-failure" });
  await assert.rejects(adapter.append(input()), hasCode("redis-failure"));
  state.failRead = false;
  state.failEval = true;
  await assert.rejects(adapter.append(input()), hasCode("redis-failure"));
  state.failEval = false;
  for (const response of [null, true, 1, "appended", {}, [], ["unknown"],
    ["invalid-time"], ["race", "extra"], ["appended"], ["appended", "{}"],
    ["appended", null], ["appended", "{}", "extra"]]) {
    state.forceResponse = response;
    await assert.rejects(adapter.append(input()), hasCode("invalid-response"));
  }
  state.forceResponse = ["race"];
  const before = state.evals;
  await assert.rejects(adapter.append(input()), hasCode("concurrency-conflict"));
  assert.equal(state.evals - before, 3);
  assert.equal(state.writes, 0);
});

test("response must agree with exact identity, chain, effective time and trusted provenance", async () => {
  const reference = fakeRedis();
  const first = (await reference.adapter.append(input())).transition;
  for (const overrides of [
    { canonicalEventId: next().canonicalEventId, canonicalMeetingDate: next().canonicalMeetingDate },
    { transitionId: "wrong" }, { effectiveAt: first.effectiveAt + 1 },
    { recordedAt: first.effectiveAt + 1 }, { recordedAt: -1 },
    { recordedAtSource: "caller" }, { sequence: 2 }, { previousTransitionId: "wrong" },
  ]) {
    const { state, adapter } = fakeRedis();
    state.forceResponse = ["appended", JSON.stringify({ ...first, ...overrides })];
    await assert.rejects(adapter.append(input()), hasCode("invalid-response"));
    assert.equal(state.writes, 0);
  }
});

test("malformed or inconsistent stored history is never repaired or overwritten", async () => {
  const reference = fakeRedis();
  const first = (await reference.adapter.append(input())).transition;
  const second = (await reference.adapter.append(next())).transition;
  const invalidHistories: unknown[] = [
    null, undefined, {}, "[]", [first], [null], ["bad-json"], ["null"], ["[]"], ["{}"],
    ...[
      { schemaVersion: "v2" }, { recordedAtSource: "caller" }, { recordedAt: first.effectiveAt + 1 },
      { recordedAt: -1 }, { effectiveAt: 0.5 }, { transitionId: "" },
      { canonicalEventId: second.canonicalEventId }, { canonicalMeetingDate: "2026-02-30" },
      { sequence: 2 }, { previousTransitionId: "wrong" }, { fromCanonicalEventId: second.canonicalEventId },
      { unexpected: true },
    ].map((change) => [JSON.stringify({ ...first, ...change })]),
    [JSON.stringify(first), JSON.stringify(first)],
    ...[
      { effectiveAt: first.effectiveAt }, { recordedAt: first.recordedAt - 1 },
      { previousTransitionId: "wrong" }, { fromCanonicalEventId: null }, { sequence: 3 },
      { transitionId: first.transitionId },
      { canonicalEventId: first.canonicalEventId, canonicalMeetingDate: first.canonicalMeetingDate },
    ].map((change) => [JSON.stringify(first), JSON.stringify({ ...second, ...change })]),
  ];
  for (const history of invalidHistories) {
    const { state, adapter } = fakeRedis();
    // Undefined is deliberately returned too, rather than interpreted as absence.
    const transport = { read: async () => history, eval: async () => { state.evals++; } };
    const corrupt = createAdapter(transport);
    assert.deepEqual(await corrupt.read(), { status: "stored-ledger-invalid" });
    await assert.rejects(corrupt.append(next()), hasCode("stored-ledger-invalid"));
    assert.equal(state.evals, 0);
    assert.deepEqual(await adapter.read(), { status: "absent" });
  }
});

test("a corrupt entry introduced between read and append cannot be overwritten", async () => {
  const { state, adapter } = fakeRedis();
  state.beforeEval = () => { state.raw = ["corrupt"]; state.beforeEval = undefined; };
  await assert.rejects(adapter.append(input()), hasCode("stored-ledger-invalid"));
  assert.deepEqual(state.raw, ["corrupt"]);
  assert.equal(state.writes, 0);
});

test("module has no production client, caller clock, live state or integration dependencies", () => {
  const imports = [...source.matchAll(/^import .* from "([^"]+)";/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ["node:util", "../events/ecbMonetaryPolicy"]);
  assert.doesNotMatch(source, /process\.env|new Redis|Date\.now|new Date\(|historicalResolution|ActiveEventRedis|EventMemoryRedis/);
  const script = /const APPEND_SCRIPT = String.raw`([\s\S]*?)`;/m.exec(source)?.[1];
  assert.ok(script);
  assert.match(script, /redis\.call\("TIME"\)/);
  assert.match(script, /redis\.call\("RPUSH"/);
  assert.doesNotMatch(script, /"SET"|"DEL"|"EXPIRE"|"LTRIM"|"LSET"/);
});

test("proxy, revoked proxy and accessor input is rejected without executing caller code", async () => {
  const { state, adapter } = fakeRedis();
  let invoked = 0;
  const trap = () => { invoked++; throw new Error("Caller code must not run"); };
  const proxy = new Proxy(input(), { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
  const changing = new Proxy(input(), { get(target, property, receiver) {
    invoked++;
    if (property === "canonicalEventId") return "forged-owner";
    return Reflect.get(target, property, receiver);
  } });
  const revoked = Proxy.revocable(input(), {});
  revoked.revoke();
  const accessor = Object.defineProperty(input(), "canonicalEventId", { enumerable: true, get: trap });
  const nested = { ...input(), effectiveAt: new Proxy({}, { get: trap, getPrototypeOf: trap }) };
  const coercible = { ...input(), effectiveAt: { valueOf: trap, toJSON: trap } };
  for (const value of [proxy, changing, revoked.proxy, accessor, nested, coercible]) {
    await assert.rejects(adapter.append(value as Input), hasCode("invalid-transition"));
  }
  assert.equal(invoked, 0);
  assert.equal(state.reads, 0);
  assert.equal(state.evals, 0);
  assert.equal(state.writes, 0);
});

test("detached input survives synchronous mutation and retry races", async () => {
  const { state, transport } = fakeRedis();
  const mutable = input() as { -readonly [K in keyof Input]: Input[K] };
  const originalRead = transport.read;
  transport.read = async (key) => {
    mutable.canonicalEventId = "forged";
    mutable.effectiveAt = 0;
    return originalRead(key);
  };
  let raced = false;
  const originalEval = transport.eval;
  transport.eval = async (script, keys, args) => {
    if (!raced) { raced = true; return ["race"]; }
    return originalEval(script, keys, args);
  };
  const result = await createAdapter(transport).append(mutable);
  assert.equal(result.transition.canonicalEventId, input().canonicalEventId);
  assert.equal(result.transition.effectiveAt, input().effectiveAt);
  assert.equal(state.reads, 2);
  assert.equal(state.writes, 1);
});

test("null-prototype primitive input is snapshotted and accepted", async () => {
  const { adapter } = fakeRedis();
  assert.equal((await adapter.append(Object.assign(Object.create(null), input()))).status, "appended");
});

test("wire arrays reject traps, accessors, holes and unsupported shapes without evaluation", async () => {
  let invoked = 0;
  const trap = () => { invoked++; throw new Error("No transport traps"); };
  const proxy = new Proxy([], { get: (_target, property) => property === "then" ? undefined : trap(),
    getPrototypeOf: trap, ownKeys: trap });
  const revoked = Proxy.revocable([], {});
  revoked.revoke();
  const accessor = Object.defineProperty(["entry"], "0", { enumerable: true, get: trap });
  const iterator = Object.defineProperty([], Symbol.iterator, { value: trap });
  const arrays: unknown[] = [proxy, revoked.proxy, accessor, iterator, new Array(1),
    Object.assign([], { extra: "entry" }), Object.setPrototypeOf([], null)];
  for (const raw of arrays) {
    let evals = 0;
    const adapter = createAdapter({ read: async () => raw, eval: async () => { evals++; } });
    // Promise resolution itself probes .then; a revoked proxy rejects there,
    // before the adapter receives a value, and is a transport failure.
    const readCode = raw === revoked.proxy ? "redis-failure" : "stored-ledger-invalid";
    assert.deepEqual(await adapter.read(), { status: readCode });
    await assert.rejects(adapter.append(input()), hasCode(readCode));
    assert.equal(evals, 0);
    const fixture = fakeRedis();
    fixture.state.forceResponse = raw;
    await assert.rejects(fixture.adapter.append(input()),
      hasCode(raw === revoked.proxy ? "redis-failure" : "invalid-response"));
    assert.equal(fixture.state.writes, 0);
  }
  assert.equal(invoked, 0);
});

test("a shared LRANGE array cannot corrupt CAS serialization or response validation", async () => {
  const { state, adapter } = fakeRedis();
  await adapter.append(input());
  const original = state.raw[0];
  const shared = [...state.raw];
  state.readResponse = shared;
  state.beforeEval = () => { shared[0] = "corrupted after snapshot"; };
  const result = await adapter.append(next());
  assert.equal(result.status, "appended");
  assert.equal(result.transition.sequence, 2);
  assert.equal(state.raw[0], original);
  assert.equal(state.writes, 2);
});

test("canonical millisecond bounds include epoch and UTC year 9999 and reject wider Date range", async () => {
  const max = Date.parse("9999-12-31T23:59:59.999Z");
  assert.equal(max, 253_402_300_799_999);
  for (const effectiveAt of [0, max]) {
    const { state, adapter } = fakeRedis();
    state.now = effectiveAt;
    const result = await adapter.append(input({ effectiveAt }));
    assert.equal(result.transition.effectiveAt, effectiveAt);
    assert.equal(result.transition.recordedAt, effectiveAt);
    assert.equal((await adapter.read()).status, "available");
  }
  for (const effectiveAt of [-0, -1, max + 1, 8_640_000_000_000_000, NaN, Infinity, -Infinity, 0.001]) {
    const { state, adapter } = fakeRedis();
    await assert.rejects(adapter.append(input({ effectiveAt })), hasCode("invalid-transition"));
    assert.equal(state.reads, 0);
    assert.equal(state.writes, 0);
  }
});

test("stored timestamps outside canonical bounds fail closed before any write", async () => {
  const reference = fakeRedis();
  const record = (await reference.adapter.append(input())).transition;
  for (const change of [{ effectiveAt: 253_402_300_800_000 }, { recordedAt: 253_402_300_800_000 },
    { effectiveAt: -0 }, { recordedAt: -0 }]) {
    // Preserve JSON negative zero, which JSON.stringify would normalize away.
    let raw = JSON.stringify({ ...record, ...change });
    if (Object.is(change.effectiveAt, -0)) raw = raw.replace('"effectiveAt":0', '"effectiveAt":-0');
    if (Object.is(change.recordedAt, -0)) raw = raw.replace('"recordedAt":0', '"recordedAt":-0');
    const { state, adapter } = fakeRedis();
    state.raw = [raw];
    assert.deepEqual(await adapter.read(), { status: "stored-ledger-invalid" });
    await assert.rejects(adapter.append(next()), hasCode("stored-ledger-invalid"));
    assert.equal(state.evals, 0);
  }
});

test("fractional Redis milliseconds reject elapsed effective times and preserve sample buckets", async () => {
  for (const remainder of [0, 1, 456, 999]) {
    const fixture = fakeRedis();
    fixture.state.microsecondRemainder = remainder;
    if (remainder === 0) {
      assert.equal((await fixture.adapter.append(input({ effectiveAt: NOW }))).status, "appended");
    } else {
      await assert.rejects(fixture.adapter.append(input({ effectiveAt: NOW })), hasCode("backdated-transition"));
      assert.equal(fixture.state.writes, 0);
      const result = await fixture.adapter.append(input({ effectiveAt: NOW + 1 }));
      assert.equal(result.transition.recordedAt, NOW);
      assert.equal(result.transition.effectiveAt, NOW + 1);
      fixture.state.now += 10_000;
      assert.deepEqual(await fixture.adapter.append(input({ effectiveAt: NOW + 1 })),
        { status: "unchanged", transition: result.transition });
      assert.equal(fixture.state.writes, 1);
    }
  }
});

test("upper-bound submillisecond exhaustion fails without a write", async () => {
  const { state, adapter } = fakeRedis();
  state.now = 253_402_300_799_999;
  state.microsecondRemainder = 1;
  await assert.rejects(adapter.append(input({ effectiveAt: state.now })), hasCode("invalid-response"));
  assert.equal(state.writes, 0);
});


// Release gate: execute the unchanged adapter script through fakeredis EVAL,
// Redis 7 command semantics and real Lua 5.1. No network or credentials.
// Tested with temp-only fakeredis[lua]==2.40.0, lupa==2.8, redis==8.1.0.
// Set ECB_LEDGER_LUA_PYTHONPATH to that installation; a skipped test is NOT a
// completed release gate. fakeredis lacks Redis 7's replicate_commands no-op,
// supplied explicitly below. Only TIME/failure responses are controlled for
// deterministic boundaries; LRANGE, RPUSH, EVAL locking and cjson are unmodified.
test("actual Lua 5.1 EVAL: precision, year 9999, atomic races and fail-before-write", {
  skip: !process.env.ECB_LEDGER_LUA_PYTHONPATH,
}, async () => {
  const fixture = fakeRedis();
  await fixture.adapter.append(input());
  const script = fixture.state.script;
  const candidate: Record<string, unknown> = JSON.parse(fixture.state.raw[0]);
  delete candidate.recordedAt;
  assert.ok(script);
  const python = String.raw`
import json, sys, time
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
import fakeredis
from fakeredis._helpers import SimpleError
from fakeredis.commands_mixins.scripting_mixin import ScriptingCommandsMixin, LUA_VERSION

payload = json.loads(sys.stdin.read())
script, candidate = payload["script"], payload["candidate"]
server = fakeredis.FakeServer(version=(7, 0), server_type="redis")
client = fakeredis.FakeRedis(server=server, decode_responses=True)
assert LUA_VERSION == "5.1" and client.eval("return _VERSION", 0) == "Lua 5.1"
# This is exactly Redis 7's documented obsolete API behavior; not a script edit.
server._lua_runtime.execute(b"redis.replicate_commands = function() return true end")

def run(expected, effective, minimum=0, value=candidate, connection=client):
    record = json.loads(value)
    record["effectiveAt"] = effective
    return connection.eval(script, 1, "ledger", json.dumps(expected), json.dumps(record), str(effective), str(minimum))

# Exercise unchanged EVAL with the environment's unpatched TIME implementation.
before = time.time_ns() // 1000000
real = run([], before + 60000)
after = time.time_ns() // 1000000
assert real[0] == "appended"
assert before <= json.loads(real[1])["recordedAt"] <= after
assert client.lrange("ledger", 0, -1) == [real[1]]
client.delete("ledger")

state = {"time": [b"1791712800", b"123456"], "fail": None}
original_call = ScriptingCommandsMixin._lua_redis_call
def controlled_call(self, runtime, globals_, command, *args):
    if command == state["fail"]:
        raise SimpleError("ERR isolated injected command failure")
    if command == b"TIME":
        return self._convert_redis_result(runtime, state["time"])
    return original_call(self, runtime, globals_, command, *args)

def unchanged(expected):
    assert client.lrange("ledger", 0, -1) == expected

with patch.object(ScriptingCommandsMixin, "_lua_redis_call", controlled_call):
    now = 1791712800123
    # Exhaust ALL 1000 microsecond remainders at a millisecond boundary.
    for remainder in range(1000):
        state["time"] = [b"1791712800", str(123000 + remainder).encode()]
        expected = client.lrange("ledger", 0, -1)
        if remainder:
            assert run(expected, now) == ["backdated-transition"]
            unchanged(expected)
        else:
            exact = run(expected, now)
            assert exact[0] == "appended" and json.loads(exact[1])["recordedAt"] == now
            client.delete("ledger")
            expected = []
        following = run(expected, now + 1)
        assert following[0] == "appended" and json.loads(following[1])["recordedAt"] == now
        client.delete("ledger")

    # Second/day rollover and lower bound.
    for seconds, micros, floor_ms in [(0, 0, 0), (0, 1, 0), (1791763199, 999999, 1791763199999)]:
        state["time"] = [str(seconds).encode(), str(micros).encode()]
        if micros % 1000:
            assert run([], floor_ms) == ["backdated-transition"]
            unchanged([])
        success = run([], floor_ms + (1 if micros % 1000 else 0))
        assert success[0] == "appended" and json.loads(success[1])["recordedAt"] == floor_ms
        client.delete("ledger")

    maximum = 253402300799999
    state["time"] = [b"253402300799", b"999000"]
    last = run([], maximum)
    assert last[0] == "appended" and json.loads(last[1])["recordedAt"] == maximum
    client.delete("ledger")
    for micros in [999001, 999456, 999999]:
        state["time"] = [b"253402300799", str(micros).encode()]
        assert run([], maximum) == ["invalid-time"]
        unchanged([])

    for invalid in [(b"bad", b"0"), (b"-1", b"0"), (b"1", b"-1"),
                    (b"1", b"1000000"), (b"1", b"0.5"), (b"1.5", b"0"),
                    (b"253402300800", b"0"), (b"8640000000001", b"0")]:
        state["time"] = list(invalid)
        assert run([], maximum) == ["invalid-time"]
        unchanged([])

    state["time"] = [b"1791712800", b"123456"]
    first = run([], now + 1000)
    assert first[0] == "appended"
    original = first[1]
    expected = [original]
    assert run([], now + 1000) == ["race"]
    assert run(["same-length-corrupt-content"], now + 1000) == ["race"]
    assert run(expected, now + 1000, now + 1) == ["clock-regression"]
    assert run(expected, now) == ["backdated-transition"]
    unchanged(expected)
    second = run(expected, now + 2000, now)
    assert second[0] == "appended"
    expected.append(second[1])
    unchanged(expected)
    for command in [b"LRANGE", b"TIME", b"RPUSH"]:
        state["fail"] = command
        try:
            run(expected, now + 3000, now)
            raise AssertionError("Expected command error")
        except Exception as error:
            assert "isolated injected command failure" in str(error), str(error)
        unchanged(expected)
    state["fail"] = None
    try:
        client.eval(script, 1, "ledger", "invalid-json", candidate, str(now+3000), "0")
        raise AssertionError("Expected JSON error")
    except Exception as error:
        assert not isinstance(error, AssertionError)
    unchanged(expected)

    # Independent clients contend for the same exact head under EVAL's lock.
    # The script owns CAS; duplicate operation convergence belongs to TS.
    client.delete("ledger")
    for round_ in range(8):
        prior = client.lrange("ledger", 0, -1)
        barrier = Barrier(8)
        def contender(index):
            connection = fakeredis.FakeRedis(server=server, decode_responses=True)
            barrier.wait(timeout=5)
            value = json.dumps({"transitionId": str(round_) + "-" + str(index)})
            return run(prior, now + 3000 + round_, now, value, connection)
        with ThreadPoolExecutor(max_workers=8) as pool:
            outcomes = list(pool.map(contender, range(8)))
        assert sum(value[0] == "appended" for value in outcomes) == 1
        assert sum(value == ["race"] for value in outcomes) == 7
        current = client.lrange("ledger", 0, -1)
        assert current[:-1] == prior and len(current) == round_ + 1

    # WRONGTYPE fails at LRANGE, before any mutation.
    client.delete("ledger")
    client.set("ledger", "wrong-type")
    try:
        run([], now + 3000)
        raise AssertionError("Expected WRONGTYPE")
    except Exception as error:
        assert "WRONGTYPE" in str(error)
    assert client.get("ledger") == "wrong-type"

print("Actual Lua 5.1 EVAL verified: 1000 precision remainders, UTC bounds, 64 concurrent writes, exact CAS and failure atomicity; fakeredis=" + fakeredis.__version__)
`;
  const output = execFileSync("python", ["-B", "-c", python], {
    input: JSON.stringify({ script, candidate: JSON.stringify(candidate) }),
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: process.env.ECB_LEDGER_LUA_PYTHONPATH,
      PYTHONDONTWRITEBYTECODE: "1", FAKEREDIS_LUA_VERSION: "5.1" },
    timeout: 30_000,
  });
  assert.match(output, /Actual Lua 5.1 EVAL verified:/);
});
