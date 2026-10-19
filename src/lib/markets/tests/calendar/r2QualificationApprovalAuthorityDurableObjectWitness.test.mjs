import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, mock, test } from "node:test";
import {
  R2_APPROVAL_LEDGER_V1, R2_APPROVAL_DRAFT_V1, R2_APPROVAL_DECISION_V1,
  inspectR2ApprovalAuthorityJournalV1, prepareR2QualificationApprovalV1,
} from "../../calendar/r2QualificationApproval.ts";
import {
  R2_APPROVAL_AUTHORITY_ACK_V1, R2ApprovalAuthorityErrorV1, createOfflineR2ApprovalAuthorityV1,
} from "../../calendar/r2QualificationApprovalAuthority.ts";
import { createInactiveR2ApprovalAuthorityDurableObjectWitnessV1 as adapter } from "../../calendar/r2QualificationApprovalAuthorityDurableObjectWitness.ts";
import {
  R2_QUALIFICATION_PLAN_V1, R2_QUALIFICATION_CEILINGS_V1, prepareR2CaptureArchiveQualificationV1,
} from "../../calendar/r2CaptureArchiveQualification.ts";

// The injected SQL capability executes actual statements in LOCAL SQLite only.
const sockets = mock.method(Socket.prototype, "connect", () => assert.fail("Slice 8 forbids sockets."));
const fetches = mock.method(globalThis, "fetch", () => assert.fail("Slice 8 forbids fetch."));
after(() => {
  try { assert.equal(sockets.mock.callCount(), 0); assert.equal(fetches.mock.callCount(), 0); }
  finally { sockets.mock.restore(); fetches.mock.restore(); }
});
const schema = readFileSync(new URL("../../calendar/r2QualificationApprovalAuthorityDurableObjectWitness.sql", import.meta.url), "utf8");
const identity = Object.freeze({ authorityId: "synthetic-sqlite-witness", generation: "generation-1" });
const pinned = Object.freeze({ ...identity, witnessId: "independent-synthetic-witness-1" });
const genesis = { schemaVersion: R2_APPROVAL_LEDGER_V1, ...identity, events: [] };
const initial = inspectR2ApprovalAuthorityJournalV1(genesis, identity.authorityId, identity.generation).checkpoint;
const signal = () => new AbortController().signal;
const clone = value => JSON.parse(JSON.stringify(value));
const request = (expected = initial, hash = "b".repeat(64)) => ({ expected,
  checkpoint: { ...expected, sequence: expected.sequence + 1, headSha256: hash } });
function code(expected) {
  return error => error instanceof R2ApprovalAuthorityErrorV1 && error.code === expected &&
    error.message === "Offline approval authority unavailable." && !("cause" in error);
}
function hooks() { return { transactions: 0, statements: [], beforeSQL: () => {}, afterSQL: (_sql, rows) => rows,
  beforeCommit: () => {}, afterCommit: value => value }; }
function capability(db, state) {
  return {
    sql: { exec(sql, ...bindings) {
      assert.equal(db.isTransaction, true, "Every adapter statement must execute inside its transaction.");
      state.statements.push({ sql, bindings }); state.beforeSQL(sql, bindings);
      const rows = db.prepare(sql).all(...bindings);
      return { toArray: () => state.afterSQL(sql, rows) };
    } },
    transactionSync(callback) {
      state.transactions++; db.exec("BEGIN IMMEDIATE");
      let result;
      try { result = callback(); state.beforeCommit(); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
      return state.afterCommit(result);
    },
  };
}
function seed(db, end = 0) {
  const insert = db.prepare(`INSERT INTO calendar_r2_approval_witness_history_v1
    (witness_id, authority_id, generation, checkpoint_schema, sequence, head_sha256) VALUES (?, ?, ?, ?, ?, ?)`);
  for (let sequence = 0; sequence <= end; sequence++) {
    insert.run(pinned.witnessId, identity.authorityId, identity.generation, initial.schemaVersion,
      sequence, sequence === 0 ? initial.headSha256 : "b".repeat(64));
  }
  db.prepare(`INSERT INTO calendar_r2_approval_witness_v1
    (slot, witness_id, authority_id, generation, checkpoint_schema, sequence, head_sha256)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(1, pinned.witnessId, identity.authorityId, identity.generation,
    initial.schemaVersion, end, end === 0 ? initial.headSha256 : "b".repeat(64));
}
function fixture(t, { empty = false, file = false, end = 0 } = {}) {
  const root = realpathSync(tmpdir());
  const directory = file ? mkdtempSync(join(root, "chronoverse-slice8-")) : null;
  const path = directory ? join(directory, "witness.sqlite") : ":memory:";
  const connections = [];
  function connect() { const db = new DatabaseSync(path, { timeout: 0 }); connections.push(db); return db; }
  const db = connect();
  t.after(() => {
    for (const connection of connections) if (connection.isOpen) connection.close();
    if (directory) {
      assert.equal(dirname(realpathSync(directory)), root);
      assert.ok(basename(directory).startsWith("chronoverse-slice8-"));
      rmSync(directory, { recursive: true });
    }
  });
  db.exec(schema); if (!empty) seed(db, end);
  const state = hooks(); const storage = capability(db, state); const witness = adapter(pinned, storage);
  const raw = () => ({ current: db.prepare("SELECT * FROM calendar_r2_approval_witness_v1").all(),
    history: db.prepare("SELECT * FROM calendar_r2_approval_witness_history_v1 ORDER BY sequence").all() });
  return { db, state, storage, witness, connect, raw,
    read: () => witness.read(identity, signal()), write: value => witness.compareAndSwap(value, signal()) };
}
const mutations = state => state.statements.filter(({ sql }) => /^(UPDATE|INSERT)/.test(sql));

test("construction is inactive, performs no I/O, and exposes only the existing witness capability", t => {
  const f = fixture(t);
  assert.equal(f.state.transactions, 0); assert.equal(f.state.statements.length, 0);
  assert.deepEqual(Object.keys(f.witness).sort(), ["compareAndSwap", "executionAllowed", "read", "scope"]);
  assert.equal(f.witness.executionAllowed, false); assert.ok(Object.isFrozen(f.witness));
  assert.equal(f.witness.scope, "inactive-durable-object-compatible-approval-witness-only");
});

test("deterministic detached reads and one-step CAS atomically retain immutable history", async t => {
  const f = fixture(t); const old = await f.read(); const before = f.raw();
  assert.deepEqual(old, initial); assert.deepEqual(await f.read(), old); assert.ok(Object.isFrozen(old));
  const next = request(); const result = await f.write(next);
  // Domain parsing intentionally detaches records to null-prototype objects.
  assert.deepEqual(clone(result), clone({ schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store: "witness", status: "applied", ...next }));
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.expected)); assert.ok(Object.isFrozen(result.checkpoint));
  assert.deepEqual(clone(await f.read()), clone(next.checkpoint)); assert.deepEqual(old, initial);
  assert.deepEqual(f.raw().history[0], before.history[0]); assert.equal(f.raw().history.length, 2);
  assert.deepEqual(mutations(f.state).map(({ sql }) => sql.split(" ")[0]), ["UPDATE", "INSERT"]);
  const second = request(next.checkpoint, "c".repeat(64)); await f.write(second);
  assert.deepEqual(clone(await f.read()), clone(second.checkpoint)); assert.equal(f.raw().history.length, 3);
});

for (const stale of ["sequence", "headSha256", "replay"]) {
  test("stale expected checkpoint refuses " + stale + " without writes", async t => {
    const f = fixture(t); let next = request();
    if (stale === "replay") await f.write(next);
    if (stale === "sequence") next = request({ ...initial, sequence: 1 });
    if (stale === "headSha256") next = request({ ...initial, headSha256: "d".repeat(64) });
    const before = f.raw(); const count = mutations(f.state).length;
    assert.deepEqual(clone(await f.write(next)), clone({ schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1,
      store: "witness", status: "conflict", expected: next.expected, checkpoint: null }));
    assert.deepEqual(f.raw(), before); assert.equal(mutations(f.state).length, count);
  });
}

test("competing adapters on a shared file have one winner and one conflict", async t => {
  const f = fixture(t, { file: true }); const state = hooks();
  const other = adapter(pinned, capability(f.connect(), state));
  const results = await Promise.all([f.write(request()), other.compareAndSwap(request(initial, "c".repeat(64)), signal())]);
  assert.deepEqual(results.map(result => result.status).sort(), ["applied", "conflict"]);
  assert.equal(mutations(f.state).length + mutations(state).length, 2);
  assert.equal(f.raw().history.length, 2); assert.deepEqual(await f.read(), results.find(result => result.status === "applied").checkpoint);
});

for (const field of ["schemaVersion", "authorityId", "generation", "sequence", "headSha256"]) {
  test("missing expected field " + field + " fails before storage access", async t => {
    const f = fixture(t); const next = clone(request()); delete next.expected[field];
    await assert.rejects(f.write(next), code("invalid-input")); assert.equal(f.state.transactions, 0);
  });
}
for (const change of [{ schemaVersion: "unsupported" }, { authorityId: "other" }, { generation: "other" },
  { sequence: -1 }, { sequence: -0 }, { sequence: 0.5 }, { headSha256: "invalid" }, { extra: true }]) {
  test("malformed expected checkpoint " + JSON.stringify(change) + " is rejected", async t => {
    const f = fixture(t); const next = request({ ...initial, ...change });
    await assert.rejects(f.write(next), code("invalid-input")); assert.equal(f.state.transactions, 0);
  });
}
for (const change of [{ schemaVersion: "unsupported" }, { authorityId: "other" }, { generation: "other" },
  { sequence: 0 }, { sequence: 2 }, { sequence: 129 }, { sequence: 1.5 }, { headSha256: "invalid" }, { witnessId: "other" }]) {
  test("invalid next checkpoint " + JSON.stringify(change) + " cannot mutate retained data", async t => {
    const f = fixture(t); const next = request(); next.checkpoint = { ...next.checkpoint, ...change }; const before = f.raw();
    await assert.rejects(f.write(next), code("transition-rejected"));
    assert.equal(mutations(f.state).length, 0); assert.deepEqual(f.raw(), before);
  });
}

test("sequence capacity refuses advancement without eviction or reset", async t => {
  const f = fixture(t, { end: 128 }); const retained = await f.read(); const before = f.raw();
  await assert.rejects(f.write(request(retained)), code("transition-rejected")); assert.deepEqual(f.raw(), before);
});

for (const field of ["authorityId", "generation", "witnessId"]) {
  test("wrong pinned " + field + " refuses current state and never repairs it", async t => {
    const f = fixture(t); const before = f.raw(); const wrong = { ...pinned, [field]: "other" };
    const witness = adapter(wrong, f.storage); const readIdentity = { authorityId: wrong.authorityId, generation: wrong.generation };
    await assert.rejects(witness.read(readIdentity, signal()), code("corrupt-history"));
    const next = request({ ...initial, ...readIdentity });
    await assert.rejects(witness.compareAndSwap(next, signal()), code("corrupt-history"));
    assert.deepEqual(f.raw(), before); assert.equal(mutations(f.state).length, 0);
  });
}
for (const change of [{ authorityId: "other" }, { generation: "other" }, { witnessId: pinned.witnessId }]) {
  test("read request identity must match the existing exact contract: " + JSON.stringify(change), async t => {
    const f = fixture(t);
    await assert.rejects(f.witness.read({ ...identity, ...change }, signal()), code("invalid-input"));
    assert.equal(f.state.transactions, 0);
  });
}

test("missing current and history read as null; CAS never bootstraps", async t => {
  const f = fixture(t, { empty: true }); assert.equal(await f.read(), null);
  await assert.rejects(f.write(request()), code("missing-state")); assert.deepEqual(f.raw(), { current: [], history: [] });
});
for (const mode of ["orphan-current", "orphan-history", "missing-prefix", "extra-history", "bad-schema", "bad-hash",
  "wrong-authority", "wrong-generation", "wrong-witness", "head-mismatch", "history-identity"]) {
  test("persisted " + mode + " fails closed without repair", async t => {
    const f = fixture(t);
    if (mode === "orphan-current" || mode === "missing-prefix") {
      f.db.exec("DROP TRIGGER calendar_r2_approval_witness_history_no_delete_v1");
      f.db.exec("DELETE FROM calendar_r2_approval_witness_history_v1");
      if (mode === "missing-prefix") f.db.exec("UPDATE calendar_r2_approval_witness_v1 SET sequence = 1");
    }
    if (mode === "orphan-history") f.db.exec("DELETE FROM calendar_r2_approval_witness_v1");
    if (mode === "extra-history") f.db.exec(`INSERT INTO calendar_r2_approval_witness_history_v1
      SELECT 1, witness_id, authority_id, generation, checkpoint_schema, head_sha256 FROM calendar_r2_approval_witness_history_v1`);
    const column = { "bad-schema": "checkpoint_schema", "bad-hash": "head_sha256", "wrong-authority": "authority_id",
      "wrong-generation": "generation", "wrong-witness": "witness_id", "head-mismatch": "head_sha256" }[mode];
    if (column) f.db.prepare(`UPDATE calendar_r2_approval_witness_v1 SET ${column} = ?`).run(mode === "head-mismatch" ? "d".repeat(64) : "invalid");
    if (mode === "history-identity") {
      f.db.exec("DROP TRIGGER calendar_r2_approval_witness_history_no_update_v1");
      f.db.exec("UPDATE calendar_r2_approval_witness_history_v1 SET witness_id = 'other'");
    }
    const before = f.raw();
    await assert.rejects(f.read(), code("corrupt-history")); await assert.rejects(f.write(request()), code("corrupt-history"));
    assert.deepEqual(f.raw(), before); assert.equal(mutations(f.state).length, 0);
  });
}

test("history schema rejects update, delete, duplicate insert and replacement of accepted records", async t => {
  const f = fixture(t); await f.write(request()); const before = f.raw();
  for (const sql of ["UPDATE calendar_r2_approval_witness_history_v1 SET head_sha256 = 'changed' WHERE sequence = 0",
    "DELETE FROM calendar_r2_approval_witness_history_v1 WHERE sequence = 0",
    "INSERT INTO calendar_r2_approval_witness_history_v1 SELECT * FROM calendar_r2_approval_witness_history_v1 WHERE sequence = 0",
    "INSERT OR REPLACE INTO calendar_r2_approval_witness_history_v1 SELECT * FROM calendar_r2_approval_witness_history_v1 WHERE sequence = 0"]) {
    assert.throws(() => f.db.exec(sql), /Immutable witness history/); assert.deepEqual(f.raw(), before);
  }
});

for (const column of ["witness_id", "authority_id", "generation", "checkpoint_schema", "sequence", "head_sha256"]) {
  test("actual conditional UPDATE compares " + column + " and rolls back on zero rows", async t => {
    const f = fixture(t); const before = f.raw();
    f.state.beforeSQL = sql => {
      if (sql.startsWith("UPDATE")) f.db.prepare(`UPDATE calendar_r2_approval_witness_v1 SET ${column} = ?`)
        .run(column === "sequence" ? 1 : "other");
    };
    await assert.rejects(f.write(request()), code("acknowledgement-unknown"));
    assert.deepEqual(f.raw(), before); assert.equal(mutations(f.state).length, 1);
  });
}

test("history insertion constraint failure rolls back an already executed checkpoint UPDATE", async t => {
  const f = fixture(t); const before = f.raw();
  f.db.exec(`CREATE TRIGGER synthetic_history_failure BEFORE INSERT ON calendar_r2_approval_witness_history_v1
    BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END`);
  await assert.rejects(f.write(request()), code("acknowledgement-unknown"));
  assert.deepEqual(f.raw(), before); assert.equal(mutations(f.state).length, 2);
});
for (const stage of ["UPDATE", "INSERT", "before-commit"]) {
  test("exception after " + stage + " rolls back both tables without retry", async t => {
    const f = fixture(t); const before = f.raw();
    const failure = () => { throw new Error("synthetic private provider detail"); };
    if (stage === "before-commit") f.state.beforeCommit = failure;
    else f.state.afterSQL = (sql, rows) => { if (sql.startsWith(stage)) failure(); return rows; };
    await assert.rejects(f.write(request()), code("acknowledgement-unknown"));
    assert.deepEqual(f.raw(), before); assert.equal(f.state.transactions, 1);
  });
}
for (const malformed of [[], [{}], null, "unsupported", [{ ...initial, witnessId: "other" }]]) {
  test("malformed mutation response " + JSON.stringify(malformed) + " rolls back", async t => {
    const f = fixture(t); const before = f.raw();
    f.state.afterSQL = (sql, rows) => sql.startsWith("INSERT") ? malformed : rows;
    await assert.rejects(f.write(request()), code("acknowledgement-unknown")); assert.deepEqual(f.raw(), before);
  });
}

test("post-commit exception is uncertain and retains both records without retry", async t => {
  const f = fixture(t); f.state.afterCommit = () => { throw new Error("synthetic lost reply"); };
  await assert.rejects(f.write(request()), code("acknowledgement-unknown"));
  assert.equal(f.state.transactions, 1); assert.equal(f.raw().current[0].sequence, 1); assert.equal(f.raw().history.length, 2);
  f.state.afterCommit = value => value;
  assert.deepEqual(clone(await f.read()), clone(request().checkpoint)); assert.equal((await f.write(request())).status, "conflict");
});

test("SQLite file lock and closed storage fail without exposing provider details or writing", async t => {
  const f = fixture(t, { file: true }); const other = f.connect(); const before = f.raw();
  other.exec("BEGIN IMMEDIATE");
  try {
    await assert.rejects(f.read(), code("storage-unavailable"));
    await assert.rejects(f.write(request()), code("storage-unavailable"));
  } finally { other.exec("ROLLBACK"); }
  assert.deepEqual(f.raw(), before); assert.equal(mutations(f.state).length, 0);
  f.db.close(); await assert.rejects(f.read(), code("storage-unavailable"));
});

test("quota/read errors and missing schema fail closed", async t => {
  const f = fixture(t); const before = f.raw();
  f.state.beforeSQL = () => { throw new Error("synthetic quota/private detail"); };
  await assert.rejects(f.read(), code("storage-unavailable")); await assert.rejects(f.write(request()), code("storage-unavailable"));
  assert.deepEqual(f.raw(), before); f.state.beforeSQL = () => {};
  f.db.exec("DROP TABLE calendar_r2_approval_witness_v1");
  await assert.rejects(f.read(), code("storage-unavailable")); await assert.rejects(f.write(request()), code("storage-unavailable"));
});

for (const mode of ["skip", "repeat", "promise", "wrong-return"]) {
  test("uncertain transaction capability " + mode + " cannot acknowledge success", async t => {
    const f = fixture(t); const before = f.raw(); const transaction = f.storage.transactionSync.bind(f.storage);
    f.storage.transactionSync = callback => {
      if (mode === "skip") return undefined;
      if (mode === "repeat") return transaction(() => { callback(); return callback(); });
      const result = transaction(callback);
      return mode === "promise" ? Promise.resolve(result) : { ...result };
    };
    await assert.rejects(f.write(request()), code("acknowledgement-unknown"));
    if (mode === "skip" || mode === "repeat") assert.deepEqual(f.raw(), before);
    else { assert.equal(f.raw().current[0].sequence, 1); assert.equal(f.raw().history.length, 2); }
  });
}

for (const mode of ["before", "during", "after"]) {
  test("abort " + mode + " transaction never reports success", async t => {
    const f = fixture(t); const controller = new AbortController(); const before = f.raw();
    if (mode === "before") controller.abort();
    if (mode === "during") f.state.afterSQL = (sql, rows) => { if (sql.startsWith("UPDATE")) controller.abort(); return rows; };
    if (mode === "after") f.state.afterCommit = value => { controller.abort(); return value; };
    await assert.rejects(f.witness.compareAndSwap(request(), controller.signal), code(mode === "before" ? "storage-unavailable" : "acknowledgement-unknown"));
    if (mode !== "after") assert.deepEqual(f.raw(), before);
    else { assert.equal(f.raw().current[0].sequence, 1); assert.equal(f.raw().history.length, 2); }
    if (mode === "before") assert.equal(f.state.transactions, 0);
  });
}

test("file close/reopen retains checkpoint and immutable history and refuses replay", async t => {
  const f = fixture(t, { file: true }); await f.write(request()); f.db.close();
  const witness = adapter(pinned, capability(f.connect(), hooks()));
  assert.deepEqual(clone(await witness.read(identity, signal())), clone(request().checkpoint));
  assert.equal((await witness.compareAndSwap(request(), signal())).status, "conflict");
});

test("hostile factory/request getters and proxies never run and exact shapes are mandatory", async t => {
  const f = fixture(t); let accessed = false;
  const bad = Object.defineProperty({}, "expected", { enumerable: true, get() { accessed = true; throw new Error(); } });
  for (const value of [null, bad, new Proxy(request(), {}), { ...request(), witnessId: "other" }]) {
    await assert.rejects(f.write(value), code("invalid-input"));
  }
  for (const value of [null, { ...pinned, witnessId: "" }, { ...pinned, extra: true }, new Proxy(pinned, {})]) {
    assert.throws(() => adapter(value, f.storage), code("invalid-input"));
  }
  assert.equal(accessed, false); assert.equal(f.state.transactions, 0);
});

test("a deferred transaction callback cannot perform late work after refusal", async t => {
  const f = fixture(t); let late;
  f.storage.transactionSync = callback => { late = callback; return undefined; };
  await assert.rejects(f.write(request()), code("acknowledgement-unknown"));
  assert.throws(() => late(), code("acknowledgement-unknown"));
  assert.equal(f.state.statements.length, 0); assert.equal(f.raw().history.length, 1);
});

test("persisted row accessors are refused without execution", async t => {
  const f = fixture(t); let accessed = false;
  f.state.afterSQL = () => [Object.defineProperty({}, "witnessId", {
    enumerable: true, get() { accessed = true; throw new Error("private detail"); },
  })];
  await assert.rejects(f.read(), code("storage-unavailable"));
  await assert.rejects(f.write(request()), code("storage-unavailable"));
  assert.equal(accessed, false); assert.equal(mutations(f.state).length, 0);
});

test("a missing interior history record refuses even when the latest checkpoint matches", async t => {
  const f = fixture(t, { end: 2 });
  f.db.exec("DROP TRIGGER calendar_r2_approval_witness_history_no_delete_v1");
  f.db.exec("DELETE FROM calendar_r2_approval_witness_history_v1 WHERE sequence = 1");
  const before = f.raw();
  await assert.rejects(f.read(), code("corrupt-history"));
  await assert.rejects(f.write(request({ ...initial, sequence: 2, headSha256: 'b'.repeat(64) })), code("corrupt-history"));
  assert.deepEqual(f.raw(), before);
});

function driver(f) {
  const state = { journal: genesis, journalWrites: 0 };
  const wall = Date.UTC(2026, 9, 19);
  const manifest = prepareR2CaptureArchiveQualificationV1({ schemaVersion: R2_QUALIFICATION_PLAN_V1, runId: "witness-run",
    target: { accountId: "a".repeat(32), jurisdiction: "default", bucket: { name: "synthetic-witness-only",
      purpose: "dedicated-calendar-capture-archive", environment: "non-production" } }, limits: { ...R2_QUALIFICATION_CEILINGS_V1 } });
  const draft = prepareR2QualificationApprovalV1({ schemaVersion: R2_APPROVAL_DRAFT_V1, approvalId: "witness-approval", manifest,
    notBefore: wall, expiresAt: wall + 120000, targetPolicyVersion: "synthetic-policy-v1" });
  const create = () => createOfflineR2ApprovalAuthorityV1({ ...identity, witness: f.witness,
    journal: { read: async () => state.journal, compareAndSwap: async next => {
      state.journalWrites++; state.journal = next.snapshot;
      return { schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store: "journal", status: "applied",
        expected: next.expected, checkpoint: next.checkpoint };
    } },
    clock: () => ({ generation: identity.generation, earliestMs: wall, latestMs: wall }),
    authorize: value => ({ schemaVersion: R2_APPROVAL_DECISION_V1, decision: "authorized", purpose: value.purpose,
      requestSha256: value.requestSha256, operatorSubjectSha256: "b".repeat(64), authorizationEvidenceSha256: "c".repeat(64) }),
    monotonicNow: () => 0, armDeadline: () => () => {},
  });
  return { create, state, command: { action: "issue", draft } };
}

test("existing authority driver composes with the SQLite witness and returns inspection only", async t => {
  const f = fixture(t); const model = driver(f); const authority = model.create();
  assert.deepEqual((await authority.read()).checkpoint, initial);
  const result = await authority.transact(model.command);
  assert.equal(result.status, "observed"); assert.equal(result.executionAllowed, false);
  assert.deepEqual(await f.read(), result.checkpoint); assert.equal(f.raw().history.length, 2);
});

test("lost witness reply quarantines the driver, preserves witness-ahead history and prevents journal publication", async t => {
  const f = fixture(t); const model = driver(f); const authority = model.create();
  f.state.afterCommit = value => { if (value?.status === "applied") throw new Error("synthetic lost reply"); return value; };
  await assert.rejects(authority.transact(model.command), code("acknowledgement-unknown"));
  await assert.rejects(authority.read(), code("authority-uncertain"));
  assert.equal(model.state.journalWrites, 0); assert.equal(f.raw().history.length, 2);
  f.state.afterCommit = value => value;
  await assert.rejects(model.create().read(), code("checkpoint-mismatch"));
});
