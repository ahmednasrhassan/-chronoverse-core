import "server-only";

import { types } from "node:util";
import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";
import {
  R2_APPROVAL_BOUNDS_V1, inspectR2ApprovalAuthorityJournalV1,
  readR2ApprovalAuthorityCheckpointV1, type R2ApprovalCheckpointV1,
} from "./r2QualificationApproval";
import {
  R2_APPROVAL_AUTHORITY_ACK_V1, R2ApprovalAuthorityErrorV1,
  type R2ApprovalAuthorityJournalStoreV1, type R2ApprovalAuthorityIdentityV1, type R2ApprovalAuthorityWriteV1,
} from "./r2QualificationApprovalAuthority";
import { validateR2ApprovalAuthorityJournalCASV1 } from "./r2QualificationApprovalAuthorityStoreValidation";

/** Structural capability only. No provider import, connection, token or default database. */
export interface R2ApprovalD1DatabaseV1 {
  readonly prepare: (sql: string) => {
    readonly bind: (...values: (string | number)[]) => {
      readonly first: () => Promise<unknown>;
      readonly run: () => Promise<unknown>;
    };
  };
}
const readSQL = `SELECT authority_id AS authorityId, generation,
  checkpoint_schema AS schemaVersion, sequence, head_sha256 AS headSha256,
  snapshot_json AS snapshotJson FROM calendar_r2_approval_journal_v1 WHERE slot = ?`;
const updateSQL = `UPDATE calendar_r2_approval_journal_v1
  SET authority_id = ?, generation = ?, checkpoint_schema = ?, sequence = ?,
      head_sha256 = ?, snapshot_json = ?
  WHERE slot = ? AND authority_id = ? AND generation = ? AND checkpoint_schema = ?
    AND sequence = ? AND head_sha256 = ? AND snapshot_json COLLATE BINARY = ?`;

type Checkpoint = R2ApprovalCheckpointV1;
type Reason = ConstructorParameters<typeof R2ApprovalAuthorityErrorV1>[0];
function fail(code: Reason): never { throw new R2ApprovalAuthorityErrorV1(code); }
function same(a: Checkpoint, b: Checkpoint): boolean {
  return a.schemaVersion === b.schemaVersion && a.authorityId === b.authorityId &&
    a.generation === b.generation && a.sequence === b.sequence && a.headSha256 === b.headSha256;
}
/** Inspect only own passive fields, without invoking provider getters or proxy traps.
 * Unlike the domain copier, this permits the bounded serialized snapshot string. */
function fields(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) throw new TypeError();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 32) throw new TypeError();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string") throw new TypeError();
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError();
    result[key] = descriptor.value;
  }
  return result;
}
function ack(expected: Checkpoint, checkpoint: Checkpoint | null) {
  return Object.freeze({ schemaVersion: R2_APPROVAL_AUTHORITY_ACK_V1, store: "journal" as const,
    status: checkpoint === null ? "conflict" as const : "applied" as const, expected, checkpoint });
}

/** Inactive adapter for the existing journal contract. Construction does no I/O.
 * Only an explicitly supplied trusted capability may execute these fixed statements.
 * No bootstrap, repair, retry, clock, authenticated ingress or live authority exists.
 * The exact old JSON AND every checkpoint field guard the single atomic UPDATE. */
export function createInactiveR2ApprovalAuthorityD1JournalV1(
  identityInput: unknown, database: R2ApprovalD1DatabaseV1,
): R2ApprovalAuthorityJournalStoreV1 & {
  readonly scope: "inactive-d1-compatible-approval-journal-only";
  readonly executionAllowed: false;
} {
  let authorityId: string; let generation: string;
  try {
    const data = calendarRecordV1(snapshotCalendarDataV1(identityInput), ["authorityId", "generation"]);
    if (typeof data.authorityId !== "string" || typeof data.generation !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(data.authorityId) ||
        !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(data.generation)) fail("invalid-input");
    authorityId = data.authorityId; generation = data.generation;
  } catch { return fail("invalid-input"); }
  const identity = Object.freeze({ authorityId, generation });
  async function load(signal: AbortSignal) {
    if (signal.aborted) fail("storage-unavailable");
    let raw: unknown;
    try { raw = await database.prepare(readSQL).bind(1).first(); }
    catch { return fail("storage-unavailable"); }
    if (signal.aborted) fail("storage-unavailable");
    if (raw === null) return null;
    try {
      const row = calendarRecordV1(fields(raw), ["authorityId", "generation", "schemaVersion", "sequence", "headSha256", "snapshotJson"]);
      const retained = readR2ApprovalAuthorityCheckpointV1({ schemaVersion: row.schemaVersion, authorityId: row.authorityId,
        generation: row.generation, sequence: row.sequence, headSha256: row.headSha256 }, authorityId, generation);
      const text = row.snapshotJson;
      if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > R2_APPROVAL_BOUNDS_V1.bytes) fail("corrupt-history");
      const journal = inspectR2ApprovalAuthorityJournalV1(JSON.parse(text), authorityId, generation);
      if (!same(retained, journal.checkpoint)) fail("corrupt-history");
      return { text, snapshot: journal.snapshot };
    } catch { return fail("corrupt-history"); }
  }
  return Object.freeze({ scope: "inactive-d1-compatible-approval-journal-only" as const, executionAllowed: false as const,
    read: async (input: R2ApprovalAuthorityIdentityV1, signal: AbortSignal) => {
      try {
        const data = calendarRecordV1(snapshotCalendarDataV1(input), ["authorityId", "generation"]);
        if (data.authorityId !== authorityId || data.generation !== generation) fail("invalid-input");
      } catch { return fail("invalid-input"); }
      return (await load(signal))?.snapshot ?? null;
    },
    compareAndSwap: async (input: R2ApprovalAuthorityWriteV1, signal: AbortSignal) => {
      let request: unknown; let expected: Checkpoint;
      try {
        request = snapshotCalendarDataV1(input);
        const data = calendarRecordV1(request, ["expected", "checkpoint", "snapshot"]);
        expected = readR2ApprovalAuthorityCheckpointV1(data.expected, authorityId, generation);
      } catch { return fail("invalid-input"); }
      const retained = await load(signal);
      if (retained === null) fail("missing-state");
      const next = validateR2ApprovalAuthorityJournalCASV1(identity, retained.snapshot, request);
      if (next.status === "refused") {
        if (next.reason === "stale-writer") return ack(expected, null);
        return fail("transition-rejected");
      }
      let response: unknown;
      try {
        if (signal.aborted) fail("acknowledgement-unknown");
        response = await database.prepare(updateSQL).bind(
          next.checkpoint.authorityId, next.checkpoint.generation, next.checkpoint.schemaVersion,
          next.checkpoint.sequence, next.checkpoint.headSha256, JSON.stringify(next.snapshot),
          1, expected.authorityId, expected.generation, expected.schemaVersion,
          expected.sequence, expected.headSha256, retained.text,
        ).run();
      } catch { return fail("acknowledgement-unknown"); }
      // Cancellation/exception cannot establish non-commitment. Never retry this UPDATE.
      if (signal.aborted) fail("acknowledgement-unknown");
      try {
        const result = fields(response); const meta = fields(result.meta);
        if (result.success !== true || Object.is(meta.changes, -0) ||
            (meta.total_attempts !== undefined && meta.total_attempts !== 1) ||
            (meta.served_by_primary !== undefined && meta.served_by_primary !== true)) fail("acknowledgement-unknown");
        if (meta.changes === 0 && meta.changed_db === false) return ack(expected, null);
        if (meta.changes !== 1 || meta.changed_db !== true) fail("acknowledgement-unknown");
        return ack(next.expected, next.checkpoint);
      } catch { return fail("acknowledgement-unknown"); }
    },
  });
}
