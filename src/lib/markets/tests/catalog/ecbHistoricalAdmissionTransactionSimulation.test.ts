import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import {
  createEcbHistoricalAdmissionTransactionSimulationV1 as create,
  restoreEcbHistoricalAdmissionTransactionSimulationV1 as restore,
  ECB_HISTORICAL_SIMULATION_CHECKPOINT_SCHEMA_V1,
  ECB_HISTORICAL_SIMULATION_FAULT_POINTS_V1,
  ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1,
  ECB_HISTORICAL_SIMULATION_MAX_TRANSACTIONS_V1,
  ECB_HISTORICAL_SIMULATION_MAX_VERSIONS_V1,
  type EcbHistoricalAdmissionTransactionSimulationV1 as Coordinator,
  type EcbHistoricalSimulationCommitV1,
  type EcbHistoricalSimulationOutcomeV1,
  type EcbHistoricalSimulationProposalV1,
  type EcbHistoricalSimulationRefusalV1,
  type EcbHistoricalSimulationViewV1,
} from "../../catalog/ecbHistoricalAdmissionTransactionSimulation";
import { createEcbHistoricalByteCustodyEnvelopeV1 } from "../../catalog/ecbHistoricalByteCustodyEnvelope";
import { ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 } from "../../catalog/ecbHistoricalAdmissionPlanning";
import { normalizeEcbMonetaryPolicyEventV1 } from "../../events/ecbMonetaryPolicy";
import { buildEcbMonetaryPolicyEventSnapshotV1 } from "../../events/ecbMonetaryPolicyMemory";

const BASE = Date.parse("2026-09-10T12:20:00.000Z") / 1_000;
const URL = "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260910~abc123.en.html";
function payload(version = 1, offset = version, meetingDate = "2026-09-10", documentUrl = URL) {
  return JSON.stringify(buildEcbMonetaryPolicyEventSnapshotV1(normalizeEcbMonetaryPolicyEventV1({
    canonicalMeetingDate: meetingDate,
    schedule: { meetingDate, fetchedAt: BASE + offset - 1 },
    decision: {
      decisionDate: meetingDate, documentUrl, contentDigest: version.toString(16).padStart(64, "0"),
      fetchedAt: BASE + offset, firstObservedAt: BASE + offset - 2, actualReleasedAt: null,
      rates: { depositFacility: 2, mainRefinancingOperations: 2.15,
        marginalLendingFacility: 2.4, effectiveDate: "2026-09-16" },
    },
  })));
}
function envelope(text = payload()) {
  const result = createEcbHistoricalByteCustodyEnvelopeV1(text);
  assert.equal(result.status, "envelope");
  if (result.status !== "envelope") throw new Error("Invalid synthetic fixture");
  return JSON.stringify(result);
}
function propose(c: Coordinator, key: string, wire = envelope()): EcbHistoricalSimulationProposalV1 {
  const result = c.propose(key, wire);
  assert.equal(result.kind, "proposal");
  if (result.kind !== "proposal") throw new Error("Expected proposal");
  return result;
}
function record(c: Coordinator, key: string, wire = envelope(), outcome: EcbHistoricalSimulationOutcomeV1 = "accepted") {
  const result = c.commit(propose(c, key, wire));
  assert.equal(result.kind, "committed");
  if (result.kind !== "committed") throw new Error("Expected commit");
  assert.equal(result.receipt.outcome, outcome);
  assert.equal(result.auditRecorded, true);
  invariant(c);
  return result;
}
function refused(result: { readonly kind: string }, reason: EcbHistoricalSimulationRefusalV1["reason"]) {
  assert.equal(result.kind, "refused");
  const value = result as EcbHistoricalSimulationRefusalV1;
  assert.equal(value.reason, reason);
  assert.equal(value.auditRecorded, false);
  assert.equal(value.objectVerified, false);
  assert.equal(value.ownershipVerified, false);
  assert.ok(Object.isFrozen(value));
}
function frozen(value: unknown) {
  if (typeof value !== "object" || value === null) return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozen(child);
}
function invariant(c: Coordinator) {
  const view = c.inspect();
  frozen(view);
  assert.equal(view.commitSequence, view.journal.length);
  assert.equal(view.commitSequence, view.receipts.length);
  assert.equal(view.commitSequence, view.audit.length);
  assert.equal(view.modelRevision, view.acceptedVersions.length);
  assert.equal(view.acceptedVersions.length, view.bytes.length);
  assert.equal(view.acceptedVersions.length, view.outbox.length);
  assert.ok(view.commitSequence <= ECB_HISTORICAL_SIMULATION_MAX_TRANSACTIONS_V1);
  assert.ok(view.acceptedVersions.length <= ECB_HISTORICAL_SIMULATION_MAX_VERSIONS_V1);
  assert.ok(Buffer.byteLength(c.exportCheckpoint(), "utf8") <= ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1);
  for (let i = 0; i < view.receipts.length; i++) {
    const receipt = view.receipts[i]!;
    assert.equal(receipt.commitSequence, i + 1);
    assert.equal(receipt.requestKey, view.journal[i]!.requestKey);
    assert.equal(receipt.envelopeJson, view.journal[i]!.envelopeJson);
    assert.equal(receipt.outcome, view.audit[i]!.outcome);
    assert.equal(receipt.scope, c.scope);
    assert.equal(receipt.principal, c.principal);
    assert.equal(receipt.operation, "admit");
    assert.equal(receipt.ownershipVerified, false);
    assert.equal(receipt.objectVerified, false);
  }
  for (let i = 0; i < view.acceptedVersions.length; i++) {
    const version = view.acceptedVersions[i]!;
    const bytes = view.bytes[i]!;
    const task = view.outbox[i]!;
    assert.equal(version.acceptedVersionId, i + 1);
    assert.equal(bytes.acceptedVersionId, version.acceptedVersionId);
    assert.equal(task.acceptedVersionId, version.acceptedVersionId);
    assert.equal(task.taskId, i + 1);
    assert.equal(task.commitSequence, version.commitSequence);
    assert.equal(task.status, "queued");
    assert.equal(task.taskType, "persist-canonical-bytes");
    assert.equal(version.status, "admitted-pending-object");
    assert.equal(version.sha256, createHash("sha256").update(Buffer.from(bytes.envelope.payloadText, "utf8")).digest("hex"));
    assert.equal(version.byteLength, Buffer.byteLength(bytes.envelope.payloadText, "utf8"));
    assert.equal(bytes.envelopeJson, JSON.stringify(bytes.envelope));
    assert.equal(version.objectVerified, false);
    assert.equal(version.ownershipVerified, false);
    assert.equal(task.objectVerified, false);
    if (i > 0) assert.ok(view.acceptedVersions[i - 1]!.knownAt < version.knownAt);
  }
  assert.equal(view.canonicalEventId, view.acceptedVersions[0]?.canonicalEventId ?? null);
}
function unchanged(c: Coordinator, action: () => void) {
  const before = c.inspect();
  const wire = c.exportCheckpoint();
  action();
  assert.strictEqual(c.inspect(), before);
  assert.equal(c.exportCheckpoint(), wire);
}
function restored(wire: unknown) {
  const result = restore(wire);
  assert.equal(result.kind, "restored");
  if (result.kind !== "restored") throw new Error("Expected restored coordinator");
  assert.ok(Object.isFrozen(result));
  invariant(result.coordinator);
  return result.coordinator;
}

/**
 * Test-only local realm: observe the simulator's WeakMap values without adding a
 * production debug API, changing global intrinsics, or exposing authority handles.
 * Only the exact simulator source is read; its two authoritative imports retain
 * their normal host realm and native WeakMaps. Compilation emits only to memory.
 */
function observePrivateProposals() {
  const bindings: object[] = [];
  class ObservedWeakMap extends WeakMap<object, object> {
    override set(key: object, value: object) {
      bindings.push(value);
      return super.set(key, value);
    }
  }
  const filename = resolve("src/lib/markets/catalog/ecbHistoricalAdmissionTransactionSimulation.ts");
  const compiled = transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2017, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const observedModule = { exports: {} };
  runInNewContext(compiled, {
    exports: observedModule.exports, require: createRequire(filename), WeakMap: ObservedWeakMap,
  }, { filename });
  return { bindings, api: observedModule.exports as typeof import("../../catalog/ecbHistoricalAdmissionTransactionSimulation") };
}

/** Check the actual retained object graph, not just its TypeScript declaration. */
function requestOnlyBinding(binding: object, baseCommitSequence: number) {
  assert.deepEqual(Reflect.ownKeys(binding), ["baseCommitSequence", "requestKey", "envelopeJson", "envelope", "candidate"]);
  assert.equal((binding as { baseCommitSequence: unknown }).baseCommitSequence, baseCommitSequence);
  const visited = new WeakSet<object>();
  const stateFields = new Set(["base", "checkpoint", "journal", "acceptedVersions", "outbox", "receipts",
    "audit", "bytes", "model", "view", "entries", "revision"]);
  function visit(value: unknown) {
    if (value === null) return;
    if (typeof value !== "object") {
      assert.ok(["string", "number", "boolean"].includes(typeof value));
      if (typeof value === "string") {
        assert.ok(!value.startsWith(`{"schemaVersion":"${ECB_HISTORICAL_SIMULATION_CHECKPOINT_SCHEMA_V1}"`));
      }
      return;
    }
    assert.ok(Object.isFrozen(value));
    assert.ok(!Array.isArray(value), "proposal binding must not retain row collections");
    if (visited.has(value)) return;
    visited.add(value);
    for (const key of Reflect.ownKeys(value)) {
      assert.equal(typeof key, "string");
      assert.ok(!stateFields.has(key as string), `proposal retains coordinator state field: ${String(key)}`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      assert.ok("value" in descriptor, "proposal binding must not retain accessor closures");
      visit(descriptor.value);
    }
  }
  visit(binding);
}

test("first admission replaces one complete immutable synthetic head", () => {
  const c = create();
  assert.ok(Object.isFrozen(c));
  invariant(c);
  const before = c.inspect();
  const p = propose(c, "first");
  assert.strictEqual(c.inspect(), before);
  assert.equal(p.baseCommitSequence, 0);
  const result = c.commit(p);
  assert.equal(result.kind, "committed");
  invariant(c);
  assert.equal(before.commitSequence, 0);
  assert.equal(c.inspect().commitSequence, 1);
  assert.equal(c.inspect().modelRevision, 1);
  assert.equal(c.inspect().bytes[0]!.envelope.payloadText, payload());
  assert.equal(c.inspect().receipts[0]!.acceptedVersionId, 1);
  assert.equal(c.inspect().audit[0]!.outcome, "accepted");
});

test("two empty-base proposals cannot both initialize; a fresh plan can follow", () => {
  const c = create();
  const first = propose(c, "one");
  const second = propose(c, "two", envelope(payload(2)));
  assert.equal(c.commit(first).kind, "committed");
  unchanged(c, () => refused(c.commit(second), "PRECONDITION_FAILED"));
  record(c, "two", envelope(payload(2)));
  assert.equal(c.inspect().acceptedVersions.length, 2);
});

test("competing identical-key proposals replay the original initializer", () => {
  const c = create();
  const a = propose(c, "same");
  const b = propose(c, "same");
  const first = c.commit(a) as EcbHistoricalSimulationCommitV1;
  unchanged(c, () => {
    const again = c.commit(b) as EcbHistoricalSimulationCommitV1;
    assert.equal(again.kind, "replay");
    assert.strictEqual(again.receipt, first.receipt);
    assert.equal(again.auditRecorded, false);
  });
});

test("audit-only transactions invalidate plans while model revision stays fixed", () => {
  const c = create();
  record(c, "first");
  const p = propose(c, "future", envelope(payload(2)));
  record(c, "duplicate", envelope(), "duplicate");
  assert.equal(c.inspect().modelRevision, 1);
  assert.equal(c.inspect().commitSequence, 2);
  unchanged(c, () => refused(c.commit(p), "PRECONDITION_FAILED"));
});

test("exact old semantic bytes remain duplicates after newer knowledge", () => {
  const c = create();
  record(c, "v1");
  record(c, "v2", envelope(payload(2)));
  const before = c.inspect();
  const result = record(c, "older", envelope(), "duplicate");
  assert.equal(result.receipt.acceptedVersionId, 1);
  assert.equal(result.receipt.modelRevision, 2);
  assert.strictEqual(c.inspect().acceptedVersions, before.acceptedVersions);
  assert.strictEqual(c.inspect().bytes, before.bytes);
  assert.strictEqual(c.inspect().outbox, before.outbox);
});

test("semantic-equal different bytes conflict before stale/equal/new chronology", () => {
  const c = create();
  record(c, "first");
  record(c, "new", envelope(payload(2, 20)));
  for (const offset of [0, 1, 30]) {
    let text = payload(1, offset);
    if (offset === 1) {
      const raw = JSON.parse(text);
      raw.event.schedule.fetchedAt -= 4;
      text = JSON.stringify(raw);
    }
    const original = JSON.parse(envelope());
    const recapture = JSON.parse(envelope(text));
    assert.equal(original.eventSourceVersionId, recapture.eventSourceVersionId);
    assert.notEqual(original.sha256, recapture.sha256);
    record(c, `recapture:${offset}`, JSON.stringify(recapture), "integrity-conflict");
  }
  assert.equal(c.inspect().acceptedVersions.length, 2);
});

test("new stale version, equal-knownAt version and other event are audited rejections", () => {
  const c = create();
  record(c, "first", envelope(payload(1, 10)));
  const before = c.inspect();
  record(c, "stale", envelope(payload(2, 9)), "stale");
  record(c, "equal", envelope(payload(3, 10)), "chronology-conflict");
  record(c, "other", envelope(payload(4, 30, "2026-09-11")), "event-id-mismatch");
  assert.strictEqual(c.inspect().bytes, before.bytes);
  assert.strictEqual(c.inspect().acceptedVersions, before.acceptedVersions);
  assert.strictEqual(c.inspect().outbox, before.outbox);
  assert.equal(c.inspect().modelRevision, 1);
  assert.equal(c.inspect().commitSequence, 4);
});

test("lost acknowledgement and stale-base retries recover the identical immutable receipt", () => {
  const c = create();
  const lost = propose(c, "lost");
  c.commit(lost); // Discard completed response: commit was already visible.
  const original = c.inspect().receipts[0]!;
  record(c, "next", envelope(payload(2)));
  for (const p of [lost, propose(c, "lost")]) {
    unchanged(c, () => {
      const result = c.commit(p) as EcbHistoricalSimulationCommitV1;
      assert.equal(result.kind, "replay");
      assert.strictEqual(result.receipt, original);
      assert.equal(result.receipt.modelRevision, 1);
      assert.equal(result.receipt.commitSequence, 1);
      assert.equal(result.auditRecorded, false);
    });
  }
});

test("key misuse is audit-only, never replaces original key binding, and is replayable by reconstruction", () => {
  const c = create();
  const first = record(c, "bound");
  const changed = envelope(payload(2));
  record(c, "bound", changed, "idempotency-conflict");
  record(c, "bound", changed, "idempotency-conflict");
  assert.equal(c.inspect().acceptedVersions.length, 1);
  const r = c.commit(propose(c, "bound")) as EcbHistoricalSimulationCommitV1;
  assert.strictEqual(r.receipt, first.receipt);
  const next = restored(c.exportCheckpoint());
  assert.deepEqual(next.inspect(), c.inspect());
});

test("stale changed-key proposals fail before key misuse classification", () => {
  const c = create();
  record(c, "bound");
  const p = propose(c, "bound", envelope(payload(2)));
  record(c, "audit", envelope(), "duplicate");
  unchanged(c, () => refused(c.commit(p), "PRECONDITION_FAILED"));
});

test("audited rejected requests replay original receipts without being reclassified", () => {
  const c = create();
  record(c, "first", envelope(payload(1, 10)));
  const rejectedWire = envelope(payload(2, 9));
  const old = propose(c, "rejected", rejectedWire);
  const rejection = c.commit(old) as EcbHistoricalSimulationCommitV1;
  assert.equal(rejection.receipt.outcome, "stale");
  record(c, "new", envelope(payload(3, 20)));
  for (const p of [old, propose(c, "rejected", rejectedWire)]) {
    unchanged(c, () => {
      const replay = c.commit(p) as EcbHistoricalSimulationCommitV1;
      assert.equal(replay.kind, "replay");
      assert.strictEqual(replay.receipt, rejection.receipt);
      assert.equal(replay.receipt.commitSequence, 2);
      assert.equal(replay.receipt.modelRevision, 1);
    });
  }
});

test("authority precedes replay, and exact replay precedes staleness and fault staging", () => {
  const c = create();
  const issued = propose(c, "first");
  c.commit(issued);
  record(c, "new", envelope(payload(2)));
  unchanged(c, () => refused(c.commit({ ...issued }), "INVALID_PROPOSAL"));
  unchanged(c, () => refused(c.commit(propose(create(), "first")), "INVALID_PROPOSAL"));
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const fault of ["before-swap", "unrecognized", revoked.proxy]) {
    unchanged(c, () => {
      const result = c.commit(issued, fault) as EcbHistoricalSimulationCommitV1;
      assert.equal(result.kind, "replay");
      assert.equal(result.auditRecorded, false);
    });
  }
});

test("64 retained maximum-payload proposals contain request data and primitive bases only", () => {
  const { api, bindings } = observePrivateProposals();
  const c = api.createEcbHistoricalAdmissionTransactionSimulationV1();
  const padding = ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 - Buffer.byteLength(payload(), "utf8");
  const text = payload(1, 1, "2026-09-10", URL.replace("abc123", `abc123${"x".repeat(padding)}`));
  const wire = envelope(text);
  const retained: EcbHistoricalSimulationProposalV1[] = [];
  for (let i = 0; i < 64; i++) {
    const p = propose(c, `retained:${i}`, wire);
    retained.push(p);
    const result = c.commit(p) as EcbHistoricalSimulationCommitV1;
    assert.equal(result.kind, "committed");
    assert.equal(result.receipt.outcome, i === 0 ? "accepted" : "duplicate");
    assert.equal(bindings.length, i + 1);
    requestOnlyBinding(bindings[i]!, i);
  }
  assert.equal(c.inspect().commitSequence, 64);
  assert.equal(c.inspect().modelRevision, 1);
  // Old handles still recover their original receipts without retaining old heads.
  for (let i = 0; i < retained.length; i++) {
    unchanged(c, () => {
      const replay = c.commit(retained[i]) as EcbHistoricalSimulationCommitV1;
      assert.equal(replay.kind, "replay");
      assert.strictEqual(replay.receipt, c.inspect().receipts[i]);
      assert.equal(replay.auditRecorded, false);
    });
  }
  invariant(c);
});

test("retained primitive-base proposals become stale after audit-only commits and remain retryable after abort", () => {
  const { api, bindings } = observePrivateProposals();
  const c = api.createEcbHistoricalAdmissionTransactionSimulationV1();
  const first = propose(c, "first");
  const aborted = c.commit(first, "before-swap");
  refused(aborted, "INJECTED_ABORT");
  assert.equal(c.inspect().commitSequence, 0);
  requestOnlyBinding(bindings[0]!, 0);
  assert.equal(c.commit(first).kind, "committed");
  const pending = propose(c, "future", envelope(payload(2)));
  const keyMisuse = propose(c, "first", envelope(payload(2)));
  record(c, "rejection", envelope(payload(1, 2)), "integrity-conflict");
  assert.equal(c.inspect().modelRevision, 1);
  assert.equal(c.inspect().commitSequence, 2);
  requestOnlyBinding(bindings[1]!, 1);
  requestOnlyBinding(bindings[2]!, 1);
  unchanged(c, () => refused(c.commit(pending), "PRECONDITION_FAILED"));
  unchanged(c, () => refused(c.commit(keyMisuse), "PRECONDITION_FAILED"));
  unchanged(c, () => assert.equal(c.commit(first).kind, "replay"));
});

test("equal primitive base counters never grant authority across coordinators or restoration", () => {
  const { api, bindings } = observePrivateProposals();
  const c = api.createEcbHistoricalAdmissionTransactionSimulationV1();
  const other = api.createEcbHistoricalAdmissionTransactionSimulationV1();
  const p = propose(c, "first");
  const foreign = propose(other, "first");
  requestOnlyBinding(bindings[0]!, 0);
  requestOnlyBinding(bindings[1]!, 0);
  unchanged(c, () => refused(c.commit(foreign), "INVALID_PROPOSAL"));
  unchanged(c, () => refused(c.commit({ ...p }), "INVALID_PROPOSAL"));
  const result = api.restoreEcbHistoricalAdmissionTransactionSimulationV1(c.exportCheckpoint());
  assert.equal(result.kind, "restored");
  if (result.kind !== "restored") throw new Error("Expected restored coordinator");
  assert.equal(result.coordinator.inspect().commitSequence, p.baseCommitSequence);
  unchanged(result.coordinator, () => refused(result.coordinator.commit(p), "INVALID_PROPOSAL"));
  assert.equal(c.commit(p).kind, "committed");
  assert.equal(result.coordinator.commit(propose(result.coordinator, "first")).kind, "committed");
});

for (const fault of ECB_HISTORICAL_SIMULATION_FAULT_POINTS_V1) {
  test(`injected ${fault} abort leaves every staged bundle invisible and retryable`, () => {
    for (const outcome of ["accepted", "duplicate", "integrity-conflict", "idempotency-conflict"] as const) {
      const c = create();
      if (outcome !== "accepted") record(c, "first");
      const key = outcome === "idempotency-conflict" ? "first" : "attempt";
      const wire = outcome === "idempotency-conflict" ? envelope(payload(2)) :
        outcome === "integrity-conflict" ? envelope(payload(1, 2)) : envelope();
      const p = propose(c, key, wire);
      unchanged(c, () => refused(c.commit(p, fault), "INJECTED_ABORT"));
      const committed = c.commit(p) as EcbHistoricalSimulationCommitV1;
      assert.equal(committed.kind, "committed");
      assert.equal(committed.receipt.outcome, outcome);
      invariant(c);
    }
  });
}

test("closed fault enum rejects callbacks and hostile values without executing them", () => {
  const c = create();
  const p = propose(c, "first");
  let calls = 0;
  for (const fault of [null, 1, "after-write", {}, () => { calls++; }]) {
    unchanged(c, () => refused(c.commit(p, fault), "INVALID_FAULT_POINT"));
  }
  assert.equal(calls, 0);
  assert.equal(c.commit(p).kind, "committed");
});

test("proposal authority rejects copied, forged, serialized, cross-instance and hostile handles", () => {
  const c = create();
  const p = propose(c, "first");
  let traps = 0;
  const hostile = new Proxy({}, { get() { traps++; throw Error("trap"); },
    getPrototypeOf() { traps++; throw Error("trap"); }, ownKeys() { traps++; throw Error("trap"); } });
  const getter = Object.defineProperty({}, "kind", { get() { traps++; throw Error("getter"); } });
  const revoked = Proxy.revocable(p, {});
  revoked.revoke();
  for (const bad of [null, undefined, "proposal", [], {}, { ...p }, JSON.parse(JSON.stringify(p)),
    Object.create(p), new Proxy(p, {}), hostile, getter, revoked.proxy, propose(create(), "foreign")]) {
    unchanged(c, () => refused(c.commit(bad), "INVALID_PROPOSAL"));
  }
  assert.equal(traps, 0);
  assert.equal(c.commit(p).kind, "committed");
});

test("all public data and aliases are deeply frozen; no caller state/model is accepted", () => {
  const c = create();
  const p = propose(c, "first");
  assert.equal(Reflect.set(p, "baseCommitSequence", 99), false);
  assert.equal(Reflect.set(p, "nextModel", {}), false);
  const result = c.commit(p);
  frozen(result);
  const before = c.inspect();
  assert.equal(Reflect.set(before.bytes[0]!.envelope, "payloadText", "forged"), false);
  assert.equal(Reflect.set(before.acceptedVersions[0]!, "status", "verified-readable"), false);
  assert.equal(Reflect.set(before.outbox[0]!, "status", "complete"), false);
  assert.throws(() => (before.journal as unknown[]).push({}));
  const copy = JSON.parse(JSON.stringify(before));
  copy.bytes[0].envelope.payloadText = "forged";
  copy.outbox.length = 0;
  invariant(c);
  assert.strictEqual(c.inspect(), before);
  assert.equal(Reflect.set(c, "inspect", () => copy), false);
});

test("primitive keys are exact, case-sensitive, bounded ASCII; invalid proposals do not audit", () => {
  const c = create();
  let calls = 0;
  const hostile = new Proxy({}, { get() { calls++; throw Error("get"); } });
  for (const key of ["", "x".repeat(65), " a", "a ", "a\n", "é", "a/b", "a\u0000", 1, null,
    undefined, [], {}, new String("key"), hostile]) {
    unchanged(c, () => refused(c.propose(key, envelope()), "INVALID_REQUEST_KEY"));
  }
  assert.equal(calls, 0);
  record(c, "A._:-0");
  record(c, "a._:-0", envelope(), "duplicate");
  record(c, "x".repeat(64), envelope(), "duplicate");
});

test("untrusted envelope inputs retain Slice 1 strict wire validation and bounds", () => {
  const c = create();
  const original = envelope();
  const getter = Object.defineProperty({}, "toJSON", { get() { throw Error("must not read"); } });
  const forged = JSON.parse(original);
  forged.objectVerified = true;
  for (const wire of [null, {}, [], new String(original), getter, Buffer.from(original), "{}", "[", `${original} `,
    original.replace('"sha256":', '"sha256":"forged","sha256":'), JSON.stringify(forged),
    original.replace("utf8-v1", "utf8-v2"), "x".repeat(400_000), "\ud800"]) {
    unchanged(c, () => refused(c.propose("key", wire), "INVALID_ENVELOPE"));
  }
});

test("version capacity refuses only new versions; duplicates, conflicts and exact replay remain usable", () => {
  const c = create();
  for (let i = 1; i <= ECB_HISTORICAL_SIMULATION_MAX_VERSIONS_V1; i++) record(c, `v:${i}`, envelope(payload(i)));
  const full = c.inspect();
  unchanged(c, () => refused(c.commit(propose(c, "overflow", envelope(payload(129)))), "VERSION_LIMIT"));
  record(c, "old", envelope(), "duplicate");
  record(c, "conflict", envelope(payload(1, 130)), "integrity-conflict");
  assert.strictEqual(c.inspect().bytes, full.bytes);
  unchanged(c, () => assert.equal(c.commit(propose(c, "v:1")).kind, "replay"));
  assert.deepEqual(restored(c.exportCheckpoint()).inspect(), c.inspect());
});

test("transaction capacity leaves stale/full refusals unchanged while original receipts replay", () => {
  const c = create();
  const initial = propose(c, "initial");
  const unused = propose(c, "unused", envelope(payload(2)));
  const first = c.commit(initial) as EcbHistoricalSimulationCommitV1;
  for (let i = 1; i < ECB_HISTORICAL_SIMULATION_MAX_TRANSACTIONS_V1; i++) record(c, `audit:${i}`, envelope(), "duplicate");
  unchanged(c, () => refused(c.commit(unused), "PRECONDITION_FAILED"));
  unchanged(c, () => refused(c.commit(propose(c, "overflow")), "TRANSACTION_LIMIT"));
  unchanged(c, () => refused(c.commit(propose(c, "initial", envelope(payload(2)))), "TRANSACTION_LIMIT"));
  unchanged(c, () => {
    const replay = c.commit(initial) as EcbHistoricalSimulationCommitV1;
    assert.equal(replay.kind, "replay");
    assert.strictEqual(replay.receipt, first.receipt);
  });
  assert.deepEqual(restored(c.exportCheckpoint()).inspect(), c.inspect());
});

test("journal-only checkpoint is canonical, fixed context and contains no derived authority", () => {
  const c = create();
  record(c, "first");
  const wire = c.exportCheckpoint();
  const raw = JSON.parse(wire);
  assert.equal(raw.schemaVersion, ECB_HISTORICAL_SIMULATION_CHECKPOINT_SCHEMA_V1);
  assert.deepEqual(Object.keys(raw), ["schemaVersion", "scope", "principal", "operation", "mode", "coverage",
    "ownershipVerified", "objectVerified", "journal"]);
  assert.deepEqual(Object.keys(raw.journal[0]), ["requestKey", "envelopeJson"]);
  assert.equal(raw.principal, c.principal);
  assert.equal(raw.scope, c.scope);
  assert.equal(raw.operation, "admit");
  assert.equal(raw.objectVerified, false);
  assert.equal(raw.ownershipVerified, false);
  assert.equal(JSON.stringify(raw), wire);
  assert.deepEqual(restored(wire).inspect(), c.inspect());
  assert.equal(restored(create().exportCheckpoint()).inspect().commitSequence, 0);
});

test("restore invalidates old proposals and preserves request replay with fresh immutable receipts", () => {
  const c = create();
  const old = propose(c, "first");
  c.commit(old);
  const pending = propose(c, "second", envelope(payload(2)));
  const next = restored(c.exportCheckpoint());
  unchanged(next, () => refused(next.commit(old), "INVALID_PROPOSAL"));
  unchanged(next, () => refused(next.commit(pending), "INVALID_PROPOSAL"));
  const replay = next.commit(propose(next, "first")) as EcbHistoricalSimulationCommitV1;
  assert.equal(replay.kind, "replay");
  assert.deepEqual(replay.receipt, c.inspect().receipts[0]);
  assert.notStrictEqual(replay.receipt, c.inspect().receipts[0]);
  record(next, "second", envelope(payload(2)));
  assert.equal(c.inspect().commitSequence, 1);
});

test("restore rejects forged headers, missing/unknown fields, types and derived readiness claims", () => {
  const wire = create().exportCheckpoint();
  const raw = JSON.parse(wire);
  for (const key of Object.keys(raw)) {
    const missing = { ...raw };
    delete missing[key];
    refused(restore(JSON.stringify(missing)), "INVALID_CHECKPOINT");
    for (const value of [null, 1, true, {}, [], "forged"]) {
      if (key === "journal" && Array.isArray(value)) continue;
      refused(restore(JSON.stringify({ ...raw, [key]: value })), "INVALID_CHECKPOINT");
    }
  }
  for (const field of ["model", "nextModel", "commitSequence", "objectReceipt", "verified", "constructor"]) {
    refused(restore(JSON.stringify({ ...raw, [field]: true })), "INVALID_CHECKPOINT");
  }
  refused(restore(wire.replace('"journal":', '"__proto__":{},"journal":')), "INVALID_CHECKPOINT");
  assert.equal(Object.prototype.hasOwnProperty.call({}, "verified"), false);
});

test("duplicate keys and noncanonical checkpoint representations cannot use JSON.parse last-key-wins", () => {
  const c = create();
  record(c, "first");
  const wire = c.exportCheckpoint();
  for (const bad of [
    wire.replace('"schemaVersion":', '"schemaVersion":"forged","schemaVersion":'),
    wire.replace('"objectVerified":false', '"objectVerified":true,"objectVerified":false'),
    wire.replace('"requestKey":"first"', '"requestKey":"wrong","requestKey":"first"'),
    wire.replace('"requestKey":"first"', '"requestKey":"wrong","request\\u004bey":"first"'),
    wire.replace('"envelopeJson":', '"envelopeJson":"{}","envelopeJson":'),
    ` ${wire}`, `${wire}\n`, JSON.stringify(JSON.parse(wire), null, 2),
    JSON.stringify({ journal: [], ...JSON.parse(wire) }), wire.replace("first", "\\u0066irst"),
  ]) refused(restore(bad), "INVALID_CHECKPOINT");
});

test("restore rejects malformed journal entries, nested envelope forgery and exact no-op replay entries", () => {
  const c = create();
  record(c, "first");
  const raw = JSON.parse(c.exportCheckpoint());
  const entry = raw.journal[0];
  for (const bad of [null, 1, "entry", [], {}, { ...entry, extra: 1 }, { requestKey: "first" },
    { envelopeJson: entry.envelopeJson }, { ...entry, requestKey: " first" },
    { ...entry, envelopeJson: {} }, { ...entry, envelopeJson: "{}" },
    { ...entry, envelopeJson: `${entry.envelopeJson} ` },
    { ...entry, envelopeJson: entry.envelopeJson.replace('"knownAt":', '"knownAt":0,"knownAt":') },
    { ...entry, envelopeJson: entry.envelopeJson.replace('"objectVerified":false', '"objectVerified":true') }]) {
    refused(restore(JSON.stringify({ ...raw, journal: [bad] })), "INVALID_CHECKPOINT");
  }
  refused(restore(JSON.stringify({ ...raw, journal: [entry, entry] })), "INVALID_CHECKPOINT");
  refused(restore(JSON.stringify({ ...raw, journal: Array(257).fill(entry) })), "INVALID_CHECKPOINT");
});

test("restore fails each over-capacity prefix even in a syntactically valid journal", () => {
  const raw = JSON.parse(create().exportCheckpoint());
  raw.journal = Array.from({ length: 129 }, (_, i) => ({ requestKey: `v:${i}`, envelopeJson: envelope(payload(i + 1)) }));
  refused(restore(JSON.stringify(raw)), "INVALID_CHECKPOINT");
});

test("restore accepts only primitive lossless bounded UTF-8 wire and never invokes caller methods", () => {
  let traps = 0;
  const hostile = new Proxy({}, { get() { traps++; throw Error("get"); },
    ownKeys() { traps++; throw Error("keys"); }, getPrototypeOf() { traps++; throw Error("proto"); } });
  const getter = Object.defineProperty({}, "toJSON", { get() { traps++; throw Error("getter"); } });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const bad of [undefined, null, 1, true, [], {}, getter, hostile, revoked.proxy,
    new String(create().exportCheckpoint()), Buffer.from(create().exportCheckpoint()),
    "", "[", "null", "[]", "\ud800", "\ufffd", " ".repeat(ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1 + 1),
    "€".repeat(Math.floor(ECB_HISTORICAL_SIMULATION_MAX_CHECKPOINT_BYTES_V1 / 3) + 1)]) {
    refused(restore(bad), "INVALID_CHECKPOINT");
  }
  assert.equal(traps, 0);
});

test("maximum canonical payload survives simulated commit and nested JSON checkpoint byte-for-byte", () => {
  const padding = ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1 - Buffer.byteLength(payload(), "utf8");
  const text = payload(1, 1, "2026-09-10", URL.replace("abc123", `abc123${"x".repeat(padding)}`));
  assert.equal(Buffer.byteLength(text, "utf8"), ECB_HISTORICAL_MAX_PAYLOAD_BYTES_V1);
  const c = create();
  record(c, "large", envelope(text));
  const next = restored(c.exportCheckpoint());
  assert.equal(next.inspect().bytes[0]!.envelope.payloadText, text);
  assert.deepEqual(Buffer.from(next.inspect().bytes[0]!.envelope.payloadText), Buffer.from(text));
});

test("every mixed journal prefix reconstructs identical immutable derived data and refusal has no trace", () => {
  const c = create();
  const requests: [string, string, EcbHistoricalSimulationOutcomeV1][] = [
    ["one", envelope(payload(1, 10)), "accepted"], ["two", envelope(payload(2, 20)), "accepted"],
    ["old", envelope(payload(1, 10)), "duplicate"], ["capture", envelope(payload(1, 25)), "integrity-conflict"],
    ["stale", envelope(payload(3, 9)), "stale"], ["equal", envelope(payload(4, 20)), "chronology-conflict"],
    ["other", envelope(payload(5, 30, "2026-09-11")), "event-id-mismatch"],
    ["one", envelope(payload(6, 30)), "idempotency-conflict"], ["six", envelope(payload(6, 30)), "accepted"],
  ];
  for (const [key, wire, outcome] of requests) {
    unchanged(c, () => refused(c.propose("invalid key", wire), "INVALID_REQUEST_KEY"));
    record(c, key, wire, outcome);
    const next = restored(c.exportCheckpoint());
    assert.deepEqual(next.inspect(), c.inspect());
    assert.equal(next.exportCheckpoint(), c.exportCheckpoint());
  }
});

test("checkpoint rehydration in a fresh Node process produces identical bytes, receipts and journal", () => {
  const c = create();
  record(c, "one");
  record(c, "two", envelope(payload(2)));
  record(c, "old", envelope(), "duplicate");
  record(c, "bad", envelope(payload(1, 5)), "integrity-conflict");
  const childSource = String.raw`
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const Module = require('node:module');
    const ts = require('typescript');
    const applicationFiles = [
      'catalog/ecbHistoricalAdmissionTransactionSimulation.ts',
      'catalog/ecbHistoricalByteCustodyEnvelope.ts', 'catalog/ecbHistoricalAdmissionPlanning.ts',
      'catalog/ecbHistoricalCatalogProjection.ts', 'events/ecbMonetaryPolicyMemory.ts',
      'events/ecbMonetaryPolicy.ts'
    ].map(f => path.resolve('src/lib/markets', f).toLowerCase());
    const allowed = new Set(applicationFiles);
    const appRoot = path.resolve('src').toLowerCase() + path.sep;
    const forbidden = f => typeof f === 'string' && /ecbMonetaryPolicyOwnershipLedgerRedis/i.test(f);
    const read = fs.readFileSync, load = Module._load;
    fs.readFileSync = function(f, ...args) {
      if (forbidden(f)) throw Error('Protected read blocked');
      return read.call(this, f, ...args);
    };
    Module._load = function(request, parent, isMain) {
      if (forbidden(request)) throw Error('Protected import blocked');
      const filename = Module._resolveFilename(request, parent, isMain);
      if (typeof filename === 'string' && filename.toLowerCase().startsWith(appRoot) &&
        !allowed.has(filename.toLowerCase())) throw Error('Unexpected application import');
      return load.apply(this, arguments);
    };
    require.extensions['.ts'] = (module, filename) => {
      if (!allowed.has(path.resolve(filename).toLowerCase())) throw Error('Unexpected TS source');
      module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017,
          esModuleInterop: true }, fileName: filename
      }).outputText, filename);
    };
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const api = require('./src/lib/markets/catalog/ecbHistoricalAdmissionTransactionSimulation.ts');
    const result = api.restoreEcbHistoricalAdmissionTransactionSimulationV1(input.checkpoint);
    assert.equal(result.kind, 'restored');
    assert.equal(result.coordinator.exportCheckpoint(), input.checkpoint);
    assert.equal(JSON.stringify(result.coordinator.inspect()), input.view);
    assert.equal(result.coordinator.objectVerified, false);
    assert.equal(result.coordinator.ownershipVerified, false);
    process.stdout.write('fresh-process-equivalent');
  `;
  const child = spawnSync(process.execPath, ["-e", childSource], {
    cwd: process.cwd(), input: JSON.stringify({ checkpoint: c.exportCheckpoint(), view: JSON.stringify(c.inspect()) }),
    encoding: "utf8", timeout: 30_000, maxBuffer: 1_024 * 1_024,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "fresh-process-equivalent");
});

test("all exposed contracts remain offline, provided-history-only, pending and without service capabilities", () => {
  const c = create();
  assert.deepEqual(Object.keys(c).filter(key => typeof c[key as keyof Coordinator] === "function"),
    ["propose", "commit", "inspect", "exportCheckpoint"]);
  record(c, "first");
  const all: (Coordinator | EcbHistoricalSimulationViewV1)[] = [c, c.inspect(), restored(c.exportCheckpoint())];
  for (const value of all) {
    assert.equal(value.mode, "offline-model-only");
    assert.equal(value.coverage, "provided-history-only");
    assert.equal(value.objectVerified, false);
    assert.equal(value.ownershipVerified, false);
    for (const field of ["durable", "authenticated", "readable", "objectReceipt", "lease", "worker", "database", "r2"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(value, field), false);
    }
  }
  const forgedHistory = restored(c.exportCheckpoint());
  // Self-consistent user-authored journals are accepted only as synthetic data.
  assert.equal(forgedHistory.inspect().acceptedVersions[0]!.status, "admitted-pending-object");
});
