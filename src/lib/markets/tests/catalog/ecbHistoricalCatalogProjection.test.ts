import assert from "node:assert/strict";
import test from "node:test";
import {
  projectEcbHistoricalCatalogCandidateV1,
} from "../../catalog/ecbHistoricalCatalogProjection";
import {
  buildEcbMonetaryPolicyEventSnapshotV1,
} from "../../events/ecbMonetaryPolicyMemory";
import {
  normalizeEcbMonetaryPolicyEventV1,
} from "../../events/ecbMonetaryPolicy";

const capturedAt = Math.floor(
  Date.parse("2026-09-10T12:20:00.000Z") / 1_000,
);

const event = normalizeEcbMonetaryPolicyEventV1({
  canonicalMeetingDate: "2026-09-10",
  schedule: {
    meetingDate: "2026-09-10",
    scheduledLocalTime: "14:15",
    fetchedAt: capturedAt,
  },
  decision: null,
});

const snapshot = buildEcbMonetaryPolicyEventSnapshotV1(event);

const projected = projectEcbHistoricalCatalogCandidateV1(snapshot);

assert.equal(projected.status, "candidate");
assert.equal(projected.canonicalEventId, snapshot.canonicalEventId);
assert.equal(projected.eventSourceVersionId, snapshot.eventSourceVersionId);
assert.equal(projected.knownAt, capturedAt);
assert.equal(projected.scheduleFetchedAt, capturedAt);
assert.equal(projected.decisionFetchedAt, null);
assert.equal(projected.firstObservedAt, null);
assert.equal(projected.actualReleasedAt, null);
assert.equal(projected.ownershipVerified, false);
assert.equal(projected.objectVerified, false);
assert.equal(Object.isFrozen(projected), true);

assert.deepEqual(
  projectEcbHistoricalCatalogCandidateV1(snapshot),
  projected,
  "identical input produces an identical projection",
);

assert.throws(
  () => projectEcbHistoricalCatalogCandidateV1({
    ...snapshot,
    knownAt: snapshot.knownAt - 1,
  }),
  /Invalid ECB historical catalog candidate/,
);

assert.throws(
  () => projectEcbHistoricalCatalogCandidateV1({
    ...snapshot,
    canonicalEventId: "ecb-invalid-event",
  }),
  /Invalid ECB historical catalog candidate/,
);

assert.throws(
  () => projectEcbHistoricalCatalogCandidateV1({
    ...snapshot,
    eventSourceVersionId: "forged-version",
  }),
  /Invalid ECB historical catalog candidate/,
);

assert.throws(
  () => projectEcbHistoricalCatalogCandidateV1({
    ...snapshot,
    event: {
      ...snapshot.event,
      schedule: {
        ...snapshot.event.schedule,
        fetchedAt: snapshot.knownAt + 1,
      },
    },
  }),
  /Invalid ECB historical catalog candidate/,
);

const mutableInput = structuredClone(snapshot);
const stableProjection =
  projectEcbHistoricalCatalogCandidateV1(mutableInput);

Object.assign(mutableInput.event.schedule, { fetchedAt: capturedAt + 3_600 });

assert.equal(stableProjection.knownAt, capturedAt);
assert.equal(stableProjection.scheduleFetchedAt, capturedAt);

console.log("ECB historical catalog projection: PASS");

function rejectsCandidate(input: unknown): void {
  assert.throws(
    () => projectEcbHistoricalCatalogCandidateV1(input),
    (error: unknown) => error instanceof TypeError &&
      error.message === "Invalid ECB historical catalog candidate.",
  );
}

function decisionSnapshot(scheduleFetchedAt = capturedAt) {
  return buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: "2026-09-10",
    schedule: {
      meetingDate: "2026-09-10",
      scheduledLocalTime: "14:15",
      fetchedAt: scheduleFetchedAt,
    },
    decision: {
      decisionDate: "2026-09-10",
      documentUrl: "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~314e508016.en.html",
      contentDigest: "a".repeat(64),
      fetchedAt: capturedAt + 600,
      firstObservedAt: capturedAt - 180,
      actualReleasedAt: "2026-09-10T12:16:00.000Z",
      rates: {
        depositFacility: 2,
        mainRefinancingOperations: 2.15,
        marginalLendingFacility: 2.4,
        effectiveDate: "2026-09-16",
      },
    },
  }));
}

test("rejects accessors at every depth without executing or leaking them", () => {
  for (const target of ["root", "event", "schedule", "rates"] as const) {
    const input = structuredClone(decisionSnapshot());
    const record = target === "root" ? input : target === "event" ? input.event :
      target === "schedule" ? input.event.schedule : input.event.decision!.rates!;
    const key = target === "root" ? "knownAt" : target === "event" ? "canonicalEventId" :
      target === "schedule" ? "fetchedAt" : "depositFacility";
    let calls = 0;
    Object.defineProperty(record, key, {
      enumerable: true,
      get() {
        calls += 1;
        Object.assign(input, { accessorExecuted: true });
        throw "synthetic-caller-secret";
      },
    });
    rejectsCandidate(input);
    assert.equal(calls, 0);
    assert.equal(Object.hasOwn(input, "accessorExecuted"), false);
  }
  const input = structuredClone(snapshot);
  let calls = 0;
  Object.defineProperty(input, "knownAt", {
    enumerable: true,
    get() { calls += 1; return capturedAt; },
  });
  rejectsCandidate(input);
  assert.equal(calls, 0, "even an accessor returning a valid value is not data");
});

test("rejects changing and revoked Proxies before any traps execute", () => {
  for (const target of ["root", "event", "schedule", "decision", "rates"] as const) {
    const input = structuredClone(decisionSnapshot());
    const record = target === "root" ? input : target === "event" ? input.event :
      target === "schedule" ? input.event.schedule : target === "decision" ?
        input.event.decision! : input.event.decision!.rates!;
    let calls = 0;
    const hostile = () => { calls += 1; throw "synthetic-proxy-secret"; };
    const proxy = new Proxy(record, {
      get: hostile,
      ownKeys: hostile,
      getOwnPropertyDescriptor: hostile,
      getPrototypeOf: hostile,
    });
    if (target === "root") rejectsCandidate(proxy);
    else {
      if (target === "event") Object.assign(input, { event: proxy });
      if (target === "schedule") Object.assign(input.event, { schedule: proxy });
      if (target === "decision") Object.assign(input.event, { decision: proxy });
      if (target === "rates") Object.assign(input.event.decision!, { rates: proxy });
      rejectsCandidate(input);
    }
    assert.equal(calls, 0);
  }
  const revoked = Proxy.revocable(snapshot, {});
  revoked.revoke();
  rejectsCandidate(revoked.proxy);
});

test("rejects malformed roots, executable values and required-field cycles", () => {
  for (const input of [null, undefined, true, 1, "snapshot", [], [snapshot],
    Symbol("snapshot"), () => snapshot, new Date(), new Map(), new Uint8Array(4)]) {
    rejectsCandidate(input);
  }
  const input = structuredClone(snapshot);
  Object.assign(input, { event: input });
  rejectsCandidate(input);
  rejectsCandidate({ ...snapshot, extra: () => "untrusted" });
});

test("owns aliased and cyclic data without treating metadata as ECB evidence", () => {
  const input = structuredClone(snapshot);
  const metadata: Record<string, unknown> = { value: [1, 2] };
  metadata.self = metadata;
  Object.assign(input, { metadata, alias: metadata });
  const result = projectEcbHistoricalCatalogCandidateV1(input);
  assert.deepEqual(result, projected);
  (metadata.value as number[]).push(3);
  Object.assign(input.event.schedule, { fetchedAt: -1 });
  assert.deepEqual(result, projected);
  assert.equal(Object.isFrozen(metadata), false, "caller data must remain unmodified");
});

test("null prototypes are data; inherited accessors and own accessors are rejected safely", () => {
  const input = structuredClone(snapshot);
  Object.setPrototypeOf(input, null);
  Object.setPrototypeOf(input.event, null);
  Object.setPrototypeOf(input.event.schedule, null);
  Object.defineProperty(input, "__proto__", { value: { polluted: true }, enumerable: true });
  assert.deepEqual(projectEcbHistoricalCatalogCandidateV1(input), projected);
  let calls = 0;
  const inherited = Object.create({
    get canonicalEventId() { calls += 1; throw "synthetic-inherited-secret"; },
  });
  rejectsCandidate(inherited);
  const hidden = structuredClone(snapshot);
  Object.defineProperty(hidden, Symbol.toStringTag, {
    get() { calls += 1; return "Object"; },
  });
  rejectsCandidate(hidden);
  assert.equal(calls, 0);
});

test("the existing parser rejects forged identity, versions and malformed ECB times", () => {
  const mutations = [
    (input: typeof snapshot) => Object.assign(input, { schemaVersion: "forged" }),
    (input: typeof snapshot) => Object.assign(input.event, { canonicalEventId: "forged" }),
    (input: typeof snapshot) => Object.assign(input.event, { canonicalMeetingDate: "2026-02-30" }),
    (input: typeof snapshot) => Object.assign(input.event.schedule, { scheduledAt: "invalid" }),
    (input: typeof snapshot) => Object.assign(input.event.schedule, { sourceVersionId: "forged" }),
    (input: typeof snapshot) => {
      Object.assign(input, { eventSourceVersionId: "forged" });
      Object.assign(input.event, { sourceVersionId: "forged" });
    },
  ];
  for (const mutate of mutations) {
    const input = structuredClone(snapshot);
    mutate(input);
    rejectsCandidate(input);
  }
  for (const fetchedAt of [-1, NaN, Infinity, 1.5, "not-a-timestamp"]) {
    const input = structuredClone(snapshot);
    Object.assign(input.event.schedule, { fetchedAt });
    rejectsCandidate(input);
  }
});

test("knowledge comes only from parser capture chronology, never release or observation", () => {
  for (const input of [decisionSnapshot(), decisionSnapshot(capturedAt + 900)]) {
    const result = projectEcbHistoricalCatalogCandidateV1(input);
    assert.equal(result.knownAt, input.knownAt);
    assert.equal(result.scheduleFetchedAt, input.event.schedule.fetchedAt);
    assert.equal(result.decisionFetchedAt, input.event.decision!.fetchedAt);
    assert.equal(result.firstObservedAt, input.event.decision!.firstObservedAt);
    assert.equal(result.actualReleasedAt, input.event.decision!.actualReleasedAt);
    for (const knownAt of [input.event.decision!.firstObservedAt,
      Date.parse(input.event.decision!.actualReleasedAt!) / 1_000,
      Date.parse(input.event.schedule.scheduledAt) / 1_000]) {
      rejectsCandidate({ ...input, knownAt });
    }
  }
  const input = structuredClone(decisionSnapshot());
  Object.assign(input.event.decision!, { firstObservedAt: input.knownAt + 1 });
  rejectsCandidate(input);
  Object.assign(input.event.decision!, {
    firstObservedAt: capturedAt,
    actualReleasedAt: new Date(input.knownAt * 1_000 + 1).toISOString(),
  });
  rejectsCandidate(input);
});

test("nested mutations cannot change the frozen scalar candidate or verification flags", () => {
  const input = structuredClone(decisionSnapshot());
  const result = projectEcbHistoricalCatalogCandidateV1(input);
  const expected = { ...result };
  Object.assign(input.event.schedule, { fetchedAt: -1 });
  Object.assign(input.event.decision!, { fetchedAt: -1, firstObservedAt: -1, actualReleasedAt: null });
  Object.assign(input.event.decision!.rates!, { depositFacility: NaN });
  assert.deepEqual(result, expected);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Reflect.set(result, "ownershipVerified", true), false);
  assert.equal(Reflect.set(result, "objectVerified", true), false);
  assert.equal(result.status, "candidate");
  assert.equal(result.ownershipVerified, false);
  assert.equal(result.objectVerified, false);
  assert.ok(Object.values(result).every(value => value === null || typeof value !== "object"));
});
