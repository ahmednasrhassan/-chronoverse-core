import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { after, mock, test } from "node:test";
import {
  R2_APPROVAL_BOUNDS_V1, R2_APPROVAL_DRAFT_V1, R2_APPROVAL_DECISION_V1,
  createOfflineR2ApprovalLedgerV1, createOfflineR2ApprovalWitnessV1, prepareR2QualificationApprovalV1,
  inspectR2ApprovalAuthorityJournalV1, type R2ApprovalAuthorizationRequestV1, type R2ApprovalCheckpointV1,
} from "../../calendar/r2QualificationApproval";
import {
  R2_APPROVAL_AUTHORITY_ACK_V1, R2ApprovalAuthorityErrorV1, createOfflineR2ApprovalAuthorityV1,
  type R2ApprovalAuthorityDependenciesV1, type R2ApprovalAuthorityWriteV1,
} from "../../calendar/r2QualificationApprovalAuthority";
import {
  R2_QUALIFICATION_PLAN_V1, R2_QUALIFICATION_CEILINGS_V1, R2_QUALIFICATION_APPROVAL_V1,
  prepareR2CaptureArchiveQualificationV1, executeR2CaptureArchiveQualificationV1,
} from "../../calendar/r2CaptureArchiveQualification";
import { prepareCalendarCaptureV1 } from "../../calendar/capturePersistence";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { captureFixtureV1 } from "./capturePersistenceFixtures";

// Volatile mocked stores demonstrate contract conformance ONLY. They establish no
// real provider atomicity, durability, recovery safety or globally safe replay prevention.
const sockets = mock.method(Socket.prototype, "connect", () => { assert.fail("Offline authority tests forbid sockets."); });
const fetches = mock.method(globalThis, "fetch", () => { assert.fail("Offline authority tests forbid network fetch."); });
after(() => {
  try { assert.equal(sockets.mock.callCount(), 0); assert.equal(fetches.mock.callCount(), 0); }
  finally { sockets.mock.restore(); fetches.mock.restore(); }
});
const wall = Date.UTC(2026, 9, 18);
let serial = 0;
type Hook = () => void | Promise<void>;
type Checkpoint = R2ApprovalCheckpointV1;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function same(a: Checkpoint, b: Checkpoint) {
  return a.schemaVersion === b.schemaVersion && a.authorityId === b.authorityId && a.generation === b.generation &&
    a.sequence === b.sequence && a.headSha256 === b.headSha256;
}
function ack(store: "journal" | "witness", expected: Checkpoint, checkpoint: Checkpoint | null) {
  return { schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store, status: checkpoint ? "applied" : "conflict", expected, checkpoint };
}
function decision(request: R2ApprovalAuthorizationRequestV1) {
  return { schemaVersion: R2_APPROVAL_DECISION_V1, decision: "authorized", purpose: request.purpose,
    requestSha256: request.requestSha256, operatorSubjectSha256: "b".repeat(64), authorizationEvidenceSha256: "c".repeat(64) };
}
function draft(limits: { readonly [K in keyof typeof R2_QUALIFICATION_CEILINGS_V1]: number } = { ...R2_QUALIFICATION_CEILINGS_V1 }) {
  return prepareR2QualificationApprovalV1({ schemaVersion: R2_APPROVAL_DRAFT_V1, approvalId: "approval-" + serial++,
    manifest: prepareR2CaptureArchiveQualificationV1({ schemaVersion: R2_QUALIFICATION_PLAN_V1, runId: "run-" + serial++,
      target: { accountId: "a".repeat(32), jurisdiction: "default", bucket: { name: "synthetic-authority-only",
        purpose: "dedicated-calendar-capture-archive", environment: "non-production" } }, limits }),
    notBefore: wall, expiresAt: wall + 120000, targetPolicyVersion: "synthetic-policy-v1" });
}
function code(expected: R2ApprovalAuthorityErrorV1["code"]) {
  return (error: unknown) => error instanceof R2ApprovalAuthorityErrorV1 && error.code === expected &&
    error.message === "Offline approval authority unavailable." && !("cause" in error);
}
async function setup() {
  const authorityId = "authority-" + serial++; const generation = "generation-1";
  // Explicit TEST bootstrap outside the new driver. The driver has no create/reset path.
  const initialWitness = createOfflineR2ApprovalWitnessV1(authorityId, generation);
  const initial = createOfflineR2ApprovalLedgerV1({ authorityId, generation, witness: initialWitness,
    clock: () => ({ generation, earliestMs: wall, latestMs: wall }), authorize: decision });
  const state: {
    journal: unknown; witness: unknown; earliestMs: number; latestMs: number; elapsed: number; clockGeneration: string;
    authorize: (request: R2ApprovalAuthorizationRequestV1) => unknown;
    beforeJournalRead: Hook; afterJournalRead: Hook; beforeWitnessRead: Hook;
    beforeJournalWrite: Hook; afterJournalWrite: Hook; beforeWitnessWrite: Hook; afterWitnessWrite: Hook;
    omitJournalEvent: boolean; journalAck: (value: unknown) => unknown; witnessAck: (value: unknown) => unknown;
  } = {
    journal: await initial.read(), witness: initialWitness.read(), earliestMs: wall, latestMs: wall, elapsed: 0, clockGeneration: generation,
    authorize: decision, beforeJournalRead: () => {}, afterJournalRead: () => {}, beforeWitnessRead: () => {},
    beforeJournalWrite: () => {}, afterJournalWrite: () => {}, beforeWitnessWrite: () => {}, afterWitnessWrite: () => {},
    omitJournalEvent: false, journalAck: value => value, witnessAck: value => value,
  };
  const calls = { journalRead: 0, journalWrite: 0, witnessRead: 0, witnessWrite: 0 };
  const signals: AbortSignal[] = [];
  const timers: { callback: () => void; cancelled: boolean }[] = [];
  const journal: R2ApprovalAuthorityDependenciesV1["journal"] = {
    read: async identity => {
      calls.journalRead++; assert.equal(identity.authorityId, authorityId);
      await state.beforeJournalRead(); const value = state.journal; await state.afterJournalRead(); return value;
    },
    compareAndSwap: async (request, signal) => {
      calls.journalWrite++; signals.push(signal); await state.beforeJournalWrite();
      const current = inspectR2ApprovalAuthorityJournalV1(state.journal, authorityId, generation);
      if (!same(current.checkpoint, request.expected)) return ack("journal", request.expected, null);
      const next = inspectR2ApprovalAuthorityJournalV1(request.snapshot, authorityId, generation);
      assert.equal(next.checkpoint.sequence, current.checkpoint.sequence + 1);
      assert.ok(same(next.checkpoint, request.checkpoint));
      assert.deepEqual(next.snapshot.events.slice(0, -1), current.snapshot.events);
      // No await inside this modeled CAS commit. One state contains ALL projections.
      state.journal = state.omitJournalEvent ? { ...next.snapshot, events: next.snapshot.events.slice(0, -1) } : next.snapshot;
      await state.afterJournalWrite(); return state.journalAck(ack("journal", request.expected, request.checkpoint));
    },
  };
  const witness: R2ApprovalAuthorityDependenciesV1["witness"] = {
    read: async () => { calls.witnessRead++; await state.beforeWitnessRead(); return state.witness; },
    compareAndSwap: async (request, signal) => {
      calls.witnessWrite++; signals.push(signal); await state.beforeWitnessWrite();
      // The retained test witness is supplied independently of the journal.
      if (!assertCheckpoint(state.witness, request.expected)) return ack("witness", request.expected, null);
      assert.equal(request.checkpoint.sequence, request.expected.sequence + 1);
      state.witness = request.checkpoint;
      await state.afterWitnessWrite(); return state.witnessAck(ack("witness", request.expected, request.checkpoint));
    },
  };
  function assertCheckpoint(value: unknown, expected: Checkpoint) {
    return JSON.stringify(value) === JSON.stringify(expected);
  }
  const dependencies: R2ApprovalAuthorityDependenciesV1 = { authorityId, generation, journal, witness,
    clock: () => ({ generation: state.clockGeneration, earliestMs: state.earliestMs, latestMs: state.latestMs }),
    authorize: request => state.authorize(request), monotonicNow: () => state.elapsed,
    armDeadline: (callback, ms) => {
      assert.equal(ms, 1000); const timer = { callback, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; };
    } };
  const driver = (overrides: Partial<R2ApprovalAuthorityDependenciesV1> = {}) => createOfflineR2ApprovalAuthorityV1({ ...dependencies, ...overrides });
  return { authorityId, generation, state, calls, signals, timers, journal, witness, dependencies, driver };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function issue(h: Fixture, value = draft()) {
  const result = await h.driver().transact({ action: "issue", draft: value });
  const approval = result.views.find(view => view.approval.draft.approvalId === value.approvalId)?.approval;
  assert.ok(approval); return approval;
}
function reference(approval: Awaited<ReturnType<typeof issue>>) {
  return { approvalIdentity: approval.approvalIdentity, approvalSha256: approval.approvalSha256 };
}
async function claim(h: Fixture, approval: Awaited<ReturnType<typeof issue>>, claimId = "claim-1") {
  return h.driver().transact({ action: "claim", ...reference(approval), claimId });
}

test("construction is inactive; reads inspect explicit retained state and expose no authorization", async () => {
  const h = await setup(); const driver = h.driver(); assert.deepEqual(h.calls, { journalRead: 0, journalWrite: 0, witnessRead: 0, witnessWrite: 0 });
  const read = await driver.read(); assert.deepEqual(read.views, []); assert.equal(read.executionAllowed, false);
  assert.equal(driver.executionAllowed, false); assert.ok(!("session" in read)); assert.ok(!("claim" in driver));
  assert.ok(h.timers.every(timer => timer.cancelled));
});
test("journal consumption, identity/run reservation and audit are one indivisible state", async () => {
  const h = await setup(); const input = draft(); const approval = await issue(h, input);
  const result = await claim(h, approval); assert.equal(result.status, "observed"); assert.equal(result.executionAllowed, false);
  assert.ok(!("session" in result)); assert.equal(result.views[0].consumed, true); assert.equal(result.checkpoint.sequence, 2);
  const state = inspectR2ApprovalAuthorityJournalV1(h.state.journal, h.authorityId, h.generation);
  assert.deepEqual(state.checkpoint, h.state.witness); assert.equal(state.snapshot.events[1].command.action, "claim");
  await assert.rejects(claim(h, approval), code("transition-rejected"));
  await assert.rejects(issue(h, input), code("transition-rejected"));
  await assert.rejects(issue(h, { ...input, approvalId: "another-approval" }), code("transition-rejected"));
});
test("independent authority drivers racing through shared modeled CAS have at most one observed claim", async () => {
  const h = await setup(); const approval = await issue(h);
  const results = await Promise.allSettled([claim(h, approval, "claim-a"), claim(h, approval, "claim-b")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const read = await h.driver().read(); assert.equal(read.views[0].consumed, true); assert.equal(read.checkpoint.sequence, 2);
  assert.equal(h.calls.journalWrite, 2); // One issuance, one consumption.
});
test("claim versus revocation races serialize without reopening consumption", async () => {
  for (const revokeFirst of [false, true]) {
    const h = await setup(); const approval = await issue(h);
    const commands = [
      { action: "claim", ...reference(approval), claimId: "racing-claim" },
      { action: "revoke", ...reference(approval) },
    ];
    if (revokeFirst) commands.reverse();
    const results = await Promise.allSettled(commands.map(command => h.driver().transact(command)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const read = await h.driver().read(); assert.ok(["revoked", "claimed"].includes(read.views[0].state));
    await assert.rejects(claim(h, approval), code("transition-rejected"));
  }
});
test("an explicitly revoked approval rejects fresh reservations and retains pending uncertainty", async () => {
  const h = await setup(); const approval = await issue(h); await claim(h, approval);
  const driver = h.driver(); const base = { ...reference(approval), claimId: "claim-1" };
  await driver.transact({ action: "reserve", ...base, reservationId: "pending", method: "put", objectKey: approval.draft.manifest.fixtures[0].objectKey });
  await driver.transact({ action: "revoke", ...reference(approval) });
  await assert.rejects(driver.transact({ action: "reserve", ...base, reservationId: "new", method: "get", objectKey: approval.draft.manifest.missingObjectKey }), code("transition-rejected"));
  const read = await driver.read(); assert.equal(read.views[0].consumed, true); assert.equal(read.views[0].reservations[0].outcome, "pending");
});
test("stale checkpoint CAS rejects the writer, and generation/authority mismatches never rotate state", async () => {
  const h = await setup(); const approval = await issue(h); const before = h.state.journal;
  h.state.witnessAck = () => ack("witness", inspectR2ApprovalAuthorityJournalV1(before, h.authorityId, h.generation).checkpoint, null);
  const driver = h.driver(); await assert.rejects(driver.transact({ action: "claim", ...reference(approval), claimId: "stale" }), code("stale-writer"));
  await assert.rejects(driver.read(), code("authority-uncertain")); assert.equal(h.state.journal, before);
  await assert.rejects(h.driver({ generation: "generation-2" }).read(), code("corrupt-history"));
  await assert.rejects(h.driver({ authorityId: "different-authority", journal: { ...h.journal, read: async () => before } }).read(), code("corrupt-history"));
});
test("the journal contract compares the complete predecessor, not merely sequence", async () => {
  const h = await setup(); await issue(h);
  const state = inspectR2ApprovalAuthorityJournalV1(h.state.journal, h.authorityId, h.generation);
  for (const changed of [{ authorityId: "other" }, { generation: "other" }, { sequence: 0 }, { headSha256: "e".repeat(64) }]) {
    const write: R2ApprovalAuthorityWriteV1 = { expected: { ...state.checkpoint, ...changed }, checkpoint: state.checkpoint, snapshot: state.snapshot };
    const result = await h.journal.compareAndSwap(write, new AbortController().signal);
    assert.deepEqual(result, ack("journal", write.expected, null));
  }
});
test("restart with retained stores preserves consumption and reads never reconstruct sessions", async () => {
  const h = await setup(); const approval = await issue(h); await claim(h, approval);
  const restarted = h.driver(); const read = await restarted.read(); assert.equal(read.views[0].consumed, true);
  assert.ok(!("session" in read)); await assert.rejects(restarted.transact({ action: "claim", ...reference(approval), claimId: "claim-1" }), code("transition-rejected"));
});
test("missing state cannot bootstrap/reset an authority, including with a retained genesis witness", async () => {
  const h = await setup(); h.state.journal = null;
  await assert.rejects(h.driver().read(), code("missing-state"));
  await assert.rejects(h.driver().transact({ action: "issue", draft: draft() }), code("missing-state"));
  assert.equal(h.calls.journalWrite, 0); assert.equal(h.calls.witnessWrite, 0);
});
test("rollback, missing suffix, corrupted audit and unsupported history fail against the retained witness", async () => {
  const h = await setup(); const approval = await issue(h); const prefix = h.state.journal; await claim(h, approval);
  const full = inspectR2ApprovalAuthorityJournalV1(h.state.journal, h.authorityId, h.generation).snapshot;
  for (const bad of [prefix, { ...full, events: [] }, { ...full, events: [...full.events].reverse() },
    { ...full, events: full.events.map(event => ({ ...event, eventSha256: "e".repeat(64) })) },
    { ...full, schemaVersion: "unsupported" }, {}, undefined]) {
    h.state.journal = bad; await assert.rejects(h.driver().read());
  }
  h.state.journal = full; h.state.witness = null;
  await assert.rejects(h.driver().read(), code("checkpoint-unavailable"));
});
test("checkpoint corruption and unavailability prevent mutation before any publication", async () => {
  const h = await setup(); const approval = await issue(h); const witness = h.state.witness;
  for (const value of [null, {}, { ...inspectR2ApprovalAuthorityJournalV1(h.state.journal, h.authorityId, h.generation).checkpoint, headSha256: "f".repeat(64) }]) {
    h.state.witness = value; const writes = h.calls.witnessWrite;
    await assert.rejects(claim(h, approval)); assert.equal(h.calls.witnessWrite, writes);
  }
  h.state.witness = witness; h.state.beforeWitnessRead = () => { throw new Error("synthetic-private-detail"); };
  await assert.rejects(claim(h, approval), code("checkpoint-unavailable"));
});
test("failure before checkpoint commit leaves both stores unchanged and grants nothing", async () => {
  const h = await setup(); const approval = await issue(h); const journal = h.state.journal; const witness = h.state.witness;
  h.state.beforeWitnessWrite = () => { throw new Error("synthetic-private-detail"); };
  const driver = h.driver();
  await assert.rejects(driver.transact({ action: "claim", ...reference(approval), claimId: "lost" }), code("acknowledgement-unknown"));
  assert.equal(h.state.journal, journal); assert.equal(h.state.witness, witness);
  await assert.rejects(driver.read(), code("authority-uncertain"));
});
test("lost checkpoint acknowledgement retains the advanced witness and quarantines the restore gap", async () => {
  const h = await setup(); const approval = await issue(h); const journal = h.state.journal;
  h.state.afterWitnessWrite = () => { throw new Error("synthetic-private-detail"); };
  await assert.rejects(claim(h, approval), code("acknowledgement-unknown")); assert.equal(h.state.journal, journal);
  await assert.rejects(h.driver().read(), code("checkpoint-mismatch"));
});
test("failure after witness publication cannot fall back to the old journal or retry it", async () => {
  const h = await setup(); const approval = await issue(h);
  h.state.beforeJournalWrite = () => { throw new Error("synthetic-private-detail"); };
  const before = h.calls.journalWrite; await assert.rejects(claim(h, approval), code("acknowledgement-unknown"));
  assert.equal(h.calls.journalWrite, before + 1); await assert.rejects(h.driver().read(), code("checkpoint-mismatch"));
});
test("lost journal acknowledgement retains consumed state but supplies no recovered authorization", async () => {
  const h = await setup(); const approval = await issue(h);
  h.state.afterJournalWrite = () => { throw new Error("synthetic-private-detail"); };
  await assert.rejects(claim(h, approval), code("acknowledgement-unknown"));
  const read = await h.driver().read(); assert.equal(read.views[0].consumed, true); assert.ok(!("session" in read));
  await assert.rejects(claim(h, approval), code("transition-rejected"));
});
for (const action of ["issue", "claim"] as const) {
  test("an applied reply with omitted indivisible " + action + " event is detected, never accepted", async () => {
    const h = await setup(); const approval = action === "claim" ? await issue(h) : null;
    h.state.omitJournalEvent = true;
    const command = approval ? { action: "claim", ...reference(approval), claimId: "partial" } : { action: "issue", draft: draft() };
    await assert.rejects(h.driver().transact(command), code("checkpoint-mismatch"));
    await assert.rejects(h.driver().read(), code("checkpoint-mismatch"));
  });
}
for (const store of ["witness", "journal"] as const) {
  test("malformed " + store + " acknowledgements remain ambiguous and never disclose raw input", async () => {
    for (const reply of [null, true, { status: "applied", secret: "synthetic-private-detail" }]) {
      const h = await setup(); const approval = await issue(h);
      if (store === "journal") h.state.journalAck = () => reply; else h.state.witnessAck = () => reply;
      await assert.rejects(claim(h, approval), code("acknowledgement-unknown"));
    }
  });
}
test("a stalled read times out, is aborted and cannot resume into publication after late completion", async () => {
  const h = await setup(); const gate = deferred(); h.state.beforeJournalRead = () => gate.promise;
  const pending = h.driver().transact({ action: "issue", draft: draft() }); await tick();
  h.timers.at(-1)!.callback(); await assert.rejects(pending, code("deadline"));
  gate.resolve(); await tick(); assert.equal(h.calls.witnessRead, 0); assert.equal(h.calls.witnessWrite, 0);
});
for (const store of ["witness", "journal"] as const) {
  test("late " + store + " commit after timeout cannot revive an observation or trigger another write", async () => {
    const h = await setup(); const approval = await issue(h); const gate = deferred(); let entered = false;
    const hook = () => { entered = true; return gate.promise; };
    if (store === "witness") h.state.beforeWitnessWrite = hook; else h.state.beforeJournalWrite = hook;
    const driver = h.driver(); const pending = driver.transact({ action: "claim", ...reference(approval), claimId: "late" }); await tick();
    assert.equal(entered, true); const writes = h.calls.journalWrite;
    h.timers.at(-1)!.callback(); await assert.rejects(pending, code("deadline"));
    assert.equal(h.signals.at(-1)!.aborted, true); gate.resolve(); await tick();
    assert.equal(h.calls.journalWrite, writes); await assert.rejects(driver.read(), code("authority-uncertain"));
    if (store === "witness") await assert.rejects(h.driver().read(), code("checkpoint-mismatch"));
    else assert.equal((await h.driver().read()).views[0].consumed, true);
  });
}
test("delayed timer dispatch cannot extend the shared elapsed deadline across storage calls", async () => {
  const h = await setup(); const approval = await issue(h); const writes = h.calls.journalWrite;
  h.state.afterWitnessWrite = () => { h.state.elapsed = 1000; };
  await assert.rejects(claim(h, approval), code("deadline")); assert.equal(h.calls.journalWrite, writes);
});
test("synchronously expired deadline prevents any storage dispatch", async () => {
  const h = await setup(); const driver = h.driver({ armDeadline: callback => { callback(); return () => {}; } });
  await assert.rejects(driver.read(), code("deadline")); assert.equal(h.calls.journalRead, 0);
});
for (const stage of ["load", "witness", "journal", "readback"] as const) {
  test("approval expiry during asynchronous " + stage + " never returns a stale observation", async () => {
    const h = await setup(); const approval = await issue(h); const writes = h.calls.journalWrite;
    const expire = () => { h.state.earliestMs = approval.draft.expiresAt; h.state.latestMs = approval.draft.expiresAt; };
    if (stage === "load") h.state.afterJournalRead = expire;
    if (stage === "witness") h.state.afterWitnessWrite = expire;
    if (stage === "journal") h.state.afterJournalWrite = expire;
    if (stage === "readback") { let reads = 0; h.state.afterJournalRead = () => { if (++reads === 2) expire(); }; }
    await assert.rejects(claim(h, approval), code("transition-rejected"));
    assert.equal(h.calls.journalWrite, writes + (stage === "journal" || stage === "readback" ? 1 : 0));
    if (stage === "journal" || stage === "readback") assert.equal((await h.driver().read()).views[0].consumed, true);
    if (stage === "witness") await assert.rejects(h.driver().read(), code("checkpoint-mismatch"));
  });
}
test("clock regression, excessive uncertainty, generation mismatch and invalid elapsed clocks fail closed", async () => {
  for (const mode of ["regression", "uncertainty", "generation", "elapsed"] as const) {
    const h = await setup(); const approval = await issue(h);
    if (mode === "regression") h.state.earliestMs = h.state.latestMs = wall - 1;
    if (mode === "uncertainty") h.state.latestMs = wall + 1001;
    if (mode === "generation") h.state.clockGeneration = "other-generation";
    if (mode === "elapsed") h.state.elapsed = Number.NaN;
    await assert.rejects(claim(h, approval), code("clock"));
  }
});
test("commands detach before awaits and malformed passive inputs cannot invoke getters", async () => {
  const h = await setup(); const gate = deferred(); h.state.beforeJournalRead = () => gate.promise;
  const input = { action: "issue", draft: draft() }; const originalId = input.draft.approvalId;
  const pending = h.driver().transact(input); input.draft = draft(); gate.resolve();
  assert.equal((await pending).views[0].approval.draft.approvalId, originalId);
  let accessed = false;
  const bad = Object.defineProperty({}, "action", { enumerable: true, get() { accessed = true; return "claim"; } });
  await assert.rejects(h.driver().transact(bad), code("invalid-input")); assert.equal(accessed, false);
  await assert.rejects(h.driver().transact(new Proxy({}, {})), code("invalid-input"));
});
test("local overlap is bounded without substituting a process lock for shared CAS", async () => {
  const h = await setup(); const gate = deferred(); h.state.beforeJournalRead = () => gate.promise;
  const driver = h.driver(); const pending = driver.read(); await tick();
  await assert.rejects(driver.read(), code("busy")); gate.resolve(); await pending;
});
test("existing record/event/byte/time limits and no-refund reservation rules remain authoritative", async () => {
  assert.deepEqual(R2_APPROVAL_BOUNDS_V1, { records: 8, events: 128, bytes: 262144, clockUncertaintyMs: 1000, requestTimeoutMs: 1000, validityMs: 120000 });
  const h = await setup(); const approval = await issue(h, draft({ ...R2_QUALIFICATION_CEILINGS_V1, gets: 1 }));
  await claim(h, approval);
  const base = { ...reference(approval), claimId: "claim-1", reservationId: "get-one" };
  const driver = h.driver();
  await driver.transact({ action: "reserve", ...base, method: "get", objectKey: approval.draft.manifest.missingObjectKey });
  await driver.transact({ action: "settle", ...base, outcome: "unknown" });
  await assert.rejects(driver.transact({ action: "reserve", ...base, reservationId: "get-two", method: "get", objectKey: approval.draft.manifest.missingObjectKey }), code("transition-rejected"));
  await assert.rejects(driver.transact({ action: "complete", ...reference(approval), claimId: "claim-1" }), code("transition-rejected"));
  await driver.transact({ action: "stop", ...reference(approval), claimId: "claim-1" });
  await driver.transact({ action: "reconcile", ...reference(approval), resolutionSha256: "d".repeat(64) });
  const final = await driver.read(); assert.equal(final.views[0].consumed, true); assert.equal(final.views[0].reservations.length, 1);
});
test("authenticated decisions remain exact-command bound and failure is sanitized", async () => {
  const h = await setup(); h.state.authorize = () => { throw new Error("synthetic-private-detail"); };
  await assert.rejects(issue(h), code("storage-unavailable")); assert.equal(h.calls.witnessWrite, 0);
  h.state.authorize = request => ({ ...decision(request), requestSha256: "e".repeat(64) });
  await assert.rejects(issue(h), code("transition-rejected")); assert.equal(h.calls.witnessWrite, 0);
});
test("live execution and historical admission remain unavailable after a model claim", async () => {
  const h = await setup(); const approval = await issue(h); await claim(h, approval);
  const manifest = approval.draft.manifest; let constructed = false;
  const result = await executeR2CaptureArchiveQualificationV1(manifest, { schemaVersion: R2_QUALIFICATION_APPROVAL_V1,
    mode: "live", approvalId: "slice5-live-blocked", accountId: manifest.plan.target.accountId, bucket: manifest.plan.target.bucket.name,
    runId: manifest.plan.runId, manifestSha256: manifest.manifestSha256, expiresAt: wall + 120000 },
  { now: () => wall, monotonicNow: () => 0, createOfflineTransport: () => { constructed = true; throw new Error(); } });
  assert.equal(result.reason, "live-replay-unavailable"); assert.equal(constructed, false);
  const capture = prepareCalendarCaptureV1(await captureFixtureV1()); assert.ok(capture.status === "prepared");
  for (const { event } of capture.record.eventVersions) assert.equal(selectCalendarEventAsOfV1({ versions: [event],
    knowledgeCutoff: "9999-12-31T23:59:59.999Z", evaluatedAt: "9999-12-31T23:59:59.999Z" }).status, "unavailable");
});
test("the driver is server-only and isolated from providers, environment loaders and application activation", () => {
  const source = readFileSync(new URL("../../calendar/r2QualificationApprovalAuthority.ts", import.meta.url), "utf8");
  assert.ok(source.startsWith('import "server-only";'));
  assert.doesNotMatch(source, /process\.env|fetch\(|S3Client|@cloudflare|@upstash|supabase|DeleteObject|CreateBucket/);
  assert.doesNotMatch(source, /as unknown as|@ts-ignore|@ts-expect-error/);
});

test("corrupting only the committed claim binding cannot masquerade as an indivisible transition", async () => {
  const h = await setup(); const approval = await issue(h);
  h.state.afterJournalWrite = () => {
    const stored = inspectR2ApprovalAuthorityJournalV1(h.state.journal, h.authorityId, h.generation).snapshot;
    const event = stored.events.at(-1); assert.ok(event);
    h.state.journal = { ...stored, events: [...stored.events.slice(0, -1),
      { ...event, command: { action: "claim", ...reference(approval), claimId: "corrupted-binding" } }] };
  };
  await assert.rejects(claim(h, approval), code("corrupt-history"));
  await assert.rejects(h.driver().read(), code("corrupt-history"));
});
test("co-rollback of journal AND witness is explicitly undetectable, and still yields inspection only", async () => {
  const h = await setup(); const approval = await issue(h); const prefix = h.state.journal; const witness = h.state.witness;
  await claim(h, approval);
  // This deliberately violates independent witness retention. It demonstrates the
  // model limitation, not a qualified recovery path or safe replay-prevention claim.
  h.state.journal = prefix; h.state.witness = witness;
  const read = await h.driver().read(); assert.equal(read.views[0].consumed, false);
  assert.equal(read.executionAllowed, false); assert.ok(!("session" in read));
});
test("factory rejects invalid fixed authority names without constructing state", async () => {
  const h = await setup();
  for (const identity of [{ authorityId: "" }, { generation: "bad generation" }, { authorityId: "x".repeat(97) }]) {
    assert.throws(() => h.driver(identity), code("invalid-input"));
  }
  assert.equal(h.calls.journalRead, 0); assert.equal(h.calls.journalWrite, 0);
});
