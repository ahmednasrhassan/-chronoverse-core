import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Socket } from "node:net";
import { after, mock, test } from "node:test";
import {
  R2_APPROVAL_DRAFT_V1, R2_APPROVAL_DECISION_V1, R2_APPROVAL_BOUNDS_V1, R2_APPROVAL_LEDGER_V1,
  prepareR2QualificationApprovalV1, createOfflineR2ApprovalWitnessV1, createOfflineR2ApprovalLedgerV1,
  createOfflineR2ApprovalCoordinatorV1, validateR2ApprovalRecoveryV1, R2QualificationApprovalErrorV1,
  type R2ApprovalRecordV1, type R2ApprovalModelTransportV1, type R2ApprovalModelDependenciesV1,
  type R2ApprovalAuthorizationRequestV1, type R2ApprovalDraftV1,
} from "../../calendar/r2QualificationApproval";
import { R2_QUALIFICATION_PLAN_V1, R2_QUALIFICATION_CEILINGS_V1,
  prepareR2CaptureArchiveQualificationV1, executeR2CaptureArchiveQualificationV1, R2_QUALIFICATION_APPROVAL_V1 } from "../../calendar/r2CaptureArchiveQualification";
import { prepareCalendarCaptureV1 } from "../../calendar/capturePersistence";
import { selectCalendarEventAsOfV1 } from "../../calendar/history";
import { captureFixtureV1 } from "./capturePersistenceFixtures";

const sockets = mock.method(Socket.prototype, "connect", () => { assert.fail("Offline approval tests forbid sockets."); });
const fetches = mock.method(globalThis, "fetch", () => { assert.fail("Offline approval tests forbid network fetch."); });
after(() => { try { assert.equal(sockets.mock.callCount(), 0); assert.equal(fetches.mock.callCount(), 0); }
  finally { sockets.mock.restore(); fetches.mock.restore(); } });
const wall = Date.UTC(2026, 9, 17);
const subject = "b".repeat(64); const evidence = "c".repeat(64);
let serial = 0;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function request() {
  return { schemaVersion: R2_APPROVAL_DRAFT_V1, approvalId: "approval-" + serial++,
    manifest: prepareR2CaptureArchiveQualificationV1({ schemaVersion: R2_QUALIFICATION_PLAN_V1, runId: "run-" + serial++,
      target: { accountId: "a".repeat(32), jurisdiction: "default", bucket: { name: "synthetic-approval-only",
        purpose: "dedicated-calendar-capture-archive", environment: "non-production" } }, limits: { ...R2_QUALIFICATION_CEILINGS_V1 } }),
    notBefore: wall, expiresAt: wall + 120000, targetPolicyVersion: "non-production-policy-v1" };
}
function decision(value: R2ApprovalAuthorizationRequestV1) {
  return { schemaVersion: R2_APPROVAL_DECISION_V1, decision: "authorized", purpose: value.purpose,
    requestSha256: value.requestSha256, operatorSubjectSha256: subject, authorizationEvidenceSha256: evidence };
}
const reference = (record: R2ApprovalRecordV1) => ({ approvalIdentity: record.approvalIdentity, approvalSha256: record.approvalSha256 });
function hasCode(code: string) { return (error: unknown) => error instanceof R2QualificationApprovalErrorV1 && error.code === code && error.message === "Offline qualification approval unavailable."; }
function setup() {
  const authorityId = "authority-" + serial++; const generation = "generation-1";
  const witness = createOfflineR2ApprovalWitnessV1(authorityId, generation);
  const state: { clock: { generation: string; earliestMs: number; latestMs: number };
    authorize: (request: R2ApprovalAuthorizationRequestV1) => unknown; fault: ReturnType<NonNullable<R2ApprovalModelDependenciesV1["fault"]>> } = {
    clock: { generation, earliestMs: wall, latestMs: wall }, authorize: decision, fault: "none" };
  const dependencies: R2ApprovalModelDependenciesV1 = { authorityId, generation, witness,
    clock: () => state.clock, authorize: value => state.authorize(value), fault: () => state.fault };
  const ledger = createOfflineR2ApprovalLedgerV1(dependencies);
  const timers: { callback: () => void; cancelled: boolean }[] = [];
  const coordinator = (transport: R2ApprovalModelTransportV1 = ledger) => createOfflineR2ApprovalCoordinatorV1({ authorityId, generation, witness, transport,
    armDeadline: (callback, ms) => { assert.equal(ms, R2_APPROVAL_BOUNDS_V1.requestTimeoutMs); const timer = { callback, cancelled: false };
      timers.push(timer); return () => { timer.cancelled = true; }; } });
  return { authorityId, generation, witness, state, dependencies, ledger, timers, coordinator };
}
async function issued(h: ReturnType<typeof setup>, draft: R2ApprovalDraftV1 = prepareR2QualificationApprovalV1(request())) {
  return h.coordinator().issue(draft);
}
async function claimed(h: ReturnType<typeof setup>, record: R2ApprovalRecordV1) {
  const coordinator = h.coordinator(); const result = await coordinator.claim(reference(record));
  assert.ok(result.status === "claimed"); assert.equal(result.executionAllowed, false);
  return { coordinator, session: result.session };
}
function rawSnapshot(value: unknown): { schemaVersion: string; authorityId: string; generation: string; events: Record<string, unknown>[] } {
  // Test fixture serialization only; production recovery always receives unknown.
  return JSON.parse(JSON.stringify(value));
}

test("draft identity/digest is deterministic, immutable and binds the complete manifest and validity", () => {
  const input = request(); const first = prepareR2QualificationApprovalV1(input);
  assert.deepEqual(prepareR2QualificationApprovalV1(clone(input)), first); assert.ok(Object.isFrozen(first));
  for (const changed of [{ ...input, approvalId: "different-id" }, { ...input, expiresAt: input.expiresAt - 1 },
    { ...input, notBefore: input.notBefore + 1 }, { ...input, targetPolicyVersion: "non-production-policy-v2" }]) {
    assert.notEqual(prepareR2QualificationApprovalV1(changed).requestSha256, first.requestSha256);
  }
  input.approvalId = "detached"; assert.notEqual(first.approvalId, input.approvalId);
});
for (const extra of ["operator", "authenticated", "token", "credentials", "authorization"]) {
  test("caller-supplied " + extra + " is never authentication", () => {
    assert.throws(() => prepareR2QualificationApprovalV1({ ...request(), [extra]: "private-input" }), hasCode("invalid-input"));
  });
}
for (const field of ["schemaVersion", "approvalId", "manifest", "notBefore", "expiresAt", "targetPolicyVersion"]) {
  test("missing required draft field " + field + " is rejected", () => {
    const value: Record<string, unknown> = request(); delete value[field];
    assert.throws(() => prepareR2QualificationApprovalV1(value), hasCode("invalid-input"));
  });
}
test("strict draft validation rejects malformed windows, identifiers, accessors, proxies and unsupported manifests", () => {
  const base = request();
  for (const value of [{ ...base, expiresAt: wall }, { ...base, expiresAt: wall + 120001 }, { ...base, notBefore: -1 },
    { ...base, expiresAt: 1.5 }, { ...base, approvalId: "a".repeat(97) }, { ...base, targetPolicyVersion: "bad policy" },
    { ...base, manifest: { ...base.manifest, manifestSha256: "d".repeat(64) } }, new Proxy(base, {})]) {
    assert.throws(() => prepareR2QualificationApprovalV1(value));
  }
  let accessed = false; const value = { ...base };
  Object.defineProperty(value, "approvalId", { get() { accessed = true; return "unsafe"; } });
  assert.throws(() => prepareR2QualificationApprovalV1(value)); assert.equal(accessed, false);
});
test("substituted account, bucket, run, jurisdiction, limits and manifest fields cannot use an old digest", () => {
  const base = request();
  const changedPlans = [
    { ...base.manifest.plan, target: { ...base.manifest.plan.target, accountId: "d".repeat(32) } },
    { ...base.manifest.plan, target: { ...base.manifest.plan.target, bucket: { ...base.manifest.plan.target.bucket, name: "other-synthetic-bucket" } } },
    { ...base.manifest.plan, runId: "substituted-run" },
    { ...base.manifest.plan, target: { ...base.manifest.plan.target, jurisdiction: "eu" } },
    { ...base.manifest.plan, limits: { ...base.manifest.plan.limits, puts: 31 } },
  ];
  for (const plan of changedPlans) assert.throws(() => prepareR2QualificationApprovalV1({ ...base, manifest: { ...base.manifest, plan } }));
});
for (const response of [true, "arbitrary-token", null, {}, { decision: "authorized", operator: "name-only" }]) {
  test("unauthenticated or unsupported issuer response rejects: " + typeof response + "/" + JSON.stringify(response), async () => {
    const h = setup(); h.state.authorize = () => response;
    await assert.rejects(issued(h), hasCode("unauthorized")); assert.equal((await h.coordinator().read()).length, 0);
  });
}
test("issuer decision must match purpose, exact request digest, supported schema and hash-only evidence", async () => {
  for (const change of [{ purpose: "revoke" }, { requestSha256: "e".repeat(64) }, { schemaVersion: "unsupported" },
    { decision: "denied" }, { operatorSubjectSha256: "operator-name" }, { authorizationEvidenceSha256: "raw-secret" }, { token: "private" }]) {
    const h = setup(); h.state.authorize = value => ({ ...decision(value), ...change });
    await assert.rejects(issued(h), hasCode("unauthorized"));
  }
});
test("authenticated issuance produces domain-separated identity and immutable fully bound record", async () => {
  const h = setup(); const draft = prepareR2QualificationApprovalV1(request()); const record = await issued(h, draft);
  assert.equal(record.authorization.operatorSubjectSha256, subject); assert.equal(record.authorization.authorizationEvidenceSha256, evidence);
  assert.notEqual(record.approvalIdentity, record.approvalSha256); assert.notEqual(record.approvalSha256, draft.requestSha256);
  assert.equal(record.draft.manifest.plan.target.jurisdiction, "default"); assert.ok(Object.isFrozen(record));
  const state = (await h.coordinator().read())[0]; assert.equal(state.state, "issued"); assert.equal(state.consumed, false);
  assert.ok(h.timers.every(timer => timer.cancelled));
});
test("duplicate IDs and duplicate target/run identities remain reserved after revocation", async () => {
  const h = setup(); const base = request(); const record = await issued(h, prepareR2QualificationApprovalV1(base));
  const differentRun = request(); differentRun.approvalId = base.approvalId;
  await assert.rejects(issued(h, prepareR2QualificationApprovalV1(differentRun)), hasCode("duplicate"));
  await h.coordinator().revoke(reference(record));
  await assert.rejects(issued(h, prepareR2QualificationApprovalV1({ ...base, approvalId: "another-id" })), hasCode("duplicate"));
  assert.equal((await h.coordinator().read()).length, 1);
});
test("independent coordinators sharing one authority cannot both claim", async () => {
  const h = setup(); const record = await issued(h);
  const results = await Promise.all([h.coordinator().claim(reference(record)), h.coordinator().claim(reference(record))]);
  assert.equal(results.filter(result => result.status === "claimed").length, 1);
  assert.equal(results.filter(result => result.status === "unavailable").length, 1);
  const view = (await h.coordinator().read())[0]; assert.equal(view.consumed, true); assert.equal(view.state, "claimed");
});
test("approval substitution at claim is rejected without consumption", async () => {
  const h = setup(); const record = await issued(h);
  for (const value of [{ ...reference(record), approvalSha256: "f".repeat(64) }, { ...reference(record), approvalIdentity: "f".repeat(64) },
    { ...reference(record), authenticated: true }]) assert.equal((await h.coordinator().claim(value)).status, "unavailable");
  assert.equal((await h.coordinator().read())[0].consumed, false);
});
test("restart retains consumption and audit reads cannot reconstruct an executor session", async () => {
  const h = setup(); const record = await issued(h); const first = await claimed(h, record);
  const snapshot = await h.ledger.read();
  const restored = createOfflineR2ApprovalLedgerV1({ ...h.dependencies, recoveredSnapshot: snapshot });
  const restarted = h.coordinator(restored); assert.equal((await restarted.read())[0].consumed, true);
  assert.equal((await restarted.claim(reference(record))).status, "unavailable");
  await assert.rejects(restarted.reserve(first.session, "after-restart", "put", record.draft.manifest.fixtures[0].objectKey), hasCode("invalid-session"));
  await assert.rejects(restarted.reserve({ scope: "offline-approval-session-only" }, "forged", "put", record.draft.manifest.fixtures[0].objectKey), hasCode("invalid-session"));
});
test("validity boundaries and uncertainty intervals are conservative", async () => {
  const h = setup(); const value = request(); value.notBefore = wall + 100;
  const record = await issued(h, prepareR2QualificationApprovalV1(value));
  assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
  h.state.clock = { generation: h.generation, earliestMs: wall + 100, latestMs: wall + 100 };
  const active = await claimed(h, record);
  h.state.clock = { generation: h.generation, earliestMs: record.draft.expiresAt - 1, latestMs: record.draft.expiresAt };
  await assert.rejects(active.coordinator.reserve(active.session, "boundary", "put", record.draft.manifest.fixtures[0].objectKey), hasCode("outside-window"));
  h.state.clock = { generation: h.generation, earliestMs: record.draft.expiresAt, latestMs: record.draft.expiresAt };
  await h.coordinator().expire(reference(record));
  const view = (await h.coordinator().read())[0]; assert.equal(view.state, "expired"); assert.equal(view.consumed, true);
});
test("unused expiration stays unclaimable without erasing the approval", async () => {
  const h = setup(); const record = await issued(h);
  h.state.clock.earliestMs = record.draft.expiresAt; h.state.clock.latestMs = record.draft.expiresAt;
  assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
  await h.coordinator().expire(reference(record)); assert.equal((await h.coordinator().read())[0].state, "expired");
});
test("clock regression, excessive skew and uncertain generations fail closed", async () => {
  for (const sample of [{ generation: "generation-1", earliestMs: wall - 1, latestMs: wall - 1 },
    { generation: "generation-1", earliestMs: wall, latestMs: wall + 1001 },
    { generation: "generation-unknown", earliestMs: wall, latestMs: wall },
    { generation: "generation-1", earliestMs: wall + 1, latestMs: wall }]) {
    const h = setup(); const record = await issued(h); h.state.clock = sample;
    assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
  }
});
test("revocation prevents new reservations but preserves already reserved uncertainty", async () => {
  const h = setup(); const record = await issued(h); const active = await claimed(h, record);
  const key = record.draft.manifest.fixtures[0].objectKey;
  await active.coordinator.reserve(active.session, "in-flight", "put", key);
  await h.coordinator().revoke(reference(record));
  const view = (await h.coordinator().read())[0]; assert.equal(view.consumed, true); assert.equal(view.reservations[0].outcome, "pending");
  await assert.rejects(active.coordinator.reserve(active.session, "after-revoke", "get", key), hasCode("invalid-state"));
  await h.coordinator().reconcile(reference(record), "d".repeat(64));
  const final = (await h.coordinator().read())[0]; assert.equal(final.state, "reconciled"); assert.equal(final.consumed, true);
  assert.equal(final.reservations[0].outcome, "pending"); assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
});
test("revocation racing claim or reservation serializes without reopening approval", async () => {
  const h = setup(); const record = await issued(h);
  await Promise.all([h.coordinator().revoke(reference(record)), h.coordinator().claim(reference(record))]);
  assert.equal((await h.coordinator().read())[0].state, "revoked");
  assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
});
test("unauthorized revocation and reconciliation do not change audit state", async () => {
  const h = setup(); const record = await issued(h); const before = await h.ledger.read();
  h.state.authorize = () => false;
  await assert.rejects(h.coordinator().revoke(reference(record)), hasCode("unauthorized"));
  assert.deepEqual(await h.ledger.read(), before);
});
test("partial execution, stop and reconciliation never refund consumption or budgets", async () => {
  const h = setup(); const record = await issued(h); const active = await claimed(h, record);
  const key = record.draft.manifest.fixtures[0].objectKey;
  await active.coordinator.reserve(active.session, "partial", "put", key);
  await active.coordinator.settle(active.session, "partial", "unknown");
  await active.coordinator.stop(active.session);
  await h.coordinator().reconcile(reference(record), "d".repeat(64));
  const view = (await h.coordinator().read())[0]; assert.equal(view.consumed, true); assert.equal(view.reservations.length, 1);
  assert.equal(view.reservations[0].outcome, "unknown"); assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
});
test("completed state is terminal and produces no live execution permission", async () => {
  const h = setup(); const record = await issued(h); const active = await claimed(h, record);
  await active.coordinator.reserve(active.session, "read-1", "get", record.draft.manifest.fixtures[0].objectKey);
  await active.coordinator.settle(active.session, "read-1", "observed"); await active.coordinator.complete(active.session);
  const view = (await h.coordinator().read())[0]; assert.equal(view.state, "completed"); assert.equal(view.consumed, true);
  assert.equal(active.coordinator.executionAllowed, false);
  await assert.rejects(active.coordinator.reserve(active.session, "read-2", "get", record.draft.manifest.fixtures[0].objectKey), hasCode("invalid-session"));
});
test("reservation budgets, key isolation and concurrency are enforced atomically", async () => {
  for (const mode of ["concurrency", "key", "puts", "duration"] as const) {
    const h = setup(); const base = request();
    if (mode === "puts") base.manifest = prepareR2CaptureArchiveQualificationV1({ ...base.manifest.plan, limits: { ...base.manifest.plan.limits, puts: 1 } });
    const record = await issued(h, prepareR2QualificationApprovalV1(base)); const active = await claimed(h, record);
    const key = record.draft.manifest.fixtures[0].objectKey;
    await active.coordinator.reserve(active.session, "first", "put", key);
    if (mode === "concurrency") {
      await active.coordinator.reserve(active.session, "second", "get", key);
      await assert.rejects(active.coordinator.reserve(active.session, "third", "get", key), hasCode("budget"));
    } else if (mode === "key") await assert.rejects(active.coordinator.reserve(active.session, "outside", "put", record.draft.manifest.missingObjectKey), hasCode("invalid-input"));
    else if (mode === "puts") {
      await active.coordinator.settle(active.session, "first", "observed");
      await assert.rejects(active.coordinator.reserve(active.session, "second", "put", key), hasCode("budget"));
    } else {
      h.state.clock.earliestMs += record.draft.manifest.plan.limits.durationMs; h.state.clock.latestMs = h.state.clock.earliestMs;
      await assert.rejects(active.coordinator.reserve(active.session, "late", "get", key), hasCode("outside-window"));
    }
    assert.equal((await h.coordinator().read())[0].consumed, true);
  }
});
test("before-commit failure leaves both consumption and audit unchanged and returns no session", async () => {
  const h = setup(); const record = await issued(h); const before = await h.ledger.read(); const head = h.witness.read();
  h.state.fault = "before-commit"; const result = await h.coordinator().claim(reference(record));
  assert.equal(result.status, "unavailable"); assert.deepEqual(await h.ledger.read(), before); assert.deepEqual(h.witness.read(), head);
  assert.equal((await h.coordinator().read())[0].consumed, false);
});
test("lost claim acknowledgement burns approval and later reads never grant a session", async () => {
  const h = setup(); const record = await issued(h); h.state.fault = "after-commit";
  const result = await h.coordinator().claim(reference(record)); assert.equal(result.status, "unavailable");
  h.state.fault = "none"; assert.equal((await h.coordinator().read())[0].consumed, true);
  assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
});
test("checkpoint publication failure quarantines the authority without granting a session", async () => {
  const h = setup(); const record = await issued(h); const prefix = await h.ledger.read(); h.state.fault = "after-state";
  const result = await h.coordinator().claim(reference(record)); assert.equal(result.status, "unavailable");
  await assert.rejects(h.ledger.read(), hasCode("authority-uncertain"));
  assert.throws(() => validateR2ApprovalRecoveryV1(prefix, h.authorityId, h.generation, h.witness), hasCode("checkpoint"));
  assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
});
test("late committed response after claim timeout cannot create a session", async () => {
  const h = setup(); const record = await issued(h); let resolve!: (value: unknown) => void;
  const wrapped: R2ApprovalModelTransportV1 = { read: h.ledger.read,
    transact: async (command, signal) => { const result = await h.ledger.transact(command, signal); return new Promise(done => { resolve = () => done(result); }); } };
  const coordinator = h.coordinator(wrapped); const pending = coordinator.claim(reference(record));
  await tick(); h.timers.at(-1)!.callback(); const result = await pending; assert.equal(result.status, "unavailable");
  resolve(undefined); await tick(); assert.equal((await coordinator.read())[0].consumed, true);
  assert.equal((await h.coordinator().claim(reference(record))).status, "unavailable");
});
test("timeout before dispatch creates no claim, grant or retry", async () => {
  const h = setup(); const record = await issued(h); let calls = 0;
  const coordinator = createOfflineR2ApprovalCoordinatorV1({ authorityId: h.authorityId, generation: h.generation, witness: h.witness,
    transport: { read: h.ledger.read, transact: async () => { calls++; throw new Error("must not dispatch"); } },
    armDeadline: callback => { callback(); return () => {}; } });
  assert.equal((await coordinator.claim(reference(record))).status, "unavailable"); assert.equal(calls, 0);
  assert.equal((await h.coordinator().read())[0].consumed, false);
});
test("missing, corrupt, reordered, truncated and rolled-back audit snapshots reject", async () => {
  const h = setup(); const record = await issued(h); const prefix = await h.ledger.read(); await claimed(h, record);
  const full = rawSnapshot(await h.ledger.read());
  const corrupt = clone(full); corrupt.events[0].eventSha256 = "e".repeat(64);
  const reordered = clone(full); reordered.events.reverse();
  const truncated = clone(full); truncated.events.pop();
  const omitted = clone(full); omitted.events.shift();
  for (const value of [undefined, null, {}, { ...full, events: [] }, prefix, corrupt, reordered, truncated, omitted,
    { ...full, generation: "unknown" }, { ...full, authorityId: "different" }]) {
    assert.throws(() => validateR2ApprovalRecoveryV1(value, h.authorityId, h.generation, h.witness));
  }
  assert.throws(() => createOfflineR2ApprovalLedgerV1({ ...h.dependencies, recoveredSnapshot: prefix }), hasCode("checkpoint"));
  assert.throws(() => createOfflineR2ApprovalLedgerV1({ ...h.dependencies, witness: { read: () => null, compareAndSet: () => false }, recoveredSnapshot: full }));
  assert.equal(validateR2ApprovalRecoveryV1(full, h.authorityId, h.generation, h.witness)[0].consumed, true);
});
test("a locally valid prefix is insufficient without the current independent witness", async () => {
  const h = setup(); const record = await issued(h); const prefix = await h.ledger.read(); await claimed(h, record);
  assert.throws(() => validateR2ApprovalRecoveryV1(prefix, h.authorityId, h.generation, h.witness), hasCode("checkpoint"));
  // Fabricated new genesis witness cannot validate any nonempty retained history.
  assert.throws(() => validateR2ApprovalRecoveryV1(prefix, h.authorityId, h.generation,
    createOfflineR2ApprovalWitnessV1(h.authorityId, h.generation)), hasCode("checkpoint"));
});
test("rehashing an impossible transition still fails semantic audit replay", async () => {
  const h = setup(); const record = await issued(h); await claimed(h, record); const snapshot = rawSnapshot(await h.ledger.read());
  const last = snapshot.events[1]; const first = snapshot.events[0];
  last.command = first.command; last.authorization = first.authorization;
  const { eventSha256: ignored, ...body } = last; void ignored;
  function canonical(value: unknown): string {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (typeof value === "object" && value !== null) { const data = value as Record<string, unknown>;
      return "{" + Object.keys(data).sort().map(key => JSON.stringify(key) + ":" + canonical(data[key])).join(",") + "}"; }
    return JSON.stringify(value) ?? "null";
  }
  last.eventSha256 = createHash("sha256").update(canonical(["chronoverse:calendar:r2-qualification-approval:v1", "audit-event", body])).digest("hex");
  assert.throws(() => validateR2ApprovalRecoveryV1(snapshot, h.authorityId, h.generation, h.witness), hasCode("audit-invalid"));
});
test("record capacity and oversized recovery inputs fail without eviction", async () => {
  const h = setup();
  for (let index = 0; index < R2_APPROVAL_BOUNDS_V1.records; index++) await issued(h);
  await assert.rejects(issued(h), hasCode("capacity")); assert.equal((await h.coordinator().read()).length, 8);
  const snapshot = rawSnapshot(await h.ledger.read());
  assert.throws(() => validateR2ApprovalRecoveryV1({ ...snapshot, events: Array(129).fill(null) }, h.authorityId, h.generation, h.witness));
  assert.throws(() => validateR2ApprovalRecoveryV1({ ...snapshot, extra: "s".repeat(262145) }, h.authorityId, h.generation, h.witness));
});
test("errors, malformed acknowledgements, unavailable checkpoints and issuer exceptions are sanitized", async () => {
  const h = setup(); const record = await issued(h);
  for (const response of [true, "private-token", { status: "applied", secret: "private-token" }, null]) {
    const transport: R2ApprovalModelTransportV1 = { read: h.ledger.read, transact: async () => response };
    const result = await h.coordinator(transport).claim(reference(record));
    assert.equal(result.status, "unavailable"); assert.ok(!JSON.stringify(result).includes("private-token"));
  }
  const broken: R2ApprovalModelTransportV1 = { read: async () => { throw new Error("private-provider-detail"); }, transact: async () => { throw new Error("private-provider-detail"); } };
  const result = await h.coordinator(broken).claim(reference(record)); assert.ok(!JSON.stringify(result).includes("private-provider-detail"));
  h.state.authorize = () => { throw new Error("private-authorization-token"); };
  await assert.rejects(issued(h), error => error instanceof Error && error.message === "Offline qualification approval unavailable.");
});
test("checkpoint corruption and state reset cannot masquerade as fresh authority", async () => {
  const h = setup(); await issued(h);
  assert.throws(() => createOfflineR2ApprovalLedgerV1({ ...h.dependencies }), hasCode("checkpoint"));
  const bad = { ...h.dependencies, generation: "other-generation" };
  assert.throws(() => createOfflineR2ApprovalLedgerV1(bad));
});
test("live R2 qualification remains blocked and ledger observations cannot qualify historical evidence", async () => {
  const h = setup(); const record = await issued(h); await claimed(h, record);
  const manifest = record.draft.manifest; let constructed = 0;
  const result = await executeR2CaptureArchiveQualificationV1(manifest, { schemaVersion: R2_QUALIFICATION_APPROVAL_V1,
    mode: "live", approvalId: "blocked-live-approval", accountId: manifest.plan.target.accountId,
    bucket: manifest.plan.target.bucket.name, runId: manifest.plan.runId, manifestSha256: manifest.manifestSha256, expiresAt: wall + 120000 },
  { now: () => wall, monotonicNow: () => 0, createOfflineTransport: () => { constructed++; throw new Error(); } });
  assert.equal(result.reason, "live-replay-unavailable"); assert.equal(constructed, 0);
  const capture = prepareCalendarCaptureV1(await captureFixtureV1()); assert.ok(capture.status === "prepared");
  for (const { event } of capture.record.eventVersions) assert.equal(selectCalendarEventAsOfV1({ versions: [event],
    knowledgeCutoff: "9999-12-31T23:59:59.999Z", evaluatedAt: "9999-12-31T23:59:59.999Z" }).status, "unavailable");
});
test("source is isolated, server-only, provider independent and has no live persistence capability", () => {
  const source = readFileSync(new URL("../../calendar/r2QualificationApproval.ts", import.meta.url), "utf8");
  assert.ok(source.startsWith('import "server-only";')); assert.ok(source.includes('executionAllowed: false'));
  assert.doesNotMatch(source, /process\.env|fetch\(|@upstash|S3Client|DeleteObject|CreateBucket|@cloudflare|drizzle|supabase/);
  assert.equal(R2_APPROVAL_LEDGER_V1, "calendar-r2-offline-approval-ledger-v1");
});

test("a decision for a previous exact command cannot authorize a changed draft", async () => {
  const h = setup(); let captured: ReturnType<typeof decision> | undefined;
  h.state.authorize = value => { captured = decision(value); return captured; };
  await issued(h); assert.ok(captured);
  const oldDecision = captured; h.state.authorize = () => oldDecision;
  await assert.rejects(issued(h), hasCode("unauthorized"));
  const asynchronous = setup(); asynchronous.state.authorize = value => Promise.resolve(decision(value));
  await assert.rejects(issued(asynchronous), hasCode("unauthorized"));
});

test("independent restored authorities cannot fork a single retained checkpoint", async () => {
  const h = setup(); const record = await issued(h); const snapshot = await h.ledger.read();
  const other = createOfflineR2ApprovalLedgerV1({ ...h.dependencies, recoveredSnapshot: snapshot });
  const results = await Promise.all([h.coordinator().claim(reference(record)), h.coordinator(other).claim(reference(record))]);
  assert.equal(results.filter(result => result.status === "claimed").length, 1);
  assert.equal(results.filter(result => result.status === "unavailable").length, 1);
});

test("GET budgets and repeated reservation identities cannot be refunded", async () => {
  for (const duplicate of [false, true]) {
    const h = setup(); const value = request();
    value.manifest = prepareR2CaptureArchiveQualificationV1({ ...value.manifest.plan, limits: { ...value.manifest.plan.limits, gets: 1 } });
    const record = await issued(h, prepareR2QualificationApprovalV1(value)); const active = await claimed(h, record);
    const key = record.draft.manifest.missingObjectKey;
    await active.coordinator.reserve(active.session, "get-one", "get", key);
    await active.coordinator.settle(active.session, "get-one", "unknown");
    await assert.rejects(active.coordinator.reserve(active.session, duplicate ? "get-one" : "get-two", "get", key), hasCode(duplicate ? "invalid-input" : "budget"));
    assert.equal((await h.coordinator().read())[0].reservations.length, 1);
  }
});

test("the audit event ceiling rejects a further reservation without changing its head", async () => {
  const h = setup(); const record = await issued(h); const active = await claimed(h, record);
  const key = record.draft.manifest.missingObjectKey;
  for (let index = 0; index < 63; index++) {
    await active.coordinator.reserve(active.session, "reservation-" + index, "get", key);
    await active.coordinator.settle(active.session, "reservation-" + index, "observed");
  }
  const before = h.witness.read();
  await assert.rejects(active.coordinator.reserve(active.session, "capacity", "get", key), hasCode("capacity"));
  assert.deepEqual(h.witness.read(), before);
});

test("forged protocol errors cannot expose custom messages or causes", async () => {
  const h = setup(); const record = await issued(h);
  const error = new R2QualificationApprovalErrorV1("storage-unavailable"); error.message = "private-authentication-material";
  const transport: R2ApprovalModelTransportV1 = { read: h.ledger.read, transact: async () => { throw error; } };
  const result = await h.coordinator(transport).claim(reference(record));
  assert.equal(result.status, "unavailable"); assert.ok(!JSON.stringify(result).includes("private-authentication-material"));
});
