import "server-only";

import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";
import {
  R2_APPROVAL_BOUNDS_V1, readR2ApprovalAuthorityCheckpointV1, type R2ApprovalCheckpointV1,
} from "./r2QualificationApproval";
import {
  R2_APPROVAL_AUTHORITY_ACK_V1, R2ApprovalAuthorityErrorV1,
  type R2ApprovalAuthorityIdentityV1, type R2ApprovalAuthorityWitnessStoreV1,
} from "./r2QualificationApprovalAuthority";
import { validateR2ApprovalAuthorityWitnessCASV1 } from "./r2QualificationApprovalAuthorityStoreValidation";

/** Trusted structural capability, compatible with SQLite-backed DO storage.
 * transactionSync MUST invoke once, synchronously, atomically, and roll back on
 * any callback exception. No provider connection or default storage is supplied. */
export interface R2ApprovalDurableObjectStorageV1 {
  readonly sql: { readonly exec: (sql: string, ...bindings: (string | number)[]) => {
    readonly toArray: () => unknown;
  } };
  readonly transactionSync: <T>(callback: () => T) => T;
}
const columns = `witness_id AS witnessId, authority_id AS authorityId, generation,
  checkpoint_schema AS schemaVersion, sequence, head_sha256 AS headSha256`;
const readSQL = `SELECT ${columns} FROM calendar_r2_approval_witness_v1 WHERE slot = ?`;
const historySQL = `SELECT ${columns} FROM calendar_r2_approval_witness_history_v1 ORDER BY sequence LIMIT ?`;
const updateSQL = `UPDATE calendar_r2_approval_witness_v1 SET sequence = ?, head_sha256 = ?
  WHERE slot = ? AND witness_id COLLATE BINARY = ? AND authority_id COLLATE BINARY = ?
    AND generation COLLATE BINARY = ? AND checkpoint_schema COLLATE BINARY = ?
    AND sequence = ? AND head_sha256 COLLATE BINARY = ? RETURNING ${columns}`;
const appendSQL = `INSERT INTO calendar_r2_approval_witness_history_v1
  (witness_id, authority_id, generation, checkpoint_schema, sequence, head_sha256)
  VALUES (?, ?, ?, ?, ?, ?) RETURNING ${columns}`;
type Checkpoint = R2ApprovalCheckpointV1;
type Reason = ConstructorParameters<typeof R2ApprovalAuthorityErrorV1>[0];
function fail(code: Reason): never { throw new R2ApprovalAuthorityErrorV1(code); }
function record(value: unknown, keys: readonly string[]) {
  return calendarRecordV1(snapshotCalendarDataV1(value), keys);
}
function same(a: Checkpoint, b: Checkpoint): boolean {
  return a.schemaVersion === b.schemaVersion && a.authorityId === b.authorityId && a.generation === b.generation &&
    a.sequence === b.sequence && a.headSha256 === b.headSha256;
}
function ack(expected: Checkpoint, checkpoint: Checkpoint | null) {
  return Object.freeze({ schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store: "witness" as const,
    status: checkpoint === null ? "conflict" as const : "applied" as const, expected, checkpoint });
}

/** Inactive implementation of the existing witness contract. The witnessId pins
 * local storage provenance; it neither changes checkpoint/ACK formats nor proves
 * independent retention. No DDL, bootstrap, retry, repair or runtime wiring. */
export function createInactiveR2ApprovalAuthorityDurableObjectWitnessV1(
  identityInput: unknown, storage: R2ApprovalDurableObjectStorageV1,
): R2ApprovalAuthorityWitnessStoreV1 & {
  readonly scope: "inactive-durable-object-compatible-approval-witness-only";
  readonly executionAllowed: false;
} {
  let authorityId: string; let generation: string; let witnessId: string;
  try {
    const data = record(identityInput, ["authorityId", "generation", "witnessId"]);
    if (![data.authorityId, data.generation, data.witnessId].every(value =>
      typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value))) fail("invalid-input");
    authorityId = data.authorityId as string; generation = data.generation as string; witnessId = data.witnessId as string;
  } catch { return fail("invalid-input"); }
  const identity = Object.freeze({ authorityId, generation });
  function rows(sql: string, ...bindings: (string | number)[]): readonly unknown[] {
    const data = snapshotCalendarDataV1(storage.sql.exec(sql, ...bindings).toArray());
    if (!Array.isArray(data)) fail("corrupt-history");
    return data;
  }
  function checkpoint(value: unknown): Checkpoint {
    const row = record(value, ["witnessId", "authorityId", "generation", "schemaVersion", "sequence", "headSha256"]);
    if (row.witnessId !== witnessId) fail("corrupt-history");
    return readR2ApprovalAuthorityCheckpointV1({ schemaVersion: row.schemaVersion, authorityId: row.authorityId,
      generation: row.generation, sequence: row.sequence, headSha256: row.headSha256 }, authorityId, generation);
  }
  // Always called inside the injected transaction, including on inspection reads.
  function load(): Checkpoint | null {
    const current = rows(readSQL, 1);
    const history = rows(historySQL, R2_APPROVAL_BOUNDS_V1.events + 2);
    try {
      if (current.length === 0 && history.length === 0) return null;
      if (current.length !== 1) fail("corrupt-history");
      const retained = checkpoint(current[0]);
      if (history.length !== retained.sequence + 1) fail("corrupt-history");
      for (let index = 0; index < history.length; index++) {
        const previous = checkpoint(history[index]);
        if (previous.sequence !== index || (index === retained.sequence && !same(previous, retained))) fail("corrupt-history");
      }
      return retained;
    } catch { return fail("corrupt-history"); }
  }
  function atomic<T>(signal: AbortSignal, work: () => T, dispatched: () => boolean = () => false): T {
    let called = false; let closed = false; let completed: T | undefined;
    function check() { if (signal.aborted) fail(dispatched() ? "acknowledgement-unknown" : "storage-unavailable"); }
    try {
      check();
      let result: T;
      try {
        result = storage.transactionSync(() => {
          if (closed || called) fail("acknowledgement-unknown");
          called = true; check(); completed = work(); check(); return completed;
        });
      } finally { closed = true; }
      check();
      if (!called || completed === undefined || result !== completed) fail("acknowledgement-unknown");
      return result;
    } catch (error) {
      if (dispatched()) return fail("acknowledgement-unknown");
      if (error instanceof R2ApprovalAuthorityErrorV1) throw new R2ApprovalAuthorityErrorV1(error.code);
      return fail("storage-unavailable");
    }
  }
  return Object.freeze({ scope: "inactive-durable-object-compatible-approval-witness-only" as const, executionAllowed: false as const,
    read: async (input: R2ApprovalAuthorityIdentityV1, signal: AbortSignal) => {
      try {
        const data = record(input, ["authorityId", "generation"]);
        if (data.authorityId !== authorityId || data.generation !== generation) fail("invalid-input");
      } catch { return fail("invalid-input"); }
      return atomic(signal, load);
    },
    compareAndSwap: async (input: { readonly expected: Checkpoint; readonly checkpoint: Checkpoint }, signal: AbortSignal) => {
      let request: unknown; let expected: Checkpoint;
      try {
        request = snapshotCalendarDataV1(input);
        const data = calendarRecordV1(request, ["expected", "checkpoint"]);
        expected = readR2ApprovalAuthorityCheckpointV1(data.expected, authorityId, generation);
      } catch { return fail("invalid-input"); }
      let dispatched = false;
      return atomic(signal, () => {
        const retained = load();
        if (retained === null) fail("missing-state");
        const next = validateR2ApprovalAuthorityWitnessCASV1(identity, retained, request);
        if (next.status === "refused") {
          if (next.reason === "stale-writer") return ack(expected, null);
          return fail("transition-rejected");
        }
        dispatched = true;
        const changed = rows(updateSQL, next.checkpoint.sequence, next.checkpoint.headSha256, 1, witnessId,
          expected.authorityId, expected.generation, expected.schemaVersion, expected.sequence, expected.headSha256);
        if (changed.length !== 1 || !same(checkpoint(changed[0]), next.checkpoint)) fail("acknowledgement-unknown");
        const appended = rows(appendSQL, witnessId, next.checkpoint.authorityId, next.checkpoint.generation,
          next.checkpoint.schemaVersion, next.checkpoint.sequence, next.checkpoint.headSha256);
        if (appended.length !== 1 || !same(checkpoint(appended[0]), next.checkpoint)) fail("acknowledgement-unknown");
        const after = load();
        if (after === null || !same(after, next.checkpoint)) fail("acknowledgement-unknown");
        return ack(next.expected, next.checkpoint);
      }, () => dispatched);
    },
  });
}
