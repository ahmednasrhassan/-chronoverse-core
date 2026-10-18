import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { after, mock, test } from "node:test";
import {
  R2_APPROVAL_BOUNDS_V1, R2_APPROVAL_DRAFT_V1, R2_APPROVAL_DECISION_V1, R2_APPROVAL_LEDGER_V1,
  inspectR2ApprovalAuthorityJournalV1, prepareR2ApprovalAuthorityTransitionV1, prepareR2QualificationApprovalV1,
  type R2ApprovalAuthorizationRequestV1, type R2ApprovalCheckpointV1,
} from "../../calendar/r2QualificationApproval";
import {
  createOfflineR2ApprovalAuthorityV1, R2_APPROVAL_AUTHORITY_ACK_V1,
  type R2ApprovalAuthorityDependenciesV1, type R2ApprovalAuthorityWriteV1,
} from "../../calendar/r2QualificationApprovalAuthority";
import {
  validateR2ApprovalAuthorityJournalCASV1 as journalCAS,
  validateR2ApprovalAuthorityWitnessCASV1 as witnessCAS,
} from "../../calendar/r2QualificationApprovalAuthorityStoreValidation";
import { R2_QUALIFICATION_PLAN_V1, R2_QUALIFICATION_CEILINGS_V1,
  prepareR2CaptureArchiveQualificationV1 } from "../../calendar/r2CaptureArchiveQualification";

// All retained state and CAS commits below are volatile OFFLINE fixtures. These
// tests prove no actual provider atomicity, durability, linearizability or global
// replay prevention. Importing validators initializes no real storage.
const sockets = mock.method(Socket.prototype, "connect", () => { assert.fail("Store validation forbids sockets."); });
const fetches = mock.method(globalThis, "fetch", () => { assert.fail("Store validation forbids fetch."); });
after(() => {
  try { assert.equal(sockets.mock.callCount(), 0); assert.equal(fetches.mock.callCount(), 0); }
  finally { sockets.mock.restore(); fetches.mock.restore(); }
});
const identity = Object.freeze({ authorityId: "synthetic-store-authority", generation: "generation-1" });
const wall = Date.UTC(2026, 9, 18);
const at = Object.freeze({ generation: identity.generation, earliestMs: wall, latestMs: wall });
type Journal = ReturnType<typeof inspectR2ApprovalAuthorityJournalV1>;
type Snapshot = Journal["snapshot"];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const data = value as Record<string, unknown>;
    return "{" + Object.keys(data).sort().map(key => JSON.stringify(key) + ":" + canonical(data[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
function hash(kind: string, value: unknown) {
  return createHash("sha256").update(canonical(["chronoverse:calendar:r2-qualification-approval:v1", kind, value])).digest("hex");
}
function decision(request: R2ApprovalAuthorizationRequestV1) {
  return { schemaVersion: R2_APPROVAL_DECISION_V1, decision: "authorized", purpose: request.purpose,
    requestSha256: request.requestSha256, operatorSubjectSha256: "b".repeat(64), authorizationEvidenceSha256: "c".repeat(64) };
}
function manifest(runId: string) {
  return prepareR2CaptureArchiveQualificationV1({ schemaVersion: R2_QUALIFICATION_PLAN_V1, runId,
    target: { accountId: "a".repeat(32), jurisdiction: "default", bucket: { name: "synthetic-store-only",
      purpose: "dedicated-calendar-capture-archive", environment: "non-production" } }, limits: { ...R2_QUALIFICATION_CEILINGS_V1 } });
}
const baseManifest = manifest("store-run");
function draft(approvalId = "store-approval", runManifest = baseManifest) {
  return prepareR2QualificationApprovalV1({ schemaVersion: R2_APPROVAL_DRAFT_V1, approvalId, manifest: runManifest,
    notBefore: wall, expiresAt: wall + 120000, targetPolicyVersion: "synthetic-policy-v1" });
}
// Explicit genesis fixture only; neither validator offers an initialization API.
function genesis(): Snapshot { return { schemaVersion: R2_APPROVAL_LEDGER_V1, ...identity, events: [] }; }
function inspect(snapshot: unknown) { return inspectR2ApprovalAuthorityJournalV1(snapshot, identity.authorityId, identity.generation); }
function prepare(snapshot: Snapshot, command: unknown): R2ApprovalAuthorityWriteV1 {
  const step = prepareR2ApprovalAuthorityTransitionV1(snapshot, command, at, identity.authorityId, identity.generation, decision);
  return { expected: step.expected, checkpoint: step.checkpoint, snapshot: step.snapshot };
}
function issued() {
  const write = prepare(genesis(), { action: "issue", draft: draft() });
  const view = inspect(write.snapshot).views[0];
  const reference = { approvalIdentity: view.approval.approvalIdentity, approvalSha256: view.approval.approvalSha256 };
  return { write, snapshot: write.snapshot, reference };
}
function claimed() {
  const h = issued(); const command = { action: "claim", ...h.reference, claimId: "claim-1" };
  const write = prepare(h.snapshot, command);
  return { ...h, write, snapshot: write.snapshot, command };
}
function refusal(result: ReturnType<typeof journalCAS> | ReturnType<typeof witnessCAS>, reason?: string) {
  assert.equal(result.status, "refused"); assert.equal(result.executionAllowed, false); assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), ["executionAllowed", "reason", "scope", "status"]);
  if (reason) { assert.ok(result.status === "refused"); assert.equal(result.reason, reason); }
}
// Deliberately rehash adversarial raw histories instead of asking trusted preparation
// to create impossible transitions. Correct hashes must not bypass semantic replay.
function unsafeAppend(snapshot: Snapshot, command: unknown, sample: Snapshot["events"][number]["clock"] = at) {
  const previous = inspect(snapshot).checkpoint;
  const action = (command as { action: string }).action;
  const authorization = ["issue", "revoke", "reconcile"].includes(action)
    ? decision({ purpose: action as R2ApprovalAuthorizationRequestV1["purpose"], requestSha256: hash("command", command) }) : null;
  const body = { schemaVersion: "calendar-r2-approval-audit-v1", sequence: previous.sequence + 1,
    previousSha256: previous.headSha256, clock: sample, command, authorization };
  const event = { ...body, eventSha256: hash("audit-event", body) };
  return { expected: previous, checkpoint: { ...previous, sequence: event.sequence, headSha256: event.eventSha256 },
    snapshot: { ...snapshot, events: [...snapshot.events, event] } };
}

// A synthetic storage harness integrates both validators with the unchanged Slice 5
// driver. Validation and assignment have no intervening await in each modeled CAS.
function stores(initial: Snapshot) {
  const state: { journal: unknown; witness: unknown; lose: "journal" | "witness" | null } = {
    journal: initial, witness: inspect(initial).checkpoint, lose: null,
  };
  const calls = { journal: 0, witness: 0 };
  function ack(store: "journal" | "witness", expected: R2ApprovalCheckpointV1, checkpoint: R2ApprovalCheckpointV1) {
    return { schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store, status: "applied", expected, checkpoint };
  }
  const dependencies: R2ApprovalAuthorityDependenciesV1 = { ...identity,
    journal: {
      read: async () => state.journal,
      compareAndSwap: async request => {
        calls.journal++;
        const result = journalCAS(identity, state.journal, request);
        if (result.status === "refused") throw new Error("synthetic refusal");
        state.journal = result.snapshot;
        if (state.lose === "journal") throw new Error("synthetic lost acknowledgement");
        return ack("journal", result.expected, result.checkpoint);
      },
    },
    witness: {
      read: async () => state.witness,
      compareAndSwap: async request => {
        calls.witness++;
        const result = witnessCAS(identity, state.witness, request);
        if (result.status === "refused") throw new Error("synthetic refusal");
        state.witness = result.checkpoint;
        if (state.lose === "witness") throw new Error("synthetic lost acknowledgement");
        return ack("witness", result.expected, result.checkpoint);
      },
    },
    clock: () => at, authorize: decision, monotonicNow: () => 0, armDeadline: () => () => {},
  };
  return { state, calls, driver: () => createOfflineR2ApprovalAuthorityV1(dependencies) };
}

test("valid one-event journal append returns a deeply immutable description, without mutating inputs", () => {
  const retained = genesis(); const source = clone(issued().write);
  const request = { ...source, snapshot: { ...source.snapshot, events: [...source.snapshot.events] } }; const original = clone(request);
  const result = journalCAS(identity, retained, request);
  assert.ok(result.status === "validated"); assert.equal(result.store, "journal"); assert.equal(result.executionAllowed, false);
  assert.equal(result.checkpoint.sequence, 1); assert.equal(retained.events.length, 0); assert.deepEqual(request, original);
  assert.ok(Object.isFrozen(result.snapshot.events[0].command)); assert.ok(Object.isFrozen(result.expected));
  request.snapshot.events.length = 0; assert.equal(result.snapshot.events.length, 1);
  assert.throws(() => Object.assign(result.snapshot.events[0].clock, { latestMs: wall + 1 }), TypeError);
  const reversed = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(journalCAS(identity, retained, reversed).status, "validated");
});

for (const missing of [null, undefined]) {
  test("missing retained journal and witness never bootstrap: " + String(missing), () => {
    const request = issued().write;
    refusal(journalCAS(identity, missing, request), "missing-state");
    refusal(witnessCAS(identity, missing, { expected: request.expected, checkpoint: request.checkpoint }), "missing-state");
  });
}
for (const bad of [{}, true, "synthetic-private-error", { ...genesis(), schemaVersion: "unsupported" },
  { ...genesis(), authorityId: "other" }, { ...genesis(), generation: "other" }, { ...genesis(), events: [null] }]) {
  test("malformed retained journal refuses: " + JSON.stringify(bad), () => {
    refusal(journalCAS(identity, bad, issued().write), "corrupt-state");
  });
}
for (const change of [{ schemaVersion: "unsupported" }, { authorityId: "other" }, { generation: "other" },
  { sequence: 1 }, { headSha256: "d".repeat(64) }, { extra: "synthetic-private-value" }]) {
  test("every expected checkpoint field is checked for journal AND witness: " + Object.keys(change)[0], () => {
    const request = issued().write; const bad = { ...request.expected, ...change };
    refusal(journalCAS(identity, genesis(), { ...request, expected: bad }));
    refusal(witnessCAS(identity, request.expected, { expected: bad, checkpoint: request.checkpoint }));
  });
}
for (const field of ["schemaVersion", "authorityId", "generation", "sequence", "headSha256"]) {
  test("missing expected checkpoint field rejects: " + field, () => {
    const request = issued().write; const expected: Record<string, unknown> = { ...request.expected }; delete expected[field];
    refusal(journalCAS(identity, genesis(), { ...request, expected }));
    refusal(witnessCAS(identity, request.expected, { expected, checkpoint: request.checkpoint }));
  });
}

for (const change of [{ schemaVersion: "unsupported" }, { authorityId: "other" }, { generation: "other" }]) {
  test("candidate journal and retained witness bind schema/identity/generation: " + Object.keys(change)[0], () => {
    const request = issued().write;
    refusal(journalCAS(identity, genesis(), { ...request, snapshot: { ...request.snapshot, ...change } }));
    refusal(witnessCAS(identity, { ...request.expected, ...change }, { expected: request.expected, checkpoint: request.checkpoint }), "corrupt-state");
  });
}
test("stale writers and competing candidates cannot overwrite the winning retained head", () => {
  const current = issued().snapshot;
  const first = prepare(current, { action: "claim", ...issued().reference, claimId: "winner" });
  const other = prepare(current, { action: "claim", ...issued().reference, claimId: "loser" });
  assert.equal(journalCAS(identity, current, first).status, "validated");
  assert.equal(journalCAS(identity, current, other).status, "validated"); // No lock/commit is created by validation.
  refusal(journalCAS(identity, first.snapshot, other), "stale-writer");
  refusal(journalCAS(identity, first.snapshot, first), "stale-writer");
  refusal(witnessCAS(identity, first.checkpoint, { expected: other.expected, checkpoint: other.checkpoint }), "stale-writer");
});

test("same-sequence different-head forks and valid rewritten prefixes are refused", () => {
  const h = issued(); const other = prepare(genesis(), { action: "issue", draft: draft("different-approval") });
  const fork = prepare(other.snapshot, { action: "claim", ...inspect(other.snapshot).views.map(view => ({
    approvalIdentity: view.approval.approvalIdentity, approvalSha256: view.approval.approvalSha256 }))[0], claimId: "fork" });
  refusal(journalCAS(identity, h.snapshot, fork), "stale-writer");
  // Even replacing expected with the real retained checkpoint cannot bless a valid alternate history.
  refusal(journalCAS(identity, h.snapshot, { ...fork, expected: inspect(h.snapshot).checkpoint }), "invalid-transition");
});

test("truncation, no-op and multi-event append are never single-event CAS transitions", () => {
  const h = claimed(); const current = inspect(h.snapshot).checkpoint;
  refusal(journalCAS(identity, h.snapshot, { expected: current, checkpoint: h.write.expected, snapshot: issued().snapshot }));
  refusal(journalCAS(identity, h.snapshot, { expected: current, checkpoint: current, snapshot: h.snapshot }));
  refusal(journalCAS(identity, genesis(), { ...h.write, expected: inspect(genesis()).checkpoint }));
});

test("skipped sequence and wrong predecessor reject even after the event is rehashed", () => {
  const h = issued(); const request = prepare(h.snapshot, { action: "claim", ...h.reference, claimId: "claim" });
  for (const change of [{ sequence: 3 }, { previousSha256: "d".repeat(64) }]) {
    const { eventSha256, ...body } = request.snapshot.events[1]; void eventSha256;
    const changed = { ...body, ...change }; const event = { ...changed, eventSha256: hash("audit-event", changed) };
    refusal(journalCAS(identity, h.snapshot, { ...request, checkpoint: { ...request.checkpoint, headSha256: event.eventSha256 },
      snapshot: { ...request.snapshot, events: [request.snapshot.events[0], event] } }));
  }
});

test("duplicate approval and target/run identities reject semantically validly hashed proposals", () => {
  const h = issued();
  for (const value of [draft(), draft("another-approval"), draft("store-approval", manifest("another-run"))]) {
    refusal(journalCAS(identity, h.snapshot, unsafeAppend(h.snapshot, { action: "issue", draft: value })), "invalid-transition");
  }
});

test("consumption cannot reopen through re-claim, reset command or rewritten unused prefix", () => {
  const h = claimed();
  for (const command of [{ ...h.command, claimId: "new-claim" }, { action: "reset", ...h.reference }]) {
    refusal(journalCAS(identity, h.snapshot, unsafeAppend(h.snapshot, command)), "invalid-transition");
  }
  const reused = prepare(issued().snapshot, { ...h.command, claimId: "new-claim" });
  refusal(journalCAS(identity, h.snapshot, { ...reused, expected: inspect(h.snapshot).checkpoint }), "invalid-transition");
});

test("rehashed impossible completion and unauthenticated audit decisions reject", () => {
  const h = claimed();
  const reserved = prepare(h.snapshot, { action: "reserve", ...h.reference, claimId: "claim-1", reservationId: "pending", method: "get",
    objectKey: baseManifest.missingObjectKey });
  const command = { action: "complete", ...h.reference, claimId: "claim-1" };
  refusal(journalCAS(identity, reserved.snapshot, unsafeAppend(reserved.snapshot, command)));
  const bad = clone(issued().write);
  const body = { ...bad.snapshot.events[0], authorization: { ...bad.snapshot.events[0].authorization!, requestSha256: "d".repeat(64) } };
  const { eventSha256, ...withoutHash } = body; void eventSha256;
  const event = { ...withoutHash, eventSha256: hash("audit-event", withoutHash) };
  refusal(journalCAS(identity, genesis(), { ...bad, checkpoint: { ...bad.checkpoint, headSha256: event.eventSha256 },
    snapshot: { ...bad.snapshot, events: [event] } }));
});

for (const sample of [{ ...at, latestMs: wall + 1001 }, { ...at, earliestMs: wall - 1, latestMs: wall - 1 },
  { ...at, generation: "other" }, { ...at, earliestMs: wall + 120000, latestMs: wall + 120000 }]) {
  test("clock or expiry violation cannot enter replay: " + JSON.stringify(sample), () => {
    const h = issued(); refusal(journalCAS(identity, h.snapshot, unsafeAppend(h.snapshot,
      { action: "claim", ...h.reference, claimId: "claim" }, sample)));
  });
}

test("record ceiling rejects a ninth permanent reservation without eviction", () => {
  let snapshot = genesis();
  for (let index = 0; index < 8; index++) {
    const request = prepare(snapshot, { action: "issue", draft: draft("approval-" + index, manifest("run-" + index)) });
    const result = journalCAS(identity, snapshot, request); assert.ok(result.status === "validated"); snapshot = result.snapshot;
  }
  assert.equal(inspect(snapshot).views.length, 8);
  const ninth = unsafeAppend(snapshot, { action: "issue", draft: draft("approval-9", manifest("run-9")) });
  refusal(journalCAS(identity, snapshot, ninth)); assert.equal(inspect(snapshot).views.length, 8);
});

test("event ceiling accepts 128 and rejects event 129 with no reset", () => {
  const h = claimed(); let snapshot = h.snapshot;
  const command = { action: "stop", ...h.reference, claimId: "claim-1" };
  // Build a valid bounded prefix without repeated provider/model commits.
  while (snapshot.events.length < 127) {
    snapshot = unsafeAppend(snapshot, command).snapshot as Snapshot;
  }
  const last = unsafeAppend(snapshot, command); const result = journalCAS(identity, snapshot, last);
  assert.ok(result.status === "validated"); assert.equal(result.checkpoint.sequence, 128);
  refusal(journalCAS(identity, result.snapshot, unsafeAppend(result.snapshot, command)));
});

test("snapshot byte ceiling and existing passive-data limits reject oversized input", () => {
  assert.deepEqual(R2_APPROVAL_BOUNDS_V1, { records: 8, events: 128, bytes: 262144,
    clockUncertaintyMs: 1000, requestTimeoutMs: 1000, validityMs: 120000 });
  const large = { ...genesis(), events: Array.from({ length: 128 }, () => ({ padding: Array(3).fill("s".repeat(1024)) })) };
  assert.ok(Buffer.byteLength(canonical(large), "utf8") > 262144);
  refusal(journalCAS(identity, large, issued().write), "corrupt-state");
  refusal(journalCAS(identity, genesis(), { ...issued().write, snapshot: large }));
  refusal(journalCAS(identity, genesis(), { ...issued().write, extra: "s".repeat(2049) }));
});

test("candidate checkpoint must equal the complete replayed next journal head", () => {
  const request = issued().write;
  for (const change of [{ schemaVersion: "bad" }, { authorityId: "other" }, { generation: "other" },
    { sequence: 0 }, { headSha256: "d".repeat(64) }]) {
    refusal(journalCAS(identity, genesis(), { ...request, checkpoint: { ...request.checkpoint, ...change } }));
  }
});

test("witness validates one full-checkpoint step without authenticating unseen events", () => {
  const request = issued().write;
  const next = { ...request.checkpoint, headSha256: "e".repeat(64) };
  const result = witnessCAS(identity, request.expected, { expected: request.expected, checkpoint: next });
  assert.ok(result.status === "validated"); assert.ok(Object.isFrozen(result.checkpoint)); assert.equal(result.executionAllowed, false);
  // The witness has no journal argument, so cannot prove this arbitrary head has an event.
  refusal(journalCAS(identity, genesis(), { ...request, checkpoint: next }));
  for (const change of [{ sequence: 0 }, { sequence: 2 }, { sequence: 129 }, { sequence: -1 },
    { headSha256: "bad" }, { generation: "other" }, { authorityId: "other" }, { schemaVersion: "bad" }]) {
    refusal(witnessCAS(identity, request.expected, { expected: request.expected, checkpoint: { ...next, ...change } }));
  }
  refusal(witnessCAS(identity, request.expected, { expected: request.expected, checkpoint: next, snapshot: request.snapshot }));
  refusal(witnessCAS(identity, {}, { expected: request.expected, checkpoint: next }), "corrupt-state");
});

test("validation does not lock state or permit an unconditional write; zero rows is a refusal", () => {
  const h = issued(); const first = prepare(h.snapshot, { action: "claim", ...h.reference, claimId: "first" });
  const second = prepare(h.snapshot, { action: "revoke", ...h.reference });
  const validatedEarlier = journalCAS(identity, h.snapshot, first); assert.ok(validatedEarlier.status === "validated");
  let retained = h.snapshot;
  function conditionalCommit(request: R2ApprovalAuthorityWriteV1) {
    const result = journalCAS(identity, retained, request);
    if (result.status === "refused") return { status: "conflict", changedRows: 0 };
    retained = result.snapshot; return { status: "applied", changedRows: 1 };
  }
  assert.equal(conditionalCommit(second).status, "applied");
  assert.deepEqual(conditionalCommit(first), { status: "conflict", changedRows: 0 });
  assert.equal(inspect(retained).views[0].state, "revoked");
  assert.equal(validatedEarlier.status, "validated"); // Earlier immutable description cannot observe later state.
});

for (const store of ["journal", "witness"] as const) {
  test("lost " + store + " acknowledgement quarantines unchanged driver and cannot grant execution", async () => {
    const h = issued(); const fixture = stores(h.snapshot); fixture.state.lose = store;
    const driver = fixture.driver();
    await assert.rejects(driver.transact({ action: "claim", ...h.reference, claimId: "lost" }),
      { code: "acknowledgement-unknown" });
    await assert.rejects(driver.read(), { code: "authority-uncertain" });
    assert.equal(driver.executionAllowed, false);
    if (store === "journal") {
      const result = await fixture.driver().read(); assert.equal(result.views[0].consumed, true);
      await assert.rejects(fixture.driver().transact({ action: "claim", ...h.reference, claimId: "retry" }));
    } else {
      assert.equal(fixture.calls.journal, 0);
      await assert.rejects(fixture.driver().read(), { code: "checkpoint-mismatch" });
    }
  });
}
for (const direction of ["witness-ahead", "journal-ahead"] as const) {
  test(direction + " retained gap rejects without repair or further writes", async () => {
    const h = issued(); const next = prepare(h.snapshot, { action: "claim", ...h.reference, claimId: "gap" });
    const fixture = stores(h.snapshot);
    if (direction === "witness-ahead") fixture.state.witness = next.checkpoint;
    else fixture.state.journal = next.snapshot;
    await assert.rejects(fixture.driver().read(), { code: "checkpoint-mismatch" });
    await assert.rejects(fixture.driver().transact({ action: "claim", ...h.reference, claimId: "other" }));
    assert.deepEqual(fixture.calls, { journal: 0, witness: 0 });
  });
}

test("fresh driver restart preserves consumption and returns inspection only", async () => {
  const h = issued(); const fixture = stores(h.snapshot);
  const observed = await fixture.driver().transact({ action: "claim", ...h.reference, claimId: "retained" });
  assert.equal(observed.executionAllowed, false); assert.equal(observed.views[0].consumed, true);
  const recovered = await fixture.driver().read(); assert.equal(recovered.views[0].consumed, true); assert.ok(!("session" in recovered));
  await assert.rejects(fixture.driver().transact({ action: "claim", ...h.reference, claimId: "retained" }));
});

test("joint rollback remains undetectable without an independently protected external anchor", async () => {
  const h = issued(); const fixture = stores(h.snapshot); const oldWitness = fixture.state.witness;
  await fixture.driver().transact({ action: "claim", ...h.reference, claimId: "consumed" });
  fixture.state.journal = h.snapshot; fixture.state.witness = oldWitness; // Deliberately violates independence.
  const recovered = await fixture.driver().read(); assert.equal(recovered.views[0].consumed, false);
  assert.equal(recovered.executionAllowed, false);
  const proposed = prepare(h.snapshot, { action: "claim", ...h.reference, claimId: "after-rollback" });
  assert.equal(journalCAS(identity, fixture.state.journal, proposed).status, "validated");
  // Pure predicates cannot certify freshness of both supplied retained inputs.
});

test("malformed data refuses without running caller getters, proxies or leaking private input", () => {
  const request = issued().write; let accessed = false;
  const getter = Object.defineProperty({}, "expected", { enumerable: true, get() { accessed = true; throw new Error("synthetic-private-detail"); } });
  for (const input of [getter, new Proxy({}, { ownKeys() { accessed = true; throw new Error("synthetic-private-detail"); } }),
    { ...request, authorization: "synthetic-private-detail" }, null]) {
    const result = journalCAS(identity, genesis(), input); refusal(result);
    assert.ok(!JSON.stringify(result).includes("synthetic-private-detail"));
  }
  refusal(witnessCAS(identity, new Proxy({}, {}), { expected: request.expected, checkpoint: request.checkpoint }));
  for (const bad of [{ authorityId: "", generation: "generation-1" }, { ...identity, generation: "bad generation" }, new Proxy(identity, {})]) {
    refusal(journalCAS(bad, genesis(), request), "invalid-input");
    refusal(witnessCAS(bad, request.expected, { expected: request.expected, checkpoint: request.checkpoint }), "invalid-input");
  }
  assert.equal(accessed, false);
});

test("validators expose no persistence, authorization, initialization or live capability", () => {
  const source = readFileSync(new URL("../../calendar/r2QualificationApprovalAuthorityStoreValidation.ts", import.meta.url), "utf8");
  assert.ok(source.startsWith('import "server-only";'));
  assert.doesNotMatch(source, /process\.env|fetch\(|S3Client|@cloudflare|@upstash|Date\.now|setTimeout|randomUUID|executionAllowed: true/);
  assert.doesNotMatch(source, /as unknown as|@ts-ignore|@ts-expect-error/);
  const result = journalCAS(identity, genesis(), issued().write);
  assert.ok(result.status === "validated");
  assert.deepEqual(Object.keys(result).sort(), ["checkpoint", "executionAllowed", "expected", "scope", "snapshot", "status", "store"]);
  assert.ok(!("session" in result)); assert.ok(!("acknowledgement" in result));
});
