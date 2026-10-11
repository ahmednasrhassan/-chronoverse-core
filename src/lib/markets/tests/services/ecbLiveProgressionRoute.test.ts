import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { test } from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import { NodeNextRequest } from "next/dist/server/base-http/node";
import { NextRequestAdapter } from "next/dist/server/web/spec-extension/adapters/next-request";
import { autoImplementMethods } from "next/dist/server/route-modules/app-route/helpers/auto-implement-methods";
import * as facts from "../../events/ecbMonetaryPolicy";
import * as intelligence from "../../events/ecbMonetaryPolicyIntelligence";
import * as memory from "../../events/ecbMonetaryPolicyMemory";
import * as activeRedis from "../../persistence/ecbMonetaryPolicyActiveEventRedis";
import * as memoryRedis from "../../persistence/ecbMonetaryPolicyEventMemoryRedis";
import * as parser from "../../providers/ecb/monetaryPolicy/parser";
import type * as liveRuntime from "../../services/ecbMonetaryPolicyEventRuntime";
import type * as historicalResolution from "../../services/ecbMonetaryPolicyHistoricalResolution";
import type * as liveRoute from "../../../../app/api/cron/ecb-live-progression/route";
import type { FiveProductCanonicalProjectionInputV1 } from "../../projections/types";

const SECRET = "local-test-secret-not-a-deployment-secret";
const ROUTE_URL = "https://chronoversecapital.com/api/cron/ecb-live-progression";
const E = "2027-02-02T10:00:00.000Z";
const SOURCE_URL = facts.ECB_GOVERNING_COUNCIL_CALENDAR_URL;
const routeSource = readFileSync(new URL("../../../../app/api/cron/ecb-live-progression/route.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../../services/ecbMonetaryPolicyEventRuntime.ts", import.meta.url), "utf8");

// Execute actual production source with isolated framework/transport boundaries.
// Real Redis adapters retain their validation/CAS behavior over an in-memory store.
function compile<T>(source: string, requireDependency: (name: string) => unknown,
  globals: Readonly<Record<string, unknown>> = {}): T {
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const box = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), compiled)(
    requireDependency, box, box.exports, ...Object.values(globals),
  );
  return box.exports as T;
}

function fixture(secret: string | undefined = SECRET) {
  let now = E;
  const store = new Map<string, string>();
  const calls = { runtime: 0, schedule: 0, pointerReads: 0, pointerWrites: 0, memoryReads: 0, memoryAdvances: 0 };
  const argumentsSeen: unknown[][] = [];
  const capturedResults: liveRuntime.EcbMonetaryPolicyEventRuntimeResultV1[] = [];
  const persistence = {
    read: async (key: string) => store.get(key) ?? null,
    compareAndSet: async (key: string, expected: string | null, replacement: string) => {
      if ((store.get(key) ?? null) !== expected) return "race";
      store.set(key, replacement);
      return "written";
    },
  };
  const active = activeRedis.createEcbMonetaryPolicyActiveEventRedisAdapterV1(persistence);
  const events = memoryRedis.createEcbMonetaryPolicyEventMemoryRedisAdapterV1(persistence);
  class LiveDate extends Date {
    constructor(value: string | number = now) { super(value); }
  }
  const modules: Record<string, unknown> = {
    "server-only": {},
    "../events/ecbMonetaryPolicy": facts,
    "../events/ecbMonetaryPolicyIntelligence": intelligence,
    "../events/ecbMonetaryPolicyMemory": memory,
    "../providers/ecb/monetaryPolicy/parser": parser,
    "../providers/ecb/monetaryPolicy/cache": { getEcbMonetaryPolicyScheduleSourceV1: async () => {
      calls.schedule++;
      return { status: "available", sourceUrl: SOURCE_URL, fetchedAt: Date.parse("2027-02-01T00:00:00Z") / 1_000,
        data: ["2027-02-04", "2027-03-18"].map(meetingDate => ({ sourceInstitution: "ECB", sourceUrl: SOURCE_URL, meetingDate })) };
    } },
    "../persistence/ecbMonetaryPolicyActiveEventRedis": { ...activeRedis,
      readEcbMonetaryPolicyActiveEventRedisV1: async () => { calls.pointerReads++; return active.read(); },
      writeEcbMonetaryPolicyActiveEventRedisV1: async (...args: Parameters<typeof active.write>) => {
        calls.pointerWrites++; return active.write(...args);
      },
    },
    "../persistence/ecbMonetaryPolicyEventMemoryRedis": { ...memoryRedis,
      readEcbMonetaryPolicyEventMemoryV1: async (...args: Parameters<typeof events.read>) => {
        calls.memoryReads++; return events.read(...args);
      },
      advanceEcbMonetaryPolicyEventMemoryRedisV1: async (...args: Parameters<typeof events.advance>) => {
        calls.memoryAdvances++; return events.advance(...args);
      },
    },
  };
  const actualRuntime = compile<typeof liveRuntime>(runtimeSource, name => {
    assert.ok(Object.hasOwn(modules, name), "Unexpected runtime dependency: " + name);
    return modules[name];
  }, { Date: LiveDate });
  const run = async (...args: Parameters<typeof actualRuntime.getEcbMonetaryPolicyEventRuntimeV1>) => {
    calls.runtime++;
    argumentsSeen.push(args);
    const result = await actualRuntime.getEcbMonetaryPolicyEventRuntimeV1(...args);
    capturedResults.push(result);
    return result;
  };
  function routeWith(execute = run) {
    return compile<typeof liveRoute>(routeSource, name => {
      if (name === "server-only") return {};
      if (name === "node:crypto") return crypto;
      assert.equal(name, "@/lib/markets/services/ecbMonetaryPolicyEventRuntime");
      return { getEcbMonetaryPolicyEventRuntimeV1: execute };
    }, { process: { env: { CRON_SECRET: secret } } });
  }
  return { route: routeWith(), routeWith, calls, argumentsSeen, capturedResults, store,
    setNow: (value: string) => { now = value; } };
}

function request(authorization: string | undefined = `Bearer ${SECRET}`, suffix = "", method = "GET") {
  return new NextRequest(ROUTE_URL + suffix, { method, headers: authorization === undefined ? {} : { authorization } });
}

// Use the installed production adapter over a real IncomingMessage. The socket
// is never connected; deliberately invalid framing can reach the adapter without
// Node's HTTP parser rejecting it first. No request body property is overridden.
function adaptedNodeGet(headers: Readonly<Record<string, string | string[] | undefined>> = {}, body = "") {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = "GET";
  incoming.url = ROUTE_URL;
  incoming.headers = { authorization: `Bearer ${SECRET}`, ...headers };
  if (body !== "") incoming.push(Buffer.from(body));
  incoming.push(null);
  try {
    return NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming), new AbortController().signal);
  } finally {
    incoming.destroy();
  }
}

const noCalls = { runtime: 0, schedule: 0, pointerReads: 0, pointerWrites: 0, memoryReads: 0, memoryAdvances: 0 };

test("the actual production GET invokes the default live runtime once and initializes/rolls over via existing CAS adapters", async () => {
  const observed = fixture();
  assert.equal(observed.route.runtime, "nodejs");
  assert.equal(observed.route.dynamic, "force-dynamic");
  const first = await observed.route.GET(request());
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.deepEqual(await first.json(), { status: "available" });
  assert.deepEqual(observed.calls, { runtime: 1, schedule: 1, pointerReads: 1, pointerWrites: 1, memoryReads: 1, memoryAdvances: 1 });
  assert.deepEqual(observed.argumentsSeen, [[]], "caller supplies neither event identity nor evaluation time");
  const firstResult = observed.capturedResults[0];
  assert.equal(firstResult.status, "available");
  if (firstResult.status !== "available") assert.fail("Expected initialized event.");
  assert.equal(firstResult.canonicalMeetingDate, "2027-02-04");
  const oldKey = memoryRedis.buildEcbMonetaryPolicyEventMemoryRedisKeyV1(firstResult.canonicalEventId);
  const oldMemory = observed.store.get(oldKey);
  assert.notEqual(oldMemory, undefined);
  observed.setNow("2027-02-04T14:16:01.000Z");
  const next = await observed.route.GET(request());
  assert.equal(next.status, 200);
  assert.deepEqual(observed.calls, { runtime: 2, schedule: 2, pointerReads: 2, pointerWrites: 2, memoryReads: 2, memoryAdvances: 2 });
  assert.deepEqual(observed.argumentsSeen, [[], []]);
  const nextResult = observed.capturedResults[1];
  assert.equal(nextResult.status, "available");
  if (nextResult.status !== "available") assert.fail("Expected rolled event.");
  assert.equal(nextResult.canonicalMeetingDate, "2027-03-18");
  assert.equal(observed.store.get(oldKey), oldMemory, "rollover retains prior event memory");
});

test("duplicate concurrent invocations converge through existing CAS without duplicate event memory", async () => {
  const observed = fixture();
  const responses = await Promise.all([observed.route.GET(request()), observed.route.GET(request())]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "available" });
  }
  assert.equal(observed.calls.runtime, 2, "one call per accepted HTTP execution, including duplicate deliveries");
  assert.deepEqual(observed.argumentsSeen, [[], []]);
  assert.equal(observed.store.size, 2, "one active pointer and one per-event memory");
  const stored = [...observed.store];
  const repeated = await observed.route.GET(request());
  assert.equal(repeated.status, 200);
  assert.equal(observed.calls.runtime, 3);
  assert.deepEqual([...observed.store], stored, "reprocessing unchanged evidence cannot append a duplicate snapshot");
});
test("missing configuration and unauthorized or parameterized requests perform no acquisition or persistence", async () => {
  const unconfigured = fixture("");
  assert.equal((await unconfigured.route.GET(request())).status, 503);
  assert.deepEqual(unconfigured.calls, noCalls);
  const observed = fixture();
  for (const authorization of [undefined, "", "Bearer incorrect", `Basic ${SECRET}`, `bearer ${SECRET}`, `Bearer ${SECRET.slice(0, -1)}x`]) {
    const req = authorization === undefined ? new NextRequest(ROUTE_URL) : request(authorization);
    assert.equal((await observed.route.GET(req)).status, 401);
  }
  for (const suffix of ["?evaluatedAt=2020-01-01T00:00:00Z", "?eventId=ECB:2027-03-18", "?unknown=1"]) {
    const response = await observed.route.GET(request(`Bearer ${SECRET}`, suffix));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { status: "invalid-request" });
  }
  const bodyRequest = request();
  Object.defineProperty(bodyRequest, "body", { value: new ReadableStream() });
  assert.equal((await observed.route.GET(bodyRequest)).status, 400);
  assert.deepEqual(observed.calls, noCalls);
  assert.equal(observed.store.size, 0);
});

test("actual Next Node adaptation preserves rejected GET framing even though it discards the body", async () => {
  const observed = fixture();
  const rejected: readonly Readonly<Record<string, string | string[]>>[] = [
    { "content-length": "2" },
    { "transfer-encoding": "chunked" },
    { "transfer-encoding": "" },
    { "transfer-encoding": "identity" },
    { "transfer-encoding": "gzip, chunked" },
    { "content-length": "0", "transfer-encoding": "chunked" },
    ...["", "-1", "-0", "+0", "1", "01", "0.0", "0e0", "0x0", "zero", "0 0",
      "0, 0", "0, 2", "2, 0", "999999999999999999999999999999999999"].map(value => ({ "content-length": value })),
    { "content-length": ["0", "0"] },
    { "content-length": ["0", "2"] },
  ];
  for (const framing of rejected) {
    const req = adaptedNodeGet(framing, "{}");
    assert.equal(req.body, null, "the installed adapter discards GET bodies before route execution");
    const response = await observed.route.GET(req);
    assert.equal(response.status, 400, JSON.stringify(framing));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "invalid-request" });
    assert.deepEqual(observed.calls, noCalls, "rejected framing must precede every live operation");
    assert.equal(observed.store.size, 0);
  }
});

test("actual Next Node bodyless GET with absent or valid zero length invokes progression exactly once", async () => {
  const accepted = [{}, { "content-length": "0" }, { "content-length": "00" },
    { "content-length": "000" }, { "content-length": " 0 " }];
  for (const framing of accepted) {
    const observed = fixture();
    const before = { ...observed.calls };
    const req = adaptedNodeGet(framing);
    assert.equal(req.body, null);
    const response = await observed.route.GET(req);
    assert.equal(response.status, 200, JSON.stringify(framing));
    assert.deepEqual(await response.json(), { status: "available" });
    for (const operation of Object.keys(noCalls) as (keyof typeof noCalls)[]) {
      assert.equal(observed.calls[operation], before[operation] + 1, operation);
    }
    assert.deepEqual(observed.argumentsSeen, [[]]);
  }
});

test("authentication precedes framing validation through the actual Next Node adapter", async () => {
  const observed = fixture();
  const unauthorized = await observed.route.GET(adaptedNodeGet({
    authorization: "Bearer incorrect", "content-length": "2", "transfer-encoding": "chunked",
  }, "{}"));
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { status: "unauthorized" });
  assert.deepEqual(observed.calls, noCalls);
  const unconfigured = fixture("");
  assert.equal((await unconfigured.route.GET(adaptedNodeGet({ "content-length": "2" }, "{}"))).status, 503);
  assert.deepEqual(unconfigured.calls, noCalls);
});

test("Next method dispatch cannot progress events through HEAD, POST or OPTIONS", async () => {
  const observed = fixture();
  const methods = autoImplementMethods(observed.route);
  for (const [method, status] of [["HEAD", 405], ["POST", 405], ["OPTIONS", 204]] as const) {
    const response = await methods[method](request(`Bearer ${SECRET}`, "", method), {});
    assert.ok(response instanceof Response);
    assert.equal(response.status, status);
  }
  assert.deepEqual(observed.calls, noCalls);
  assert.equal(observed.store.size, 0);
});

test("typed outcomes and conflicts remain distinct while unsafe fields and thrown errors never escape", async () => {
  const variants = [
    [{ status: "available", intelligence: { secret: SECRET }, canonicalEventId: SECRET }, 200, { status: "available" }],
    [{ status: "no-relevant-event", sourceUrl: SECRET, fetchedAt: 1 }, 200, { status: "no-relevant-event" }],
    [{ status: "insufficient-as-known-state", canonicalEventId: SECRET, evaluatedAt: E }, 200, { status: "insufficient-as-known-state" }],
    [{ status: "source-unavailable", sourceUrl: SECRET, reason: SECRET }, 503, { status: "source-unavailable" }],
    [{ status: "source-malformed", sourceUrl: SECRET, reason: SECRET }, 502, { status: "source-malformed" }],
    [{ status: "reconciliation-required", reason: "active-date-missing", canonicalEventId: SECRET }, 409, { status: "reconciliation-required", reason: "active-date-missing" }],
    [{ status: "stored-state-invalid", owner: "active-event" }, 409, { status: "stored-state-invalid", owner: "active-event" }],
    ...["concurrency-conflict", "event-memory-conflict", "redis-failure", SECRET].map(reason => [
      { status: "persistence-unavailable", owner: "event-memory", reason },
      reason.endsWith("conflict") ? 409 : 503,
      { status: "persistence-unavailable", owner: "event-memory", reason: reason === SECRET ? "unexpected-error" : reason },
    ]),
  ];
  const observed = fixture();
  for (const [result, status, body] of variants) {
    let count = 0;
    const route = observed.routeWith(async (...args) => {
      count++;
      assert.deepEqual(args, []);
      return result as unknown as liveRuntime.EcbMonetaryPolicyEventRuntimeResultV1;
    });
    const response = await route.GET(request());
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), body);
    assert.equal(text.includes(SECRET), false);
    assert.equal(count, 1);
  }
  let count = 0;
  const failing = observed.routeWith(async () => { count++; throw new Error(SECRET); });
  const response = await failing.GET(request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { status: "runtime-unavailable", reason: "unexpected-runtime-error" });
  assert.equal(count, 1, "unexpected failure is not retried by the route");
});

test("historical VIP event resolution remains independent before and after live production-route rollover", async () => {
  const observed = fixture();
  const forbidden: string[] = [];
  const deny = (name: string): never => { forbidden.push(name); throw new Error("Forbidden historical dependency: " + name); };
  const clock = compile(readFileSync(new URL("../../events/eventClock.ts", import.meta.url), "utf8"), deny);
  const history = compile<typeof historicalResolution>(readFileSync(new URL("../../services/ecbMonetaryPolicyHistoricalResolution.ts", import.meta.url), "utf8"),
    name => name === "../events/eventClock" ? clock : deny(name));
  const input = { productId: "eurusd", canonical: { availability: "available", engineResult: { evaluatedAt: E } } } as unknown as FiveProductCanonicalProjectionInputV1;
  const before = await history.resolveVipEcbPolicyEventForCanonicalV1(input);
  assert.deepEqual(observed.calls, noCalls);
  await observed.route.GET(request());
  observed.setNow("2027-02-04T14:16:01.000Z");
  await observed.route.GET(request());
  const callsBeforeHistory = { ...observed.calls };
  const storageBeforeHistory = [...observed.store];
  const after = await history.resolveVipEcbPolicyEventForCanonicalV1(input);
  assert.deepEqual(before, { status: "historical-ownership-unavailable", reason: "ownership-not-recorded", evaluatedAt: E });
  assert.deepEqual(after, before);
  assert.deepEqual(forbidden, [], "direct historical dependencies cannot hide live route or persistence access");
  assert.deepEqual(observed.calls, callsBeforeHistory);
  assert.deepEqual([...observed.store], storageBeforeHistory);
});
