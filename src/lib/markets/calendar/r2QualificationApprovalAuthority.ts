import "server-only";

import { calendarRecordV1, snapshotCalendarDataV1 } from "./validation";
import {
  R2_APPROVAL_BOUNDS_V1, R2QualificationApprovalErrorV1,
  inspectR2ApprovalAuthorityJournalV1, prepareR2ApprovalAuthorityTransitionV1,
  readR2ApprovalAuthorityCheckpointV1, readR2ApprovalAuthorityClockV1,
  type R2ApprovalAuthorizationRequestV1, type R2ApprovalCheckpointV1,
} from "./r2QualificationApproval";

export const R2_APPROVAL_AUTHORITY_ACK_V1 = "calendar-r2-approval-authority-ack-v1" as const;
const scope = "offline-approval-authority-contract-only" as const;
type Checkpoint = R2ApprovalCheckpointV1;
type Journal = ReturnType<typeof inspectR2ApprovalAuthorityJournalV1>;
type Clock = ReturnType<typeof readR2ApprovalAuthorityClockV1>;
type Reason = "invalid-input" | "missing-state" | "corrupt-history" | "checkpoint-unavailable" | "checkpoint-mismatch"
  | "stale-writer" | "storage-unavailable" | "acknowledgement-unknown" | "deadline" | "clock"
  | "transition-rejected" | "authority-uncertain" | "busy";

export interface R2ApprovalAuthorityIdentityV1 { readonly authorityId: string; readonly generation: string }
export interface R2ApprovalAuthorityWriteV1 {
  readonly expected: Checkpoint;
  readonly checkpoint: Checkpoint;
  /** Entire validated journal: the only stored approval/run/consumption/audit state. */
  readonly snapshot: Journal["snapshot"];
}
/** Trusted injected capabilities only. Null explicitly means missing. No initialization API.
 * CAS MUST atomically compare ALL expected fields and store the ENTIRE next journal.
 * Partial application, silent resets, stale success and internally retried writes violate
 * this contract. An applied acknowledgement binds store, expected and checkpoint. */
export interface R2ApprovalAuthorityJournalStoreV1 {
  readonly read: (identity: R2ApprovalAuthorityIdentityV1, signal: AbortSignal) => Promise<unknown>;
  readonly compareAndSwap: (request: R2ApprovalAuthorityWriteV1, signal: AbortSignal) => Promise<unknown>;
}
/** Must be retained independently of journal restore, not derived from its read/export.
 * No shared transaction with journal is assumed. Ambiguous publication is irreversible
 * uncertainty; there is no rollback, repair or automatic retry capability. */
export interface R2ApprovalAuthorityWitnessStoreV1 {
  readonly read: (identity: R2ApprovalAuthorityIdentityV1, signal: AbortSignal) => Promise<unknown>;
  readonly compareAndSwap: (request: { readonly expected: Checkpoint; readonly checkpoint: Checkpoint }, signal: AbortSignal) => Promise<unknown>;
}
export interface R2ApprovalAuthorityDependenciesV1 extends R2ApprovalAuthorityIdentityV1 {
  readonly journal: R2ApprovalAuthorityJournalStoreV1;
  readonly witness: R2ApprovalAuthorityWitnessStoreV1;
  readonly clock: () => unknown;
  readonly authorize: (request: R2ApprovalAuthorizationRequestV1) => unknown;
  /** Trusted elapsed-time controls, never evidence or persistence clocks. */
  readonly monotonicNow?: () => number;
  readonly armDeadline?: (callback: () => void, milliseconds: number) => () => void;
}
export class R2ApprovalAuthorityErrorV1 extends Error {
  readonly code: Reason;
  constructor(code: Reason) { super("Offline approval authority unavailable."); this.name = "R2ApprovalAuthorityErrorV1"; this.code = code; }
}
const reasons: readonly Reason[] = ["invalid-input", "missing-state", "corrupt-history", "checkpoint-unavailable", "checkpoint-mismatch",
  "stale-writer", "storage-unavailable", "acknowledgement-unknown", "deadline", "clock", "transition-rejected", "authority-uncertain", "busy"];
function fail(code: Reason): never { throw new R2ApprovalAuthorityErrorV1(code); }
function same(a: Checkpoint, b: Checkpoint): boolean {
  return a.schemaVersion === b.schemaVersion && a.authorityId === b.authorityId && a.generation === b.generation &&
    a.sequence === b.sequence && a.headSha256 === b.headSha256;
}
function record(value: unknown, keys: readonly string[]) { return calendarRecordV1(snapshotCalendarDataV1(value), keys); }

/** Inactive contract driver. All storage/clock/authenticity guarantees are assumptions
 * on injected trusted models. No provider, persistence, distributed guarantee or session.
 * Construction does no I/O; reads and successful writes return inspection data only. */
export function createOfflineR2ApprovalAuthorityV1(dependencies: R2ApprovalAuthorityDependenciesV1) {
  const { authorityId, generation } = dependencies;
  if (![authorityId, generation].every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value))) fail("invalid-input");
  const identity = Object.freeze({ authorityId, generation });
  const readJournal = dependencies.journal.read.bind(dependencies.journal);
  const writeJournal = dependencies.journal.compareAndSwap.bind(dependencies.journal);
  const readWitness = dependencies.witness.read.bind(dependencies.witness);
  const writeWitness = dependencies.witness.compareAndSwap.bind(dependencies.witness);
  const clock = dependencies.clock; const authorize = dependencies.authorize;
  const monotonic = dependencies.monotonicNow ?? performance.now.bind(performance);
  const arm = dependencies.armDeadline ?? ((callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  let lastClock: Clock | undefined;
  let quarantined = false; let busy = false;
  function currentClock(floor?: Clock): Clock {
    try {
      const at = readR2ApprovalAuthorityClockV1(clock(), generation, lastClock);
      lastClock = readR2ApprovalAuthorityClockV1(at, generation, floor); return lastClock;
    } catch { return fail("clock"); }
  }
  function checkpoint(value: unknown): Checkpoint {
    try { return readR2ApprovalAuthorityCheckpointV1(value, authorityId, generation); }
    catch { return fail("checkpoint-mismatch"); }
  }
  function acknowledgement(value: unknown, store: "journal" | "witness", expected: Checkpoint, next: Checkpoint): void {
    try {
      const data = record(value, ["schemaVersion", "store", "status", "expected", "checkpoint"]);
      if (data.schemaVersion !== R2_APPROVAL_AUTHORITY_ACK_V1 || data.store !== store ||
          !same(checkpoint(data.expected), expected)) fail("acknowledgement-unknown");
      if (data.status === "conflict" && data.checkpoint === null) fail("stale-writer");
      if (data.status !== "applied" || !same(checkpoint(data.checkpoint), next)) fail("acknowledgement-unknown");
    } catch (error) {
      if (error instanceof R2ApprovalAuthorityErrorV1 && error.code === "stale-writer") throw error;
      fail("acknowledgement-unknown");
    }
  }
  async function operation<T>(work: (context: {
    readonly wait: <V>(call: (signal: AbortSignal) => Promise<V>, failure: Reason) => Promise<V>;
    readonly load: () => Promise<Journal>;
    readonly check: () => void;
    readonly markWrite: () => void;
    readonly onDelivery: (validate: () => void) => void;
  }) => Promise<T>): Promise<T> {
    if (quarantined) fail("authority-uncertain");
    if (busy) fail("busy");
    busy = true;
    const controller = new AbortController();
    let closed = false; let writing = false; let disarm = () => {}; let validateDelivery = () => {};
    let rejectDeadline!: (error: Error) => void;
    const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; }); void deadline.catch(() => {});
    try {
      let start: number;
      try { start = monotonic(); } catch { return fail("clock"); }
      let previous = start;
      function check(): void {
        let elapsed: number;
        try { elapsed = monotonic(); } catch { return fail("clock"); }
        if (!Number.isFinite(elapsed) || !Number.isFinite(start) || start < 0 || elapsed < previous) fail("clock");
        previous = elapsed;
        if (closed || controller.signal.aborted || elapsed - start >= R2_APPROVAL_BOUNDS_V1.requestTimeoutMs) fail("deadline");
      }
      async function wait<V>(call: (signal: AbortSignal) => Promise<V>, failure: Reason): Promise<V> {
        check();
        const pending = Promise.resolve().then(() => { check(); return call(controller.signal); })
          .catch(() => { if (closed || controller.signal.aborted) fail("deadline"); fail(failure); });
        const value = await Promise.race([pending, deadline]); check(); return value;
      }
      async function load(): Promise<Journal> {
        const raw = await wait(signal => readJournal(identity, signal), "storage-unavailable");
        if (raw === null) fail("missing-state");
        let state: Journal;
        try { state = inspectR2ApprovalAuthorityJournalV1(raw, authorityId, generation); }
        catch { return fail("corrupt-history"); }
        currentClock(state.snapshot.events.at(-1)?.clock);
        const witness = await wait(signal => readWitness(identity, signal), "checkpoint-unavailable");
        if (witness === null) fail("checkpoint-unavailable");
        if (!same(checkpoint(witness), state.checkpoint)) fail("checkpoint-mismatch");
        currentClock(state.snapshot.events.at(-1)?.clock); check(); return state;
      }
      disarm = arm(() => { closed = true; controller.abort(); rejectDeadline(new R2ApprovalAuthorityErrorV1("deadline")); }, R2_APPROVAL_BOUNDS_V1.requestTimeoutMs);
      check();
      const result = await work({ wait, load, check, markWrite: () => { writing = true; }, onDelivery: validate => { validateDelivery = validate; } });
      validateDelivery(); check(); return result;
    } catch (error) {
      // Even a deterministic CAS conflict quarantines a writer after publication
      // was attempted. A fresh driver can inspect retained state, never repair it.
      if (writing) quarantined = true;
      if (error instanceof R2ApprovalAuthorityErrorV1 && reasons.includes(error.code)) throw new R2ApprovalAuthorityErrorV1(error.code);
      if (error instanceof R2QualificationApprovalErrorV1) fail("transition-rejected");
      return fail("storage-unavailable");
    } finally {
      closed = true; controller.abort(); try { disarm(); } catch { /* Cleanup grants nothing. */ }
      busy = false;
    }
  }
  return Object.freeze({ scope, executionAllowed: false as const,
    read: () => operation(async ({ load }) => {
      const state = await load();
      return Object.freeze({ scope, executionAllowed: false as const, checkpoint: state.checkpoint, views: state.views });
    }),
    transact: (input: unknown) => {
      // Detach before the first await; no caller-owned command can change in flight.
      let passive: unknown;
      try { passive = snapshotCalendarDataV1(input); } catch { return Promise.reject(new R2ApprovalAuthorityErrorV1("invalid-input")); }
      return operation(async ({ wait, load, check, markWrite, onDelivery }) => {
        const before = await load();
        const step = prepareR2ApprovalAuthorityTransitionV1(before.snapshot, passive, currentClock(), authorityId, generation, authorize);
        function fresh(): void { check(); step.assertCurrentTime(currentClock()); check(); }
        onDelivery(fresh); fresh(); markWrite();
        acknowledgement(await wait(signal => { fresh(); return writeWitness({ expected: step.expected, checkpoint: step.checkpoint }, signal); },
          "acknowledgement-unknown"), "witness", step.expected, step.checkpoint);
        fresh();
        const published = await wait(signal => readWitness(identity, signal), "checkpoint-unavailable");
        if (published === null) fail("checkpoint-unavailable");
        if (!same(checkpoint(published), step.checkpoint)) fail("checkpoint-mismatch");
        fresh();
        acknowledgement(await wait(signal => { fresh(); return writeJournal({ expected: step.expected, checkpoint: step.checkpoint, snapshot: step.snapshot }, signal); },
          "acknowledgement-unknown"), "journal", step.expected, step.checkpoint);
        fresh();
        const after = await load();
        if (!same(after.checkpoint, step.checkpoint)) fail("checkpoint-mismatch");
        fresh();
        return Object.freeze({ scope, executionAllowed: false as const, status: "observed" as const,
          commandSha256: step.commandSha256, checkpoint: after.checkpoint, views: after.views });
      });
    },
  });
}
