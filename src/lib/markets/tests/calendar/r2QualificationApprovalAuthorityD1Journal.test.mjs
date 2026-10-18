import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, mock, test } from "node:test";
import {
  R2_APPROVAL_DRAFT_V1, R2_APPROVAL_DECISION_V1, R2_APPROVAL_LEDGER_V1,
  inspectR2ApprovalAuthorityJournalV1, prepareR2ApprovalAuthorityTransitionV1, prepareR2QualificationApprovalV1,
} from "../../calendar/r2QualificationApproval.ts";
import {
  R2_APPROVAL_AUTHORITY_ACK_V1, R2ApprovalAuthorityErrorV1, createOfflineR2ApprovalAuthorityV1,
} from "../../calendar/r2QualificationApprovalAuthority.ts";
import { validateR2ApprovalAuthorityWitnessCASV1 } from "../../calendar/r2QualificationApprovalAuthorityStoreValidation.ts";
import { createInactiveR2ApprovalAuthorityD1JournalV1 as adapter } from "../../calendar/r2QualificationApprovalAuthorityD1Journal.ts";
import {
  R2_QUALIFICATION_PLAN_V1, R2_QUALIFICATION_CEILINGS_V1, prepareR2CaptureArchiveQualificationV1,
} from "../../calendar/r2CaptureArchiveQualification.ts";

// Real LOCAL SQLite executes the adapter's statements. The D1 response envelope,
// issuer, clock and witness remain synthetic; no Cloudflare qualification is claimed.
const sockets = mock.method(Socket.prototype, "connect", () => assert.fail("Slice 7 forbids sockets."));
const fetches = mock.method(globalThis, "fetch", () => assert.fail("Slice 7 forbids fetch."));
after(() => {
  try { assert.equal(sockets.mock.callCount(), 0); assert.equal(fetches.mock.callCount(), 0); }
  finally { sockets.mock.restore(); fetches.mock.restore(); }
});
const schema = readFileSync(new URL("../../calendar/r2QualificationApprovalAuthorityD1Journal.sql", import.meta.url), "utf8");
const identity = Object.freeze({ authorityId: "synthetic-d1-authority", generation: "generation-1" });
const wall = Date.UTC(2026, 9, 18);
const at = Object.freeze({ generation: identity.generation, earliestMs: wall, latestMs: wall });
const signal = () => new AbortController().signal;
const clone = value => JSON.parse(JSON.stringify(value));
const inspect = snapshot => inspectR2ApprovalAuthorityJournalV1(snapshot, identity.authorityId, identity.generation);
const genesis = () => ({ schemaVersion: R2_APPROVAL_LEDGER_V1, ...identity, events: [] });
const decision = request => ({ schemaVersion: R2_APPROVAL_DECISION_V1, decision: "authorized", purpose: request.purpose,
  requestSha256: request.requestSha256, operatorSubjectSha256: "b".repeat(64), authorizationEvidenceSha256: "c".repeat(64) });
const manifest = prepareR2CaptureArchiveQualificationV1({ schemaVersion: R2_QUALIFICATION_PLAN_V1, runId: "sqlite-run",
  target: { accountId: "a".repeat(32), jurisdiction: "default", bucket: { name: "synthetic-sqlite-only",
    purpose: "dedicated-calendar-capture-archive", environment: "non-production" } }, limits: { ...R2_QUALIFICATION_CEILINGS_V1 } });
function draft(approvalId = "sqlite-approval") {
  return prepareR2QualificationApprovalV1({ schemaVersion: R2_APPROVAL_DRAFT_V1, approvalId, manifest,
    notBefore: wall, expiresAt: wall + 120000, targetPolicyVersion: "synthetic-policy-v1" });
}
function prepare(snapshot, command) {
  const step = prepareR2ApprovalAuthorityTransitionV1(snapshot, command, at, identity.authorityId, identity.generation, decision);
  return { expected: step.expected, checkpoint: step.checkpoint, snapshot: step.snapshot };
}
const issued = prepare(genesis(), { action: "issue", draft: draft() });
const approval = inspect(issued.snapshot).views[0].approval;
const reference = { approvalIdentity: approval.approvalIdentity, approvalSha256: approval.approvalSha256 };
const command = (claimId = "claim-1") => ({ action: "claim", ...reference, claimId });
const claim = (snapshot = issued.snapshot, claimId = "claim-1") => prepare(snapshot, command(claimId));
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function rehash(body) {
  return { ...body, eventSha256: createHash("sha256")
    .update(canonical(["chronoverse:calendar:r2-qualification-approval:v1", "audit-event", body]), "utf8").digest("hex") };
}
function appendRaw(snapshot, cmd) {
  const expected = inspect(snapshot).checkpoint;
  const event = rehash({ schemaVersion: "calendar-r2-approval-audit-v1", sequence: expected.sequence + 1,
    previousSha256: expected.headSha256, clock: at, command: cmd, authorization: null });
  return { expected, checkpoint: { ...expected, sequence: event.sequence, headSha256: event.eventSha256 },
    snapshot: { ...snapshot, events: [...snapshot.events, event] } };
}
function code(expected) {
  return error => error instanceof R2ApprovalAuthorityErrorV1 && error.code === expected &&
    error.message === "Offline approval authority unavailable." && !("cause" in error);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function hooks() {
  return { prepares: 0, reads: 0, writes: 0, statements: [], beforeRead: () => {}, afterRead: value => value,
    beforeUpdate: () => {}, afterUpdate: value => value };
}
// Only the provider envelope and fault timing are modeled. Both SELECT and UPDATE
// always execute the exact SQL supplied by the adapter through SQLite prepared statements.
function capability(db, state) {
  return { prepare(sql) {
    state.prepares++; state.statements.push(sql);
    return { bind(...values) {
      return {
        async first() {
          state.reads++; await state.beforeRead();
          return state.afterRead(db.prepare(sql).get(...values) ?? null);
        },
        async run() {
          state.writes++; await state.beforeUpdate();
          const result = db.prepare(sql).run(...values);
          return state.afterUpdate({ success: true, meta: { changes: result.changes,
            changed_db: result.changes !== 0, total_attempts: 1, served_by_primary: true } });
        },
      };
    } };
  } };
}
function seed(db, snapshot) {
  const cp = inspect(snapshot).checkpoint;
  // Explicit privileged TEST setup/restore only, never an adapter operation.
  db.prepare(`INSERT OR REPLACE INTO calendar_r2_approval_journal_v1
    (slot, authority_id, generation, checkpoint_schema, sequence, head_sha256, snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(1, cp.authorityId, cp.generation, cp.schemaVersion, cp.sequence, cp.headSha256, JSON.stringify(snapshot));
}
function fixture(t, { initial = issued.snapshot, file = false, pageSize } = {}) {
  const root = realpathSync(tmpdir());
  const directory = file ? mkdtempSync(join(root, "chronoverse-slice7-")) : null;
  const path = directory ? join(directory, "journal.sqlite") : ":memory:";
  const connections = [];
  function connect() { const db = new DatabaseSync(path, { timeout: 0 }); connections.push(db); return db; }
  const db = connect();
  t.after(() => {
    for (const connection of connections) if (connection.isOpen) connection.close();
    if (directory) {
      assert.equal(dirname(realpathSync(directory)), root);
      assert.ok(basename(directory).startsWith("chronoverse-slice7-"));
      rmSync(directory, { recursive: true });
    }
  });
  if (pageSize === 512) db.exec("PRAGMA page_size = 512");
  db.exec(schema);
  if (initial !== null) seed(db, initial);
  const state = hooks(); const journal = adapter(identity, capability(db, state));
  return { db, state, journal, connect,
    raw: () => db.prepare("SELECT * FROM calendar_r2_approval_journal_v1 WHERE slot = 1").get(),
    read: () => journal.read(identity, signal()),
    write: request => journal.compareAndSwap(request, signal()),
  };
}
function modeledDriver(f, initial = issued.snapshot) {
  const state = { witness: inspect(initial).checkpoint, clock: { ...at }, elapsed: 0, timers: [], witnessWrites: 0 };
  const create = () => createOfflineR2ApprovalAuthorityV1({ ...identity, journal: f.journal,
    witness: {
      read: async () => state.witness,
      compareAndSwap: async request => {
        state.witnessWrites++;
        const result = validateR2ApprovalAuthorityWitnessCASV1(identity, state.witness, request);
        if (result.status !== "validated") return { schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store: "witness",
          status: "conflict", expected: request.expected, checkpoint: null };
        state.witness = result.checkpoint;
        return { schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store: "witness", status: "applied",
          expected: result.expected, checkpoint: result.checkpoint };
      },
    }, clock: () => state.clock, authorize: decision, monotonicNow: () => state.elapsed,
    armDeadline: (callback, ms) => {
      assert.equal(ms, 1000); state.timers.push(callback); return () => {};
    } });
  return { state, create };
}

test("construction is inactive and exposes only journal operations and inactive labels", t => {
  const f = fixture(t);
  assert.equal(f.state.prepares, 0);
  assert.deepEqual(Object.keys(f.journal).sort(), ["compareAndSwap", "executionAllowed", "read", "scope"]);
  assert.equal(f.journal.executionAllowed, false); assert.ok(Object.isFrozen(f.journal));
  assert.equal(f.journal.scope, "inactive-d1-compatible-approval-journal-only");
});

test("valid single-event append executes one SQL UPDATE and retains the whole consumed journal", async t => {
  const f = fixture(t); const request = claim(); const result = await f.write(request);
  assert.deepEqual(result, { schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store: "journal", status: "applied",
    expected: request.expected, checkpoint: request.checkpoint });
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.checkpoint));
  assert.equal(f.state.writes, 1); assert.equal(f.state.statements.filter(sql => sql.startsWith("UPDATE")).length, 1);
  const row = f.raw(); assert.equal(row.sequence, 2); assert.equal(row.head_sha256, request.checkpoint.headSha256);
  assert.deepEqual(await f.read(), request.snapshot); assert.equal(inspect(await f.read()).views[0].consumed, true);
});

test("repeating the same committed request returns conflict, never fresh success", async t => {
  const f = fixture(t); const request = claim(); await f.write(request);
  const result = await f.write(request);
  assert.equal(result.status, "conflict"); assert.equal(result.checkpoint, null); assert.equal(f.state.writes, 1);
});

test("two competing adapter instances execute actual SQL with one winning predecessor", async t => {
  const f = fixture(t, { file: true }); const otherState = hooks(); const other = adapter(identity, capability(f.connect(), otherState));
  const results = await Promise.all([f.write(claim()), other.compareAndSwap(claim(issued.snapshot, "claim-2"), signal())]);
  assert.deepEqual(results.map(value => value.status).sort(), ["applied", "conflict"]);
  assert.equal(f.state.writes + otherState.writes, 2); assert.equal(inspect(await f.read()).views[0].consumed, true);
});

test("a writer delayed after validation cannot overwrite another committed snapshot", async t => {
  const f = fixture(t, { file: true }); const entered = deferred(); const release = deferred();
  f.state.beforeUpdate = async () => { entered.resolve(); await release.promise; };
  const pending = f.write(claim()); await entered.promise;
  const other = adapter(identity, capability(f.connect(), hooks())); const winner = claim(issued.snapshot, "winner");
  assert.equal((await other.compareAndSwap(winner, signal())).status, "applied");
  release.resolve(); const result = await pending;
  assert.equal(result.status, "conflict"); assert.equal(result.checkpoint, null);
  assert.deepEqual(await f.read(), winner.snapshot);
});

for (const semanticChange of [false, true]) {
  test("exact retained JSON guards a concurrent " + (semanticChange ? "snapshot replacement" : "representation-only change"), async t => {
    const f = fixture(t);
    const replacement = semanticChange ? JSON.stringify(genesis()) : JSON.stringify(issued.snapshot, null, 1);
    f.state.beforeUpdate = () => f.db.prepare("UPDATE calendar_r2_approval_journal_v1 SET snapshot_json = ? WHERE slot = 1").run(replacement);
    const result = await f.write(claim());
    assert.equal(result.status, "conflict"); assert.equal(result.checkpoint, null);
    assert.equal(f.raw().snapshot_json, replacement); assert.equal(f.raw().sequence, 1);
    if (semanticChange) await assert.rejects(f.read(), code("corrupt-history"));
    else assert.deepEqual(await f.read(), issued.snapshot);
  });
}

for (const change of [{ schemaVersion: "unsupported" }, { authorityId: "other" }, { generation: "other" },
  { sequence: 0 }, { headSha256: "d".repeat(64) }]) {
  test("mutation of expected checkpoint " + Object.keys(change)[0] + " cannot write", async t => {
    const f = fixture(t); const request = claim(); request.expected = { ...request.expected, ...change };
    try { assert.notEqual((await f.write(request)).status, "applied"); }
    catch (error) { assert.ok(code("invalid-input")(error)); }
    assert.equal(f.state.writes, 0); assert.deepEqual(await f.read(), issued.snapshot);
  });
}
for (const field of ["schemaVersion", "authorityId", "generation", "sequence", "headSha256"]) {
  test("missing expected checkpoint " + field + " cannot write", async t => {
    const f = fixture(t); const request = clone(claim()); delete request.expected[field];
    await assert.rejects(f.write(request), code("invalid-input")); assert.equal(f.state.writes, 0);
  });
}

for (const kind of ["fork", "truncation", "skipped-event", "reopen-consumption"]) {
  test("semantic " + kind + " is refused before SQL mutation", async t => {
    const current = kind === "reopen-consumption" ? claim().snapshot : issued.snapshot;
    const f = fixture(t, { initial: current }); let request;
    if (kind === "fork") {
      const alternate = prepare(genesis(), { action: "issue", draft: draft("alternate") }).snapshot;
      const a = inspect(alternate).views[0].approval;
      request = prepare(alternate, { action: "claim", approvalIdentity: a.approvalIdentity,
        approvalSha256: a.approvalSha256, claimId: "fork" }); request.expected = issued.checkpoint;
    } else if (kind === "truncation") {
      request = { expected: issued.checkpoint, checkpoint: issued.expected, snapshot: genesis() };
    } else if (kind === "skipped-event") {
      request = clone(claim()); const { eventSha256, ...body } = request.snapshot.events[1]; void eventSha256;
      const event = rehash({ ...body, sequence: 3 }); request.snapshot.events[1] = event;
      request.checkpoint = { ...request.checkpoint, headSha256: event.eventSha256 };
    } else request = appendRaw(current, command("reopened"));
    await assert.rejects(f.write(request), code("transition-rejected"));
    assert.equal(f.state.writes, 0); assert.deepEqual(await f.read(), current);
  });
}

for (const change of [{ authorityId: "other" }, { generation: "other" }]) {
  test("read identity " + Object.keys(change)[0] + " cannot select another authority", async t => {
    const f = fixture(t);
    await assert.rejects(f.journal.read({ ...identity, ...change }, signal()), code("invalid-input"));
    assert.equal(f.state.prepares, 0);
  });
}
for (const [column, value] of [["authority_id", "other"], ["generation", "other"],
  ["checkpoint_schema", "unsupported"], ["sequence", 0], ["head_sha256", "d".repeat(64)]]) {
  test("retained checkpoint " + column + " must match pinned canonical replay", async t => {
    const f = fixture(t);
    // Column names below are fixed TEST cases, never caller-controlled adapter SQL.
    f.db.prepare("UPDATE calendar_r2_approval_journal_v1 SET " + column + " = ? WHERE slot = 1").run(value);
    await assert.rejects(f.read(), code("corrupt-history"));
    await assert.rejects(f.write(claim()), code("corrupt-history")); assert.equal(f.state.writes, 0);
  });
}

test("missing retained row returns null on read and cannot initialize through CAS", async t => {
  const f = fixture(t, { initial: null }); assert.equal(await f.read(), null);
  await assert.rejects(f.write(issued), code("missing-state")); assert.equal(f.raw(), undefined); assert.equal(f.state.writes, 0);
});
for (const value of ["{", "null", "{}", JSON.stringify({ ...issued.snapshot, schemaVersion: "unsupported" })]) {
  test("corrupt retained snapshot " + value.slice(0, 24) + " refuses", async t => {
    const f = fixture(t); f.db.prepare("UPDATE calendar_r2_approval_journal_v1 SET snapshot_json = ? WHERE slot = 1").run(value);
    await assert.rejects(f.read(), code("corrupt-history")); await assert.rejects(f.write(claim()), code("corrupt-history"));
    assert.equal(f.state.writes, 0);
  });
}

test("oversized serialized state is refused before JSON replay even after privileged constraint bypass", async t => {
  const f = fixture(t); f.db.exec("PRAGMA ignore_check_constraints = ON");
  f.db.prepare("UPDATE calendar_r2_approval_journal_v1 SET snapshot_json = ? WHERE slot = 1").run(" ".repeat(262145));
  await assert.rejects(f.read(), code("corrupt-history")); assert.equal(f.state.writes, 0);
});

const malformedReplies = [undefined, null, {}, { success: true },
  { success: false, meta: { changes: 1, changed_db: true } },
  { success: true, meta: { changes: 1 } }, { success: true, meta: { changes: "1", changed_db: true } },
  { success: true, meta: { changes: 2, changed_db: true } }, { success: true, meta: { changes: 1, changed_db: false } },
  { success: true, meta: { changes: 0, changed_db: true } }, { success: true, meta: { changes: -0, changed_db: false } },
  { success: true, meta: { changes: 1, changed_db: true, total_attempts: 2 } },
  { success: true, meta: { changes: 1, changed_db: true, served_by_primary: false } }];
for (const [index, reply] of malformedReplies.entries()) {
  test("missing, contradictory or malformed database acknowledgement remains uncertain: " + index, async t => {
    const f = fixture(t); f.state.afterUpdate = () => reply;
    await assert.rejects(f.write(claim()), code("acknowledgement-unknown"));
    assert.equal(f.state.writes, 1); assert.equal(inspect(await f.read()).views[0].consumed, true);
  });
}

test("passive provider checks reject getters and proxies without invoking them", async t => {
  const f = fixture(t); let accessed = false;
  const getter = Object.defineProperty({}, "success", { enumerable: true, get() { accessed = true; throw new Error(); } });
  f.state.afterUpdate = () => getter;
  await assert.rejects(f.write(claim()), code("acknowledgement-unknown")); assert.equal(accessed, false);
  const g = fixture(t); g.state.afterRead = () => new Proxy({}, { ownKeys() { accessed = true; throw new Error(); } });
  await assert.rejects(g.read(), code("corrupt-history")); assert.equal(accessed, false);
});

test("real file-backed SQLite lock is uncertain and never retried", async t => {
  const f = fixture(t, { file: true }); const blocker = f.connect(); blocker.exec("BEGIN IMMEDIATE");
  try { await assert.rejects(f.write(claim()), code("acknowledgement-unknown")); }
  finally { blocker.exec("ROLLBACK"); }
  assert.equal(f.state.writes, 1); assert.deepEqual(await f.read(), issued.snapshot);
});

test("real SQLite capacity exhaustion fails closed without eviction", async t => {
  const f = fixture(t, { initial: genesis(), pageSize: 512 });
  const pages = f.db.prepare("PRAGMA page_count").get().page_count;
  // This numeric limit is obtained from the local database, not an untrusted input.
  f.db.exec("PRAGMA max_page_count = " + pages);
  await assert.rejects(f.write(issued), code("acknowledgement-unknown"));
  assert.equal(f.state.writes, 1); assert.deepEqual(await f.read(), inspect(genesis()).snapshot);
});

test("injected provider quota error remains uncertain and does not trigger fallback or retry", async t => {
  const f = fixture(t); f.state.beforeUpdate = () => { throw new Error("synthetic-private-quota-error"); };
  await assert.rejects(f.write(claim()), code("acknowledgement-unknown"));
  assert.equal(f.state.writes, 1); assert.deepEqual(await f.read(), issued.snapshot);
});

test("failure reading before mutation dispatch is unavailable with no UPDATE", async t => {
  const f = fixture(t); f.state.beforeRead = () => { throw new Error("synthetic-private-read-error"); };
  await assert.rejects(f.write(claim()), code("storage-unavailable")); assert.equal(f.state.writes, 0);
});

test("commit followed by lost acknowledgement preserves consumption and quarantines the unchanged driver", async t => {
  const f = fixture(t); const model = modeledDriver(f); const driver = model.create();
  f.state.afterUpdate = () => { throw new Error("synthetic-private-lost-ack"); };
  await assert.rejects(driver.transact(command()), code("acknowledgement-unknown"));
  await assert.rejects(driver.read(), code("authority-uncertain")); assert.equal(f.state.writes, 1);
  const recovered = await model.create().read(); assert.equal(recovered.views[0].consumed, true);
  assert.equal(recovered.executionAllowed, false); assert.ok(!("session" in recovered));
  await assert.rejects(model.create().transact(command("retry")), code("transition-rejected"));
});

test("zero-row conditional refusal after witness publication also quarantines the driver", async t => {
  const f = fixture(t); const model = modeledDriver(f); const driver = model.create();
  f.state.beforeUpdate = () => f.db.prepare("UPDATE calendar_r2_approval_journal_v1 SET snapshot_json = ? WHERE slot = 1")
    .run(JSON.stringify(issued.snapshot, null, 1));
  await assert.rejects(driver.transact(command()), code("stale-writer"));
  await assert.rejects(driver.read(), code("authority-uncertain"));
  await assert.rejects(model.create().read(), code("checkpoint-mismatch"));
});

test("file-backed SQLite close/reopen retains consumed state and rejects duplicate consumption", async t => {
  const f = fixture(t, { file: true }); const request = claim(); await f.write(request); f.db.close();
  const reopened = adapter(identity, capability(f.connect(), hooks()));
  const snapshot = await reopened.read(identity, signal()); assert.deepEqual(snapshot, request.snapshot);
  assert.equal(inspect(snapshot).views[0].consumed, true);
  assert.equal((await reopened.compareAndSwap(request, signal())).status, "conflict");
});

test("journal rollback fails against the separately retained modeled current witness", async t => {
  const f = fixture(t); const model = modeledDriver(f); await model.create().transact(command());
  seed(f.db, issued.snapshot); const writes = f.state.writes;
  await assert.rejects(model.create().read(), code("checkpoint-mismatch"));
  await assert.rejects(model.create().transact(command("after-restore")), code("checkpoint-mismatch"));
  assert.equal(f.state.writes, writes);
});

test("joint journal/witness rollback is still undetectable and never grants execution", async t => {
  const f = fixture(t); const model = modeledDriver(f); await model.create().transact(command());
  seed(f.db, issued.snapshot); model.state.witness = issued.checkpoint;
  const recovered = await model.create().read(); assert.equal(recovered.views[0].consumed, false);
  assert.equal(recovered.executionAllowed, false); assert.ok(!("session" in recovered));
  const observed = await model.create().transact(command("after-joint-rollback"));
  assert.equal(observed.executionAllowed, false); assert.equal(observed.views[0].consumed, true);
  // Real local persistence does not make a jointly restored prefix distinguishable.
});

for (const mode of ["regression", "uncertainty", "generation", "elapsed"]) {
  test("unchanged driver refuses clock " + mode + " before publication", async t => {
    const f = fixture(t); const model = modeledDriver(f);
    if (mode === "regression") model.state.clock = { ...at, earliestMs: wall - 1, latestMs: wall - 1 };
    if (mode === "uncertainty") model.state.clock = { ...at, latestMs: wall + 1001 };
    if (mode === "generation") model.state.clock = { ...at, generation: "other" };
    if (mode === "elapsed") model.state.elapsed = NaN;
    await assert.rejects(model.create().transact(command()), code("clock"));
    assert.equal(f.state.writes, 0); assert.equal(model.state.witnessWrites, 0);
  });
}

test("expiry before publication cannot produce an observation", async t => {
  const f = fixture(t); const model = modeledDriver(f);
  model.state.clock = { ...at, earliestMs: wall + 120000, latestMs: wall + 120000 };
  await assert.rejects(model.create().transact(command()), code("transition-rejected"));
  assert.equal(f.state.writes, 0); assert.equal(model.state.witnessWrites, 0);
});

test("expiry after SQL commit refuses delivery and retains consumed state", async t => {
  const f = fixture(t); const model = modeledDriver(f); const driver = model.create();
  f.state.afterUpdate = value => { model.state.clock = { ...at, earliestMs: wall + 120000, latestMs: wall + 120000 }; return value; };
  await assert.rejects(driver.transact(command()), code("transition-rejected"));
  await assert.rejects(driver.read(), code("authority-uncertain"));
  assert.equal(inspect(await f.read()).views[0].consumed, true);
});

test("deadline during a read aborts without allowing late work to publish", async t => {
  const f = fixture(t); const model = modeledDriver(f); const entered = deferred(); const release = deferred();
  f.state.afterRead = async value => { entered.resolve(); await release.promise; return value; };
  const driver = model.create(); const pending = driver.transact(command()); await entered.promise;
  model.state.elapsed = 1000; model.state.timers[0]();
  await assert.rejects(pending, code("deadline")); release.resolve();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.state.writes, 0);
});

test("late SQL commit after deadline cannot revive an observation or retry", async t => {
  const f = fixture(t); const model = modeledDriver(f); const entered = deferred(); const release = deferred(); const committed = deferred();
  f.state.beforeUpdate = async () => { entered.resolve(); await release.promise; };
  f.state.afterUpdate = value => { committed.resolve(); return value; };
  const driver = model.create(); const pending = driver.transact(command()); await entered.promise;
  model.state.elapsed = 1000; model.state.timers[0]();
  await assert.rejects(pending, code("deadline")); await assert.rejects(driver.read(), code("authority-uncertain"));
  release.resolve(); await committed.promise; await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.writes, 1); assert.equal(inspect(await f.read()).views[0].consumed, true);
});

test("aborted adapter calls never dispatch an UPDATE", async t => {
  const f = fixture(t); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.journal.compareAndSwap(claim(), controller.signal), code("storage-unavailable"));
  assert.equal(f.state.prepares, 0);
});

test("requests detach before asynchronous reads and malformed getters cannot run", async t => {
  const f = fixture(t); const entered = deferred(); const release = deferred();
  f.state.beforeRead = async () => { entered.resolve(); await release.promise; };
  const request = clone(claim()); const pending = f.write(request); await entered.promise;
  request.snapshot.events.length = 0; release.resolve(); assert.equal((await pending).status, "applied");
  assert.equal(inspect(await f.read()).views[0].consumed, true);
  let accessed = false;
  const bad = Object.defineProperty({}, "expected", { enumerable: true, get() { accessed = true; throw new Error(); } });
  await assert.rejects(f.write(bad), code("invalid-input")); assert.equal(accessed, false);
});

test("invalid factory identities fail without database access", () => {
  const database = { prepare() { assert.fail("Construction must not prepare SQL."); } };
  for (const value of [{ authorityId: "", generation: "generation-1" }, { ...identity, generation: "bad generation" },
    { ...identity, extra: true }, null, new Proxy(identity, {})]) assert.throws(() => adapter(value, database), code("invalid-input"));
});

test("schema enforces one bounded retained row without an adapter initialization API", t => {
  const f = fixture(t);
  assert.throws(() => f.db.prepare(`INSERT INTO calendar_r2_approval_journal_v1
    SELECT 2, authority_id, generation, checkpoint_schema, sequence, head_sha256, snapshot_json
    FROM calendar_r2_approval_journal_v1`).run());
  assert.throws(() => f.db.prepare("UPDATE calendar_r2_approval_journal_v1 SET snapshot_json = ? WHERE slot = 1").run("s".repeat(262145)));
  assert.equal(f.raw().sequence, 1);
});

test("adapter source contains no activation, clock fallback, bootstrap or raw SQL API", () => {
  const source = readFileSync(new URL("../../calendar/r2QualificationApprovalAuthorityD1Journal.ts", import.meta.url), "utf8");
  assert.ok(source.startsWith('import "server-only";'));
  assert.doesNotMatch(source, /process\.env|fetch\(|S3Client|@cloudflare|@upstash|Date\.now|randomUUID|executionAllowed: true/);
  assert.doesNotMatch(source, /\b(?:INSERT|DELETE|CREATE|DROP|REPLACE|UPSERT)\b|as unknown as|@ts-ignore|@ts-expect-error/);
});
